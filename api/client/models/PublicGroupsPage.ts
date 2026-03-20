/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { GroupScoped } from './GroupScoped';
/**
 * Paginated public groups for discovery (server-side offset/limit)
 */
export type PublicGroupsPage = {
    items: Array<GroupScoped>;
    total: number;
};

