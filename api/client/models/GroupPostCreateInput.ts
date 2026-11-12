/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type GroupPostCreateInput = {
    id: string;
    userId: string;
    title: string;
    body: string;
    /**
     * Client-resolved mention targets; server validates against group roster
     */
    mentionedUserIds?: Array<string>;
};

