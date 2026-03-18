import { PrismaClient } from '@prisma/client';
import { Group, GroupInput, GroupUpdate, GroupRole, MembershipRequestAction, User } from '../models';
import { NotificationService } from './NotificationService';

const prisma = new PrismaClient();
const notificationService = new NotificationService();

export class GroupService {
  /**
   * Get all groups with member information
   */
  public async getAll(): Promise<Group[]> {
    const groups = await prisma.group.findMany({
      include: {
        members: {
          include: {
            user: true,
          },
        },
      },
    });

    return groups.map((g) => this.mapGroupWithMembers(g));
  }

  /**
   * Get group by ID with member information
   */
  public async getById(id: string): Promise<Group | null> {
    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: true,
          },
        },
      },
    });

    return group ? this.mapGroupWithMembers(group) : null;
  }

  /**
   * Create a new group with members
   */
  public async create(input: GroupInput): Promise<Group> {
    const { superAdminId, adminIds = [], memberIds = [], createdBy, ...groupData } = input;

    // Create group with members
    const group = await prisma.group.create({
      data: {
        ...groupData,
        createdBy,
        updatedBy: createdBy,
        members: {
          create: [
            // Super admin
            { userId: superAdminId, role: 'superadmin' },
            // Other admins
            ...adminIds
              .filter((uid) => uid !== superAdminId)
              .map((userId) => ({ userId, role: 'admin' as GroupRole })),
            // Regular members
            ...memberIds
              .filter((uid) => uid !== superAdminId && !adminIds.includes(uid))
              .map((userId) => ({ userId, role: 'member' as GroupRole })),
          ],
        },
      },
      include: {
        members: {
          include: {
            user: true,
          },
        },
      },
    });

    return this.mapGroupWithMembers(group);
  }

  /**
   * Update a group
   */
  public async update(id: string, input: GroupUpdate): Promise<Group> {
    const { superAdminId, adminIds, memberIds, updatedBy, ...groupData } = input;

    // If member lists are provided, update them
    if (superAdminId || adminIds || memberIds) {
      await prisma.$transaction(async (tx) => {
        // Delete existing members
        await tx.groupMember.deleteMany({
          where: { groupId: id },
        });

        // Create new members
        const membersToCreate = [];
        
        if (superAdminId) {
          membersToCreate.push({ groupId: id, userId: superAdminId, role: 'superadmin' });
        }

        if (adminIds) {
          adminIds
            .filter((uid) => uid !== superAdminId)
            .forEach((userId) => {
              membersToCreate.push({ groupId: id, userId, role: 'admin' });
            });
        }

        if (memberIds) {
          memberIds
            .filter((uid) => uid !== superAdminId && !adminIds?.includes(uid))
            .forEach((userId) => {
              membersToCreate.push({ groupId: id, userId, role: 'member' });
            });
        }

        if (membersToCreate.length > 0) {
          await tx.groupMember.createMany({
            data: membersToCreate,
          });
        }
      });
    }

    // Update group data
    if (Object.keys(groupData).length > 0 || updatedBy) {
      await prisma.group.update({
        where: { id },
        data: {
          ...groupData,
          updatedBy,
        },
      });
    }

    // Fetch and return updated group
    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: true,
          },
        },
      },
    });

    return this.mapGroupWithMembers(group!);
  }

  /**
   * Delete a group
   */
  public async delete(id: string): Promise<void> {
    await prisma.group.delete({
      where: { id },
    });
  }

  /**
   * Get members of a group
   */
  public async getMembers(groupId: string) {
    return prisma.user.findMany({
      where: {
        groupMemberships: {
          some: {
            groupId,
          },
        },
      },
    });
  }

  /**
   * Get pending membership requests for a group
   */
  public async getPendingRequests(groupId: string): Promise<User[]> {
    const pendingMembers = await prisma.groupMember.findMany({
      where: {
        groupId,
        status: 'pending',
      },
      include: {
        user: true,
      },
    });

    return pendingMembers.map((m) => m.user) as User[];
  }

  /**
   * Handle membership request (approve or reject)
   */
  public async handleMembershipRequest(
    groupId: string,
    action: MembershipRequestAction
  ): Promise<void> {
    const { userId, action: requestAction } = action;

    if (requestAction === 'approve') {
      await prisma.groupMember.update({
        where: {
          groupId_userId: {
            groupId,
            userId,
          },
        },
        data: {
          status: 'active',
        },
      });

      // Create in-app notification for approved user
      const group = await prisma.group.findUnique({
        where: { id: groupId },
      });

      if (group) {
        await notificationService.createForUser(
          userId,
          'Request Approved',
          `You've been approved to join ${group.name}`,
          {
            type: 'group_approval',
            icon: '✓',
            groupId: group.id,
            dest: 'group',
          }
        ).catch(err => console.error('Failed to create approval notification:', err));
      }
    } else if (requestAction === 'reject') {
      await prisma.groupMember.update({
        where: {
          groupId_userId: {
            groupId,
            userId,
          },
        },
        data: {
          status: 'rejected',
        },
      });
    }
  }

  /**
   * Update user's color preference for a group
   */
  public async updateMemberColor(
    groupId: string,
    userId: string,
    colorHex: string
  ): Promise<void> {
    await prisma.groupMember.updateMany({
      where: {
        groupId,
        userId,
        status: 'active',
      },
      data: {
        colorHex,
      },
    });
  }

  /**
   * Get user's color preference for a group
   */
  public async getMemberColor(
    groupId: string,
    userId: string
  ): Promise<string | null> {
    const member = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
      select: {
        colorHex: true,
      },
    });

    return member?.colorHex || null;
  }

  /**
   * Get all group color preferences for a user
   */
  public async getAllMemberColors(userId: string): Promise<Record<string, string>> {
    const memberships = await prisma.groupMember.findMany({
      where: {
        userId,
        status: 'active',
        colorHex: {
          not: null,
        },
      },
      select: {
        groupId: true,
        colorHex: true,
      },
    });

    const colors: Record<string, string> = {};
    memberships.forEach((m) => {
      if (m.colorHex) {
        colors[m.groupId] = m.colorHex;
      }
    });

    return colors;
  }

  /**
   * Map Prisma group with members to Group model
   */
  private mapGroupWithMembers(group: any): Group {
    const superAdmin = group.members.find((m: any) => m.role === 'superadmin' && m.status === 'active');
    const admins = group.members.filter(
      (m: any) => (m.role === 'admin' || m.role === 'superadmin') && m.status === 'active'
    );
    const activeMembers = group.members.filter((m: any) => m.status === 'active');
    const pendingMembers = group.members.filter((m: any) => m.status === 'pending');

    return {
      id: group.id,
      name: group.name,
      desc: group.desc,
      thumbnail: group.thumbnail,
      isPublic: group.isPublic,
      superAdminId: superAdmin ? superAdmin.userId : '',
      adminIds: admins.map((m: any) => m.userId),
      memberIds: activeMembers.map((m: any) => m.userId),
      pendingMemberIds: pendingMembers.map((m: any) => m.userId),
      createdBy: group.createdBy,
      updatedBy: group.updatedBy,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }
}
