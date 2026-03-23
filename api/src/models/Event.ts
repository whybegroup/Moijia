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
  /** Event subtitle */
  subtitle?: string | null;
  /** Event description */
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
  /** Timestamp when the event was created */
  createdAt: Date;
  /** Timestamp when the event was last updated */
  updatedAt: Date;
}

/**
 * Event with RSVPs and comments (detailed view)
 */
export interface EventDetailed extends Event {
  /** Array of RSVPs for this event */
  rsvps: RSVP[];
  /** Array of comments on this event */
  comments: Comment[];
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

/**
 * Input for creating a new event
 */
export interface EventInput {
  id: string;
  groupId: string;
  createdBy: string;
  title: string;
  subtitle?: string;
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
}

/**
 * Input for updating an event
 */
export interface EventUpdate {
  title?: string;
  subtitle?: string;
  description?: string;
  coverPhotos?: string[];
  start?: Date | string;
  end?: Date | string;
  isAllDay?: boolean;
  location?: string;
  minAttendees?: number;
  maxAttendees?: number;
  enableWaitlist?: boolean;
  allowMaybe?: boolean;
  updatedBy: string;
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
}

/** Input for editing a comment */
export interface CommentUpdateInput {
  actorId: string;
  text: string;
}

/** Input for deleting a comment */
export interface CommentDeleteInput {
  actorId: string;
}
