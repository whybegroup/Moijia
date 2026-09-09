import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Pressable,
  Platform,
  Dimensions,
  Alert,
} from 'react-native';
import { type Href } from 'expo-router';
import { useAppRouter as useRouter } from '../hooks/useAppRouter';
import { shareFromModal, sharePost } from '../utils/shareContent';
import { forumPostCopyText } from '../utils/sharePreviewCopy';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { useShareLinkJoinPrompt } from '../hooks/useShareLinkJoinPrompt';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Radius, Shadows } from '../constants/theme';
import { edgeToEdgeModalProps } from './edgeToEdgeModalProps';
import { KeyboardSafeScrollView } from './KeyboardSafeScrollView';
import { AnchoredOverflowMenu } from './AnchoredOverflowMenu';
import { COMMENT_REACTION_EMOJIS } from '../constants/commentReactionEmojis';
import { ReactionEmojiGlyph } from './ReactionEmojiGlyph';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import {
  isMissingQueryError,
  useMissingGroupRedirect,
  useMissingResourceAlert,
} from '../hooks/useMissingResourceAlert';
import {
  useGroup,
  useGroupPosts,
  useUsers,
  useCreateGroupPost,
  useUpdateGroupPost,
  useDeleteGroupPost,
  useToggleGroupPostReaction,
  useCreateGroupPostComment,
  useToggleGroupPostCommentReaction,
  useUpdateGroupPostComment,
  useDeleteGroupPostComment,
} from '../hooks/api';
import { UserAvatar } from './UserAvatar';
import {
  COMMENT_THREAD_OPTIONS_MENU_WIDTH,
  ThreadedCommentsSection,
  type ThreadComment,
} from './ThreadedCommentsSection';
import { ReactionQuickPicker } from './ReactionQuickPicker';
import { ResolvableImage } from './ResolvableImage';
import { ImageLightboxModal } from './ImageLightboxModal';
import { FileExtensionIcon } from './FileExtensionPreview';
import { PostAttachmentFileRow, PostMediaImage } from './DeletedPostMedia';
import { isDeletedMediaUrl } from '../utils/deletedMedia';
import { looksLikeMediaUrl } from '../utils/fileKind';
import { AddImageButton } from './AddImageButton';
import { ForumPostMarkdownBody, dropLightboxItem, type ForumPostImageLightboxState } from './ForumPostMarkdownBody';
import { type GroupPost, type GroupPostComment, type GroupScoped } from '@moijia/client';
import { formatCreatedAtLabel, isContentEdited } from '../utils/helpers';
import { CommentMentionInput } from './CommentMentionInput';
import {
  computeMentionUserIdsForPost,
  type MentionMemberRow,
} from '../utils/mentionUtils';
import {
  createScrollAboveKeyboardOnFocus,
  scrollNodeToTopOfViewport,
} from '../utils/scrollInputAboveKeyboard';
import {
  pickAndUploadCoverPhoto,
  takeAndUploadCoverPhoto,
  pickAndUploadFileFromDevice,
  uploadUrlToDownloadUrl,
  type CoverPhotoDraft,
  type PickedFileAsset,
  coverPhotoDraftDisplayUri,
  pickDeferredCoverPhotoNative,
  pickDeferredCoverPhotoFromCamera,
  pickFilesFromDevice,
  revokeCoverPhotoDraftPreview,
  uploadCoverPhotoDrafts,
  uploadPickedFileAsset,
  isCancelled,
  ensureGroupCanUpload,
} from '../services/pickAndUploadImage';
import {
  loadForumGroupDraft,
  saveForumGroupDraft,
  type ForumGroupDraftV1,
  type ForumPostFileAttachment,
} from '../utils/forumPostDrafts';
import {
  clearTrackedUploads,
  deleteManagedUploadFireAndForget,
  deleteTrackedUploadIfNeeded,
  discardTrackedUploads,
  trackManagedUploadUrl,
  trackManagedUploadUrls,
} from '../services/managedUploadDelete';
import { canDeleteManagedMedia, isGroupAdminOrOwner } from '../utils/canDeleteManagedMedia';
import { confirmDestructive } from '../utils/confirmDestructive';

export type GroupForumViewProps = {
  groupId: string;
  /** Deep-link from mention notification — scroll to this post. */
  focusPostId?: string;
  /** When set with focusPostId, expand comments and highlight this comment. */
  focusCommentId?: string;
};

type ForumComposerChannel = 'new' | 'edit';

function forumId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function mapGroupCommentsToThread(comments: GroupPostComment[]): ThreadComment[] {
  return comments.map((c) => ({
    id: c.id,
    userId: c.userId,
    body: c.body,
    parentCommentId: c.parentCommentId ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    reactions: c.reactions,
  }));
}

function parseImageLine(trimmedLine: string): { alt: string; url: string } | null {
  const markdownMatch = trimmedLine.match(/^!\[(.*?)\]\(([^)\s]+)\)$/);
  if (markdownMatch) {
    return { alt: markdownMatch[1] || 'Image', url: markdownMatch[2] };
  }
  const plainUrlLike = /^[^\s]+$/.test(trimmedLine);
  if (!plainUrlLike) return null;
  const looksLikeImageUrl = looksLikeMediaUrl(trimmedLine);
  if (looksLikeImageUrl) {
    return { alt: 'Image', url: trimmedLine };
  }
  return null;
}

function wrapBareUrlsWithMarkdown(text: string): string {
  return text.replace(/(^|[\s\n])(https?:\/\/[^\s)]+)(?=$|[\s\n])/gi, (_match, prefix, rawUrl) => {
    const url = rawUrl.trim();
    const isAlreadyMarkdown = /\]\([^)]+\)$/.test(prefix + url);
    if (isAlreadyMarkdown) return `${prefix}${url}`;
    const isImageUrl = looksLikeMediaUrl(url);
    if (isImageUrl) return `${prefix}![Image](${url})`;
    return `${prefix}[${url}](${url})`;
  });
}

/** Separates composer “Add photo” URLs from markdown source (inline images stay in markdown). */
const POST_ATTACHMENT_MARKER = '[[MOIJIA_POST_ATTACHMENTS]]';

/** Collapsed preview clips to this height; “Read more” when full laid-out body is taller (px). */
const POST_BODY_PREVIEW_MAX_HEIGHT = 250;

function parseFileLine(trimmedLine: string): { name: string; url: string } | null {
  const m = trimmedLine.match(/^\[(.*?)\]\(([^)\s]+)\)$/);
  if (!m) return null;
  const url = m[2];
  if (!url) return null;
  return { name: m[1] || 'Attachment', url };
}

function parseAttachmentLines(block: string): {
  images: Array<{ alt: string; url: string }>;
  files: Array<{ name: string; url: string }>;
} {
  const images: Array<{ alt: string; url: string }> = [];
  const files: Array<{ name: string; url: string }> = [];
  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const img = parseImageLine(trimmed);
    if (img) {
      images.push(img);
      continue;
    }
    const file = parseFileLine(trimmed);
    if (file) files.push(file);
  }
  return { images, files };
}

/**
 * Markdown body + carousel attachments only after [[MOIJIA_POST_ATTACHMENTS]].
 * Bodies without that marker are rendered entirely as markdown (standalone `![](url)` lines stay in the body so image sizing matches inline images).
 */
function splitStoredPostBody(body: string): {
  markdownSource: string;
  attachmentImages: Array<{ alt: string; url: string }>;
  attachmentFiles: Array<{ name: string; url: string }>;
} {
  const markerLine = POST_ATTACHMENT_MARKER;
  const markerSep = `\n${markerLine}\n`;

  if (body.startsWith(`${markerLine}\n`)) {
    const after = body.slice(markerLine.length + 1);
    const parsed = parseAttachmentLines(after);
    return { markdownSource: '', attachmentImages: parsed.images, attachmentFiles: parsed.files };
  }

  const idx = body.indexOf(markerSep);
  if (idx !== -1) {
    const markdownSource = body.slice(0, idx).trimEnd();
    const after = body.slice(idx + markerSep.length);
    const parsed = parseAttachmentLines(after);
    return { markdownSource, attachmentImages: parsed.images, attachmentFiles: parsed.files };
  }

  return { markdownSource: body, attachmentImages: [], attachmentFiles: [] };
}

/** Stored body text + marker + attachment lines for API (composer keeps Add-photo URLs out of the editor field). */
function normalizeForumStoredBody(s: string): string {
  return s.replace(/\r\n/g, '\n').trim();
}

function mergeComposerBodyForApi(
  text: string,
  photoUrls: string[],
  fileAttachments: Array<{ name: string; url: string }> = []
): string {
  const t = text.trim();
  const photoLines = photoUrls.map((u) => `![](${u})`);
  const fileLines = fileAttachments.map((f) => {
    const safeName = (f.name || 'Attachment').replace(/\]/g, '');
    return `[${safeName}](${f.url})`;
  });
  const attachmentLines = [...photoLines, ...fileLines];
  const marker = POST_ATTACHMENT_MARKER;
  if (!t && attachmentLines.length === 0) return '';
  if (!t) return `${marker}\n${attachmentLines.join('\n')}`;
  if (attachmentLines.length === 0) return t;
  return `${t}\n\n${marker}\n${attachmentLines.join('\n')}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripAttachmentUrlFromBody(body: string, url: string): string {
  const split = splitStoredPostBody(body);
  const images = split.attachmentImages.filter((img) => img.url !== url);
  const files = split.attachmentFiles.filter((f) => f.url !== url);
  const reImg = new RegExp(`!\\[[^\\]]*\\]\\(${escapeRegExp(url)}\\)`, 'g');
  const reLink = new RegExp(`\\[[^\\]]*\\]\\(${escapeRegExp(url)}\\)`, 'g');
  const markdown = split.markdownSource.replace(reImg, '').replace(reLink, '').replace(/\n{3,}/g, '\n\n').trim();
  return mergeComposerBodyForApi(
    markdown,
    images.map((img) => img.url),
    files
  );
}

function mergeCommentBodyForApi(text: string, photoUrls: string[]): string {
  const t = text.trim();
  const photoLines = photoUrls.map((u) => `![](${u})`);
  if (!t && photoLines.length === 0) return '';
  if (!t) return photoLines.join('\n');
  if (photoLines.length === 0) return t;
  return `${t}\n\n${photoLines.join('\n')}`;
}

function appendMarkdownLink(text: string, fileName: string, url: string): string {
  const safeName = (fileName || 'Attachment').replace(/\]/g, '');
  const suffix = `[${safeName}](${url})`;
  const base = text.trimEnd();
  return base ? `${base}\n\n${suffix}` : suffix;
}

function postEditDiffersFromPublished(
  publishedBody: string,
  markdown: string,
  photos: string[],
  files: Array<{ name: string; url: string }>
): boolean {
  const merged = normalizeForumStoredBody(mergeComposerBodyForApi(markdown, photos, files));
  const original = normalizeForumStoredBody(publishedBody);
  return merged !== original;
}

export function GroupForumView({ groupId, focusPostId, focusCommentId }: GroupForumViewProps) {
  const router = useRouter();
  const { userId: currentUserId } = useCurrentUserContext();
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollViewportYRef = useRef(0);
  const scrollOffsetYRef = useRef(0);
  const newPostComposerRef = useRef<View>(null);
  const editPostComposerRef = useRef<View>(null);
  const scrollNewPostComposerIntoView = useMemo(
    () =>
      createScrollAboveKeyboardOnFocus({
        scrollRef,
        scrollOffsetYRef,
        targetRef: newPostComposerRef,
      }),
    []
  );
  const scrollEditPostComposerIntoView = useMemo(
    () =>
      createScrollAboveKeyboardOnFocus({
        scrollRef,
        scrollOffsetYRef,
        targetRef: editPostComposerRef,
      }),
    []
  );
  const postTopByIdRef = useRef<Record<string, number>>({});
  /** After hiding the top composer, scroll once the edited post has laid out at its new offset. */
  const pendingScrollToEditPostIdRef = useRef<string | null>(null);
  /** Scroll to post from mention notification deep link. */
  const pendingScrollToFocusPostIdRef = useRef<string | null>(null);
  const pendingScrollToCommentsPostIdRef = useRef<string | null>(null);
  const commentsBlockRefs = useRef<Record<string, View | null>>({});
  /** Persisted edit drafts per post id (survives reloads). */
  const postEditsRef = useRef<ForumGroupDraftV1['postEdits']>({});
  const editingPostIdRef = useRef<string | null>(null);
  const [forumDraftsReady, setForumDraftsReady] = useState(false);
  /** Bumped whenever `postEditsRef` changes so draft badges can recompute (refs don’t rerender). */
  const [draftBadgeTick, setDraftBadgeTick] = useState(0);
  const bumpDraftBadgeTick = useCallback(() => setDraftBadgeTick((n) => n + 1), []);
  /** Inline edit draft when `editingPostId` is set. */
  const [postBody, setPostBody] = useState('');
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  /** Top “new post” composer — independent of inline edit state. */
  const [newPostBody, setNewPostBody] = useState('');
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [composerPhotoUrls, setComposerPhotoUrls] = useState<string[]>([]);
  const [newPostPhotoUrls, setNewPostPhotoUrls] = useState<string[]>([]);
  const [composerFileAttachments, setComposerFileAttachments] = useState<ForumPostFileAttachment[]>([]);
  const [newPostFileAttachments, setNewPostFileAttachments] = useState<ForumPostFileAttachment[]>([]);
  const newPostTrackedUploadsRef = useRef<Set<string>>(new Set());
  const editPostTrackedUploadsRef = useRef<Set<string>>(new Set());
  /** Remount TextInput after clear so grown multiline height resets to minHeight. */
  const [newPostInputKey, setNewPostInputKey] = useState(0);
  const [composerSelection, setComposerSelection] = useState<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });
  const [newPostSelection, setNewPostSelection] = useState<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });
  const [composerLinkPopover, setComposerLinkPopover] = useState<{
    mode: 'link' | 'image';
    text: string;
    url: string;
    replaceStart?: number;
    replaceEnd?: number;
    channel: ForumComposerChannel;
  } | null>(null);
  const [expandedPostBodyById, setExpandedPostBodyById] = useState<Record<string, boolean>>({});
  /** Natural size of rendered markdown (uncollapsed pass); used to collapse tall posts into a square preview. */
  const [postMarkdownMeasureById, setPostMarkdownMeasureById] = useState<
    Record<string, { w: number; h: number; bodyKey: string }>
  >({});
  const [draftComments, setDraftComments] = useState<Record<string, string>>({});
  const [draftCommentPhotoDraftsByPost, setDraftCommentPhotoDraftsByPost] = useState<
    Record<string, CoverPhotoDraft[]>
  >({});
  const [draftCommentPendingFilesByPost, setDraftCommentPendingFilesByPost] = useState<
    Record<string, Array<{ id: string; name: string; asset: PickedFileAsset }>>
  >({});
  const [uploadingCommentPhotoPostId, setUploadingCommentPhotoPostId] = useState<string | null>(null);
  const [replyTargetByPost, setReplyTargetByPost] = useState<Record<string, string | null>>({});
  const [expandedCommentsByPost, setExpandedCommentsByPost] = useState<Record<string, boolean>>({});
  const [reactionPickerTarget, setReactionPickerTarget] = useState<
    { kind: 'post' | 'comment'; id: string } | null
  >(null);
  const [reactionDetailModal, setReactionDetailModal] = useState<{
    emoji: string;
    userIds: string[];
  } | null>(null);
  const [imageLightbox, setImageLightbox] = useState<ForumPostImageLightboxState>(null);
  const [commentEdit, setCommentEdit] = useState<{ postId: string; commentId: string } | null>(null);
  const [commentEditText, setCommentEditText] = useState('');
  /** Draft reply parent while editing; `null` = top-level comment. */
  const [commentEditParentId, setCommentEditParentId] = useState<string | null>(null);

  const { data: group, isError, error: groupError, refetch: refetchGroup } = useGroup(groupId, currentUserId ?? '');
  const { data: allUsers = [], refetch: refetchUsers } = useUsers();
  const {
    data: posts = [],
    isLoading: postsLoading,
    isFetched: postsFetched,
    refetch: refetchPosts,
  } = useGroupPosts(
    groupId,
    currentUserId ?? ''
  );
  const { refreshControl } = usePullToRefresh([refetchGroup, refetchUsers, refetchPosts]);
  const createPostMutation = useCreateGroupPost(groupId, currentUserId ?? '');
  const updatePostMutation = useUpdateGroupPost(groupId, currentUserId ?? '');
  const deletePostMutation = useDeleteGroupPost(groupId, currentUserId ?? '');
  const togglePostReactionMutation = useToggleGroupPostReaction(groupId, currentUserId ?? '');
  const createCommentMutation = useCreateGroupPostComment(groupId, currentUserId ?? '');
  const toggleCommentReactionMutation = useToggleGroupPostCommentReaction(groupId, currentUserId ?? '');
  const updateCommentMutation = useUpdateGroupPostComment(groupId, currentUserId ?? '');
  const deleteCommentMutation = useDeleteGroupPostComment(groupId, currentUserId ?? '');

  useMissingGroupRedirect(
    isError,
    groupError,
    focusPostId ? undefined : group?.membershipStatus,
    '/(tabs)/groups'
  );

  useEffect(() => {
    if (focusPostId) return;
    if (group?.membershipStatus === 'pending') {
      router.replace(`/(tabs)/groups/${groupId}` as Href);
    }
  }, [focusPostId, group?.membershipStatus, groupId, router]);

  const isActiveMember =
    group?.membershipStatus === 'member' || group?.membershipStatus === 'admin';
  const postJoinInfo =
    focusPostId && group && !isActiveMember
      ? {
          groupId,
          groupName: group.name,
          membershipStatus: (group.membershipStatus === 'pending' ? 'pending' : 'none') as
            | 'pending'
            | 'none',
          requireApprovalToJoin: group.requireApprovalToJoin ?? true,
        }
      : null;
  useShareLinkJoinPrompt({
    kind: 'post',
    userId: currentUserId,
    joinInfo: postJoinInfo,
    onDismiss: () => {
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/groups' as Href);
    },
    onJoined: () => {
      void refetchGroup();
      void refetchPosts();
    },
  });

  const postGone =
    !!focusPostId &&
    !!group &&
    isActiveMember &&
    !isMissingQueryError(isError, groupError) &&
    postsFetched &&
    !postsLoading &&
    !posts.some((p) => p.id === focusPostId);
  useMissingResourceAlert('post', postGone, () => {
    if (router.canGoBack()) router.back();
  });

  useEffect(() => {
    if (!focusPostId) return;
    pendingScrollToFocusPostIdRef.current = focusPostId;
    if (focusCommentId) {
      setExpandedCommentsByPost((prev) => ({ ...prev, [focusPostId]: true }));
    }
  }, [focusPostId, focusCommentId]);

  useEffect(() => {
    editingPostIdRef.current = editingPostId;
  }, [editingPostId]);

  useEffect(() => {
    if (!currentUserId) {
      setForumDraftsReady(false);
      return;
    }
    let cancelled = false;
    setForumDraftsReady(false);
    pendingScrollToEditPostIdRef.current = null;
    setEditingPostId(null);
    setPostBody('');
    setComposerPhotoUrls([]);
    setComposerFileAttachments([]);
    setComposerSelection({ start: 0, end: 0 });
    (async () => {
      const loaded = await loadForumGroupDraft(currentUserId, groupId);
      if (cancelled) return;
      postEditsRef.current = loaded?.postEdits ? { ...loaded.postEdits } : {};
      setNewPostBody(loaded?.newPost?.markdown ?? '');
      setNewPostPhotoUrls(Array.isArray(loaded?.newPost?.photos) ? [...loaded.newPost.photos] : []);
      setNewPostFileAttachments(
        Array.isArray(loaded?.newPost?.files) ? [...(loaded.newPost.files ?? [])] : []
      );
      setNewPostSelection({ start: 0, end: 0 });
      setForumDraftsReady(true);
      bumpDraftBadgeTick();
    })();
    return () => {
      cancelled = true;
    };
  }, [bumpDraftBadgeTick, currentUserId, groupId]);

  useEffect(() => {
    if (!forumDraftsReady || !currentUserId || postsLoading) return;
    const next: ForumGroupDraftV1['postEdits'] = { ...postEditsRef.current };
    let changed = false;
    for (const k of Object.keys(next)) {
      const e = next[k];
      const files = e.files ?? [];
      if (!e.markdown.trim() && e.photos.length === 0 && files.length === 0) {
        delete next[k];
        changed = true;
        continue;
      }
      const p = posts.find((x) => x.id === k);
      if (p && !postEditDiffersFromPublished(p.body, e.markdown, e.photos, files)) {
        delete next[k];
        changed = true;
      }
    }
    if (changed) {
      postEditsRef.current = next;
      bumpDraftBadgeTick();
      void (async () => {
        const newPost =
          newPostBody.trim() || newPostPhotoUrls.length > 0 || newPostFileAttachments.length > 0
            ? {
                markdown: newPostBody,
                photos: [...newPostPhotoUrls],
                files: [...newPostFileAttachments],
              }
            : null;
        await saveForumGroupDraft(currentUserId, groupId, { v: 1, newPost, postEdits: next });
      })();
    }
  }, [
    bumpDraftBadgeTick,
    currentUserId,
    forumDraftsReady,
    groupId,
    newPostBody,
    newPostPhotoUrls,
    newPostFileAttachments,
    posts,
    postsLoading,
  ]);

  useEffect(() => {
    if (!forumDraftsReady || !currentUserId) return;
    const t = setTimeout(() => {
      void (async () => {
        const eid = editingPostIdRef.current;
        const postEdits: ForumGroupDraftV1['postEdits'] = { ...postEditsRef.current };
        if (
          eid &&
          (postBody.trim() ||
            composerPhotoUrls.length > 0 ||
            composerFileAttachments.length > 0)
        ) {
          const p = posts.find((x) => x.id === eid);
          if (
            p &&
            postEditDiffersFromPublished(p.body, postBody, composerPhotoUrls, composerFileAttachments)
          ) {
            postEdits[eid] = {
              markdown: postBody,
              photos: [...composerPhotoUrls],
              files: [...composerFileAttachments],
            };
          } else if (p) {
            delete postEdits[eid];
          } else {
            postEdits[eid] = {
              markdown: postBody,
              photos: [...composerPhotoUrls],
              files: [...composerFileAttachments],
            };
          }
        }
        for (const k of Object.keys(postEdits)) {
          const e = postEdits[k];
          const files = e.files ?? [];
          if (!e.markdown.trim() && e.photos.length === 0 && files.length === 0) delete postEdits[k];
          else {
            const p = posts.find((x) => x.id === k);
            if (p && !postEditDiffersFromPublished(p.body, e.markdown, e.photos, files))
              delete postEdits[k];
          }
        }
        postEditsRef.current = postEdits;
        const newPost: ForumGroupDraftV1['newPost'] =
          newPostBody.trim() || newPostPhotoUrls.length > 0 || newPostFileAttachments.length > 0
            ? {
                markdown: newPostBody,
                photos: [...newPostPhotoUrls],
                files: [...newPostFileAttachments],
              }
            : null;
        await saveForumGroupDraft(currentUserId, groupId, { v: 1, newPost, postEdits });
        bumpDraftBadgeTick();
      })();
    }, 450);
    return () => clearTimeout(t);
  }, [
    forumDraftsReady,
    currentUserId,
    groupId,
    newPostBody,
    newPostPhotoUrls,
    newPostFileAttachments,
    editingPostId,
    postBody,
    composerPhotoUrls,
    composerFileAttachments,
    bumpDraftBadgeTick,
    posts,
  ]);

  const replaceComposerSelection = useCallback(
    (
      channel: ForumComposerChannel,
      transform: (selectedText: string) => {
        insert: string;
        selectionStart: number;
        selectionEnd: number;
      }
    ) => {
      const selection = channel === 'new' ? newPostSelection : composerSelection;
      const setBody = channel === 'new' ? setNewPostBody : setPostBody;
      const setSelection = channel === 'new' ? setNewPostSelection : setComposerSelection;
      setBody((prev) => {
        const start = Math.max(0, Math.min(selection.start, prev.length));
        const end = Math.max(start, Math.min(selection.end, prev.length));
        const before = prev.slice(0, start);
        const selected = prev.slice(start, end);
        const after = prev.slice(end);
        const next = transform(selected);
        const nextBody = `${before}${next.insert}${after}`;
        setSelection({
          start: start + next.selectionStart,
          end: start + next.selectionEnd,
        });
        return nextBody;
      });
    },
    [composerSelection.end, composerSelection.start, newPostSelection.end, newPostSelection.start]
  );

  const addComposerPhotoFor = useCallback((channel: ForumComposerChannel, url: string) => {
    if (channel === 'new') setNewPostPhotoUrls((prev) => [...prev, url]);
    else setComposerPhotoUrls((prev) => [...prev, url]);
  }, []);

  const trackedUploadsForComposer = useCallback((channel: ForumComposerChannel) => {
    return channel === 'edit' ? editPostTrackedUploadsRef.current : newPostTrackedUploadsRef.current;
  }, []);

  const removeLightboxUrl = useCallback((url: string) => {
    setImageLightbox((prev) => (prev ? dropLightboxItem(prev, url) : prev));
  }, []);

  const removeDraftMedia = useCallback(
    (channel: ForumComposerChannel, url: string) => {
      deleteTrackedUploadIfNeeded(currentUserId, trackedUploadsForComposer(channel), url);
      if (channel === 'new') {
        setNewPostPhotoUrls((prev) => prev.filter((u) => u !== url));
        setNewPostFileAttachments((prev) => prev.filter((f) => f.url !== url));
      } else {
        setComposerPhotoUrls((prev) => prev.filter((u) => u !== url));
        setComposerFileAttachments((prev) => prev.filter((f) => f.url !== url));
      }
      removeLightboxUrl(url);
    },
    [currentUserId, removeLightboxUrl, trackedUploadsForComposer]
  );

  const confirmDeleteOwnPostFile = useCallback(
    (post: GroupPost, url: string) => {
      if (!currentUserId) return;
      const run = async () => {
        const nextBody = stripAttachmentUrlFromBody(post.body || '', url);
        if (!nextBody.trim()) {
          Alert.alert('Delete file', 'A post needs some content. Delete the post instead.');
          return;
        }
        const title =
          nextBody
            .replace(/\[\[MOIJIA_POST_ATTACHMENTS\]\]/g, '')
            .trim()
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find(Boolean)
            ?.slice(0, 80) || post.title || 'Post';
        try {
          await updatePostMutation.mutateAsync({
            postId: post.id,
            title,
            body: nextBody,
          });
          deleteManagedUploadFireAndForget(currentUserId, url);
          removeLightboxUrl(url);
        } catch {
          Alert.alert('Error', 'Could not delete file');
        }
      };
      void run();
    },
    [currentUserId, removeLightboxUrl, updatePostMutation]
  );

  const confirmDeleteCommentFile = useCallback(
    (comment: GroupPostComment, url: string) => {
      if (!currentUserId) return;
      const run = async () => {
        const nextBody = stripAttachmentUrlFromBody(comment.body || '', url);
        if (!nextBody.trim()) {
          Alert.alert('Delete file', 'A comment needs some content. Delete the comment instead.');
          return;
        }
        try {
          await updateCommentMutation.mutateAsync({
            commentId: comment.id,
            body: nextBody,
            parentCommentId: comment.parentCommentId ?? null,
          });
          deleteManagedUploadFireAndForget(currentUserId, url);
          removeLightboxUrl(url);
        } catch {
          Alert.alert('Error', 'Could not delete file');
        }
      };
      void run();
    },
    [currentUserId, removeLightboxUrl, updateCommentMutation]
  );

  const removeComposerPhotoAtFor = useCallback((channel: ForumComposerChannel, index: number) => {
    const url = channel === 'new' ? newPostPhotoUrls[index] : composerPhotoUrls[index];
    if (!url) return;
    confirmDestructive('Delete photo?', 'This photo will be permanently deleted.', () =>
      removeDraftMedia(channel, url)
    );
  }, [composerPhotoUrls, newPostPhotoUrls, removeDraftMedia]);

  const uploadComposerPhoto = useCallback(
    async (channel: ForumComposerChannel) => {
      if (!currentUserId || isUploadingAttachment) return;
      try {
        setIsUploadingAttachment(true);
        const publicUrls = await pickAndUploadCoverPhoto(currentUserId, { groupId });
        if (!publicUrls?.length) return;
        trackManagedUploadUrls(trackedUploadsForComposer(channel), publicUrls);
        for (const publicUrl of publicUrls) addComposerPhotoFor(channel, publicUrl);
      } finally {
        setIsUploadingAttachment(false);
      }
    },
    [addComposerPhotoFor, currentUserId, isUploadingAttachment]
  );

  const attachFileToComposer = useCallback(
    async (channel: ForumComposerChannel) => {
      if (!currentUserId || isUploadingAttachment) return;
      try {
        setIsUploadingAttachment(true);
        const uploaded = await pickAndUploadFileFromDevice(currentUserId, { groupId });
        if (!uploaded?.length) return;
        const fileEntries: ForumPostFileAttachment[] = uploaded.map((file) => ({
          name: file.fileName || 'Attachment',
          url: uploadUrlToDownloadUrl(file.publicUrl),
        }));
        trackManagedUploadUrls(
          trackedUploadsForComposer(channel),
          fileEntries.map((f) => f.url)
        );
        const setFiles = channel === 'new' ? setNewPostFileAttachments : setComposerFileAttachments;
        setFiles((prev) => [...prev, ...fileEntries]);
      } catch (e) {
        if (e instanceof Error && e.message === 'cancelled') return;
        Alert.alert('Upload', e instanceof Error ? e.message : 'Could not attach file');
      } finally {
        setIsUploadingAttachment(false);
      }
    },
    [currentUserId, isUploadingAttachment]
  );

  const removeComposerFileAtFor = useCallback((channel: ForumComposerChannel, index: number) => {
    const url = channel === 'new' ? newPostFileAttachments[index]?.url : composerFileAttachments[index]?.url;
    if (!url) return;
    confirmDestructive('Delete file?', 'This file will be permanently deleted.', () =>
      removeDraftMedia(channel, url)
    );
  }, [composerFileAttachments, newPostFileAttachments, removeDraftMedia]);

  const takePhotoAndAddComposerPhoto = useCallback(
    async (channel: ForumComposerChannel) => {
      if (!currentUserId || isUploadingAttachment) return;
      try {
        setIsUploadingAttachment(true);
        const publicUrl = await takeAndUploadCoverPhoto(currentUserId, { groupId });
        if (!publicUrl) return;
        trackManagedUploadUrl(trackedUploadsForComposer(channel), publicUrl);
        addComposerPhotoFor(channel, publicUrl);
      } catch (e) {
        Alert.alert('Upload', e instanceof Error ? e.message : 'Could not upload photo');
      } finally {
        setIsUploadingAttachment(false);
      }
    },
    [addComposerPhotoFor, currentUserId, isUploadingAttachment]
  );

  const applyTool = useCallback(
    (tool: 'bold' | 'italic' | 'bullet' | 'link' | 'image') => {
      if (tool === 'bold') {
        replaceComposerSelection('new', (selected) => {
          const inner = selected || 'bold text';
          const insert = `**${inner}**`;
          return { insert, selectionStart: 2, selectionEnd: 2 + inner.length };
        });
        return;
      }
      if (tool === 'italic') {
        replaceComposerSelection('new', (selected) => {
          const inner = selected || 'italic text';
          const insert = `*${inner}*`;
          return { insert, selectionStart: 1, selectionEnd: 1 + inner.length };
        });
        return;
      }
      if (tool === 'link') {
        replaceComposerSelection('new', (selected) => {
          const inner = selected || 'link text';
          const insert = `[${inner}](https://example.com)`;
          return { insert, selectionStart: 1, selectionEnd: 1 + inner.length };
        });
        return;
      }
      if (tool === 'image') {
        replaceComposerSelection('new', (selected) => {
          const inner = selected || ' ';
          const insert = `![${inner}](https://example.com/image.jpg)`;
          return { insert, selectionStart: 2, selectionEnd: 2 + inner.length };
        });
        return;
      }
      replaceComposerSelection('new', (selected) => {
        if (!selected) {
          const insert = '- bullet item';
          return { insert, selectionStart: 2, selectionEnd: insert.length };
        }
        const lines = selected.split(/\r?\n/);
        const bulleted = lines.map((line) => (line.trim().startsWith('- ') ? line : `- ${line}`)).join('\n');
        return { insert: bulleted, selectionStart: 0, selectionEnd: bulleted.length };
      });
    },
    [replaceComposerSelection]
  );

  const detectHeadingLevelAtSelection = useCallback(() => {
    const start = Math.max(0, Math.min(composerSelection.start, postBody.length));
    const end = Math.max(start, Math.min(composerSelection.end, postBody.length));
    const lineStart = postBody.lastIndexOf('\n', start - 1) + 1;
    const lineEndIdx = postBody.indexOf('\n', end);
    const lineEnd = lineEndIdx === -1 ? postBody.length : lineEndIdx;
    const activeSegment = postBody.slice(lineStart, lineEnd);
    const match = activeSegment.match(/^\s*(#{1,6})\s+/);
    return match ? Math.max(1, Math.min(6, match[1].length)) : 0;
  }, [composerSelection.end, composerSelection.start, postBody]);

  const applyHeadingLevel = useCallback(
    (level: number) => {
    const safeLevel = Math.max(1, Math.min(6, level));
    const marker = `${'#'.repeat(safeLevel)} `;
    setPostBody((prev) => {
      const start = Math.max(0, Math.min(composerSelection.start, prev.length));
      const end = Math.max(start, Math.min(composerSelection.end, prev.length));
      const hasSelection = end > start;
      if (hasSelection) {
        const before = prev.slice(0, start);
        const selected = prev.slice(start, end);
        const after = prev.slice(end);
        const headed = selected
          .split(/\r?\n/)
          .map((line) => {
            if (!line.trim()) return line;
            const stripped = line.replace(/^(\s*)(#{1,6}\s+)?/, '$1');
            return `${marker}${stripped.trimStart()}`;
          })
          .join('\n');
        setComposerSelection({ start, end: start + headed.length });
        return `${before}${headed}${after}`;
      }

      const lineStart = prev.lastIndexOf('\n', start - 1) + 1;
      const lineEndIdx = prev.indexOf('\n', start);
      const lineEnd = lineEndIdx === -1 ? prev.length : lineEndIdx;
      const line = prev.slice(lineStart, lineEnd);
      const linePrefixMatch = line.match(/^(\s*)/);
      const indent = linePrefixMatch?.[1] ?? '';
      const content = line.replace(/^(\s*)(#{1,6}\s+)?/, '$1').slice(indent.length);
      const nextLine = `${indent}${marker}${content.trimStart()}`;
      const before = prev.slice(0, lineStart);
      const after = prev.slice(lineEnd);
      const cursorOffsetInLine = start - lineStart;
      const nextCursor = Math.min(lineStart + nextLine.length, lineStart + marker.length + Math.max(0, cursorOffsetInLine));
      setComposerSelection({ start: nextCursor, end: nextCursor });
      return `${before}${nextLine}${after}`;
    });
    },
    [composerSelection.end, composerSelection.start]
  );

  const increaseTextSize = useCallback(() => {
    const current = detectHeadingLevelAtSelection();
    const next = current === 0 ? 4 : Math.max(1, current - 1);
    applyHeadingLevel(next);
  }, [applyHeadingLevel, detectHeadingLevelAtSelection]);

  const decreaseTextSize = useCallback(() => {
    const current = detectHeadingLevelAtSelection();
    const next = current === 0 ? 5 : Math.min(6, current + 1);
    applyHeadingLevel(next);
  }, [applyHeadingLevel, detectHeadingLevelAtSelection]);

  const openComposerLinkPopover = useCallback(
    (mode: 'link' | 'image', channel: ForumComposerChannel) => {
      const body = channel === 'new' ? newPostBody : postBody;
      const sel = channel === 'new' ? newPostSelection : composerSelection;
      const start = Math.max(0, Math.min(sel.start, body.length));
      const end = Math.max(start, Math.min(sel.end, body.length));
      const selected = body.slice(start, end).trim();
      let matchedText = selected;
      let matchedUrl = '';
      let replaceStart: number | undefined;
      let replaceEnd: number | undefined;

      const tokenRegex = /(!?)\[(.*?)\]\(([^)\s]+)\)/g;
      let match: RegExpExecArray | null;
      while ((match = tokenRegex.exec(body)) !== null) {
        const isImageToken = match[1] === '!';
        const tokenMode = isImageToken ? 'image' : 'link';
        if (tokenMode !== mode) continue;
        const tokenStart = match.index;
        const tokenEnd = tokenStart + match[0].length;
        const intersectsSelection = start < tokenEnd && end > tokenStart;
        const cursorInside = start === end && start >= tokenStart && start <= tokenEnd;
        if (!intersectsSelection && !cursorInside) continue;
        matchedText = match[2] ?? '';
        matchedUrl = match[3] ?? '';
        replaceStart = tokenStart;
        replaceEnd = tokenEnd;
        break;
      }

      setComposerLinkPopover({
        mode,
        text: matchedText,
        url: matchedUrl,
        replaceStart,
        replaceEnd,
        channel,
      });
    },
    [composerSelection.end, composerSelection.start, newPostBody, newPostSelection.end, newPostSelection.start, postBody]
  );

  const applyComposerLinkPopover = useCallback(() => {
    if (!composerLinkPopover) return;
    const channel = composerLinkPopover.channel;
    const bodyNow = channel === 'new' ? newPostBody : postBody;
    const setBody = channel === 'new' ? setNewPostBody : setPostBody;
    const setSelection = channel === 'new' ? setNewPostSelection : setComposerSelection;

    const cleanUrl = composerLinkPopover.url.trim();
    if (!cleanUrl) return;
    const cleanText = composerLinkPopover.text.trim();
    const hasReplaceRange =
      typeof composerLinkPopover.replaceStart === 'number' &&
      typeof composerLinkPopover.replaceEnd === 'number' &&
      composerLinkPopover.replaceEnd >= composerLinkPopover.replaceStart;
    if (hasReplaceRange) {
      const replaceStart = Math.max(0, Math.min(composerLinkPopover.replaceStart ?? 0, bodyNow.length));
      const replaceEnd = Math.max(
        replaceStart,
        Math.min(composerLinkPopover.replaceEnd ?? replaceStart, bodyNow.length)
      );
      const before = bodyNow.slice(0, replaceStart);
      const after = bodyNow.slice(replaceEnd);
      if (composerLinkPopover.mode === 'link') {
        const inner = cleanText || 'link text';
        const insert = `[${inner}](${cleanUrl})`;
        setBody(`${before}${insert}${after}`);
        setSelection({ start: replaceStart + 1, end: replaceStart + 1 + inner.length });
      } else {
        const inner = cleanText || ' ';
        const insert = `![${inner}](${cleanUrl})`;
        setBody(`${before}${insert}${after}`);
        setSelection({ start: replaceStart + 2, end: replaceStart + 2 + inner.length });
      }
      setComposerLinkPopover(null);
      return;
    }
    if (composerLinkPopover.mode === 'link') {
      replaceComposerSelection(channel, (selected) => {
        const inner = cleanText || selected || 'link text';
        const insert = `[${inner}](${cleanUrl})`;
        return { insert, selectionStart: 1, selectionEnd: 1 + inner.length };
      });
    } else {
      replaceComposerSelection(channel, (selected) => {
        const inner = cleanText || selected || ' ';
        const insert = `![${inner}](${cleanUrl})`;
        return { insert, selectionStart: 2, selectionEnd: 2 + inner.length };
      });
    }
    setComposerLinkPopover(null);
  }, [composerLinkPopover, newPostBody, postBody, replaceComposerSelection]);

  const markdownStyles = useMemo(
    () => ({
      body: { color: Colors.text, fontFamily: Fonts.regular, fontSize: 14, lineHeight: 21 },
      paragraph: { marginTop: 0, marginBottom: 0, color: Colors.text, fontFamily: Fonts.regular, fontSize: 14, lineHeight: 21 },
      strong: { fontFamily: Fonts.semiBold },
      em: { fontStyle: 'italic' as const },
      link: { color: Colors.accent, textDecorationLine: 'underline' as const },
      heading1: { fontFamily: Fonts.semiBold, fontSize: 24, lineHeight: 30, marginTop: 0, marginBottom: 4, color: Colors.text },
      heading2: { fontFamily: Fonts.semiBold, fontSize: 20, lineHeight: 26, marginTop: 0, marginBottom: 4, color: Colors.text },
      heading3: { fontFamily: Fonts.semiBold, fontSize: 17, lineHeight: 23, marginTop: 0, marginBottom: 4, color: Colors.text },
      bullet_list: { marginTop: 0, marginBottom: 0 },
      ordered_list: { marginTop: 0, marginBottom: 0 },
      list_item: { marginTop: 0, marginBottom: 0 },
    }),
    []
  );

  const usersById = useMemo(() => new Map(allUsers.map((u) => [u.id, u])), [allUsers]);

  const mentionMemberRows: MentionMemberRow[] = useMemo(() => {
    const g = group as GroupScoped | undefined;
    const ids = g?.memberIds;
    if (!ids?.length) return [];
    return ids.map((uid) => {
      const u = usersById.get(uid);
      return {
        userId: uid,
        displayName: u?.displayName || u?.name || 'Member',
        name: u?.name || '',
      };
    });
  }, [group, usersById]);

  const mentionMembersForInput = useMemo(
    () => mentionMemberRows.map((m) => ({ id: m.userId, displayName: m.displayName, name: m.name })),
    [mentionMemberRows]
  );

  const getUserDisplayName = useCallback(
    (userId: string) => {
      const user = usersById.get(userId);
      return user?.displayName || user?.name || 'Member';
    },
    [usersById]
  );

  const cancelEditPost = useCallback(() => {
    discardTrackedUploads(currentUserId, editPostTrackedUploadsRef.current);
    const id = editingPostId;
    pendingScrollToEditPostIdRef.current = null;
    if (id) delete postEditsRef.current[id];
    bumpDraftBadgeTick();
    setEditingPostId(null);
    setPostBody('');
    setComposerPhotoUrls([]);
    setComposerFileAttachments([]);
    setComposerSelection({ start: 0, end: 0 });
    void (async () => {
      if (!currentUserId || !forumDraftsReady) return;
      const postEdits = { ...postEditsRef.current };
      const newPost =
        newPostBody.trim() || newPostPhotoUrls.length > 0 || newPostFileAttachments.length > 0
          ? {
              markdown: newPostBody,
              photos: [...newPostPhotoUrls],
              files: [...newPostFileAttachments],
            }
          : null;
      await saveForumGroupDraft(currentUserId, groupId, { v: 1, newPost, postEdits });
    })();
  }, [
    bumpDraftBadgeTick,
    currentUserId,
    editingPostId,
    forumDraftsReady,
    groupId,
    newPostBody,
    newPostPhotoUrls,
    newPostFileAttachments,
  ]);

  const discardNewPostDraft = useCallback(() => {
    discardTrackedUploads(currentUserId, newPostTrackedUploadsRef.current);
    setNewPostBody('');
    setNewPostPhotoUrls([]);
    setNewPostFileAttachments([]);
    setNewPostSelection({ start: 0, end: 0 });
    setNewPostInputKey((k) => k + 1);
    void (async () => {
      if (!currentUserId || !forumDraftsReady) return;
      const postEdits = { ...postEditsRef.current };
      await saveForumGroupDraft(currentUserId, groupId, { v: 1, newPost: null, postEdits });
    })();
  }, [currentUserId, forumDraftsReady, groupId]);

  const beginEditPost = useCallback(
    (post: GroupPost) => {
      if (!currentUserId) return;
      clearTrackedUploads(editPostTrackedUploadsRef.current);
      const persisted = postEditsRef.current[post.id];
      setEditingPostId(post.id);
      const persistedFiles = persisted?.files ?? [];
      if (
        persisted &&
        (persisted.markdown.trim() || persisted.photos.length > 0 || persistedFiles.length > 0)
      ) {
        setPostBody(persisted.markdown);
        setComposerPhotoUrls([...persisted.photos]);
        setComposerFileAttachments(persistedFiles.map((f) => ({ name: f.name, url: f.url })));
      } else {
        const split = splitStoredPostBody(post.body);
        setPostBody(split.markdownSource);
        setComposerPhotoUrls(split.attachmentImages.map((img) => img.url));
        setComposerFileAttachments(split.attachmentFiles.map((f) => ({ name: f.name, url: f.url })));
      }
      setComposerSelection({ start: 0, end: 0 });
      pendingScrollToEditPostIdRef.current = post.id;
    },
    [currentUserId]
  );

  const submitNewPost = useCallback(async () => {
    const body = mergeComposerBodyForApi(newPostBody, newPostPhotoUrls, newPostFileAttachments).trim();
    if (!body || !currentUserId) return;
    const title =
      newPostBody
        .trim()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean)
        ?.slice(0, 80) || 'Post';
    const mids = computeMentionUserIdsForPost(newPostBody, mentionMemberRows, currentUserId);
    await createPostMutation.mutateAsync({
      id: forumId('post'),
      userId: currentUserId,
      title,
      body,
      ...(mids.length > 0 ? { mentionedUserIds: mids } : {}),
    });
    clearTrackedUploads(newPostTrackedUploadsRef.current);
    setNewPostBody('');
    setNewPostPhotoUrls([]);
    setNewPostFileAttachments([]);
    setNewPostSelection({ start: 0, end: 0 });
    setNewPostInputKey((k) => k + 1);
    void (async () => {
      if (!currentUserId) return;
      const postEdits = { ...postEditsRef.current };
      await saveForumGroupDraft(currentUserId, groupId, { v: 1, newPost: null, postEdits });
    })();
  }, [
    createPostMutation,
    currentUserId,
    groupId,
    mentionMemberRows,
    newPostBody,
    newPostPhotoUrls,
    newPostFileAttachments,
  ]);

  const submitEditPost = useCallback(async () => {
    if (!editingPostId) return;
    const body = mergeComposerBodyForApi(postBody, composerPhotoUrls, composerFileAttachments).trim();
    if (!body || !currentUserId) return;
    const title =
      postBody
        .trim()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean)
        ?.slice(0, 80) || 'Post';
    try {
      const pid = editingPostId;
      const mids = computeMentionUserIdsForPost(postBody, mentionMemberRows, currentUserId);
      await updatePostMutation.mutateAsync({
        postId: pid,
        title,
        body,
        ...(mids.length > 0 ? { mentionedUserIds: mids } : {}),
      });
      delete postEditsRef.current[pid];
      bumpDraftBadgeTick();
      clearTrackedUploads(editPostTrackedUploadsRef.current);
      setEditingPostId(null);
      setPostBody('');
      setComposerPhotoUrls([]);
      setComposerFileAttachments([]);
      setComposerSelection({ start: 0, end: 0 });
      void (async () => {
        if (!currentUserId) return;
        const postEdits = { ...postEditsRef.current };
        const newPost =
          newPostBody.trim() || newPostPhotoUrls.length > 0 || newPostFileAttachments.length > 0
            ? {
                markdown: newPostBody,
                photos: [...newPostPhotoUrls],
                files: [...newPostFileAttachments],
              }
            : null;
        await saveForumGroupDraft(currentUserId, groupId, { v: 1, newPost, postEdits });
      })();
    } catch {
      if (Platform.OS === 'web') window.alert('Failed to update post');
      else Alert.alert('Error', 'Failed to update post');
    }
  }, [
    bumpDraftBadgeTick,
    composerPhotoUrls,
    composerFileAttachments,
    currentUserId,
    editingPostId,
    groupId,
    mentionMemberRows,
    newPostBody,
    newPostPhotoUrls,
    newPostFileAttachments,
    postBody,
    updatePostMutation,
  ]);

  const confirmDeletePost = useCallback(
    (postId: string) => {
      const run = () => {
        delete postEditsRef.current[postId];
        bumpDraftBadgeTick();
        if (editingPostId === postId) {
          setEditingPostId(null);
          setPostBody('');
          setComposerPhotoUrls([]);
          setComposerFileAttachments([]);
          setComposerSelection({ start: 0, end: 0 });
        }
        void (async () => {
          if (!currentUserId || !forumDraftsReady) return;
          const postEdits = { ...postEditsRef.current };
          const newPost =
            newPostBody.trim() || newPostPhotoUrls.length > 0 || newPostFileAttachments.length > 0
              ? {
                  markdown: newPostBody,
                  photos: [...newPostPhotoUrls],
                  files: [...newPostFileAttachments],
                }
              : null;
          await saveForumGroupDraft(currentUserId, groupId, { v: 1, newPost, postEdits });
        })();
        void deletePostMutation.mutateAsync(postId).catch(() => {
          if (Platform.OS === 'web') window.alert('Failed to delete post');
          else Alert.alert('Error', 'Failed to delete post');
        });
      };
      const msg = 'Delete this post and all of its comments?';
      if (Platform.OS === 'web') {
        if (window.confirm(msg)) run();
      } else {
        Alert.alert('Delete post?', msg, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: run },
        ]);
      }
    },
    [
      bumpDraftBadgeTick,
      currentUserId,
      deletePostMutation,
      editingPostId,
      forumDraftsReady,
      groupId,
      newPostBody,
      newPostPhotoUrls,
      newPostFileAttachments,
    ]
  );

  const handleEditPostChangeText = useCallback(
    (nextBody: string) => {
      const prevBody = postBody;
      if (!nextBody.includes('http') || nextBody === prevBody) {
        setPostBody(nextBody);
        return;
      }

      let prefix = 0;
      while (prefix < prevBody.length && prefix < nextBody.length && prevBody[prefix] === nextBody[prefix]) {
        prefix += 1;
      }
      let suffix = 0;
      while (
        suffix < prevBody.length - prefix &&
        suffix < nextBody.length - prefix &&
        prevBody[prevBody.length - 1 - suffix] === nextBody[nextBody.length - 1 - suffix]
      ) {
        suffix += 1;
      }

      const inserted = nextBody.slice(prefix, nextBody.length - suffix);
      if (inserted.length <= 1) {
        setPostBody(nextBody);
        return;
      }

      const convertedInserted = wrapBareUrlsWithMarkdown(inserted);
      if (convertedInserted === inserted) {
        setPostBody(nextBody);
        return;
      }

      const convertedBody = `${nextBody.slice(0, prefix)}${convertedInserted}${nextBody.slice(nextBody.length - suffix)}`;
      setPostBody(convertedBody);
      const delta = convertedInserted.length - inserted.length;
      const nextCaret = Math.max(0, Math.min(convertedBody.length, composerSelection.end + delta));
      setComposerSelection({ start: nextCaret, end: nextCaret });
    },
    [composerSelection.end, postBody]
  );

  const handleNewPostChangeText = useCallback(
    (nextBody: string) => {
      const prevBody = newPostBody;
      if (!nextBody.includes('http') || nextBody === prevBody) {
        setNewPostBody(nextBody);
        return;
      }

      let prefix = 0;
      while (prefix < prevBody.length && prefix < nextBody.length && prevBody[prefix] === nextBody[prefix]) {
        prefix += 1;
      }
      let suffix = 0;
      while (
        suffix < prevBody.length - prefix &&
        suffix < nextBody.length - prefix &&
        prevBody[prevBody.length - 1 - suffix] === nextBody[nextBody.length - 1 - suffix]
      ) {
        suffix += 1;
      }

      const inserted = nextBody.slice(prefix, nextBody.length - suffix);
      if (inserted.length <= 1) {
        setNewPostBody(nextBody);
        return;
      }

      const convertedInserted = wrapBareUrlsWithMarkdown(inserted);
      if (convertedInserted === inserted) {
        setNewPostBody(nextBody);
        return;
      }

      const convertedBody = `${nextBody.slice(0, prefix)}${convertedInserted}${nextBody.slice(nextBody.length - suffix)}`;
      setNewPostBody(convertedBody);
      const delta = convertedInserted.length - inserted.length;
      const nextCaret = Math.max(0, Math.min(convertedBody.length, newPostSelection.end + delta));
      setNewPostSelection({ start: nextCaret, end: nextCaret });
    },
    [newPostBody, newPostSelection.end]
  );

  const addComment = useCallback(
    async (postId: string) => {
      if (!currentUserId || uploadingCommentPhotoPostId === postId) return;
      const raw = draftComments[postId] ?? '';
      const photoDrafts = draftCommentPhotoDraftsByPost[postId] ?? [];
      const pendingFiles = draftCommentPendingFilesByPost[postId] ?? [];
      const hasContent =
        raw.trim().length > 0 || photoDrafts.length > 0 || pendingFiles.length > 0;
      if (!hasContent) return;
      if (
        (photoDrafts.length > 0 || pendingFiles.length > 0) &&
        !(await ensureGroupCanUpload(currentUserId, groupId))
      ) {
        return;
      }
      try {
        setUploadingCommentPhotoPostId(postId);
        const photoUrls = await uploadCoverPhotoDrafts(currentUserId, photoDrafts, { groupId });
        let merged = mergeCommentBodyForApi(raw, photoUrls);
        for (const f of pendingFiles) {
          const publicUrl = await uploadPickedFileAsset(currentUserId, f.asset, { groupId });
          merged = appendMarkdownLink(merged, f.name, uploadUrlToDownloadUrl(publicUrl));
        }
        const body = merged.trim();
        if (!body) return;
        const mids = computeMentionUserIdsForPost(raw, mentionMemberRows, currentUserId);
        await createCommentMutation.mutateAsync({
          postId,
          input: {
            id: forumId('comment'),
            userId: currentUserId,
            body,
            parentCommentId: replyTargetByPost[postId] ?? undefined,
            ...(mids.length > 0 ? { mentionedUserIds: mids } : {}),
          },
        });
        setDraftComments((prev) => ({ ...prev, [postId]: '' }));
        setDraftCommentPhotoDraftsByPost((prev) => ({ ...prev, [postId]: [] }));
        setDraftCommentPendingFilesByPost((prev) => ({ ...prev, [postId]: [] }));
        setReplyTargetByPost((prev) => ({ ...prev, [postId]: null }));
      } catch (e) {
        if (isCancelled(e)) return;
        Alert.alert('Comment', e instanceof Error ? e.message : 'Failed to post comment');
      } finally {
        setUploadingCommentPhotoPostId((cur) => (cur === postId ? null : cur));
      }
    },
    [
      createCommentMutation,
      currentUserId,
      draftCommentPendingFilesByPost,
      draftCommentPhotoDraftsByPost,
      draftComments,
      mentionMemberRows,
      replyTargetByPost,
      uploadingCommentPhotoPostId,
      groupId,
    ]
  );

  const addCommentPhotoDraftForPost = useCallback((postId: string, draft: CoverPhotoDraft) => {
    setDraftCommentPhotoDraftsByPost((prev) => ({
      ...prev,
      [postId]: [...(prev[postId] ?? []), draft],
    }));
  }, []);

  const removeCommentPhotoDraftAtPost = useCallback((postId: string, index: number) => {
    setDraftCommentPhotoDraftsByPost((prev) => {
      const list = prev[postId] ?? [];
      const removed = list[index];
      if (removed) revokeCoverPhotoDraftPreview(removed);
      return { ...prev, [postId]: list.filter((_, i) => i !== index) };
    });
  }, []);

  const pickCommentPhotoForPost = useCallback(
    async (postId: string) => {
      if (uploadingCommentPhotoPostId === postId) return;
      const picked = await pickDeferredCoverPhotoNative({
        userId: currentUserId ?? undefined,
        groupId,
      });
      if (!picked?.length) return;
      for (const item of picked) {
        addCommentPhotoDraftForPost(postId, {
          kind: 'pending',
          previewUri: item.previewUri,
          pending: item.pending,
        });
      }
    },
    [addCommentPhotoDraftForPost, currentUserId, groupId, uploadingCommentPhotoPostId]
  );

  const takeCommentPhotoForPost = useCallback(
    async (postId: string) => {
      if (uploadingCommentPhotoPostId === postId) return;
      const picked = await pickDeferredCoverPhotoFromCamera({
        userId: currentUserId ?? undefined,
        groupId,
      });
      if (!picked) return;
      addCommentPhotoDraftForPost(postId, {
        kind: 'pending',
        previewUri: picked.previewUri,
        pending: picked.pending,
      });
    },
    [addCommentPhotoDraftForPost, currentUserId, groupId, uploadingCommentPhotoPostId]
  );

  const attachCommentFileForPost = useCallback(
    async (postId: string) => {
      if (uploadingCommentPhotoPostId === postId) return;
      try {
        const assets = await pickFilesFromDevice({
          userId: currentUserId ?? undefined,
          groupId,
        });
        setDraftCommentPendingFilesByPost((prev) => ({
          ...prev,
          [postId]: [
            ...(prev[postId] ?? []),
            ...assets.map((asset) => ({ id: forumId('comment-file'), name: asset.fileName, asset })),
          ],
        }));
      } catch (e) {
        if (e instanceof Error && e.message === 'cancelled') return;
        Alert.alert('Attach file', e instanceof Error ? e.message : 'Could not attach file');
      }
    },
    [currentUserId, groupId, uploadingCommentPhotoPostId]
  );

  const beginEditComment = useCallback((postId: string, c: GroupPostComment) => {
    setCommentEdit({ postId, commentId: c.id });
    setCommentEditText(c.body);
    setCommentEditParentId(c.parentCommentId ?? null);
    setReplyTargetByPost((prev) => ({ ...prev, [postId]: null }));
  }, []);

  const cancelEditComment = useCallback(() => {
    setCommentEdit(null);
    setCommentEditText('');
    setCommentEditParentId(null);
  }, []);

  const saveEditedComment = useCallback(async () => {
    if (!currentUserId || !commentEdit) return;
    const body = commentEditText.trim();
    if (!body) {
      if (Platform.OS === 'web') window.alert('Comment cannot be empty');
      else Alert.alert('Error', 'Comment cannot be empty');
      return;
    }
    try {
      const mids = computeMentionUserIdsForPost(commentEditText, mentionMemberRows, currentUserId);
      await updateCommentMutation.mutateAsync({
        commentId: commentEdit.commentId,
        body,
        parentCommentId: commentEditParentId,
        ...(mids.length > 0 ? { mentionedUserIds: mids } : {}),
      });
      cancelEditComment();
    } catch {
      if (Platform.OS === 'web') window.alert('Failed to update comment');
      else Alert.alert('Error', 'Failed to update comment');
    }
  }, [
    currentUserId,
    commentEdit,
    commentEditText,
    commentEditParentId,
    mentionMemberRows,
    updateCommentMutation,
    cancelEditComment,
  ]);

  const confirmDeleteComment = useCallback(
    (postId: string, commentId: string) => {
      const run = () => {
        if (replyTargetByPost[postId] === commentId) {
          setReplyTargetByPost((prev) => ({ ...prev, [postId]: null }));
        }
        if (commentEdit?.commentId === commentId) {
          cancelEditComment();
        }
        void deleteCommentMutation.mutateAsync(commentId).catch(() => {
          if (Platform.OS === 'web') window.alert('Failed to delete comment');
          else Alert.alert('Error', 'Failed to delete comment');
        });
      };
      const msg = 'Delete this comment?';
      if (Platform.OS === 'web') {
        if (window.confirm(msg)) run();
      } else {
        Alert.alert('Delete comment?', msg, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: run },
        ]);
      }
    },
    [replyTargetByPost, commentEdit, cancelEditComment, deleteCommentMutation]
  );

  const applyReactionAndDismiss = (emoji: string) => {
    const target = reactionPickerTarget;
    if (!target) return;
    if (target.kind === 'post') {
      togglePostReactionMutation.mutate({ postId: target.id, emoji });
    } else {
      toggleCommentReactionMutation.mutate({ commentId: target.id, emoji });
    }
    setReactionPickerTarget(null);
  };

  const openReactionDetailModal = useCallback((payload: { emoji: string; userIds: string[] }) => {
    setReactionDetailModal(payload);
  }, []);

  const newPostDraftDirty = useMemo(
    () =>
      newPostBody.trim().length > 0 ||
      newPostPhotoUrls.length > 0 ||
      newPostFileAttachments.length > 0,
    [newPostBody, newPostPhotoUrls, newPostFileAttachments]
  );

  const postIdsWithUnsavedDraft = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, e] of Object.entries(postEditsRef.current)) {
      const p = posts.find((x) => x.id === id);
      if (p && postEditDiffersFromPublished(p.body, e.markdown, e.photos, e.files ?? []))
        ids.add(id);
    }
    return ids;
  }, [draftBadgeTick, posts]);

  const forumComposerFields = (channel: ForumComposerChannel) => {
    const isNew = channel === 'new';
    const body = isNew ? newPostBody : postBody;
    const photos = isNew ? newPostPhotoUrls : composerPhotoUrls;
    const fileAttachments = isNew ? newPostFileAttachments : composerFileAttachments;
    const selection = isNew ? newPostSelection : composerSelection;
    const setSelection = isNew ? setNewPostSelection : setComposerSelection;
    const onChangeText = isNew ? handleNewPostChangeText : handleEditPostChangeText;
    const submitBusy = isNew ? createPostMutation.isPending : updatePostMutation.isPending;
    const canSubmit = body.trim().length > 0 || photos.length > 0 || fileAttachments.length > 0;
    const postComposerRef = isNew ? newPostComposerRef : editPostComposerRef;
    const scrollPostComposerIntoView = isNew
      ? scrollNewPostComposerIntoView
      : scrollEditPostComposerIntoView;

    return (
      <>
        {isNew && newPostDraftDirty ? (
          <View style={styles.forumDraftBar}>
            <Text style={styles.forumDraftBarHint}>Draft saved on this device</Text>
            <TouchableOpacity
              onPress={discardNewPostDraft}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Discard new post draft"
            >
              <Text style={styles.forumDraftBarDiscard}>Discard draft</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {!isNew ? (
          <View style={styles.forumDraftBar}>
            <Text style={styles.forumDraftBarHint}>Draft saved on this device</Text>
            <TouchableOpacity
              onPress={cancelEditPost}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Discard draft"
            >
              <Text style={styles.forumDraftBarDiscard}>Discard draft</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <View ref={postComposerRef} collapsable={false}>
          <CommentMentionInput
            key={isNew ? `new-post-${newPostInputKey}` : `edit-post-${editingPostId ?? 'none'}`}
            value={body}
            onChangeText={onChangeText}
            onFocus={scrollPostComposerIntoView}
            members={mentionMembersForInput}
            currentUserId={currentUserId}
            selection={selection}
            onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
            placeholder="Write your post - use markdown for advanced formatting"
            placeholderTextColor={Colors.textMuted}
            style={styles.bodyInput}
            multiline
            textAlignVertical="top"
            wrapperStyle={styles.postMentionInputWrap}
          />
        </View>
        {photos.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.composerPhotosScroll}
            contentContainerStyle={styles.composerPhotosScrollContent}
          >
            {photos.map((uri, i) => (
              <View key={`${uri}-${i}`} style={styles.composerPhotoThumbWrap}>
                <TouchableOpacity
                  onPress={() =>
                    setImageLightbox({
                      urls: photos,
                      index: i,
                      alts: photos.map(() => ''),
                      ownerName: currentUserId ? getUserDisplayName(currentUserId) : group?.name,
                      onDelete: (url) => removeDraftMedia(channel, url),
                    })
                  }
                  activeOpacity={0.9}
                >
                  <ResolvableImage storedUrl={uri} style={styles.composerPhotoThumb} resizeMode="cover" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => removeComposerPhotoAtFor(channel, i)}
                  style={styles.composerPhotoRemoveBtn}
                  accessibilityLabel="Remove photo"
                >
                  <Ionicons name="close" size={11} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        ) : null}
        {fileAttachments.length > 0 ? (
          <View style={styles.composerFileChipsList}>
            {fileAttachments.map((file, i) => (
              <View key={`${file.url}-${i}`} style={styles.composerFileChip}>
                <TouchableOpacity
                  style={styles.composerFileChipOpen}
                  onPress={() =>
                    setImageLightbox({
                      urls: fileAttachments.map((f) => f.url),
                      index: i,
                      alts: fileAttachments.map((f) => f.name || ''),
                      ownerName: currentUserId ? getUserDisplayName(currentUserId) : group?.name,
                      onDelete: (url) => removeDraftMedia(channel, url),
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`View attached file ${file.name || 'Attachment'}`}
                >
                  <FileExtensionIcon
                    url={file.url}
                    fileName={file.name}
                    size={14}
                  />
                  <Text style={styles.composerFileChipText} numberOfLines={1}>
                    {file.name || 'Attachment'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => removeComposerFileAtFor(channel, i)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityLabel="Remove attached file"
                  style={styles.composerFileChipRemove}
                >
                  <Ionicons name="close" size={12} color={Colors.textSub} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.attachToolbarRow}>
          <View style={styles.attachToolbarLeftActions}>
            <AddImageButton
              iconOnly
              label="Add photo"
              triggerIconName="camera-outline"
              optionsModalTitle="Add photo or video"
              linkModalTitle="Media URL"
              disabled={isUploadingAttachment}
              busy={isUploadingAttachment}
              onTakePhoto={() => void takePhotoAndAddComposerPhoto(channel)}
              onChooseFromLibrary={() => void uploadComposerPhoto(channel)}
              onInsertLink={async (url) => {
                addComposerPhotoFor(channel, url.trim());
              }}
            />
            <TouchableOpacity
              style={[styles.attachFileBtn, isUploadingAttachment && styles.postBtnDisabled]}
              onPress={() => void attachFileToComposer(channel)}
              disabled={isUploadingAttachment}
              accessibilityLabel="Attach file"
            >
              <Ionicons name="attach-outline" size={16} color={Colors.textSub} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.postBtn, (!canSubmit || submitBusy) && styles.postBtnDisabled]}
            onPress={() => void (isNew ? submitNewPost() : submitEditPost())}
            disabled={!canSubmit || submitBusy}
          >
            {submitBusy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.postBtnText}>{isNew ? 'Post' : 'Save changes'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </>
    );
  };

  if (!group) return null;

  return (
    <View style={styles.page}>
      <KeyboardSafeScrollView
        ref={(node) => {
          scrollRef.current = node;
          if (!node) return;
          const measurable = node as ScrollView & {
            measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
          };
          measurable.measureInWindow?.((_x, y) => {
            scrollViewportYRef.current = y;
          });
        }}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        onScroll={(e) => {
          scrollOffsetYRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        refreshControl={refreshControl}
      >
        <View style={styles.card}>
          <View style={styles.cardPad}>{forumComposerFields('new')}</View>
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 18 }]}>POSTS</Text>
        {postsLoading ? (
          <View style={styles.card}>
            <View style={styles.cardPad}>
              <ActivityIndicator color={Colors.textSub} />
            </View>
          </View>
        ) : posts.length === 0 ? (
          <View style={styles.card}>
            <View style={styles.cardPad}>
              <Text style={styles.emptyText}>
                No posts yet.
              </Text>
            </View>
          </View>
        ) : (
          posts.map((post) => (
            <View
              key={post.id}
              style={[styles.card, { marginBottom: 14 }]}
              onLayout={(e) => {
                const top = e.nativeEvent.layout.y;
                postTopByIdRef.current[post.id] = top;
                if (pendingScrollToEditPostIdRef.current === post.id) {
                  pendingScrollToEditPostIdRef.current = null;
                  requestAnimationFrame(() => {
                    scrollRef.current?.scrollTo({ y: Math.max(0, top - 12), animated: true });
                  });
                }
                if (pendingScrollToFocusPostIdRef.current === post.id) {
                  pendingScrollToFocusPostIdRef.current = null;
                  requestAnimationFrame(() => {
                    scrollRef.current?.scrollTo({ y: Math.max(0, top - 12), animated: true });
                  });
                }
              }}
            >
              <View style={styles.cardPad}>
                <View style={styles.postMetaHeaderRow}>
                  <View style={styles.postMetaTitleColumn}>
                    <View style={styles.postMetaAuthorRow}>
                      <UserAvatar
                        seed={getUserDisplayName(post.userId)}
                        backgroundColor={[usersById.get(post.userId)?.avatarSeed ?? '']}
                        thumbnail={usersById.get(post.userId)?.thumbnail}
                        size={18}
                      />
                      <Text style={[styles.metaText, styles.postMetaTextGrow]} numberOfLines={2}>
                        {post.userId === currentUserId ? (
                          <Text style={[styles.metaText, styles.metaPostMe]}>{getUserDisplayName(post.userId)}</Text>
                        ) : (
                          getUserDisplayName(post.userId)
                        )}
                        {post.userId === currentUserId ? (
                          <Text style={[styles.metaText, styles.metaPostMe]}> (me)</Text>
                        ) : null}{' '}
                        · {formatCreatedAtLabel(post.createdAt)}
                        {isContentEdited(post.createdAt, post.updatedAt) ? ' · Edited' : ''}
                      </Text>
                    </View>
                    {post.userId === currentUserId &&
                    editingPostId !== post.id &&
                    postIdsWithUnsavedDraft.has(post.id) ? (
                      <TouchableOpacity
                        style={styles.postDraftBadge}
                        onPress={() => beginEditPost(post)}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel="Open draft editor"
                      >
                        <Ionicons name="document-text-outline" size={12} color={Colors.maybe} />
                        <Text style={styles.postDraftBadgeText}>Unsaved draft</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <AnchoredOverflowMenu
                    width={COMMENT_THREAD_OPTIONS_MENU_WIDTH}
                    menu={(close) => (
                      <>
                        <TouchableOpacity
                          style={styles.postOptionsRow}
                          onPress={() => {
                            const name = group?.name;
                            shareFromModal(close, () =>
                              sharePost(groupId, post.id, {
                                title: post.title,
                                body: post.body,
                                authorName: getUserDisplayName(post.userId),
                                groupName: name,
                              }),
                            );
                          }}
                        >
                          <Ionicons name="share-outline" size={20} color={Colors.text} />
                          <Text style={styles.postOptionsLabel}>Share</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.postOptionsRow,
                            post.userId !== currentUserId &&
                              !isGroupAdminOrOwner(group, currentUserId) &&
                              styles.postOptionsRowLast,
                          ]}
                          onPress={async () => {
                            const text = forumPostCopyText(post.body);
                            await Clipboard.setStringAsync(text);
                            close();
                            Toast.show({ type: 'success', text1: 'Copied' });
                          }}
                        >
                          <Ionicons name="copy-outline" size={20} color={Colors.text} />
                          <Text style={styles.postOptionsLabel}>Copy</Text>
                        </TouchableOpacity>
                        {post.userId === currentUserId ? (
                          <TouchableOpacity
                            style={[
                              styles.postOptionsRow,
                              !(
                                post.userId === currentUserId || isGroupAdminOrOwner(group, currentUserId)
                              ) && styles.postOptionsRowLast,
                            ]}
                            onPress={() => {
                              close();
                              beginEditPost(post);
                            }}
                          >
                            <Ionicons name="create-outline" size={20} color={Colors.text} />
                            <Text style={styles.postOptionsLabel}>Edit</Text>
                          </TouchableOpacity>
                        ) : null}
                        {post.userId === currentUserId || isGroupAdminOrOwner(group, currentUserId) ? (
                          <TouchableOpacity
                            style={[styles.postOptionsRow, styles.postOptionsRowLast]}
                            onPress={() => {
                              close();
                              confirmDeletePost(post.id);
                            }}
                          >
                            <Ionicons name="trash-outline" size={20} color={Colors.notGoing} />
                            <Text style={[styles.postOptionsLabel, styles.postOptionsLabelDanger]}>Delete</Text>
                          </TouchableOpacity>
                        ) : null}
                      </>
                    )}
                  >
                    <TouchableOpacity
                      style={styles.postMenuBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel="Post options"
                    >
                      <Ionicons name="ellipsis-vertical" size={18} color={Colors.textSub} />
                    </TouchableOpacity>
                  </AnchoredOverflowMenu>
                </View>
                {editingPostId === post.id ? (
                  forumComposerFields('edit')
                ) : (
                  (() => {
                    const { markdownSource, attachmentImages, attachmentFiles } = splitStoredPostBody(
                      post.body
                    );
                    const joined = markdownSource.trim();
                    const hasText = joined.length > 0;
                    const expanded = !!expandedPostBodyById[post.id];
                    const storedMeasure = postMarkdownMeasureById[post.id];
                    const measureOk = storedMeasure?.bodyKey === post.body;
                    const natural = measureOk ? storedMeasure : null;
                    const shouldCollapse = !!(natural && natural.h > POST_BODY_PREVIEW_MAX_HEIGHT);
                    const showClamp = shouldCollapse && !expanded;
                    const postOwner = usersById.get(post.userId);
                    const canDeleteThisPostMedia = canDeleteManagedMedia({
                      currentUserId,
                      group,
                      resourceOwnerId: post.userId,
                    });
                    return (
                      <>
                        {hasText ? (
                          <>
                            <View
                              onLayout={(e) => {
                                const { width, height } = e.nativeEvent.layout;
                                if (width < 1 || height < 1) return;
                                const clampedLayout = !!(
                                  natural &&
                                  natural.h > POST_BODY_PREVIEW_MAX_HEIGHT &&
                                  !expanded
                                );
                                if (clampedLayout) return;
                                setPostMarkdownMeasureById((prev) => ({
                                  ...prev,
                                  [post.id]: { w: width, h: height, bodyKey: post.body },
                                }));
                              }}
                              style={
                                showClamp
                                  ? {
                                      maxHeight: POST_BODY_PREVIEW_MAX_HEIGHT,
                                      overflow: 'hidden' as const,
                                    }
                                  : undefined
                              }
                            >
                              <ForumPostMarkdownBody
                                markdownBody={joined}
                                markdownStyles={markdownStyles}
                                posterDisplayName={getUserDisplayName(post.userId)}
                                ownerAvatarSeed={postOwner?.avatarSeed ?? null}
                                ownerThumbnail={postOwner?.thumbnail ?? null}
                                setImageLightbox={setImageLightbox}
                                onDeleteUrl={
                                  canDeleteThisPostMedia
                                    ? (url) => confirmDeleteOwnPostFile(post, url)
                                    : undefined
                                }
                              />
                            </View>
                            {shouldCollapse ? (
                              <TouchableOpacity
                                onPress={() =>
                                  setExpandedPostBodyById((prev) => ({
                                    ...prev,
                                    [post.id]: !prev[post.id],
                                  }))
                                }
                                style={styles.readMoreBtn}
                              >
                                <Text style={styles.readMoreText}>
                                  {expanded ? 'Read less' : 'Read more'}
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                          </>
                        ) : null}
                        {attachmentImages.length > 0 ? (
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.postAttachmentPhotosScroll}
                            contentContainerStyle={styles.composerPhotosScrollContent}
                          >
                            {attachmentImages.map((image, idx) => (
                              <View key={`${post.id}-att-${idx}`} style={styles.composerPhotoThumbWrap}>
                                <TouchableOpacity
                                  activeOpacity={isDeletedMediaUrl(image.url) ? 1 : 0.9}
                                  disabled={isDeletedMediaUrl(image.url)}
                                  onPress={() =>
                                    setImageLightbox({
                                      urls: attachmentImages.map((img) => img.url),
                                      index: idx,
                                      alts: attachmentImages.map((img) => img.alt || ''),
                                      ownerName: getUserDisplayName(post.userId),
                                      ownerAvatarSeed: postOwner?.avatarSeed ?? null,
                                      ownerThumbnail: postOwner?.thumbnail ?? null,
                                      onDelete: canDeleteThisPostMedia
                                        ? (url) => confirmDeleteOwnPostFile(post, url)
                                        : undefined,
                                    })
                                  }
                                >
                                  <PostMediaImage
                                    storedUrl={image.url}
                                    style={styles.composerPhotoThumb}
                                    resizeMode="cover"
                                  />
                                </TouchableOpacity>
                              </View>
                            ))}
                          </ScrollView>
                        ) : null}
                        {attachmentFiles.length > 0 ? (
                          <View style={styles.postAttachmentFilesList}>
                            {attachmentFiles.map((file, idx) => (
                              <PostAttachmentFileRow
                                key={`${post.id}-file-${idx}`}
                                url={file.url}
                                name={file.name}
                                textStyle={styles.postAttachmentFileText}
                                onPress={() =>
                                  setImageLightbox({
                                    urls: attachmentFiles.map((f) => f.url),
                                    index: idx,
                                    alts: attachmentFiles.map((f) => f.name || ''),
                                    ownerName: getUserDisplayName(post.userId),
                                    ownerAvatarSeed: postOwner?.avatarSeed ?? null,
                                    ownerThumbnail: postOwner?.thumbnail ?? null,
                                    onDelete: canDeleteThisPostMedia
                                      ? (url) => confirmDeleteOwnPostFile(post, url)
                                      : undefined,
                                  })
                                }
                              />
                            ))}
                          </View>
                        ) : null}
                      </>
                    );
                  })()
                )}

                {post.reactions.length > 0 ? (
                  <View style={styles.reactionRow}>
                    {post.reactions.map((entry) => (
                      <TouchableOpacity
                        key={`${post.id}-existing-${entry.emoji}`}
                        style={styles.reactionBtn}
                        onPress={() =>
                          togglePostReactionMutation.mutate({ postId: post.id, emoji: entry.emoji })
                        }
                        onLongPress={() =>
                          openReactionDetailModal({ emoji: entry.emoji, userIds: entry.userIds })
                        }
                      >
                        <Text style={styles.reactionLabel}>
                          {entry.emoji} {entry.count}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                <View
                  collapsable={false}
                  ref={(node) => {
                    commentsBlockRefs.current[post.id] = node;
                  }}
                  onLayout={() => {
                    if (pendingScrollToCommentsPostIdRef.current !== post.id) return;
                    pendingScrollToCommentsPostIdRef.current = null;
                    const run = () => {
                      scrollNodeToTopOfViewport({
                        scrollRef,
                        scrollViewportYRef,
                        scrollOffsetYRef,
                        targetRef: { current: commentsBlockRefs.current[post.id] },
                      });
                    };
                    requestAnimationFrame(() => {
                      requestAnimationFrame(run);
                    });
                    setTimeout(run, 250);
                  }}
                >
                <View style={styles.reactionRow}>
                  <ReactionQuickPicker
                    onReact={(emoji) => togglePostReactionMutation.mutate({ postId: post.id, emoji })}
                    onViewAll={() => setReactionPickerTarget({ kind: 'post', id: post.id })}
                    disabled={togglePostReactionMutation.isPending || !currentUserId}
                  >
                    <TouchableOpacity
                      style={styles.iconActionBtn}
                      accessibilityLabel="Add reaction"
                      activeOpacity={0.75}
                    >
                      <Ionicons name="happy-outline" size={15} color={Colors.textSub} />
                    </TouchableOpacity>
                  </ReactionQuickPicker>
                  <TouchableOpacity
                    style={styles.iconActionBtn}
                    onPress={() =>
                      setExpandedCommentsByPost((prev) => {
                        const opening = !prev[post.id];
                        if (opening) pendingScrollToCommentsPostIdRef.current = post.id;
                        return { ...prev, [post.id]: opening };
                      })
                    }
                  >
                    <Ionicons name="chatbubble-outline" size={15} color={Colors.textSub} />
                    <Text style={styles.iconActionText}>Comments ({post.comments.length})</Text>
                  </TouchableOpacity>
                </View>
                {expandedCommentsByPost[post.id] ? (
                  <ThreadedCommentsSection
                    comments={mapGroupCommentsToThread(post.comments)}
                    mentionMembers={mentionMembersForInput}
                    focusCommentId={focusPostId === post.id ? focusCommentId : undefined}
                    ancestorTopPx={postTopByIdRef.current[post.id] ?? 0}
                    scrollRef={scrollRef}
                    scrollViewportYRef={scrollViewportYRef}
                    scrollOffsetYRef={scrollOffsetYRef}
                    currentUserId={currentUserId}
                    canModerateComments={isGroupAdminOrOwner(group, currentUserId)}
                    getUserDisplayName={getUserDisplayName}
                    formatCommentTime={formatCreatedAtLabel}
                    draftText={draftComments[post.id] ?? ''}
                    onDraftTextChange={(v) =>
                      setDraftComments((prev) => ({ ...prev, [post.id]: v }))
                    }
                    draftPhotoUrls={(draftCommentPhotoDraftsByPost[post.id] ?? []).map(
                      coverPhotoDraftDisplayUri
                    )}
                    onRemoveDraftPhotoAtIndex={(index) =>
                      removeCommentPhotoDraftAtPost(post.id, index)
                    }
                    draftPendingFiles={(draftCommentPendingFilesByPost[post.id] ?? []).map((f) => ({
                      id: f.id,
                      name: f.name,
                    }))}
                    onRemoveDraftPendingFile={(fileId) =>
                      setDraftCommentPendingFilesByPost((prev) => ({
                        ...prev,
                        [post.id]: (prev[post.id] ?? []).filter((f) => f.id !== fileId),
                      }))
                    }
                    onUploadDraftPhoto={() => pickCommentPhotoForPost(post.id)}
                    onTakeDraftPhoto={() => takeCommentPhotoForPost(post.id)}
                    onAddDraftPhotoByUrl={(url) =>
                      addCommentPhotoDraftForPost(post.id, { kind: 'remote', url: url.trim() })
                    }
                    draftPhotoBusy={uploadingCommentPhotoPostId === post.id}
                    onAttachDraftFile={() => attachCommentFileForPost(post.id)}
                    onOpenDraftPhoto={({ urls, index }) =>
                      setImageLightbox({
                        urls,
                        index,
                        alts: urls.map(() => ''),
                        ownerName: currentUserId ? getUserDisplayName(currentUserId) : group?.name,
                        onDelete: (url) => {
                          setDraftCommentPhotoDraftsByPost((prev) => {
                            const list = prev[post.id] ?? [];
                            const idx = list.map(coverPhotoDraftDisplayUri).indexOf(url);
                            if (idx < 0) return prev;
                            const removed = list[idx];
                            if (removed) revokeCoverPhotoDraftPreview(removed);
                            return { ...prev, [post.id]: list.filter((_, i) => i !== idx) };
                          });
                          removeLightboxUrl(url);
                        },
                      })
                    }
                    replyTargetId={replyTargetByPost[post.id] ?? null}
                    onReplyTargetChange={(id) =>
                      setReplyTargetByPost((prev) => ({ ...prev, [post.id]: id }))
                    }
                    onSubmitDraft={() => void addComment(post.id)}
                    commentEdit={
                      commentEdit?.postId === post.id ? { commentId: commentEdit.commentId } : null
                    }
                    commentEditText={commentEditText}
                    onCommentEditTextChange={setCommentEditText}
                    commentEditParentId={commentEditParentId}
                    onCommentEditParentIdChange={setCommentEditParentId}
                    onCancelEdit={cancelEditComment}
                    onSaveEdit={() => void saveEditedComment()}
                    saveEditBusy={updateCommentMutation.isPending}
                    onToggleReaction={(commentId, emoji) =>
                      toggleCommentReactionMutation.mutate({ commentId, emoji })
                    }
                    onReactionChipLongPress={openReactionDetailModal}
                    onOpenFullReactionPicker={(commentId) =>
                      setReactionPickerTarget({ kind: 'comment', id: commentId })
                    }
                    onBeginEdit={(commentId) => {
                      const c = post.comments.find((x) => x.id === commentId);
                      if (c) beginEditComment(post.id, c);
                    }}
                    confirmDeleteComment={(commentId) =>
                      confirmDeleteComment(post.id, commentId)
                    }
                    containerStyle={styles.postCommentsSection}
                    renderAvatar={(userId, displayName) => {
                      const u = usersById.get(userId);
                      return (
                        <UserAvatar
                          seed={displayName}
                          backgroundColor={[u?.avatarSeed ?? '']}
                          thumbnail={u?.thumbnail}
                          size={18}
                        />
                      );
                    }}
                    renderCommentBody={(comment) => {
                      const owner = usersById.get(comment.userId);
                      const full = post.comments.find((x) => x.id === comment.id);
                      return (
                        <ForumPostMarkdownBody
                          markdownBody={comment.body || ''}
                          markdownStyles={markdownStyles}
                          posterDisplayName={getUserDisplayName(comment.userId)}
                          ownerAvatarSeed={owner?.avatarSeed ?? null}
                          ownerThumbnail={owner?.thumbnail ?? null}
                          setImageLightbox={setImageLightbox}
                          onDeleteUrl={
                            full &&
                            canDeleteManagedMedia({
                              currentUserId,
                              group,
                              resourceOwnerId: comment.userId,
                            })
                              ? (url) => confirmDeleteCommentFile(full, url)
                              : undefined
                          }
                        />
                      );
                    }}
                  />
                ) : null}
                </View>
              </View>
            </View>
          ))
        )}
      </KeyboardSafeScrollView>

      {reactionPickerTarget && currentUserId ? (
        <Modal {...edgeToEdgeModalProps}
          visible
          transparent
          animationType="fade"
          presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
          onRequestClose={() => setReactionPickerTarget(null)}
          statusBarTranslucent
        >
          <View style={styles.commentReactionPickerRoot}>
            <Pressable
              style={[StyleSheet.absoluteFill, { backgroundColor: Colors.overlay }]}
              onPress={() => setReactionPickerTarget(null)}
              accessibilityRole="button"
              accessibilityLabel="Close emoji picker"
            />
            <View style={styles.commentReactionPickerCenter} pointerEvents="box-none">
              <View style={styles.commentReactionPickerCard} pointerEvents="auto">
                <Text style={styles.commentReactionPickerTitle}>Choose a reaction</Text>
                <ScrollView
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  style={styles.commentReactionPickerScroll}
                  contentContainerStyle={styles.commentReactionPickerGrid}
                >
                  {COMMENT_REACTION_EMOJIS.map((emoji, emojiIdx) => (
                    <TouchableOpacity
                      key={`${emoji}-${emojiIdx}`}
                      onPress={() => applyReactionAndDismiss(emoji)}
                      disabled={
                        togglePostReactionMutation.isPending || toggleCommentReactionMutation.isPending
                      }
                      style={styles.commentActionEmojiHit}
                      accessibilityLabel={`React with ${emoji}`}
                    >
                      <ReactionEmojiGlyph emoji={emoji} size={22} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}

      {reactionDetailModal ? (
        <Modal {...edgeToEdgeModalProps}
          visible
          transparent
          animationType="fade"
          presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
          onRequestClose={() => setReactionDetailModal(null)}
          statusBarTranslucent
        >
          <View style={styles.commentReactionPickerRoot}>
            <Pressable
              style={[StyleSheet.absoluteFill, { backgroundColor: Colors.overlay }]}
              onPress={() => setReactionDetailModal(null)}
              accessibilityRole="button"
              accessibilityLabel="Close reaction details"
            />
            <View style={styles.commentReactionPickerCenter} pointerEvents="box-none">
              <View style={styles.reactionDetailCard} pointerEvents="auto">
                <Text style={styles.reactionDetailTitle}>
                  {reactionDetailModal.emoji} Reactions ({reactionDetailModal.userIds.length})
                </Text>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  style={styles.reactionDetailScroll}
                >
                  {reactionDetailModal.userIds.map((uid) => {
                    const user = usersById.get(uid);
                    return (
                      <View key={`${reactionDetailModal.emoji}-${uid}`} style={styles.reactionDetailRow}>
                        <UserAvatar
                          seed={getUserDisplayName(uid)}
                          backgroundColor={[user?.avatarSeed ?? '']}
                          thumbnail={user?.thumbnail}
                          size={28}
                        />
                        <Text style={styles.reactionDetailName}>
                          {uid === currentUserId
                            ? `${getUserDisplayName(uid)} (you)`
                            : getUserDisplayName(uid)}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}

      <ImageLightboxModal
        visible={imageLightbox !== null}
        urls={imageLightbox?.urls ?? []}
        names={imageLightbox?.alts}
        index={imageLightbox?.index ?? 0}
        onChangeIndex={(nextIndex) => setImageLightbox((prev) => (prev ? { ...prev, index: nextIndex } : prev))}
        onClose={() => setImageLightbox(null)}
        onDelete={imageLightbox?.onDelete}
        headerAvatar={
          imageLightbox ? (
            <UserAvatar
              seed={imageLightbox.ownerName || 'Image'}
              backgroundColor={[imageLightbox.ownerAvatarSeed ?? '']}
              thumbnail={imageLightbox.ownerThumbnail ?? null}
              size={28}
            />
          ) : undefined
        }
        title={imageLightbox?.ownerName}
        subtitle={
          imageLightbox
            ? imageLightbox.urls.length > 1
              ? `${
                  (imageLightbox.alts?.[imageLightbox.index] || '').trim() || 'Image'
                } · ${imageLightbox.index + 1} of ${imageLightbox.urls.length}`
              : (imageLightbox.alts?.[imageLightbox.index] || '').trim() || 'Image'
            : undefined
        }
      />

      {composerLinkPopover ? (
        <Modal {...edgeToEdgeModalProps}
          visible
          transparent
          animationType="fade"
          presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
          onRequestClose={() => setComposerLinkPopover(null)}
          statusBarTranslucent
        >
          <View style={styles.commentReactionPickerRoot}>
            <Pressable
              style={[StyleSheet.absoluteFill, { backgroundColor: Colors.overlay }]}
              onPress={() => setComposerLinkPopover(null)}
              accessibilityRole="button"
              accessibilityLabel="Close link editor"
            />
            <View style={styles.commentReactionPickerCenter} pointerEvents="box-none">
              <View style={styles.composerLinkPopoverCard} pointerEvents="auto">
                <Text style={styles.composerLinkPopoverTitle}>Insert link</Text>
                <TextInput
                  value={composerLinkPopover.text}
                  onChangeText={(text) => setComposerLinkPopover((prev) => (prev ? { ...prev, text } : prev))}
                  placeholder="Displayed text"
                  placeholderTextColor={Colors.textMuted}
                  style={styles.composerLinkPopoverInput}
                />
                <TextInput
                  value={composerLinkPopover.url}
                  onChangeText={(url) => setComposerLinkPopover((prev) => (prev ? { ...prev, url } : prev))}
                  placeholder="https://example.com"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.composerLinkPopoverInput}
                />
                <View style={styles.composerLinkPopoverActions}>
                  <TouchableOpacity
                    style={styles.composerLinkPopoverCancelBtn}
                    onPress={() => setComposerLinkPopover(null)}
                  >
                    <Text style={styles.composerLinkPopoverCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.composerLinkPopoverApplyBtn,
                      !composerLinkPopover.url.trim() && styles.postBtnDisabled,
                    ]}
                    disabled={!composerLinkPopover.url.trim()}
                    onPress={applyComposerLinkPopover}
                  >
                    <Text style={styles.composerLinkPopoverApplyText}>Apply</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 110 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderStrong,
    overflow: 'hidden',
  },
  cardPad: { padding: 14 },
  attachToolbarRow: {
    marginTop: 2,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  attachToolbarLeftActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  attachFileBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    borderRadius: 9,
  },
  attachToolbarBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markdownSupportText: {
    marginTop: 10,
    marginBottom: 8,
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    fontSize: 12,
  },
  markdownSupportLink: {
    color: Colors.accent,
    textDecorationLine: 'underline',
    fontFamily: Fonts.medium,
  },
  bodyInput: {
    minHeight: 72,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.text,
    marginBottom: 6,
  },
  composerPhotosScroll: {
    marginBottom: 10,
    marginTop: -2,
  },
  /** Published post attachment strip — same 80×80 thumbs as composer preview */
  postAttachmentPhotosScroll: {
    marginTop: 8,
    marginBottom: 8,
  },
  composerPhotosScrollContent: {
    gap: 4,
    paddingVertical: 4,
  },
  postAttachmentFilesList: {
    marginTop: 6,
    marginBottom: 6,
    gap: 6,
  },
  postAttachmentFileLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  postAttachmentFileIcon: {
    flexShrink: 0,
  },
  postAttachmentFileText: {
    flexShrink: 1,
    color: Colors.accent,
    fontFamily: Fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    textDecorationLine: 'underline',
  },
  composerFileChipsList: {
    marginTop: 2,
    marginBottom: 8,
    gap: 6,
  },
  composerFileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  composerFileChipIcon: {
    flexShrink: 0,
  },
  composerFileChipText: {
    flexShrink: 1,
    color: Colors.text,
    fontFamily: Fonts.regular,
    fontSize: 13,
  },
  composerFileChipOpen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  composerFileChipRemove: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: Colors.surface,
    flexShrink: 0,
  },
  composerPhotoThumbWrap: {
    position: 'relative',
  },
  composerPhotoThumb: {
    width: 80,
    height: 80,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  composerPhotoRemoveBtn: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.text,
    borderWidth: 2,
    borderColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
  },
  postBtnDisabled: { opacity: 0.45 },
  postBtnText: { color: '#fff', fontFamily: Fonts.semiBold, fontSize: 13 },
  emptyText: { color: Colors.textMuted, fontFamily: Fonts.regular, fontSize: 14, lineHeight: 21 },
  metaText: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.textMuted, marginBottom: 12 },
  metaPostMe: { color: Colors.going, fontFamily: Fonts.semiBold },
  postMetaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  postMetaTitleColumn: { flex: 1, minWidth: 0 },
  postMetaAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  postDraftBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.md,
    backgroundColor: Colors.maybeBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.maybeBorder,
  },
  postDraftBadgeText: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.maybe,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  postMetaTextGrow: { flex: 1, marginBottom: 0 },
  postMenuBtn: { padding: 2, marginTop: -2 },
  forumDraftBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: Colors.bg,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  forumDraftBarHint: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.textMuted, flex: 1, marginRight: 8 },
  forumDraftBarDiscard: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.notGoing },
  commentComposerWrap: {
    marginTop: 8,
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
  },
  commentComposerAttachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentComposerInput: {
    minHeight: 42,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.text,
    backgroundColor: Colors.bg,
  },
  commentComposerSubmitBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent,
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentComposerSubmitBtnText: { fontSize: 12, fontFamily: Fonts.semiBold, color: '#fff' },
  commentComposerReplyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  commentComposerReplyCard: {
    flex: 1,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  commentComposerReplyAuthor: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
  },
  commentComposerReplyPreview: {
    fontSize: 14,
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    lineHeight: 20,
  },
  postOptionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  postOptionsRowLast: { borderBottomWidth: 0 },
  postOptionsLabel: { fontSize: 15, fontFamily: Fonts.medium, color: Colors.text, flex: 1 },
  postOptionsLabelDanger: { color: Colors.notGoing },
  readMoreBtn: { alignSelf: 'flex-start', marginTop: 4 },
  readMoreText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textSub },
  groupPhotoLightbox: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.93)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupPhotoLightboxHeader: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  groupPhotoLightboxName: { fontSize: 13, fontFamily: Fonts.semiBold, color: '#fff' },
  groupPhotoLightboxSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    fontFamily: Fonts.regular,
  },
  groupPhotoLightboxClose: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  groupPhotoLightboxImg: { width: '100%', height: '100%' },
  groupPhotoLightboxImageWrap: {
    flex: 1,
    width: '100%',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupPhotoLightboxTapLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '40%',
  },
  groupPhotoLightboxTapRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '40%',
  },
  groupPhotoLightboxNavBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
    zIndex: 6,
    elevation: 6,
  },
  groupPhotoLightboxNavBtnDisabled: { opacity: 0.28 },
  groupPhotoLightboxNavPrev: { left: 10 },
  groupPhotoLightboxNavNext: { right: 10 },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  iconActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  commentActionEmojiHit: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentReactionPickerRoot: {
    flex: 1,
  },
  commentReactionPickerCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  commentReactionPickerCard: {
    width: '100%',
    maxWidth: 340,
    maxHeight: Dimensions.get('window').height * 0.62,
    borderRadius: Radius.xl,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    paddingTop: 14,
    paddingHorizontal: 12,
    paddingBottom: 10,
    ...Shadows.md,
  },
  commentReactionPickerTitle: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  commentReactionPickerScroll: {
    maxHeight: Dimensions.get('window').height * 0.48,
  },
  commentReactionPickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 4,
    paddingBottom: 8,
  },
  reactionDetailCard: {
    width: '100%',
    maxWidth: 340,
    maxHeight: Dimensions.get('window').height * 0.62,
    borderRadius: Radius.xl,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 12,
    ...Shadows.md,
  },
  reactionDetailTitle: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  reactionDetailScroll: {
    maxHeight: Dimensions.get('window').height * 0.46,
  },
  reactionDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  reactionDetailName: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Colors.text,
  },
  composerLinkPopoverCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Radius.xl,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    padding: 14,
    ...Shadows.md,
  },
  composerLinkPopoverTitle: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
    marginBottom: 10,
  },
  composerLinkPopoverInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.text,
    backgroundColor: Colors.bg,
    marginBottom: 8,
  },
  composerLinkPopoverActions: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  composerLinkPopoverCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  composerLinkPopoverCancelText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Colors.textSub,
  },
  composerLinkPopoverApplyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent,
  },
  composerLinkPopoverApplyText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: '#fff',
  },
  iconActionText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textSub },
  reactionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  reactionLabel: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.textSub },
  postCommentsSection: {
    marginTop: 8,
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderStrong,
    overflow: 'hidden',
  },
  commentComposer: {
    marginTop: 8,
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  replyComposer: { marginTop: 10, gap: 8 },
  replyingBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  replyingBadgeText: { fontSize: 11, color: Colors.textMuted, fontFamily: Fonts.medium },
  composerReplyPreviewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  composerReplyQuoteStrip: {
    flex: 1,
    marginTop: 0,
    marginBottom: 0,
  },
  commentEditReplyComposer: {
    gap: 8,
    marginTop: 4,
  },
  commentEditStaleHint: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
    lineHeight: 17,
    marginBottom: 8,
    marginTop: 2,
  },
  commentEditInput: {
    marginTop: 8,
    minHeight: 72,
  },
  commentEditActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
  commentEditSecondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  commentEditSecondaryBtnText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: Colors.textSub,
  },
  commentEditPrimaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentEditPrimaryBtnDisabled: { opacity: 0.45 },
  commentEditPrimaryBtnText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: '#fff',
  },
  commentOptionsModalRoot: {
    flex: 1,
  },
  commentOptionsDismiss: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  commentOptionsPopoverWrap: {
    position: 'absolute',
    zIndex: 20,
    elevation: 20,
  },
  commentOptionsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    width: '100%',
    ...Shadows.lg,
  },
  commentOptionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  commentOptionsRowLast: { borderBottomWidth: 0 },
  commentOptionsLabel: { fontSize: 15, fontFamily: Fonts.medium, color: Colors.text, flex: 1 },
  commentOptionsLabelDanger: { color: Colors.notGoing },
  commentInput: {
    minHeight: 42,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.text,
    backgroundColor: Colors.bg,
  },
  replyBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  replyBtnText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textSub },
  commentRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    position: 'relative',
  },
  commentRowHighlightOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff7cc',
  },
  commentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  commentHeaderTitleCluster: {
    flex: 1,
    minWidth: 0,
    marginRight: 4,
  },
  /** Wraps nested Text so name + timestamp stay inline and ellipsize together. */
  commentHeaderInlineRoot: {
    width: '100%',
  },
  commentName: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.text },
  commentNameMe: { color: Colors.going },
  commentMenuBtn: { padding: 2 },
  commentTime: { fontSize: 11, color: Colors.textMuted, fontFamily: Fonts.regular, flexShrink: 0 },
  commentTimeInline: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    flexShrink: 0,
    marginLeft: 8,
  },
  commentText: { fontSize: 14, color: Colors.text, fontFamily: Fonts.regular, lineHeight: 20 },
  replyQuoteStrip: {
    marginTop: 4,
    marginBottom: 4,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  replyQuotePressed: {
    opacity: 0.9,
  },
  replyQuoteAuthor: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
  },
  replyQuotePreview: {
    fontSize: 14,
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    lineHeight: 20,
  },
  reactionChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  reactionChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reactionChipInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  reactionChipCount: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.text },
  replyCard: {
    marginTop: 10,
    marginLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: Colors.border,
    paddingLeft: 8,
  },
  commentMeta: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.textMuted, marginBottom: 4 },
  commentBody: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.text, lineHeight: 20 },
  postMentionInputWrap: { alignSelf: 'stretch', width: '100%' },
});
