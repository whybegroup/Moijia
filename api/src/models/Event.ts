/**
 * Event model - represents a scheduled event
 */
export interface Event {
  /** Unique event identifier */
  id: string;
  /** ID of the group this event belongs to */
  groupId: string;
  /** ID of the user who created this event */
  createdBy: string;
  /** ID of the user who last updated this event */
  updatedBy: string;
  /** Event title */
  title: string;
  /** Event description (multiline) */
  description?: string | null;
  /** Array of cover photo URLs */
  coverPhotos: string[];
  /** Event start date/time */
  start: Date;
  /** Event end date/time */
  end: Date;
  /** Whether this is an all-day event */
  isAllDay?: boolean | null;
  /** Event location */
  location?: string | null;
  /** Minimum number of attendees required */
  minAttendees?: number | null;
  /** Maximum number of attendees allowed */
  maxAttendees?: number | null;
  /** Whether waitlist is enabled when max capacity is reached */
  enableWaitlist?: boolean | null;
  /** Whether 'maybe' RSVPs are allowed */
  allowMaybe: boolean;
  /**
   * When set, RSVPs cannot be created or updated after this instant (server time).
   * Null means no RSVP deadline.
   */
  rsvpDeadline?: Date | string | null;
  /** When true, clients show the activity ideas (options + voting) UI. */
  activityIdeasEnabled: boolean;
  /**
   * RFC 5545 RRULE (same string on every row in a series). Null on one-off events.
   * Used when creating/editing; not shown on the event detail screen in the app.
   */
  recurrenceRule?: string | null;
  /** Present on each row that belongs to the same materialized recurrence. */
  recurrenceSeriesId?: string | null;
  /** Timestamp when the event was created */
  createdAt: Date;
  /** Timestamp when the event was last updated */
  updatedAt: Date;
}

/** Proposed activity for an event; members vote for one. */
export interface EventActivityOption {
  id: string;
  label: string;
  createdBy: string;
  voteCount: number;
  createdAt: Date;
}

/** Alternate schedule proposed by a member; host may accept to update the event. */
export interface EventTimeSuggestion {
  id: string;
  suggestedBy: string;
  start: Date;
  end: Date;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Event with RSVPs and comments (detailed view)
 */
export interface EventDetailed extends Event {
  /** Number of DB rows sharing `recurrenceSeriesId` (1 for non-series). Only on GET /events/:id. */
  recurrenceSeriesMemberCount?: number;
  /** Array of RSVPs for this event */
  rsvps: RSVP[];
  /** Array of comments on this event */
  comments: Comment[];
  /** Activity choices; members add options and vote */
  activityOptions: EventActivityOption[];
  /** When the request included viewer `userId`: option ids this user voted for */
  myActivityVoteOptionIds?: string[];
  /** Suggested time changes */
  timeSuggestions: EventTimeSuggestion[];
  /**
   * When loaded with a viewer `userId`: whether they are watching for default event notifications.
   * Default on for host + Going/Maybe; others off until they opt in (or override).
   */
  viewerWatching?: boolean;
  /** Default watch if the user has no explicit watch row (host | going | maybe). */
  viewerWatchDefault?: boolean;
}

/** Body for PUT /events/:id/watch */
export interface EventWatchInput {
  watching: boolean;
}

/** Body for POST /events/:id/recurrence/truncate */
export interface RecurrenceTruncateSeriesInput {
  /**
   * ISO 8601 start of the first occurrence to drop. That occurrence and every later one are removed;
   * earlier instances stay on the calendar.
   */
  occurrenceStart: string;
  /**
   * IANA timezone from `Intl.DateTimeFormat().resolvedOptions().timeZone` on the device.
   * Needed so WEEKLY rules match the same instants as the in-app calendar (local weekday expansion).
   */
  viewerTimeZone?: string;
}

/** Result of truncating a series at an occurrence (or deleting the event if nothing would remain). */
export interface RecurrenceTruncateResult {
  deleted: boolean;
  event?: Event;
}

/**
 * Input for creating a new event
 */
export interface EventInput {
  id: string;
  groupId: string;
  createdBy: string;
  title: string;
  /** Event description (multiline) */
  description?: string;
  coverPhotos?: string[];
  start: Date | string;
  end: Date | string;
  isAllDay?: boolean;
  location?: string;
  minAttendees?: number;
  maxAttendees?: number;
  enableWaitlist?: boolean;
  allowMaybe?: boolean;
  /** ISO instant; omit for no deadline on create. */
  rsvpDeadline?: string | null;
  /** When true, members can suggest and vote on activity ideas on the event page. */
  activityIdeasEnabled?: boolean;
  /** Initial activity options (labels); creator is recorded as author */
  activityOptionLabels?: string[];
  recurrenceRule?: string | null;
  /**
   * IANA zone (`Intl…resolvedOptions().timeZone`) so WEEKLY materialization matches the device calendar.
   */
  viewerTimeZone?: string;
}

/**
 * Input for updating an event
 */
export interface EventUpdate {
  title?: string;
  /** Event description (multiline) */
  description?: string;
  coverPhotos?: string[];
  start?: Date | string;
  end?: Date | string;
  isAllDay?: boolean;
  location?: string;
  /** Omit to leave unchanged; `null` clears the cap. */
  minAttendees?: number | null;
  /** Omit to leave unchanged; `null` clears the cap. */
  maxAttendees?: number | null;
  enableWaitlist?: boolean;
  allowMaybe?: boolean;
  activityIdeasEnabled?: boolean;
  /** ISO instant, or null to clear the deadline. Omit to leave unchanged. */
  rsvpDeadline?: string | null;
  updatedBy: string;
  /** Set to null to clear recurrence on this row (series rows should stay in sync via the same value). */
  recurrenceRule?: string | null;
  /**
   * How edits apply when this event belongs to a recurring series. Ignored for one-off events.
   * `this_occurrence`: update only this row; clears `recurrenceSeriesId` and `recurrenceRule` so it is standalone.
   * `this_and_following`: this row and any same-series row with `start` strictly after this row’s `start`; those rows get a new shared `recurrenceSeriesId` after the update (earlier rows keep the old id).
   * `all_occurrences`: every stored row with the same `recurrenceSeriesId` (id unchanged).
   * When omitted, legacy single-row behavior for non-series fields; recurrence rule still syncs across the whole series.
   */
  seriesUpdateScope?: 'this_occurrence' | 'this_and_following' | 'all_occurrences';
  /**
   * IANA zone (`Intl…resolvedOptions().timeZone`) when applying `start`/`end` across a series:
   * each occurrence keeps its local date; wall times and duration follow the form.
   */
  viewerTimeZone?: string;
}

/**
 * RSVP model
 */
export interface RSVP {
  /** User ID who made the RSVP */
  userId: string;
  /** RSVP status */
  status: 'going' | 'maybe' | 'notGoing' | 'waitlist';
  /** Optional memo or note */
  memo: string;
  /** Timestamp when created */
  createdAt: Date;
  /** Timestamp when updated */
  updatedAt: Date;
}

/**
 * Input for creating/updating an RSVP
 */
export interface RSVPInput {
  userId: string;
  status: 'going' | 'maybe' | 'notGoing' | 'waitlist';
  memo?: string;
}

/** Aggregated reaction on a comment (multi-emoji per user). */
export interface CommentReactionEntry {
  emoji: string;
  count: number;
  userIds: string[];
}

/** Parent snippet for threaded reply UI. */
export interface CommentReplyTo {
  id: string;
  userId: string;
  text: string;
  preview: string;
  user: { id: string; displayName?: string; name?: string };
  photos: string[];
}

/**
 * Comment model
 */
export interface Comment {
  /** Unique comment identifier */
  id: string;
  /** ID of the user who made the comment */
  userId: string;
  /** Comment text */
  text: string;
  /** Array of photo URLs attached to comment */
  photos: string[];
  /** Timestamp when created */
  createdAt: Date;
  /** Timestamp when updated */
  updatedAt: Date;
  /** When set, this comment replies to another comment on the same event */
  replyToCommentId?: string;
  reactions: CommentReactionEntry[];
  viewerReactionEmojis: string[];
  replyTo: CommentReplyTo | null;
}

/**
 * Input for creating a comment
 */
export interface CommentInput {
  id: string;
  userId: string;
  text?: string;
  photos?: string[];
  /** Client-resolved mention targets; server validates they are in the event's group */
  mentionedUserIds?: string[];
  replyToCommentId?: string;
}

/** Toggle a reaction emoji on a comment (POST body). */
export interface CommentReactionInput {
  userId: string;
  emoji: string;
}

/** Input for editing a comment */
export interface CommentUpdateInput {
  actorId: string;
  /** When omitted, existing text is kept */
  text?: string;
  /** When set, replaces the full photo set for this comment */
  photos?: string[];
}

/** Input for deleting a comment */
export interface CommentDeleteInput {
  actorId: string;
}

/** Add an activity option to an event */
export interface EventActivityOptionInput {
  id: string;
  userId: string;
  label: string;
}

/** Cast or change vote for an activity option */
export interface EventActivityVoteInput {
  userId: string;
  optionId: string;
}

/** Propose a new start/end time for the event */
export interface EventTimeSuggestionInput {
  id: string;
  userId: string;
  start: Date | string;
  end: Date | string;
}
