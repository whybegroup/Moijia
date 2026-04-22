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
  /** UTC instant (ISO) after which voting should be considered closed. */
  deadline: Date | string;
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
  /** UTC instant when voting closes. */
  deadline: string;
  coverPhotos: string[];
  options: PollOption[];
  createdAt: string;
  updatedAt: string;
}

export interface PollVoteInput {
  userId: string;
  optionIds: string[];
}

export interface PollQuestionResult {
  questionKey: string;
  questionIndex: number;
  questionTitle: string;
  questionType: 'single' | 'multiple' | 'rating';
  totalVotes: number;
  options: Array<{
    optionId: string;
    label: string;
    votes: number;
    pct: number;
  }>;
}

export interface PollResults {
  pollId: string;
  myOptionIds: string[];
  questions: PollQuestionResult[];
}
