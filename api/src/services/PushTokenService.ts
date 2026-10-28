import { PrismaClient } from '@prisma/client';
import type { PushTokenInput } from '../models/PushToken';

const prisma = new PrismaClient();

export class PushTokenService {
  public async register(userId: string, input: PushTokenInput): Promise<void> {
    const token = input.token.trim();
    if (!token) return;

    await prisma.pushToken.upsert({
      where: { token },
      create: {
        userId,
        token,
        platform: input.platform,
        deviceId: input.deviceId?.trim() || null,
      },
      update: {
        userId,
        platform: input.platform,
        deviceId: input.deviceId?.trim() || null,
      },
    });
  }

  public async unregister(userId: string, token: string): Promise<void> {
    const t = token.trim();
    if (!t) return;
    await prisma.pushToken.deleteMany({
      where: { userId, token: t },
    });
  }

  public async unregisterAllForUser(userId: string): Promise<void> {
    await prisma.pushToken.deleteMany({ where: { userId } });
  }
}
