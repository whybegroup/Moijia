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
  /** Event name */
  name: string;
  /** Event description (multiline) */
  description?: string | null;
  /** Array of cover photo URLs */
  coverPhotos: string[];
  /** Host/admin file attachments on the event */
  attachments: EventFileAttachment[];
  /** Event start date/time */
  start: Date;
  /** Event end date/time */
  end: Date;
  /** Whether this is an all-day event */
  isAllDay?: boolean | null;
  /** Event location */
  location?: string | null;
  /**
   * When true, the location may be opened in maps (Places pick).
   * False for free-text / “use as entered” locations.
   */
  locationLinkable?: boolean;
  /** Place name when chosen from Places; null for free-text. */
  locationName?: string | null;
  /** Full formatted address when chosen from Places; null for free-text. */
  locationAddress?: string | null;
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
  /**
   * RFC 5545 RRULE (same string on every row in a series). Null on one-off events.
   */
  recurrenceRule?: string | null;
  /** Present on each row that belongs to the same materialized recurrence. */
  recurrenceSeriesId?: string | null;
  /** Timestamp when the event was created */
  createdAt: Date;
  /** Timestamp when the event was last updated */
  updatedAt: Date;
}

/** File attached to an event by the host or a group admin. */
export interface EventFileAttachment {
  url: string;
  fileName?: string;
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
 * Checklist item on an event.
 */
export interface EventTask {
  id: string;
  title: string;
  /** Group member responsible for this task. Null when unassigned. */
  assigneeId?: string | null;
  completed: boolean;
  /** User who most recently checked this task off. */
  completedBy?: string | null;
  completedAt?: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Create a task on an event. */
export interface EventTaskInput {
  title: string;
  /** Omit or null to leave the task unassigned. */
  assigneeId?: string | null;
  createdBy: string;
  /**
   * When this event is part of a series, how far the new task applies.
   * Omit to add it only on this event without changing series membership.
   */
  seriesUpdateScope?: 'this_occurrence' | 'this_and_following' | 'all_occurrences';
}

/** Update a task title, assignee, or completion. */
export interface EventTaskUpdate {
  actorId: string;
  title?: string;
  /** Pass null to clear the assignee. Omit to leave unchanged. */
  assigneeId?: string | null;
  completed?: boolean;
}

/**
 * Event with RSVPs, tasks, and comments (detailed view)
 */
export interface EventDetailed extends Event {
  /** Number of DB rows sharing `recurrenceSeriesId` (1 for non-series). Only on GET /events/:id. */
  recurrenceSeriesMemberCount?: number;
  /** Array of RSVPs for this event */
  rsvps: RSVP[];
  /** Array of comments on this event */
  comments: Comment[];
  /** Checklist for group members */
  tasks: EventTask[];
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
  name: string;
  /** Event description (multiline) */
  description?: string;
  coverPhotos?: string[];
  attachments?: EventFileAttachment[];
  start: Date | string;
  end: Date | string;
  isAllDay?: boolean;
  location?: string;
  /** Defaults to false when omitted (free text). Set true when picking a Places suggestion. */
  locationLinkable?: boolean;
  locationName?: string | null;
  locationAddress?: string | null;
  minAttendees?: number;
  maxAttendees?: number;
  enableWaitlist?: boolean;
  allowMaybe?: boolean;
  /** ISO instant; omit for no deadline on create. */
  rsvpDeadline?: string | null;
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
  name?: string;
  /** Event description (multiline) */
  description?: string;
  coverPhotos?: string[];
  attachments?: EventFileAttachment[];
  start?: Date | string;
  end?: Date | string;
  isAllDay?: boolean;
  location?: string;
  /** When updating location: true for Places picks, false for free-text / use-as-entered. */
  locationLinkable?: boolean;
  locationName?: string | null;
  locationAddress?: string | null;
  /** Omit to leave unchanged; `null` clears the cap. */
  minAttendees?: number | null;
  /** Omit to leave unchanged; `null` clears the cap. */
  maxAttendees?: number | null;
  enableWaitlist?: boolean;
  allowMaybe?: boolean;
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
  /**
   * When set, changes which comment this row replies to (same event).
   * Pass `null` for a top-level comment. When omitted, reply target is unchanged.
   */
  replyToCommentId?: string | null;
  /** Client-resolved mention targets; server validates against the event's group roster */
  mentionedUserIds?: string[];
}

/** Input for deleting a comment */
export interface CommentDeleteInput {
  actorId: string;
}

/** Propose a new start/end time for the event */
export interface EventTimeSuggestionInput {
  id: string;
  userId: string;
  start: Date | string;
  end: Date | string;
  /** IANA zone from the device so notification copy uses the same wall clock as the rest of the app. */
  viewerTimeZone?: string;
}
