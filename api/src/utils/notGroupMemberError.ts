import type { PrismaClient } from '@prisma/client';
import { httpError, type HttpError } from './httpError';

export const NOT_GROUP_MEMBER_CODE = 'NOT_GROUP_MEMBER';

export async function notGroupMemberError(
  prisma: PrismaClient,
  groupId: string,
  userId: string
): Promise<HttpError> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { name: true, requireApprovalToJoin: true, deletedAt: true },
  });
  if (!group || group.deletedAt) {
    return httpError(404, 'Not found');
  }
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { status: true },
  });
  return httpError(403, 'Not a group member', {
    code: NOT_GROUP_MEMBER_CODE,
    groupId,
    groupName: group.name,
    membershipStatus: membership?.status === 'pending' ? 'pending' : 'none',
    requireApprovalToJoin: group.requireApprovalToJoin ?? true,
  });
}
