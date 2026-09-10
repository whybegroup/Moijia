import { PrismaClient } from '@prisma/client';
import {
  extractUploadItemsFromForumBody,
  extractUploadItemsFromPlainText,
  extractUploadUrlsFromForumBody,
  removeUploadUrlFromForumBody,
} from '../utils/groupPostBodyUploads';
import {
  DEFAULT_GROUP_MAX_STORAGE_BYTES,
  formatStorageBytes,
  groupMaxStorageBytes,
  groupStorageExceededMessage,
  paidSizeTierFromBytes,
  storageBytesToDb,
} from '../utils/groupStorageLimits';
import { httpError } from '../utils/httpError';
import {
  managedUploadByteSize,
  tryExtractUploadObjectKey,
  uploadUrlOwnedByUser,
  userIdFromUploadUrl,
} from '../utils/objectStorePaths';
import { getS3Config } from '../utils/s3Config';
import { NotificationService } from './NotificationService';
import type {
  GroupStorageBreakdown,
  GroupStorageCategoryId,
  GroupStorageFileList,
} from '../models';

const prisma = new PrismaClient();
const notificationService = new NotificationService();

export class GroupStorageService {
  public async getMaxStorageBytes(groupId: string): Promise<number> {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { maxStorageBytes: true, sizeTier: true },
    });
    if (!group) return DEFAULT_GROUP_MAX_STORAGE_BYTES;
    return groupMaxStorageBytes(group.maxStorageBytes, group.sizeTier);
  }

  public async trackedBytesForKey(objectKey: string): Promise<number> {
    const row = await prisma.groupStorageFile.findUnique({
      where: { objectKey },
      select: { byteSize: true },
    });
    return row?.byteSize ?? 0;
  }

  public async getUsedStorageBytes(groupId: string): Promise<number> {
    const referenced = await this.collectReferencedUploadUrls(groupId);
    const sizes = await this.sizeMapForGroup(groupId, referenced);
    let total = 0;
    for (const size of sizes.values()) total += size;
    return total;
  }

  public async assertCanAddBytes(groupId: string, userId: string | null, additionalBytes: number): Promise<void> {
    const extra = Math.max(0, Math.floor(additionalBytes));

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, maxStorageBytes: true, sizeTier: true, deletedAt: true },
    });

    if (group) {
      if (group.deletedAt) {
        throw httpError(404, 'Group not found');
      }
      if (userId) {
        const member = await prisma.groupMember.findUnique({
          where: { groupId_userId: { groupId, userId } },
          select: { status: true },
        });
        if (!member || member.status !== 'active') {
          throw httpError(403, 'Must be an active member to upload to this group');
        }
      }
    }

    const maxBytes = group
      ? groupMaxStorageBytes(group.maxStorageBytes, group.sizeTier)
      : DEFAULT_GROUP_MAX_STORAGE_BYTES;
    const used = await this.getUsedStorageBytes(groupId);
    if (used >= maxBytes || used + extra > maxBytes) {
      throw httpError(413, groupStorageExceededMessage(maxBytes));
    }
  }

  public async recordUpload(input: {
    groupId: string;
    objectKey: string;
    publicUrl: string;
    byteSize: number;
    originalName?: string;
  }): Promise<void> {
    const byteSize = Math.max(0, Math.floor(input.byteSize));
    const originalName = input.originalName?.trim() || undefined;
    await prisma.groupStorageFile.upsert({
      where: { objectKey: input.objectKey },
      create: {
        groupId: input.groupId,
        objectKey: input.objectKey,
        publicUrl: input.publicUrl,
        byteSize,
        originalName,
      },
      update: {
        groupId: input.groupId,
        publicUrl: input.publicUrl,
        byteSize,
        ...(originalName ? { originalName } : {}),
      },
    });
  }

  public async removeByObjectKey(objectKey: string): Promise<void> {
    try {
      await prisma.groupStorageFile.delete({ where: { objectKey } });
    } catch {
      /* already gone */
    }
  }

  public async removeByUrl(sourceUrl: string): Promise<void> {
    const key = tryExtractUploadObjectKey(sourceUrl, getS3Config());
    if (!key) return;
    await this.removeByObjectKey(key);
  }

  public async requireActiveMember(
    groupId: string,
    userId: string
  ): Promise<{ role: string }> {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, deletedAt: true },
    });
    if (!group || group.deletedAt) {
      throw httpError(404, 'Group not found');
    }
    const member = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { status: true, role: true },
    });
    if (!member || member.status !== 'active') {
      throw httpError(403, 'Must be an active group member');
    }
    return { role: member.role };
  }

  public canDeleteStorageFile(url: string, userId: string, role: string): boolean {
    if (role === 'owner' || role === 'admin') return true;
    return uploadUrlOwnedByUser(url, userId);
  }

  public parseStorageCategory(raw: string): GroupStorageCategoryId {
    if (raw === 'group' || raw === 'events' || raw === 'polls' || raw === 'posts') return raw;
    throw httpError(400, 'category must be group, events, polls, or posts');
  }

  private async sizeMapForGroup(groupId: string, extraUrls: string[]): Promise<Map<string, number>> {
    const tracked = await prisma.groupStorageFile.findMany({
      where: { groupId },
      select: { objectKey: true, byteSize: true },
    });
    const sizes = new Map<string, number>();
    for (const row of tracked) {
      if (row.objectKey) sizes.set(row.objectKey, row.byteSize);
    }
    const cfg = getS3Config();
    for (const url of extraUrls) {
      const key = tryExtractUploadObjectKey(url, cfg);
      if (!key || sizes.has(key)) continue;
      const size = await managedUploadByteSize(url);
      if (size != null && size > 0) sizes.set(key, size);
    }
    return sizes;
  }

  private bytesForUrls(urls: string[], sizes: Map<string, number>): number {
    const cfg = getS3Config();
    const seen = new Set<string>();
    let total = 0;
    for (const url of urls) {
      const key = tryExtractUploadObjectKey(url, cfg) ?? url;
      if (seen.has(key)) continue;
      seen.add(key);
      total += sizes.get(key) ?? 0;
    }
    return total;
  }

  private byteSizeForUrl(url: string, sizes: Map<string, number>): number {
    const key = tryExtractUploadObjectKey(url, getS3Config()) ?? url;
    return sizes.get(key) ?? 0;
  }

  private async originalNameMapForGroup(groupId: string): Promise<Map<string, string>> {
    const tracked = await prisma.groupStorageFile.findMany({
      where: { groupId, originalName: { not: null } },
      select: { objectKey: true, publicUrl: true, originalName: true },
    });
    const names = new Map<string, string>();
    for (const row of tracked) {
      const name = row.originalName?.trim();
      if (!name) continue;
      if (row.objectKey) names.set(row.objectKey, name);
      if (row.publicUrl) names.set(row.publicUrl, name);
    }
    return names;
  }

  private resolvedFileName(
    item: { url: string; fileName?: string },
    storedNames: Map<string, string>
  ): string | undefined {
    const uuidFile = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i;
    const fromBody = item.fileName?.trim();
    if (
      fromBody &&
      !/^(image|photo|img|attachment)$/i.test(fromBody) &&
      !uuidFile.test(fromBody)
    ) {
      return fromBody;
    }
    const key = tryExtractUploadObjectKey(item.url, getS3Config());
    const stored = (key ? storedNames.get(key) : undefined) || storedNames.get(item.url);
    const name = stored?.trim();
    if (name && !uuidFile.test(name)) return name;
    return undefined;
  }

  public async collectCategorizedUploadUrls(groupId: string): Promise<{
    events: Array<{ url: string; label: string; fileName?: string }>;
    polls: Array<{ url: string; label: string; fileName?: string }>;
    posts: Array<{ url: string; label: string; fileName?: string }>;
    group: Array<{ url: string; label: string; fileName?: string }>;
  }> {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: {
        thumbnail: true,
        coverPhotos: { select: { photoUrl: true } },
        events: {
          select: {
            name: true,
            coverPhotos: { select: { photoUrl: true } },
            comments: { select: { text: true, photos: { select: { photoUrl: true } } } },
          },
        },
        polls: { select: { title: true, photos: { select: { photoUrl: true } } } },
        posts: {
          select: {
            title: true,
            body: true,
            comments: { select: { body: true } },
          },
        },
      },
    });

    type Collected = { url: string; label: string; fileName?: string };
    const events: Collected[] = [];
    const polls: Collected[] = [];
    const posts: Collected[] = [];
    const groupFiles: Collected[] = [];
    if (!group) return { events, polls, posts, group: groupFiles };

    const pushUnique = (
      bucket: Collected[],
      url: string | null | undefined,
      label: string,
      fileName?: string
    ) => {
      const u = url?.trim();
      if (!u) return;
      const name = fileName?.trim() || undefined;
      const existing = bucket.find((item) => item.url === u);
      if (existing) {
        if (name && !existing.fileName) existing.fileName = name;
        return;
      }
      bucket.push({ url: u, label, fileName: name });
    };

    pushUnique(groupFiles, group.thumbnail, 'Group photo');
    for (const p of group.coverPhotos) pushUnique(groupFiles, p.photoUrl, 'Group photo');

    for (const ev of group.events) {
      const label = ev.name?.trim() || 'Event';
      for (const p of ev.coverPhotos) pushUnique(events, p.photoUrl, label);
      for (const c of ev.comments) {
        for (const p of c.photos) pushUnique(events, p.photoUrl, label);
        for (const item of extractUploadItemsFromPlainText(c.text)) {
          pushUnique(events, item.url, label, item.fileName);
        }
      }
    }
    for (const poll of group.polls) {
      const label = poll.title?.trim() || 'Poll';
      for (const p of poll.photos) pushUnique(polls, p.photoUrl, label);
    }
    for (const post of group.posts) {
      const label = post.title?.trim() || 'Post';
      for (const item of extractUploadItemsFromForumBody(post.body)) {
        pushUnique(posts, item.url, label, item.fileName);
      }
      for (const c of post.comments) {
        for (const item of extractUploadItemsFromForumBody(c.body)) {
          pushUnique(posts, item.url, label, item.fileName);
        }
      }
    }

    return { events, polls, posts, group: groupFiles };
  }

  public async collectReferencedUploadUrls(groupId: string): Promise<string[]> {
    const cats = await this.collectCategorizedUploadUrls(groupId);
    const urls = new Set<string>();
    for (const item of [...cats.events, ...cats.polls, ...cats.posts, ...cats.group]) {
      urls.add(item.url);
    }
    return [...urls];
  }

  public async getBreakdown(groupId: string): Promise<GroupStorageBreakdown> {
    const [cats, maxBytes, usedBytes] = await Promise.all([
      this.collectCategorizedUploadUrls(groupId),
      this.getMaxStorageBytes(groupId),
      this.getUsedStorageBytes(groupId),
    ]);
    const allUrls = [...cats.group, ...cats.events, ...cats.polls, ...cats.posts].map((i) => i.url);
    const sizes = await this.sizeMapForGroup(groupId, allUrls);
    const summary = (
      id: GroupStorageCategoryId,
      items: Array<{ url: string }>
    ): GroupStorageBreakdown['categories'][number] => ({
      id,
      usedBytes: this.bytesForUrls(items.map((i) => i.url), sizes),
      fileCount: items.length,
    });
    return {
      usedBytes,
      maxBytes,
      categories: [
        summary('group', cats.group),
        summary('events', cats.events),
        summary('polls', cats.polls),
        summary('posts', cats.posts),
      ],
    };
  }

  public async listFiles(
    groupId: string,
    category: GroupStorageCategoryId,
    viewer: { userId: string; role: string }
  ): Promise<GroupStorageFileList> {
    const cats = await this.collectCategorizedUploadUrls(groupId);
    const items = cats[category];
    const [sizes, storedNames] = await Promise.all([
      this.sizeMapForGroup(
        groupId,
        items.map((i) => i.url)
      ),
      this.originalNameMapForGroup(groupId),
    ]);
    const uploaderIds = [
      ...new Set(
        items
          .map((item) => userIdFromUploadUrl(item.url))
          .filter((id): id is string => !!id)
      ),
    ];
    const uploaders =
      uploaderIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: uploaderIds } },
            select: { id: true, displayName: true, name: true, avatarSeed: true, thumbnail: true },
          })
        : [];
    const uploaderById = new Map(uploaders.map((u) => [u.id, u]));
    return {
      category,
      files: items.map((item) => {
        const uploader = uploaderById.get(userIdFromUploadUrl(item.url) ?? '');
        return {
          url: item.url,
          byteSize: this.byteSizeForUrl(item.url, sizes),
          sourceLabel: item.label,
          fileName: this.resolvedFileName(item, storedNames),
          uploadedByName: uploader ? uploader.displayName || uploader.name : undefined,
          uploadedByAvatarSeed: uploader?.avatarSeed ?? null,
          uploadedByThumbnail: uploader?.thumbnail ?? null,
          canDelete: this.canDeleteStorageFile(item.url, viewer.userId, viewer.role),
        };
      }),
    };
  }

  public async unlinkFileFromGroup(groupId: string, sourceUrl: string): Promise<boolean> {
    const url = sourceUrl.trim();
    if (!url) throw httpError(400, 'url is required');

    const cats = await this.collectCategorizedUploadUrls(groupId);
    const referenced = new Set(
      [...cats.events, ...cats.polls, ...cats.posts, ...cats.group].map((i) => i.url)
    );
    const tracked = await prisma.groupStorageFile.findFirst({
      where: { groupId, publicUrl: url },
      select: { objectKey: true },
    });
    if (!referenced.has(url) && !tracked) {
      throw httpError(404, 'File not found in this group');
    }

    await prisma.eventPhoto.deleteMany({
      where: { photoUrl: url, event: { groupId } },
    });
    await prisma.commentPhoto.deleteMany({
      where: { photoUrl: url, comment: { event: { groupId } } },
    });
    await prisma.pollPhoto.deleteMany({
      where: { photoUrl: url, poll: { groupId } },
    });
    await prisma.groupPhoto.deleteMany({
      where: { groupId, photoUrl: url },
    });
    await prisma.group.updateMany({
      where: { id: groupId, thumbnail: url },
      data: { thumbnail: null },
    });

    const posts = await prisma.groupPost.findMany({
      where: { groupId },
      select: { id: true, body: true },
    });
    for (const post of posts) {
      if (!extractUploadUrlsFromForumBody(post.body).includes(url)) continue;
      const next = removeUploadUrlFromForumBody(post.body, url);
      if (next !== post.body) {
        await prisma.groupPost.update({ where: { id: post.id }, data: { body: next } });
      }
    }

    const comments = await prisma.groupPostComment.findMany({
      where: { post: { groupId } },
      select: { id: true, body: true },
    });
    for (const comment of comments) {
      if (!extractUploadUrlsFromForumBody(comment.body).includes(url)) continue;
      const next = removeUploadUrlFromForumBody(comment.body, url);
      if (next !== comment.body) {
        await prisma.groupPostComment.update({ where: { id: comment.id }, data: { body: next } });
      }
    }

    return true;
  }

  public async collectAllManagedUrlsForPurge(groupId: string): Promise<string[]> {
    const [referenced, tracked] = await Promise.all([
      this.collectReferencedUploadUrls(groupId),
      prisma.groupStorageFile.findMany({
        where: { groupId },
        select: { publicUrl: true },
      }),
    ]);
    return [...new Set([...referenced, ...tracked.map((r) => r.publicUrl)].filter(Boolean))];
  }

  public async purgeOldestUntilUnderCap(groupId: string, capBytes: number): Promise<void> {
    const files = await prisma.groupStorageFile.findMany({
      where: { groupId },
      orderBy: { createdAt: 'asc' },
      select: { publicUrl: true },
    });
    const { S3UploadService } = await import('./S3UploadService');
    const objectStore = new S3UploadService();
    let used = await this.getUsedStorageBytes(groupId);
    for (const file of files) {
      if (used <= capBytes) break;
      try {
        await this.unlinkFileFromGroup(groupId, file.publicUrl);
      } catch {
        /* already unlinked */
      }
      await objectStore.deleteManagedUploadBestEffort(file.publicUrl);
      used = await this.getUsedStorageBytes(groupId);
    }
  }

  public usedExceedsMaxMessage(used: number): string {
    return `Uploaded files already use ${formatStorageBytes(used)}, which exceeds this group's storage limit.`;
  }

  public async deleteTrackingForGroup(groupId: string): Promise<void> {
    await prisma.groupStorageFile.deleteMany({ where: { groupId } });
  }

  public async setMaxStorage(input: {
    groupId: string;
    userId: string;
    maxStorageBytes: number;
  }): Promise<{ maxStorageBytes: number }> {
    const tier = paidSizeTierFromBytes(Math.floor(input.maxStorageBytes));
    if (!tier) {
      throw httpError(400, 'Storage limit must be Medium (10 GB) or Large (100 GB)');
    }
    const { groupBilling } = await import('./GroupBillingService');
    return groupBilling.applyPaidSizeTier({
      groupId: input.groupId,
      userId: input.userId,
      sizeTier: tier,
    });
  }

  public async cancelStorageSubscription(input: {
    groupId: string;
    userId: string;
  }): Promise<{ maxStorageBytes: number }> {
    const group = await prisma.group.findUnique({
      where: { id: input.groupId },
      select: { id: true, name: true, deletedAt: true, maxStorageBytes: true, sizeTier: true, graceNotifiedAt: true },
    });
    if (!group || group.deletedAt) {
      throw httpError(404, 'Group not found');
    }
    const member = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: input.groupId, userId: input.userId } },
      select: { status: true, role: true },
    });
    if (!member || member.status !== 'active' || member.role !== 'owner') {
      throw httpError(403, 'Must be the group owner to cancel the storage subscription');
    }

    const { parseSizeTier, isPaidSizeTier } = await import('../utils/groupStorageLimits');
    const current = parseSizeTier(group.sizeTier);
    if (!isPaidSizeTier(current)) {
      return { maxStorageBytes: groupMaxStorageBytes(group.maxStorageBytes, group.sizeTier) };
    }
    const { groupBilling } = await import('./GroupBillingService');
    await groupBilling.startGrace(group.id, group.name, input.userId, 'small', group.graceNotifiedAt);
    return { maxStorageBytes: groupMaxStorageBytes(group.maxStorageBytes, group.sizeTier) };
  }

  public async grantStorage(groupId: string, maxStorageBytes: number): Promise<void> {
    const cap = Math.floor(maxStorageBytes);
    if (!Number.isFinite(cap) || cap < 1) {
      throw httpError(400, 'maxStorageBytes must be at least 1');
    }
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, name: true, deletedAt: true },
    });
    if (!group || group.deletedAt) {
      throw httpError(404, 'Group not found');
    }

    await prisma.group.update({
      where: { id: groupId },
      data: {
        maxStorageBytes: storageBytesToDb(cap),
        sizeTier: paidSizeTierFromBytes(cap) ?? 'small',
        pendingSizeTier: null,
        graceEndsAt: null,
        graceNotifiedAt: null,
      },
    });
    await this.notifyStorageLimit(groupId, group.name, cap);
  }

  private async notifyStorageLimit(groupId: string, groupName: string, cap: number): Promise<void> {
    const admins = await prisma.groupMember.findMany({
      where: {
        groupId,
        status: 'active',
        role: { in: ['owner', 'admin'] },
      },
      select: { userId: true },
    });
    const ids = [...new Set(admins.map((m) => m.userId))];
    if (ids.length === 0) return;
    await notificationService.createForUsers(
      ids,
      'Storage limit updated',
      `${groupName} can now store up to ${formatStorageBytes(cap)}.`,
      { type: 'group_storage', icon: 'cloud-circle-outline', groupId, dest: 'group' }
    );
  }
}

export const groupStorage = new GroupStorageService();
