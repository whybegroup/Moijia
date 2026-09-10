export const PUBLIC_WEB_ORIGIN = 'https://moijia.com';
export const TERMS_PATH = '/terms';
export const PRIVACY_PATH = '/privacy';
export const TERMS_URL = `${PUBLIC_WEB_ORIGIN}${TERMS_PATH}`;
export const PRIVACY_URL = `${PUBLIC_WEB_ORIGIN}${PRIVACY_PATH}`;
export const LEGAL_CONTACT_EMAIL = 'whybegroup@gmail.com';
export const LEGAL_EFFECTIVE_DATE = 'September 9, 2026';

const PUBLIC_SEGMENTS = new Set(['login', 'terms', 'privacy']);

export function isPublicAppSegment(segment: string | undefined): boolean {
  return !!segment && PUBLIC_SEGMENTS.has(segment);
}
