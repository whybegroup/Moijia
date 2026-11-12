/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type PushTokenInput = {
    token: string;
    platform: PushTokenInput.platform;
    deviceId?: string;
};
export namespace PushTokenInput {
    export enum platform {
        IOS = 'ios',
        ANDROID = 'android',
    }
}

