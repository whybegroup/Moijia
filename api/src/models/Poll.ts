/**
 * How a poll choice is represented.
 */
export type PollOptionInputKind = 'text' | 'datetime';

/**
 * Font preset for text poll options (stored and reapplied when rendering).
 */
export type PollTextFont = 'sans' | 'serif' | 'mono';

export interface PollOptionInput {
  /** Client-generated id (optional). */
  id?: string;
  inputKind: PollOptionInputKind;
  sortOrder: number;
  /** Sanitized HTML body when `inputKind` is `text`. */
  textHtml?: string;
  textFont?: PollTextFont;
  /** ISO 8601 UTC when `inputKind` is `datetime`. */
  dateTimeValue?: string;
}

export interface PollInput {
  id?: string;
  groupId: string;
  createdBy: string;
  title: string;
  description?: string;
  coverPhotos?: string[];
  options: PollOptionInput[];
  anonymousVotes?: boolean;
  multipleChoice?: boolean;
  ranking?: boolean;
}

export interface PollOption {
  id: string;
  pollId: string;
  sortOrder: number;
  inputKind: PollOptionInputKind;
  textHtml?: string;
  textFont?: PollTextFont;
  dateTimeValue?: string;
}

export interface Poll {
  id: string;
  groupId: string;
  createdBy: string;
  updatedBy: string;
  title: string;
  description?: string;
  anonymousVotes: boolean;
  multipleChoice: boolean;
  ranking: boolean;
  coverPhotos: string[];
  options: PollOption[];
  createdAt: string;
  updatedAt: string;
}
