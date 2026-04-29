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
  createdByName?: string;
  updatedBy: string;
  title: string;
  description?: string;
  anonymousVotes: boolean;
  multipleChoice: boolean;
  ranking: boolean;
  /** UTC instant when voting closes. */
  deadline: string;
  /** UTC instant when poll was manually closed before deadline. */
  closedAt?: string;
  /** User id who manually closed the poll. */
  closedBy?: string;
  /** Display name of closer when available. */
  closedByName?: string;
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

/** Body for POST /polls/{id}/close */
export interface PollCloseInput {
  userId: string;
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
    /** Distinct voters who picked this option (always set; survives anonymous redaction). */
    responseCount: number;
    pct: number;
    voters?: Array<{
      userId: string;
      userName: string;
      /** Ranking position when questionType is rating (1 = best). */
      rank?: number;
    }>;
  }>;
}

export interface PollResults {
  pollId: string;
  myOptionIds: string[];
  questions: PollQuestionResult[];
}

export type PollOptionSuggestionStatus = 'pending' | 'accepted' | 'declined';

export interface PollOptionSuggestion {
  id: string;
  pollId: string;
  questionKey: string;
  label: string;
  suggestedBy: string;
  suggesterName?: string;
  status: PollOptionSuggestionStatus;
  createdAt: string;
  decidedAt?: string;
}

/** Body for POST /polls/{id}/option-suggestions */
export interface PollOptionSuggestionInput {
  userId: string;
  questionKey: string;
  label: string;
}

/** Body for POST /polls/{id}/option-suggestions/{suggestionId}/decide */
export interface PollOptionSuggestionDecisionInput {
  userId: string;
  decision: 'accept' | 'decline';
}

/** Response when accepting (includes updated poll); decline returns suggestion only via poll optional absent */
export interface PollOptionSuggestionDecisionResult {
  suggestion: PollOptionSuggestion;
  /** Present when decision was accept and poll was updated. */
  poll?: Poll;
}
