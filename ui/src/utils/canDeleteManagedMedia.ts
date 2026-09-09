import { storageKeyFromMediaUrl } from './mediaShareUrl';

/** Owner id from app-managed `storage/{userId}/...` or `moijia.com/f/{userId}/...` URLs. */
export function managedUploadOwnerUserId(url: string): string | null {
  const key = storageKeyFromMediaUrl(url || '');
  if (!key) return null;
  const parts = key.split('/');
  return parts[1] || null;
}

export function isManagedUploadOwnedByUser(
  url: string,
  userId: string | null | undefined
): boolean {
  const uid = userId?.trim();
  if (!uid) return false;
  return managedUploadOwnerUserId(url) === uid;
}

export type GroupMediaRole = {
  ownerId?: string | null;
  adminIds?: string[] | null;
  membershipStatus?: string | null;
};

export function isGroupAdminOrOwner(
  group: GroupMediaRole | null | undefined,
  userId: string | null | undefined
): boolean {
  const uid = userId?.trim();
  if (!uid || !group) return false;
  if (group.ownerId === uid) return true;
  if ((group.adminIds ?? []).includes(uid)) return true;
  return group.membershipStatus === 'admin';
}

/** Admins/owners, the resource author, or the S3 uploader may delete. */
export function canDeleteManagedMedia(opts: {
  currentUserId: string | null | undefined;
  group?: GroupMediaRole | null;
  resourceOwnerId?: string | null;
  url?: string | null;
}): boolean {
  const uid = opts.currentUserId?.trim();
  if (!uid) return false;
  if (opts.resourceOwnerId && opts.resourceOwnerId === uid) return true;
  if (isGroupAdminOrOwner(opts.group, uid)) return true;
  if (opts.url && isManagedUploadOwnedByUser(opts.url, uid)) return true;
  return false;
}
