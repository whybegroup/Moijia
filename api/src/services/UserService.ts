import { PrismaClient } from '@prisma/client';
import { User, UserInput, UserUpdate } from '../models';
import { mergeNotifPrefs, parseNotifPrefsJson } from '../utils/notifPrefsCore';
import { parseGroupOrderJson, serializeGroupOrderJson } from '../utils/groupOrder';
import type { GroupOrderInput } from '../models/GroupOrder';
import { groupStorage } from './GroupStorageService';
import { S3UploadService } from './S3UploadService';
import { deleteRevenueCatSubscriber } from './RevenueCatService';

const prisma = new PrismaClient();
const objectStore = new S3UploadService();

export class UserService {
  private mapUser(row: any): User {
    const { notifPrefsJson, extraGroupSlots: _slots, email: _email, ...rest } = row;
    return {
      ...rest,
      notifPrefs: parseNotifPrefsJson(notifPrefsJson),
    };
  }

  /**
   * Get all users
   */
  public async getAll(): Promise<User[]> {
    const rows = await prisma.user.findMany();
    return rows.map((r) => this.mapUser(r));
  }

  /**
   * Get user by ID
   */
  public async getById(id: string): Promise<User | null> {
    const row = await prisma.user.findUnique({
      where: { id },
    });
    return row ? this.mapUser(row) : null;
  }

  /**
   * Create a new user
   */
  public async create(input: UserInput): Promise<User> {
    const row = await prisma.user.create({
      data: input,
    });
    return this.mapUser(row);
  }

  /**
   * Create or update user from auth (idempotent; avoids GET 404 on first sign-in).
   * displayName is only set on create so a later auth refresh cannot overwrite a
   * name the user chose in profile.
   */
  public async upsertFromAuth(input: UserInput): Promise<User> {
    const row = await prisma.user.upsert({
      where: { id: input.id },
      create: {
        id: input.id,
        name: input.name,
        displayName: input.displayName,
        avatarSeed: input.avatarSeed ?? null,
        thumbnail: input.thumbnail ?? null,
        ...(input.email !== undefined ? { email: input.email } : {}),
      },
      update: {
        name: input.name,
        ...(input.avatarSeed !== undefined ? { avatarSeed: input.avatarSeed } : {}),
        ...(input.thumbnail !== undefined ? { thumbnail: input.thumbnail } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
      },
    });
    return this.mapUser(row);
  }

  /**
   * Update a user
   */
  public async update(id: string, input: UserUpdate): Promise<User> {
    const { notifPrefs, ...rest } = input;
    const data: any = { ...rest };

    if (notifPrefs !== undefined) {
      const existing = await prisma.user.findUnique({
        where: { id },
        select: { notifPrefsJson: true },
      });
      const merged = mergeNotifPrefs(parseNotifPrefsJson(existing?.notifPrefsJson), notifPrefs);
      data.notifPrefsJson = JSON.stringify(merged);
    }

    const row = await prisma.user.update({
      where: { id },
      data,
    });
    return this.mapUser(row);
  }

  /**
   * Save preferred group display order for a user.
   * Each id must be a group the user belongs to (member, admin, or pending).
   */
  public async setGroupOrder(userId: string, input: GroupOrderInput): Promise<string[]> {
    const uniqueIds = [...new Set(input.groupIds.filter((id) => typeof id === 'string' && id.length > 0))];
    if (uniqueIds.length === 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { groupOrderJson: serializeGroupOrderJson([]) },
      });
      return [];
    }

    const memberships = await prisma.groupMember.findMany({
      where: {
        userId,
        status: { in: ['active', 'pending'] },
        groupId: { in: uniqueIds },
      },
      select: { groupId: true },
    });
    const allowed = new Set(memberships.map((m) => m.groupId));
    const ordered = uniqueIds.filter((id) => allowed.has(id));
    if (ordered.length !== uniqueIds.length) {
      throw new Error('groupIds must only include groups you belong to');
    }

    await prisma.user.update({
      where: { id: userId },
      data: { groupOrderJson: serializeGroupOrderJson(ordered) },
    });
    return ordered;
  }

  public async getGroupOrder(userId: string): Promise<string[]> {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { groupOrderJson: true },
    });
    return parseGroupOrderJson(row?.groupOrderJson);
  }

  /**
   * Delete a user and all owned groups, leftover content that would block
   * the FK, and RevenueCat subscriber state so a re-created account starts clean.
   */
  public async delete(id: string): Promise<void> {
    const existing = await prisma.user.findUnique({
      where: { id },
      select: { id: true, thumbnail: true },
    });
    if (!existing) return;

    await this.purgeOwnedGroups(id);
    await this.purgeLeftoverContent(id, existing.thumbnail);

    await prisma.notification.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });
    await deleteRevenueCatSubscriber(id);
  }

  /** Groups this user currently owns (or orphan groups they created). */
  private async purgeOwnedGroups(userId: string): Promise<void> {
    const groups = await prisma.group.findMany({
      where: {
        OR: [
          { members: { some: { userId, role: 'owner' } } },
          { createdBy: userId, members: { none: { role: 'owner' } } },
        ],
      },
      select: { id: true },
    });

    for (const group of groups) {
      const urls = await groupStorage.collectAllManagedUrlsForPurge(group.id);
      await prisma.group.delete({ where: { id: group.id } });
      await Promise.all(urls.map((u) => objectStore.deleteManagedUploadBestEffort(u)));
      await groupStorage.deleteTrackingForGroup(group.id);
    }
  }

  /**
   * Event.createdBy, Poll.createdBy/closedBy, and Comment.user do not cascade.
   * Remove that leftover content (and its files) so the user row can be deleted.
   */
  private async purgeLeftoverContent(userId: string, thumbnail: string | null): Promise<void> {
    const [events, polls, comments] = await Promise.all([
      prisma.event.findMany({
        where: { createdBy: userId },
        select: {
          coverPhotos: { select: { photoUrl: true } },
          attachments: { select: { fileUrl: true } },
        },
      }),
      prisma.poll.findMany({
        where: { createdBy: userId },
        select: { photos: { select: { photoUrl: true } } },
      }),
      prisma.comment.findMany({
        where: { userId },
        select: { photos: { select: { photoUrl: true } } },
      }),
    ]);

    const urls = new Set<string>();
    if (thumbnail) urls.add(thumbnail);
    for (const event of events) {
      for (const photo of event.coverPhotos) if (photo.photoUrl) urls.add(photo.photoUrl);
      for (const file of event.attachments) if (file.fileUrl) urls.add(file.fileUrl);
    }
    for (const poll of polls) {
      for (const photo of poll.photos) if (photo.photoUrl) urls.add(photo.photoUrl);
    }
    for (const comment of comments) {
      for (const photo of comment.photos) if (photo.photoUrl) urls.add(photo.photoUrl);
    }

    if (urls.size > 0) {
      const list = [...urls];
      await Promise.all(list.map((u) => objectStore.deleteManagedUploadBestEffort(u)));
      await prisma.groupStorageFile.deleteMany({ where: { publicUrl: { in: list } } });
    }

    await prisma.poll.updateMany({ where: { closedBy: userId }, data: { closedBy: null } });
    await prisma.comment.deleteMany({ where: { userId } });
    await prisma.event.deleteMany({ where: { createdBy: userId } });
    await prisma.poll.deleteMany({ where: { createdBy: userId } });
  }
}
