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
  /** ID of the group's super admin */
  superAdminId: string;
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
  memberCount: number;
  membershipStatus: MembershipStatus;
  /** Present when member or admin */
  inviteCode?: string | null;
  superAdminId?: string;
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
  superAdminId: string;
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
  superAdminId?: string;
  adminIds?: string[];
  memberIds?: string[];
  updatedBy: string;
}

/**
 * Group member role
 */
export type GroupRole = 'member' | 'admin' | 'superadmin';

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
