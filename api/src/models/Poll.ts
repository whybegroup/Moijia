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
  /** Distinct group members who submitted at least one option vote or text answer. */
  respondentCount: number;
  /** Effective watcher status for the viewer (when loaded with userId). */
  viewerWatching?: boolean;
  /** Default watcher status for the viewer when no explicit PollWatch row exists. */
  viewerWatchDefault?: boolean;
}

/** Body for PUT /polls/{id}/watch */
export interface PollWatchInput {
  watching: boolean;
}

export interface PollVoteInput {
  userId: string;
  optionIds: string[];
  textAnswers?: Array<{
    questionKey: string;
    answer: string;
  }>;
}

export interface PollQuestionResult {
  questionKey: string;
  questionIndex: number;
  questionTitle: string;
  questionType: 'single' | 'multiple' | 'rating' | 'text';
  anonymousVotes?: boolean;
  totalVotes: number;
  textResponseCount?: number;
  textResponses?: Array<{
    userId: string;
    userName: string;
    answer: string;
  }>;
  options: Array<{
    optionId: string;
    label: string;
    votes: number;
    pct: number;
    voters?: Array<{
      userId: string;
      userName: string;
    }>;
  }>;
}

export interface PollResults {
  pollId: string;
  myOptionIds: string[];
  questions: PollQuestionResult[];
}
