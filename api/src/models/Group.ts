/** User's relationship to a group - determines what info is returned */
export type MembershipStatus = 'none' | 'pending' | 'member' | 'admin';

/**
 * Group model - represents a social group (full, for members/admins)
 */
export interface Group {
  /** Unique group identifier */
  id: string;
  /** Group name */
  name: string;
  /** Group description */
  desc: string;
  /** Group announcement (visible to all members) */
  announcement?: string | null;
  /** Group thumbnail/avatar URL */
  thumbnail?: string | null;
  /** Cover / banner image URLs (uploaded), ordered */
  coverPhotos: string[];
  /** DiceBear icons seed for generated avatar */
  avatarSeed?: string | null;
  /** Unique invite code for joining the group */
  inviteCode?: string | null;
  /** When true, new members must be approved; when false, join is immediate */
  requireApprovalToJoin: boolean;
  /** Max bytes this group may store in S3. Default Small = 1 GiB. */
  maxStorageBytes: number;
  sizeTier: 'small' | 'medium' | 'large';
  pendingSizeTier?: 'small' | 'medium' | 'large' | null;
  graceEndsAt?: Date | null;
  maxMemberCount?: number | null;
  memberAddsBlocked?: boolean;
  /** Bytes used by this group's images and file attachments. */
  usedStorageBytes?: number;
  /** ID of the group's owner */
  ownerId: string;
  /** Array of admin user IDs */
  adminIds: string[];
  /** Array of member user IDs */
  memberIds: string[];
  /** Array of pending member request user IDs */
  pendingMemberIds?: string[];
  /** ID of the user who created this group */
  createdBy: string;
  /** ID of the user who last updated this group */
  updatedBy: string;
  /** Timestamp when the group was created */
  createdAt: Date;
  /** Timestamp when the group was last updated */
  updatedAt: Date;
}

/**
 * Group scoped by membership - API returns only appropriate fields per user's status
 */
export interface GroupScoped {
  id: string;
  name: string;
  desc: string;
  announcement?: string | null;
  thumbnail?: string | null;
  coverPhotos: string[];
  avatarSeed?: string | null;
  requireApprovalToJoin: boolean;
  /** Max bytes this group may store in S3. Default Small = 1 GiB. */
  maxStorageBytes: number;
  sizeTier: 'small' | 'medium' | 'large';
  pendingSizeTier?: 'small' | 'medium' | 'large' | null;
  graceEndsAt?: Date | null;
  maxMemberCount?: number | null;
  memberAddsBlocked?: boolean;
  /** Bytes used by this group's images and file attachments. Present on group detail. */
  usedStorageBytes?: number;
  memberCount: number;
  membershipStatus: MembershipStatus;
  /** Present when member or admin */
  inviteCode?: string | null;
  ownerId?: string;
  adminIds?: string[];
  memberIds?: string[];
  /** Present when admin only */
  pendingMemberIds?: string[];
  createdBy?: string;
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
  /** Set when group is soft-deleted */
  deletedAt?: Date | null;
  deletedBy?: string | null;
}

/**
 * Input for creating a new group
 */
export interface GroupInput {
  id: string;
  name: string;
  desc: string;
  thumbnail?: string | null;
  coverPhotos?: string[];
  avatarSeed?: string | null;
  inviteCode?: string | null;
  requireApprovalToJoin?: boolean;
  ownerId: string;
  adminIds?: string[];
  memberIds?: string[];
  createdBy: string;
}

/**
 * Input for updating a group
 */
export interface GroupUpdate {
  name?: string;
  desc?: string;
  announcement?: string | null;
  thumbnail?: string | null;
  coverPhotos?: string[];
  avatarSeed?: string | null;
  requireApprovalToJoin?: boolean;
  ownerId?: string;
  adminIds?: string[];
  memberIds?: string[];
  updatedBy: string;
}

/**
 * Group member role
 */
export type GroupRole = 'member' | 'admin' | 'owner';

/**
 * Group member status
 */
export type GroupMemberStatus = 'pending' | 'active' | 'rejected';

/**
 * Membership request action
 */
export interface MembershipRequestAction {
  /** User ID of the member request */
  userId: string;
  /** Action to take: approve or reject */
  action: 'approve' | 'reject';
}

export interface GroupPostReactionEntry {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface GroupPostComment {
  id: string;
  postId: string;
  userId: string;
  body: string;
  parentCommentId?: string;
  createdAt: Date;
  updatedAt: Date;
  reactions: GroupPostReactionEntry[];
}

export interface GroupPost {
  id: string;
  groupId: string;
  userId: string;
  title: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  reactions: GroupPostReactionEntry[];
  comments: GroupPostComment[];
}

export interface GroupPostCreateInput {
  id: string;
  userId: string;
  title: string;
  body: string;
  /** Client-resolved mention targets; server validates against group roster */
  mentionedUserIds?: string[];
}

export interface GroupPostUpdateInput {
  userId: string;
  title: string;
  body: string;
  /** Client-resolved mention targets; server validates against group roster */
  mentionedUserIds?: string[];
}

export interface GroupPostCommentCreateInput {
  id: string;
  userId: string;
  body: string;
  parentCommentId?: string;
  /** Client-resolved mention targets; server validates against group roster */
  mentionedUserIds?: string[];
}

export interface GroupPostCommentUpdateInput {
  userId: string;
  body: string;
  /** When set (including `null`), replaces reply parent; omit to leave unchanged. */
  parentCommentId?: string | null;
  /** Client-resolved mention targets; server validates against group roster */
  mentionedUserIds?: string[];
}

export interface GroupPostReactionInput {
  userId: string;
  emoji: string;
}

/** Owner-applied Medium or Large add-on. Takes effect immediately on upgrade; downgrade uses grace if over cap. */
export interface GroupStorageLimitInput {
  sizeTier: 'medium' | 'large';
}

export interface GroupBillingSyncInput {
  mediumActive: boolean;
  largeActive: boolean;
}

export interface OwnedGroupQuota {
  ownedGroupCount: number;
  freeGroupLimit: number;
  extraGroupSlots: number;
  canCreateGroup: boolean;
}

export type GroupStorageCategoryId = 'group' | 'events' | 'polls' | 'posts';

export interface GroupStorageCategorySummary {
  id: GroupStorageCategoryId;
  usedBytes: number;
  fileCount: number;
}

export interface GroupStorageBreakdown {
  usedBytes: number;
  maxBytes: number;
  categories: GroupStorageCategorySummary[];
}

export interface GroupStorageFileItem {
  url: string;
  byteSize: number;
  sourceLabel?: string;
  /** Original or derived file name (used for non-image tiles). */
  fileName?: string;
  /** Display name of the member who uploaded this file. */
  uploadedByName?: string;
  uploadedByAvatarSeed?: string | null;
  uploadedByThumbnail?: string | null;
  /** Viewer may delete this file (owner/admin, or the member who uploaded it). */
  canDelete: boolean;
}

export interface GroupStorageFileList {
  category: GroupStorageCategoryId;
  files: GroupStorageFileItem[];
}

export interface GroupStorageFileDeleteInput {
  url: string;
}

