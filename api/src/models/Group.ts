/**
 * Group model - represents a social group
 */
export interface Group {
  /** Unique group identifier */
  id: string;
  /** Group name */
  name: string;
  /** Group description */
  desc: string;
  /** Group thumbnail/avatar URL */
  thumbnail?: string | null;
  /** Whether the group is publicly visible */
  isPublic: boolean;
  /** ID of the group's super admin */
  superAdminId: string;
  /** Array of admin user IDs */
  adminIds: string[];
  /** Array of member user IDs */
  memberIds: string[];
  /** Array of pending member request user IDs */
  pendingMemberIds?: string[];
  /** Timestamp when the group was created */
  createdAt: Date;
  /** Timestamp when the group was last updated */
  updatedAt: Date;
}

/**
 * Input for creating a new group
 */
export interface GroupInput {
  id: string;
  name: string;
  desc: string;
  thumbnail?: string | null;
  isPublic: boolean;
  superAdminId: string;
  adminIds?: string[];
  memberIds?: string[];
}

/**
 * Input for updating a group
 */
export interface GroupUpdate {
  name?: string;
  desc?: string;
  thumbnail?: string | null;
  isPublic?: boolean;
  superAdminId?: string;
  adminIds?: string[];
  memberIds?: string[];
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
