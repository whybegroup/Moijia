import { PrismaClient } from '@prisma/client';
import type { FriendGroup, MembershipStatus } from '../models';
import { httpError } from '../utils/httpError';
import { NotificationService } from './NotificationService';

const prisma = new PrismaClient();
const notificationService = new NotificationService();

function normalizeInviteCode(raw: string): string {
  let value = raw.trim();
  const joinMatch = value.match(/\/join\/([A-Za-z0-9]+)/i);
  if (joinMatch) value = joinMatch[1];
  return value.toUpperCase();
}

function membershipStatusOf(
  role: string | undefined,
  status: string | undefined
): MembershipStatus {
  if (!status) return 'none';
  if (status === 'pending') return 'pending';
  if (status !== 'active') return 'none';
  if (role === 'owner' || role === 'admin') return 'admin';
  return 'member';
}

async function requireActiveMember(groupId: string, userId: string) {
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { status: true, role: true },
  });
  if (!member || member.status !== 'active') {
    throw httpError(403, 'Must be an active member');
  }
  return member;
}

async function requireAdmin(groupId: string, userId: string) {
  const member = await requireActiveMember(groupId, userId);
  if (member.role !== 'admin' && member.role !== 'owner') {
    throw httpError(403, 'Must be an admin to manage friend groups');
  }
  return member;
}

async function groupAdmins(groupId: string): Promise<string[]> {
  const rows = await prisma.groupMember.findMany({
    where: { groupId, status: 'active', role: { in: ['owner', 'admin'] } },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

async function toFriendGroup(
  otherId: string,
  userId: string,
  status: FriendGroup['status']
): Promise<FriendGroup> {
  const other = await prisma.group.findUnique({
    where: { id: otherId },
    select: { id: true, name: true, thumbnail: true, avatarSeed: true },
  });
  if (!other) throw httpError(404, 'Group not found');
  const mine = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: otherId, userId } },
    select: { role: true, status: true },
  });
  const memberCount = await prisma.groupMember.count({
    where: { groupId: otherId, status: 'active' },
  });
  return {
    groupId: other.id,
    name: other.name,
    thumbnail: other.thumbnail,
    avatarSeed: other.avatarSeed,
    status,
    membershipStatus: membershipStatusOf(mine?.role, mine?.status),
    memberCount,
  };
}

async function mapFriend(
  currentGroupId: string,
  userId: string,
  row: {
    fromGroupId: string;
    toGroupId: string;
    status: string;
    fromGroup: { id: string; name: string; thumbnail: string | null; avatarSeed: string | null; deletedAt: Date | null };
    toGroup: { id: string; name: string; thumbnail: string | null; avatarSeed: string | null; deletedAt: Date | null };
  }
): Promise<FriendGroup | null> {
  const outgoing = row.fromGroupId === currentGroupId;
  const other = outgoing ? row.toGroup : row.fromGroup;
  if (!other || other.deletedAt) return null;
  const linkStatus =
    row.status === 'accepted'
      ? 'accepted'
      : outgoing
        ? 'pending_outgoing'
        : 'pending_incoming';
  return toFriendGroup(other.id, userId, linkStatus);
}

export class GroupFriendshipService {
  public async list(groupId: string, userId: string): Promise<FriendGroup[]> {
    await requireActiveMember(groupId, userId);
    const rows = await prisma.groupFriendship.findMany({
      where: {
        status: { in: ['pending', 'accepted'] },
        OR: [{ fromGroupId: groupId }, { toGroupId: groupId }],
      },
      include: {
        fromGroup: { select: { id: true, name: true, thumbnail: true, avatarSeed: true, deletedAt: true } },
        toGroup: { select: { id: true, name: true, thumbnail: true, avatarSeed: true, deletedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const mapped = await Promise.all(rows.map((row) => mapFriend(groupId, userId, row)));
    return mapped.filter((item): item is FriendGroup => item != null);
  }

  public async request(groupId: string, userId: string, inviteCode: string): Promise<FriendGroup> {
    await requireAdmin(groupId, userId);
    const from = await prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, name: true, deletedAt: true },
    });
    if (!from || from.deletedAt) throw httpError(404, 'Group not found');

    const code = normalizeInviteCode(inviteCode);
    if (!code) throw httpError(400, 'Invite code is required');
    const to = await prisma.group.findUnique({
      where: { inviteCode: code },
      select: { id: true, name: true, deletedAt: true, thumbnail: true, avatarSeed: true },
    });
    if (!to || to.deletedAt) throw httpError(404, 'Invalid invite code');
    if (to.id === groupId) throw httpError(400, 'A group cannot be friends with itself');

    const reverse = await prisma.groupFriendship.findUnique({
      where: { fromGroupId_toGroupId: { fromGroupId: to.id, toGroupId: groupId } },
    });
    if (reverse?.status === 'accepted') {
      throw httpError(409, 'These groups are already friends');
    }
    if (reverse?.status === 'pending') {
      await prisma.groupFriendship.update({
        where: { id: reverse.id },
        data: { status: 'accepted', decidedBy: userId },
      });
      return toFriendGroup(to.id, userId, 'accepted');
    }

    const existing = await prisma.groupFriendship.findUnique({
      where: { fromGroupId_toGroupId: { fromGroupId: groupId, toGroupId: to.id } },
    });
    if (existing?.status === 'accepted') {
      throw httpError(409, 'These groups are already friends');
    }
    if (existing?.status === 'pending') {
      throw httpError(409, 'A friend request is already pending');
    }

    if (existing) {
      await prisma.groupFriendship.update({
        where: { id: existing.id },
        data: { status: 'pending', requestedBy: userId, decidedBy: null },
      });
    } else {
      await prisma.groupFriendship.create({
        data: { fromGroupId: groupId, toGroupId: to.id, requestedBy: userId, status: 'pending' },
      });
    }

    const admins = (await groupAdmins(to.id)).filter((id) => id !== userId);
    await notificationService
      .createForUsers(admins, 'Friend group request', `${from.name} wants to be friends with ${to.name}.`, {
        type: 'friend_group_request',
        icon: 'people-outline',
        groupId: to.id,
        dest: 'group',
      })
      .catch(() => undefined);

    return toFriendGroup(to.id, userId, 'pending_outgoing');
  }

  public async decide(
    groupId: string,
    friendGroupId: string,
    userId: string,
    action: 'approve' | 'reject'
  ): Promise<void> {
    await requireAdmin(groupId, userId);
    const row = await prisma.groupFriendship.findUnique({
      where: { fromGroupId_toGroupId: { fromGroupId: friendGroupId, toGroupId: groupId } },
    });
    if (!row || row.status !== 'pending') {
      throw httpError(404, 'Friend request not found');
    }
    await prisma.groupFriendship.update({
      where: { id: row.id },
      data: { status: action === 'approve' ? 'accepted' : 'rejected', decidedBy: userId },
    });
    if (action === 'approve') {
      const names = await prisma.group.findMany({
        where: { id: { in: [groupId, friendGroupId] } },
        select: { id: true, name: true },
      });
      const currentName = names.find((g) => g.id === groupId)?.name ?? 'A group';
      const otherName = names.find((g) => g.id === friendGroupId)?.name ?? 'a group';
      const admins = (await groupAdmins(friendGroupId)).filter((id) => id !== userId);
      await notificationService
        .createForUsers(admins, 'Friend group accepted', `${currentName} accepted a friend request from ${otherName}.`, {
          type: 'friend_group_accepted',
          icon: 'people-circle-outline',
          groupId: friendGroupId,
          dest: 'group',
        })
        .catch(() => undefined);
    }
  }

  public async remove(groupId: string, friendGroupId: string, userId: string): Promise<void> {
    await requireAdmin(groupId, userId);
    const { count } = await prisma.groupFriendship.deleteMany({
      where: {
        status: { in: ['pending', 'accepted'] },
        OR: [
          { fromGroupId: groupId, toGroupId: friendGroupId },
          { fromGroupId: friendGroupId, toGroupId: groupId },
        ],
      },
    });
    if (count === 0) throw httpError(404, 'Friend group not found');
  }
}

export const groupFriendships = new GroupFriendshipService();
