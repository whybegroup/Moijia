/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type GroupPostUpdateInput = {
    userId: string;
    title: string;
    body: string;
    /**
     * Client-resolved mention targets; server validates against group roster
     */
    mentionedUserIds?: Array<string>;
};

