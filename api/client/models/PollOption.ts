/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PollOptionInputKind } from './PollOptionInputKind';
import type { PollTextFont } from './PollTextFont';
export type PollOption = {
    id: string;
    pollId: string;
    sortOrder: number;
    inputKind: PollOptionInputKind;
    textHtml?: string;
    textFont?: PollTextFont;
    dateTimeValue?: string;
};

