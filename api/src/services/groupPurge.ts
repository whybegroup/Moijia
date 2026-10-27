import { PrismaClient } from '../generated/prisma';
import { groupFriendships } from './GroupFriendshipService';
import { groupStorage } from './GroupStorageService';
import { S3UploadService } from './S3UploadService';

const prisma = new PrismaClient();
const objectStore = new S3UploadService();

/** Hard-delete a group and its stored files. Returns false when the group is already gone. */
export async function purgeGroupCompletely(groupId: string): Promise<boolean> {
  const exists = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true },
  });
  if (!exists) return false;

  await groupFriendships.removeAllForGroup(groupId);
  const urlsToPurge = await groupStorage.collectAllManagedUrlsForPurge(groupId);
  await prisma.group.delete({ where: { id: groupId } });
  await Promise.all(urlsToPurge.map((url) => objectStore.deleteManagedUploadBestEffort(url)));
  await groupStorage.deleteTrackingForGroup(groupId);
  return true;
}
