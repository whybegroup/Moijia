import { PrismaClient } from '@prisma/client';
import { formatShareInstant, formatShareWhenRange } from '../utils/formatNotificationEventWhen';
import { firstImageUrlFromForumBody, GROUP_POST_ATTACHMENT_MARKER } from '../utils/groupPostBodyUploads';
import {
  absoluteHttpUrl,
  clipText,
  joinPreviewLines,
  stripHtmlToText,
  stripMarkdownToText,
  type SharePreviewCard,
} from '../utils/sharePreviewHtml';

const prisma = new PrismaClient();
const SITE_NAME = 'Moijia';

function webOrigin(): string {
  const raw = process.env.PUBLIC_WEB_ORIGIN?.trim().replace(/\/$/, '');
  return raw || 'https://moijia.com';
}

function canonicalUrl(path: string): string {
  const origin = webOrigin();
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${p}`;
}

export function parseIanaTimeZone(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const tz = raw.trim();
  if (!tz || tz.length > 64) return undefined;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return undefined;
  }
}

function eventLocationLabel(row: {
  location?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
}): string {
  const name = (row.locationName ?? '').trim();
  const addr = (row.locationAddress ?? '').trim();
  const loc = (row.location ?? '').trim();
  if (name && addr && addr !== name) return `${name}, ${addr}`;
  return name || loc;
}

function genericCard(path = '/'): SharePreviewCard {
  return {
    title: SITE_NAME,
    description: 'Events, polls, and posts with your groups.',
    imageUrl: null,
    canonicalUrl: canonicalUrl(path),
  };
}

async function previewForEvent(id: string, timeZone?: string): Promise<SharePreviewCard | null> {
  const row = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      start: true,
      end: true,
      isAllDay: true,
      location: true,
      locationName: true,
      locationAddress: true,
      coverPhotos: { select: { photoUrl: true }, take: 1, orderBy: { id: 'asc' } },
      group: { select: { name: true, deletedAt: true, thumbnail: true, coverPhotos: { select: { photoUrl: true }, take: 1, orderBy: { id: 'asc' } } } },
    },
  });
  if (!row || row.group.deletedAt) return null;

  const when = formatShareWhenRange(row.start, row.end, timeZone, !!row.isAllDay);
  const where = eventLocationLabel(row);
  const desc = clipText(stripHtmlToText(row.description ?? ''), 160);
  return {
    title: row.name.trim() || 'Event',
    description: joinPreviewLines([when, where, row.group.name ? `In ${row.group.name}` : null, desc]),
    imageUrl:
      absoluteHttpUrl(row.coverPhotos[0]?.photoUrl) ??
      absoluteHttpUrl(row.group.coverPhotos[0]?.photoUrl) ??
      absoluteHttpUrl(row.group.thumbnail),
    canonicalUrl: canonicalUrl(`/event/${row.id}`),
  };
}

async function previewForPoll(id: string, timeZone?: string): Promise<SharePreviewCard | null> {
  const row = await prisma.poll.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      deadline: true,
      closedAt: true,
      photos: { select: { photoUrl: true }, take: 1, orderBy: { id: 'asc' } },
      group: { select: { name: true, deletedAt: true, thumbnail: true, coverPhotos: { select: { photoUrl: true }, take: 1, orderBy: { id: 'asc' } } } },
    },
  });
  if (!row || row.group.deletedAt) return null;

  const closed = !!row.closedAt;
  const deadline = row.deadline;
  const deadlineLine = deadline
    ? closed
      ? `Closed · was due ${formatShareInstant(deadline, timeZone, false)}`
      : `Vote by ${formatShareInstant(deadline, timeZone, false)}`
    : closed
      ? 'Closed'
      : null;
  const desc = clipText(stripHtmlToText(row.description ?? ''), 160);
  return {
    title: row.title.trim() || 'Poll',
    description: joinPreviewLines([
      row.group.name ? `Poll in ${row.group.name}` : 'Poll',
      deadlineLine,
      desc,
    ]),
    imageUrl:
      absoluteHttpUrl(row.photos[0]?.photoUrl) ??
      absoluteHttpUrl(row.group.coverPhotos[0]?.photoUrl) ??
      absoluteHttpUrl(row.group.thumbnail),
    canonicalUrl: canonicalUrl(`/poll/${row.id}`),
  };
}

async function previewForPost(groupId: string, postId: string): Promise<SharePreviewCard | null> {
  const post = await prisma.groupPost.findFirst({
    where: { id: postId, groupId },
    select: {
      id: true,
      groupId: true,
      title: true,
      body: true,
      user: { select: { displayName: true, name: true } },
      group: { select: { name: true, deletedAt: true, thumbnail: true, coverPhotos: { select: { photoUrl: true }, take: 1, orderBy: { id: 'asc' } } } },
    },
  });
  if (!post || post.group.deletedAt) return null;

  const titleRaw = (post.title ?? '').trim();
  const markerIdx = (post.body ?? '').indexOf(GROUP_POST_ATTACHMENT_MARKER);
  const bodyForText = markerIdx >= 0 ? (post.body ?? '').slice(0, markerIdx) : (post.body ?? '');
  const bodyText = stripMarkdownToText(bodyForText);
  const excerpt = clipText(bodyText, 180);
  const heading = titleRaw && titleRaw.toLowerCase() !== 'post' ? titleRaw : excerpt || 'Post';
  const author = (post.user.displayName || post.user.name || '').trim();
  return {
    title: heading,
    description: joinPreviewLines([
      author && post.group.name ? `${author} in ${post.group.name}` : author || post.group.name || null,
      heading === excerpt ? null : excerpt,
    ]),
    imageUrl:
      absoluteHttpUrl(firstImageUrlFromForumBody(post.body)) ??
      absoluteHttpUrl(post.group.coverPhotos[0]?.photoUrl) ??
      absoluteHttpUrl(post.group.thumbnail),
    canonicalUrl: canonicalUrl(`/groups/${post.groupId}/forum?postId=${encodeURIComponent(post.id)}`),
  };
}

async function previewForJoin(code: string): Promise<SharePreviewCard | null> {
  let raw = code.trim();
  const joinMatch = raw.match(/\/join\/([A-Za-z0-9]+)/i);
  if (joinMatch) raw = joinMatch[1];
  const normalized = raw.toUpperCase();
  const group = await prisma.group.findUnique({
    where: { inviteCode: normalized },
    select: {
      name: true,
      desc: true,
      deletedAt: true,
      thumbnail: true,
      inviteCode: true,
      coverPhotos: { select: { photoUrl: true }, take: 1, orderBy: { id: 'asc' } },
    },
  });
  if (!group || group.deletedAt || !group.inviteCode) return null;

  return {
    title: `Join ${group.name}`,
    description: joinPreviewLines([`You're invited to ${group.name} on ${SITE_NAME}.`, clipText(group.desc ?? '', 160)]),
    imageUrl: absoluteHttpUrl(group.coverPhotos[0]?.photoUrl) ?? absoluteHttpUrl(group.thumbnail),
    canonicalUrl: canonicalUrl(`/join/${group.inviteCode}`),
  };
}

export async function resolveSharePreview(
  pathname: string,
  query: Record<string, unknown>
): Promise<SharePreviewCard> {
  const path = pathname.replace(/\/+$/, '') || '/';
  const tz = parseIanaTimeZone(query.tz);

  const eventMatch = path.match(/^\/event\/([^/]+)$/);
  if (eventMatch) {
    return (await previewForEvent(decodeURIComponent(eventMatch[1]), tz)) ?? genericCard(path);
  }

  const pollMatch = path.match(/^\/poll\/([^/]+)$/);
  if (pollMatch) {
    return (await previewForPoll(decodeURIComponent(pollMatch[1]), tz)) ?? genericCard(path);
  }

  const joinMatch = path.match(/^\/join\/([^/]+)$/);
  if (joinMatch) {
    return (await previewForJoin(decodeURIComponent(joinMatch[1]))) ?? genericCard(path);
  }

  const forumMatch = path.match(/^\/groups\/([^/]+)\/forum$/);
  if (forumMatch) {
    const groupId = decodeURIComponent(forumMatch[1]);
    const postId = typeof query.postId === 'string' ? query.postId.trim() : '';
    if (postId) {
      return (await previewForPost(groupId, postId)) ?? genericCard(path);
    }
  }

  return genericCard(path);
}
