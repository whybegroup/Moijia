import { PrismaClient } from '@prisma/client';
import { User, UserInput, UserUpdate } from '../models';
import { mergeNotifPrefs, parseNotifPrefsJson } from '../utils/notifPrefsCore';

const prisma = new PrismaClient();

export class UserService {
  private mapUser(row: any): User {
    const { notifPrefsJson, ...rest } = row;
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
   * Create or update user from auth (idempotent; avoids GET 404 on first sign-in)
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
      },
      update: {
        name: input.name,
        displayName: input.displayName,
        ...(input.avatarSeed !== undefined ? { avatarSeed: input.avatarSeed } : {}),
        ...(input.thumbnail !== undefined ? { thumbnail: input.thumbnail } : {}),
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
   * Delete a user
   */
  public async delete(id: string): Promise<void> {
    await prisma.user.delete({
      where: { id },
    });
  }
}
