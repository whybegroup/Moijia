import { PrismaClient } from '@prisma/client';
import { User, UserInput, UserUpdate } from '../models';
import { mergeNotifPrefs, parseNotifPrefsJson } from '../utils/notifPrefsCore';
import { parseGroupOrderJson, serializeGroupOrderJson } from '../utils/groupOrder';
import type { GroupOrderInput } from '../models/GroupOrder';

const prisma = new PrismaClient();

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
   * Delete a user
   */
  public async delete(id: string): Promise<void> {
    await prisma.user.delete({
      where: { id },
    });
  }
}
