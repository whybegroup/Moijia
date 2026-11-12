/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PollOptionInputKind } from './PollOptionInputKind';
import type { PollTextFont } from './PollTextFont';
export type PollOptionInput = {
    /**
     * Client-generated id (optional).
     */
    id?: string;
    inputKind: PollOptionInputKind;
    sortOrder: number;
    /**
     * Sanitized HTML body when `inputKind` is `text`.
     */
    textHtml?: string;
    textFont?: PollTextFont;
    /**
     * ISO 8601 UTC when `inputKind` is `datetime`.
     */
    dateTimeValue?: string;
};

