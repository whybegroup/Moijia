/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Global and per-group in-app notification preferences.
 * Delivery rule: global[key] && group[key] (when group applies).
 */
export type NotifPrefs = {
    newEvent: boolean;
    minAttendees: boolean;
    onLocation: boolean;
    onTime: boolean;
    onRsvp: boolean;
    comments: boolean;
    mentions: boolean;
    newPoll: boolean;
    onPollEdit: boolean;
    onPollResponse: boolean;
    onPollSuggestion: boolean;
    groupAnnouncement: boolean;
    postComments: boolean;
    postReactions: boolean;
    groupMembership: boolean;
    eventReminder: string;
};

