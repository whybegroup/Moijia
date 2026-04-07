import type { NotifPrefs, NotifPrefsPartial } from './NotifPrefs';

/**
 * User model - represents a user in the system
 */
export interface User {
  /** Unique user identifier */
  id: string;
  /** User's name */
  name: string;
  /** User's display name with location and year */
  displayName: string;
  /** DiceBear bottts seed for generated avatar */
  avatarSeed?: string | null;
  /** Optional custom avatar image URL */
  thumbnail?: string | null;
  /** Global in-app notification toggles (applies to all groups, AND with per-group prefs) */
  notifPrefs?: NotifPrefs;
  /** Timestamp when the user was created */
  createdAt: Date;
  /** Timestamp when the user was last updated */
  updatedAt: Date;
}

/**
 * Input for creating a new user
 */
export interface UserInput {
  id: string;
  name: string;
  displayName: string;
  avatarSeed?: string | null;
  thumbnail?: string | null;
}

/**
 * Input for updating a user
 */
export interface UserUpdate {
  name?: string;
  displayName?: string;
  avatarSeed?: string | null;
  thumbnail?: string | null;
  /** Merged into existing global notification preferences */
  notifPrefs?: NotifPrefsPartial;
}
