import { PrismaClient } from '@prisma/client';
import { User, UserInput, UserUpdate } from '../models';

const prisma = new PrismaClient();

export class UserService {
  /**
   * Get all users
   */
  public async getAll(): Promise<User[]> {
    return prisma.user.findMany();
  }

  /**
   * Get user by ID
   */
  public async getById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  /**
   * Create a new user
   */
  public async create(input: UserInput): Promise<User> {
    return prisma.user.create({
      data: input,
    });
  }

  /**
   * Create or update user from auth (idempotent; avoids GET 404 on first sign-in)
   */
  public async upsertFromAuth(input: UserInput): Promise<User> {
    return prisma.user.upsert({
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
  }

  /**
   * Update a user
   */
  public async update(id: string, input: UserUpdate): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: input,
    });
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
