import { UploadsService } from '@moijia/client';

/** Best-effort DELETE for app-managed `https` uploads; ignores failures. */
export function deleteManagedUploadFireAndForget(userId: string, sourceUrl: string): void {
  const uid = userId.trim();
  const u = sourceUrl.trim();
  if (!uid || !/^https?:\/\//i.test(u)) return;
  void UploadsService.deleteUploadedObject(uid, { sourceUrl: u }).catch(() => {
    /* 400/403/404/network */
  });
}
