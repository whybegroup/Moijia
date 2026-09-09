import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Modal,
  Pressable,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { GroupsService, type GroupPost, type GroupPostComment } from '@moijia/client';
import { shareFromModal, sharePost } from '../utils/shareContent';
import { forumPostCopyText } from '../utils/sharePreviewCopy';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { Colors, Fonts, Radius, Shadows } from '../constants/theme';
import { edgeToEdgeModalProps } from './edgeToEdgeModalProps';
import { queryKeys } from '../config/queryClient';
import { AnchoredOverflowMenu } from './AnchoredOverflowMenu';
import { COMMENT_THREAD_OPTIONS_MENU_WIDTH, ThreadedCommentsSection, type ThreadComment } from './ThreadedCommentsSection';
import { COMMENT_REACTION_EMOJIS } from '../constants/commentReactionEmojis';
import { computeMentionUserIdsForPost, type MentionMemberRow } from '../utils/mentionUtils';
import { ReactionQuickPicker } from './ReactionQuickPicker';
import { ReactionEmojiGlyph } from './ReactionEmojiGlyph';
import {
  getGroupColor,
  getDefaultGroupThemeFromName,
  formatCreatedAtLabel,
  isContentEdited,
} from '../utils/helpers';
import { Pill } from './ui';
import { CollapsibleFiltersButton } from './CollapsibleFiltersButton';
import {
  useGroups,
  useNotifications,
  useAllGroupMemberColors,
  useGroupPostsForGroups,
  useUsers,
} from '../hooks/api';
import { useCreateGroupPost } from '../hooks/api/useGroupPosts';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { KeyboardSafeScrollView } from './KeyboardSafeScrollView';
import { UserAvatar } from './UserAvatar';
import { GroupAvatar } from './GroupAvatar';
import { formSectionTitleStyle } from './ui';
import { AddImageButton } from './AddImageButton';
import { ResolvableImage } from './ResolvableImage';
import { ImageLightboxModal } from './ImageLightboxModal';
import { FileExtensionIcon } from './FileExtensionPreview';
import { PostAttachmentFileRow, PostMediaImage } from './DeletedPostMedia';
import { isDeletedMediaUrl } from '../utils/deletedMedia';
import { looksLikeMediaUrl } from '../utils/fileKind';
import { ForumPostMarkdownBody, dropLightboxItem, type ForumPostImageLightboxState } from './ForumPostMarkdownBody';
import {
  pickAndUploadCoverPhoto,
  takeAndUploadCoverPhoto,
  pickAndUploadFileFromDevice,
  uploadUrlToDownloadUrl,
} from '../services/pickAndUploadImage';
import {
  forumNewPostFromComposer,
  loadForumGroupDraft,
  loadPostsTabDraft,
  patchForumGroupNewPost,
  savePostsTabDraft,
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

const POST_ATTACHMENT_MARKER = '[[MOIJIA_POST_ATTACHMENTS]]';

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

export function PostsListScreen() {
  const { userId: currentUserId } = useCurrentUserContext();
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollViewportYRef = useRef(0);
  const scrollOffsetYRef = useRef(0);
  const postTopByIdRef = useRef<Record<string, number>>({});
  const pendingScrollToCommentsPostIdRef = useRef<string | null>(null);
  const commentsBlockRefs = useRef<Record<string, View | null>>({});

  const { data: allGroups = [], refetch: refetchGroups } = useGroups(currentUserId ?? '');
  const { refetch: refetchNotifications } = useNotifications(currentUserId || '');
  const { data: groupColors = {}, refetch: refetchGroupColors } = useAllGroupMemberColors(
    currentUserId || ''
  );
  const { data: allUsers = [], refetch: refetchUsers } = useUsers();
  
  const groups = useMemo(
    () => allGroups.filter((g) => g.membershipStatus === 'member' || g.membershipStatus === 'admin'),
    [allGroups],
  );
  
  // Filter state
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // New post state
  const [newPostBody, setNewPostBody] = useState('');
  const [newPostInputKey, setNewPostInputKey] = useState(0);
  const [selectedGroupForPost, setSelectedGroupForPost] = useState<string | null>(null);
  const [showGroupSelectModal, setShowGroupSelectModal] = useState(false);
  const [newPostPhotoUrls, setNewPostPhotoUrls] = useState<string[]>([]);
  const [newPostFileAttachments, setNewPostFileAttachments] = useState<Array<{ name: string; url: string }>>([]);
  const [postsTabDraftsReady, setPostsTabDraftsReady] = useState(false);
  const skipDraftSaveRef = useRef(false);
  const draftPersistEpochRef = useRef(0);
  const groupSwitchGenRef = useRef(0);
  const composerDraftRef = useRef({
    body: '',
    photos: [] as string[],
    files: [] as Array<{ name: string; url: string }>,
    groupId: null as string | null,
  });
  const newPostTrackedUploadsRef = useRef<Set<string>>(new Set());
  const editPostTrackedUploadsRef = useRef<Set<string>>(new Set());
  const commentTrackedUploadsRef = useRef<Record<string, Set<string>>>({});
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [imageLightbox, setImageLightbox] = useState<ForumPostImageLightboxState>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editPostBody, setEditPostBody] = useState('');
  const [editPostPhotoUrls, setEditPostPhotoUrls] = useState<string[]>([]);
  const [editPostFileAttachments, setEditPostFileAttachments] = useState<Array<{ name: string; url: string }>>([]);
  const [editSaving, setEditSaving] = useState(false);
  const queryClient = useQueryClient();
  const [expandedCommentsByPost, setExpandedCommentsByPost] = useState<Record<string, boolean>>({});
  const [draftComments, setDraftComments] = useState<Record<string, string>>({});
  const [draftCommentPhotoUrlsByPost, setDraftCommentPhotoUrlsByPost] = useState<Record<string, string[]>>({});
  const [draftCommentFilesByPost, setDraftCommentFilesByPost] = useState<
    Record<string, Array<{ id: string; name: string; url: string }>>
  >({});
  const [uploadingCommentPhotoPostId, setUploadingCommentPhotoPostId] = useState<string | null>(null);
  const [replyTargetByPost, setReplyTargetByPost] = useState<Record<string, string | null>>({});
  const [commentEdit, setCommentEdit] = useState<{ postId: string; commentId: string } | null>(null);
  const [commentEditText, setCommentEditText] = useState('');
  const [commentEditParentId, setCommentEditParentId] = useState<string | null>(null);
  const [commentSaving, setCommentSaving] = useState(false);
  const [reactionBusy, setReactionBusy] = useState(false);
  const [reactionPickerTarget, setReactionPickerTarget] = useState<{
    kind: 'post' | 'comment';
    id: string;
    groupId: string;
  } | null>(null);
  const [reactionDetailModal, setReactionDetailModal] = useState<{
    emoji: string;
    userIds: string[];
  } | null>(null);

  const groupIds = useMemo(() => groups.map((g) => g.id), [groups]);
  const groupPostsQueries = useGroupPostsForGroups(groupIds, currentUserId ?? '');

  // Combine all posts from all groups
  const allPosts = useMemo(() => {
    const posts: (GroupPost & { groupId: string })[] = [];
    groups.forEach((group, index) => {
      const groupPosts = groupPostsQueries[index]?.data || [];
      groupPosts.forEach(post => {
        posts.push({ ...post, groupId: group.id });
      });
    });
    // Sort by creation date, newest first
    return posts.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [groups, groupPostsQueries]);

  const { refreshControl } = usePullToRefresh([
    refetchGroups,
    refetchNotifications,
    refetchGroupColors,
    refetchUsers,
    ...groupPostsQueries.map(q => q.refetch),
  ]);

  const filtered = useMemo(() => {
    return allPosts.filter(post => {
      if (!groups.some(g => g.id === post.groupId)) return false;
      if (selectedGroupIds.length > 0 && !selectedGroupIds.includes(post.groupId)) return false;
      return true;
    });
  }, [
    groups,
    selectedGroupIds,
    allPosts,
  ]);

  const usersById = useMemo(() => {
    const map = new Map();
    allUsers.forEach(u => map.set(u.id, u));
    return map;
  }, [allUsers]);

  const getUserDisplayName = useCallback((userId: string) => {
    const u = usersById.get(userId);
    return u?.displayName || u?.name || 'Unknown';
  }, [usersById]);

  composerDraftRef.current = {
    body: newPostBody,
    photos: newPostPhotoUrls,
    files: newPostFileAttachments,
    groupId: selectedGroupForPost,
  };

  const applyNewPostDraft = useCallback(
    (np: { markdown: string; photos: string[]; files: Array<{ name: string; url: string }> } | null) => {
      setNewPostBody(np?.markdown ?? '');
      setNewPostPhotoUrls(Array.isArray(np?.photos) ? [...np.photos] : []);
      setNewPostFileAttachments(Array.isArray(np?.files) ? np.files.map((f) => ({ name: f.name, url: f.url })) : []);
    },
    []
  );

  useEffect(() => {
    if (!currentUserId) {
      setPostsTabDraftsReady(false);
      return;
    }
    let cancelled = false;
    setPostsTabDraftsReady(false);
    (async () => {
      const tab = await loadPostsTabDraft(currentUserId);
      if (cancelled) return;
      const groupId = tab?.groupId ?? null;
      let nextPost = tab?.newPost ?? null;
      if (groupId) {
        const groupDraft = await loadForumGroupDraft(currentUserId, groupId);
        if (cancelled) return;
        if (groupDraft?.newPost) nextPost = groupDraft.newPost;
      }
      setSelectedGroupForPost(groupId);
      applyNewPostDraft(nextPost);
      setPostsTabDraftsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [applyNewPostDraft, currentUserId]);

  useEffect(() => {
    if (!postsTabDraftsReady || !currentUserId) return;
    const epoch = draftPersistEpochRef.current;
    const t = setTimeout(() => {
      if (skipDraftSaveRef.current) return;
      if (epoch !== draftPersistEpochRef.current) return;
      void (async () => {
        const newPost = forumNewPostFromComposer(newPostBody, newPostPhotoUrls, newPostFileAttachments);
        if (epoch !== draftPersistEpochRef.current) return;
        await savePostsTabDraft(currentUserId, { v: 1, groupId: selectedGroupForPost, newPost });
        if (selectedGroupForPost) {
          await patchForumGroupNewPost(currentUserId, selectedGroupForPost, newPost);
        }
      })();
    }, 450);
    return () => clearTimeout(t);
  }, [
    postsTabDraftsReady,
    currentUserId,
    selectedGroupForPost,
    newPostBody,
    newPostPhotoUrls,
    newPostFileAttachments,
  ]);

  const newPostDraftDirty = useMemo(
    () =>
      newPostBody.trim().length > 0 ||
      newPostPhotoUrls.length > 0 ||
      newPostFileAttachments.length > 0,
    [newPostBody, newPostPhotoUrls, newPostFileAttachments]
  );

  const discardNewPostDraft = useCallback(() => {
    discardTrackedUploads(currentUserId, newPostTrackedUploadsRef.current);
    draftPersistEpochRef.current += 1;
    setNewPostBody('');
    setNewPostPhotoUrls([]);
    setNewPostFileAttachments([]);
    setNewPostInputKey((k) => k + 1);
    void (async () => {
      if (!currentUserId || !postsTabDraftsReady) return;
      await savePostsTabDraft(currentUserId, { v: 1, groupId: selectedGroupForPost, newPost: null });
      if (selectedGroupForPost) {
        await patchForumGroupNewPost(currentUserId, selectedGroupForPost, null);
      }
    })();
  }, [currentUserId, postsTabDraftsReady, selectedGroupForPost]);

  const selectGroupForPost = useCallback(
    (nextGroupId: string) => {
      setShowGroupSelectModal(false);
      const prev = composerDraftRef.current.groupId;
      if (prev === nextGroupId) return;
      const gen = ++groupSwitchGenRef.current;
      void (async () => {
        if (!currentUserId || !postsTabDraftsReady) {
          setSelectedGroupForPost(nextGroupId);
          return;
        }
        const snap = composerDraftRef.current;
        const hasLocal =
          snap.body.trim().length > 0 || snap.photos.length > 0 || snap.files.length > 0;
        skipDraftSaveRef.current = true;
        try {
          if (prev) {
            await patchForumGroupNewPost(
              currentUserId,
              prev,
              forumNewPostFromComposer(snap.body, snap.photos, snap.files)
            );
          }
          if (gen !== groupSwitchGenRef.current) return;
          setSelectedGroupForPost(nextGroupId);
          if (!prev && hasLocal) return;
          const loaded = await loadForumGroupDraft(currentUserId, nextGroupId);
          if (gen !== groupSwitchGenRef.current) return;
          applyNewPostDraft(loaded?.newPost ?? null);
          setNewPostInputKey((k) => k + 1);
        } finally {
          if (gen === groupSwitchGenRef.current) skipDraftSaveRef.current = false;
        }
      })();
    },
    [applyNewPostDraft, currentUserId, postsTabDraftsReady]
  );

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

  const hasFilters = !!(selectedGroupIds.length);
  const postsLoading = groupPostsQueries.some(q => q.isLoading);
  
  const selectedGroup = groups.find(g => g.id === selectedGroupForPost);
  const selectedGroupTheme = selectedGroup
    ? getGroupColor(
        groupColors[selectedGroup.id] || getDefaultGroupThemeFromName(selectedGroup.name)
      )
    : null;

  const trackedUploadsForComposer = useCallback((target: 'new' | 'edit') => {
    return target === 'edit' ? editPostTrackedUploadsRef.current : newPostTrackedUploadsRef.current;
  }, []);

  const commentTrackedUploads = useCallback((postId: string) => {
    let set = commentTrackedUploadsRef.current[postId];
    if (!set) {
      set = new Set();
      commentTrackedUploadsRef.current[postId] = set;
    }
    return set;
  }, []);

  const addComposerPhoto = useCallback((url: string, target: 'new' | 'edit') => {
    if (target === 'edit') setEditPostPhotoUrls((prev) => [...prev, url]);
    else setNewPostPhotoUrls((prev) => [...prev, url]);
  }, []);

  const removeLightboxUrl = useCallback((url: string) => {
    setImageLightbox((prev) => (prev ? dropLightboxItem(prev, url) : prev));
  }, []);

  const removeNewDraftMedia = useCallback(
    (url: string) => {
      deleteTrackedUploadIfNeeded(currentUserId, newPostTrackedUploadsRef.current, url);
      setNewPostPhotoUrls((prev) => prev.filter((u) => u !== url));
      setNewPostFileAttachments((prev) => prev.filter((f) => f.url !== url));
      removeLightboxUrl(url);
    },
    [currentUserId, removeLightboxUrl]
  );

  const removeEditDraftMedia = useCallback(
    (url: string) => {
      deleteTrackedUploadIfNeeded(currentUserId, editPostTrackedUploadsRef.current, url);
      setEditPostPhotoUrls((prev) => prev.filter((u) => u !== url));
      setEditPostFileAttachments((prev) => prev.filter((f) => f.url !== url));
      removeLightboxUrl(url);
    },
    [currentUserId, removeLightboxUrl]
  );

  const confirmDeleteOwnPostFile = useCallback(
    (post: GroupPost & { groupId: string }, url: string) => {
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
          await GroupsService.updateGroupPost(post.id, {
            userId: currentUserId,
            title,
            body: nextBody,
          });
          deleteManagedUploadFireAndForget(currentUserId, url);
          removeLightboxUrl(url);
          queryClient.invalidateQueries({ queryKey: queryKeys.groups.posts(post.groupId, currentUserId) });
        } catch {
          Alert.alert('Error', 'Could not delete file');
        }
      };
      void run();
    },
    [currentUserId, queryClient, removeLightboxUrl]
  );

  const confirmDeleteCommentFile = useCallback(
    (post: GroupPost & { groupId: string }, comment: GroupPostComment, url: string) => {
      if (!currentUserId) return;
      const run = async () => {
        const nextBody = stripAttachmentUrlFromBody(comment.body || '', url);
        if (!nextBody.trim()) {
          Alert.alert('Delete file', 'A comment needs some content. Delete the comment instead.');
          return;
        }
        try {
          await GroupsService.updateGroupPostComment(comment.id, {
            userId: currentUserId,
            body: nextBody,
            parentCommentId: comment.parentCommentId ?? null,
          });
          deleteManagedUploadFireAndForget(currentUserId, url);
          removeLightboxUrl(url);
          queryClient.invalidateQueries({ queryKey: queryKeys.groups.posts(post.groupId, currentUserId) });
        } catch {
          Alert.alert('Error', 'Could not delete file');
        }
      };
      void run();
    },
    [currentUserId, queryClient, removeLightboxUrl]
  );

  const promptSelectGroupForAttachments = useCallback(() => {
    const title = 'Select a group';
    const msg = 'Choose a group before adding photos or files.';
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${msg}`);
      setShowGroupSelectModal(true);
      return;
    }
    Alert.alert(title, msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Select group', onPress: () => setShowGroupSelectModal(true) },
    ]);
  }, []);

  const requireNewPostGroup = useCallback((): boolean => {
    if (selectedGroupForPost) return true;
    promptSelectGroupForAttachments();
    return false;
  }, [promptSelectGroupForAttachments, selectedGroupForPost]);

  const composerUploadGroupId = useCallback(
    (target: 'new' | 'edit', editGroupId?: string) => {
      if (target === 'edit') return editGroupId?.trim() || null;
      return selectedGroupForPost;
    },
    [selectedGroupForPost]
  );

  const uploadComposerPhoto = useCallback(async (target: 'new' | 'edit' = 'new', editGroupId?: string) => {
    if (!currentUserId || isUploadingAttachment) return;
    const groupId = composerUploadGroupId(target, editGroupId);
    if (!groupId) {
      if (target === 'new') promptSelectGroupForAttachments();
      return;
    }
    try {
      setIsUploadingAttachment(true);
      const publicUrls = await pickAndUploadCoverPhoto(currentUserId, { groupId });
      if (!publicUrls?.length) return;
      trackManagedUploadUrls(trackedUploadsForComposer(target), publicUrls);
      for (const publicUrl of publicUrls) addComposerPhoto(publicUrl, target);
    } finally {
      setIsUploadingAttachment(false);
    }
  }, [
    addComposerPhoto,
    composerUploadGroupId,
    currentUserId,
    isUploadingAttachment,
    promptSelectGroupForAttachments,
  ]);

  const takePhotoAndAddComposerPhoto = useCallback(async (target: 'new' | 'edit' = 'new', editGroupId?: string) => {
    if (!currentUserId || isUploadingAttachment) return;
    const groupId = composerUploadGroupId(target, editGroupId);
    if (!groupId) {
      if (target === 'new') promptSelectGroupForAttachments();
      return;
    }
    try {
      setIsUploadingAttachment(true);
      const publicUrl = await takeAndUploadCoverPhoto(currentUserId, { groupId });
      if (!publicUrl) return;
      trackManagedUploadUrl(trackedUploadsForComposer(target), publicUrl);
      addComposerPhoto(publicUrl, target);
    } catch (e) {
      Alert.alert('Upload', e instanceof Error ? e.message : 'Could not upload photo');
    } finally {
      setIsUploadingAttachment(false);
    }
  }, [
    addComposerPhoto,
    composerUploadGroupId,
    currentUserId,
    isUploadingAttachment,
    promptSelectGroupForAttachments,
  ]);

  const attachFileToComposer = useCallback(async (target: 'new' | 'edit' = 'new', editGroupId?: string) => {
    if (!currentUserId || isUploadingAttachment) return;
    const groupId = composerUploadGroupId(target, editGroupId);
    if (!groupId) {
      if (target === 'new') promptSelectGroupForAttachments();
      return;
    }
    try {
      setIsUploadingAttachment(true);
      const uploaded = await pickAndUploadFileFromDevice(currentUserId, { groupId });
      if (!uploaded?.length) return;
      const fileEntries = uploaded.map((file) => ({
        name: file.fileName || 'Attachment',
        url: uploadUrlToDownloadUrl(file.publicUrl),
      }));
      trackManagedUploadUrls(
        trackedUploadsForComposer(target),
        fileEntries.map((f) => f.url)
      );
      if (target === 'edit') setEditPostFileAttachments((prev) => [...prev, ...fileEntries]);
      else setNewPostFileAttachments((prev) => [...prev, ...fileEntries]);
    } catch (e) {
      if (e instanceof Error && e.message === 'cancelled') return;
      Alert.alert('Upload', e instanceof Error ? e.message : 'Could not attach file');
    } finally {
      setIsUploadingAttachment(false);
    }
  }, [
    composerUploadGroupId,
    currentUserId,
    isUploadingAttachment,
    promptSelectGroupForAttachments,
  ]);

  const canPost = (newPostBody.trim() || newPostPhotoUrls.length > 0 || newPostFileAttachments.length > 0) && selectedGroupForPost;

  // Create post mutation - dynamically created for selected group
  const createPostMutation = useCreateGroupPost(
    selectedGroupForPost || '',
    currentUserId || ''
  );

  // Helper function to generate IDs
  const generatePostId = () => {
    return `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  };

  // Handler to create post
  const handleCreatePost = useCallback(async () => {
    if (!canPost || !selectedGroupForPost || !currentUserId) return;
    
    const body = mergeComposerBodyForApi(newPostBody, newPostPhotoUrls, newPostFileAttachments).trim();
    const title = newPostBody
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 80) || 'Post';

    try {
      await createPostMutation.mutateAsync({
        id: generatePostId(),
        userId: currentUserId,
        title,
        body,
      });
      
      // Reset state after successful creation
      draftPersistEpochRef.current += 1;
      const postedGroupId = selectedGroupForPost;
      clearTrackedUploads(newPostTrackedUploadsRef.current);
      setNewPostBody('');
      setNewPostPhotoUrls([]);
      setNewPostFileAttachments([]);
      setNewPostInputKey((k) => k + 1);
      setSelectedGroupForPost(null);
      void (async () => {
        await savePostsTabDraft(currentUserId, { v: 1, groupId: null, newPost: null });
        await patchForumGroupNewPost(currentUserId, postedGroupId, null);
      })();
    } catch (error) {
      console.error('Failed to create post:', error);
    }
  }, [canPost, selectedGroupForPost, currentUserId, newPostBody, newPostPhotoUrls, newPostFileAttachments, createPostMutation]);

  const invalidatePostsForGroup = useCallback((groupId: string) => {
    if (!currentUserId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.groups.posts(groupId, currentUserId) });
  }, [currentUserId, queryClient]);

  const mentionMembersForGroup = useCallback(
    (groupId: string) => {
      const group = groups.find((g) => g.id === groupId);
      const ids = group?.memberIds ?? [];
      return ids.map((uid) => {
        const u = usersById.get(uid);
        return {
          id: uid,
          displayName: u?.displayName || u?.name || 'Member',
          name: u?.name || '',
        };
      });
    },
    [groups, usersById],
  );

  const mentionRowsForGroup = useCallback(
    (groupId: string): MentionMemberRow[] =>
      mentionMembersForGroup(groupId).map((m) => ({
        userId: m.id,
        displayName: m.displayName,
        name: m.name,
      })),
    [mentionMembersForGroup],
  );

  const applyReaction = useCallback(
    async (target: { kind: 'post' | 'comment'; id: string; groupId: string }, emoji: string) => {
      if (!currentUserId || reactionBusy) return;
      try {
        setReactionBusy(true);
        if (target.kind === 'post') {
          await GroupsService.toggleGroupPostReaction(target.id, { userId: currentUserId, emoji });
        } else {
          await GroupsService.toggleGroupPostCommentReaction(target.id, { userId: currentUserId, emoji });
        }
        invalidatePostsForGroup(target.groupId);
      } catch (e) {
        Alert.alert('Reaction', e instanceof Error ? e.message : 'Could not update reaction');
      } finally {
        setReactionBusy(false);
      }
    },
    [currentUserId, invalidatePostsForGroup, reactionBusy],
  );

  const applyReactionAndDismiss = useCallback(
    (emoji: string) => {
      const target = reactionPickerTarget;
      if (!target) return;
      void applyReaction(target, emoji);
      setReactionPickerTarget(null);
    },
    [applyReaction, reactionPickerTarget],
  );

  const addComment = useCallback(
    async (postId: string, groupId: string) => {
      if (!currentUserId || uploadingCommentPhotoPostId === postId) return;
      const raw = draftComments[postId] ?? '';
      const photoUrls = draftCommentPhotoUrlsByPost[postId] ?? [];
      const pendingFiles = draftCommentFilesByPost[postId] ?? [];
      const hasContent = raw.trim().length > 0 || photoUrls.length > 0 || pendingFiles.length > 0;
      if (!hasContent) return;
      try {
        setUploadingCommentPhotoPostId(postId);
        let merged = mergeCommentBodyForApi(raw, photoUrls);
        for (const f of pendingFiles) {
          merged = appendMarkdownLink(merged, f.name, f.url);
        }
        const body = merged.trim();
        if (!body) return;
        const mids = computeMentionUserIdsForPost(raw, mentionRowsForGroup(groupId), currentUserId);
        await GroupsService.createGroupPostComment(postId, {
          id: forumId('comment'),
          userId: currentUserId,
          body,
          parentCommentId: replyTargetByPost[postId] ?? undefined,
          ...(mids.length > 0 ? { mentionedUserIds: mids } : {}),
        });
        setDraftComments((prev) => ({ ...prev, [postId]: '' }));
        setDraftCommentPhotoUrlsByPost((prev) => ({ ...prev, [postId]: [] }));
        setDraftCommentFilesByPost((prev) => ({ ...prev, [postId]: [] }));
        setReplyTargetByPost((prev) => ({ ...prev, [postId]: null }));
        clearTrackedUploads(commentTrackedUploads(postId));
        invalidatePostsForGroup(groupId);
      } catch (e) {
        Alert.alert('Comment', e instanceof Error ? e.message : 'Failed to post comment');
      } finally {
        setUploadingCommentPhotoPostId((cur) => (cur === postId ? null : cur));
      }
    },
    [
      currentUserId,
      draftCommentFilesByPost,
      draftCommentPhotoUrlsByPost,
      draftComments,
      invalidatePostsForGroup,
      mentionRowsForGroup,
      replyTargetByPost,
      uploadingCommentPhotoPostId,
    ],
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

  const saveEditedComment = useCallback(
    async (groupId: string) => {
      if (!currentUserId || !commentEdit) return;
      const body = commentEditText.trim();
      if (!body) {
        Alert.alert('Error', 'Comment cannot be empty');
        return;
      }
      try {
        setCommentSaving(true);
        const mids = computeMentionUserIdsForPost(commentEditText, mentionRowsForGroup(groupId), currentUserId);
        await GroupsService.updateGroupPostComment(commentEdit.commentId, {
          userId: currentUserId,
          body,
          parentCommentId: commentEditParentId,
          ...(mids.length > 0 ? { mentionedUserIds: mids } : {}),
        });
        cancelEditComment();
        invalidatePostsForGroup(groupId);
      } catch {
        Alert.alert('Error', 'Failed to update comment');
      } finally {
        setCommentSaving(false);
      }
    },
    [
      cancelEditComment,
      commentEdit,
      commentEditParentId,
      commentEditText,
      currentUserId,
      invalidatePostsForGroup,
      mentionRowsForGroup,
    ],
  );

  const confirmDeleteComment = useCallback(
    (postId: string, commentId: string, groupId: string) => {
      const run = () => {
        if (!currentUserId) return;
        if (replyTargetByPost[postId] === commentId) {
          setReplyTargetByPost((prev) => ({ ...prev, [postId]: null }));
        }
        if (commentEdit?.commentId === commentId) cancelEditComment();
        void GroupsService.deleteGroupPostComment(commentId, currentUserId)
          .then(() => invalidatePostsForGroup(groupId))
          .catch(() => Alert.alert('Error', 'Failed to delete comment'));
      };
      Alert.alert('Delete comment?', 'Delete this comment?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: run },
      ]);
    },
    [cancelEditComment, commentEdit, currentUserId, invalidatePostsForGroup, replyTargetByPost],
  );

  const canManagePost = useCallback((post: { userId: string; groupId: string }) => {
    if (!currentUserId) return false;
    if (post.userId === currentUserId) return true;
    const g = allGroups.find((x) => x.id === post.groupId);
    return isGroupAdminOrOwner(g, currentUserId);
  }, [allGroups, currentUserId]);

  const beginEditPost = useCallback((post: GroupPost) => {
    clearTrackedUploads(editPostTrackedUploadsRef.current);
    const split = splitStoredPostBody(post.body || '');
    setEditingPostId(post.id);
    setEditPostBody(split.markdownSource);
    setEditPostPhotoUrls(split.attachmentImages.map((img) => img.url));
    setEditPostFileAttachments(split.attachmentFiles.map((f) => ({ name: f.name, url: f.url })));
  }, []);

  const cancelEditPost = useCallback(() => {
    discardTrackedUploads(currentUserId, editPostTrackedUploadsRef.current);
    setEditingPostId(null);
    setEditPostBody('');
    setEditPostPhotoUrls([]);
    setEditPostFileAttachments([]);
  }, [currentUserId]);

  const submitEditPost = useCallback(async (groupId: string) => {
    if (!editingPostId || !currentUserId) return;
    const body = mergeComposerBodyForApi(editPostBody, editPostPhotoUrls, editPostFileAttachments).trim();
    if (!body) return;
    const title =
      editPostBody
        .trim()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean)
        ?.slice(0, 80) || 'Post';
    try {
      setEditSaving(true);
      await GroupsService.updateGroupPost(editingPostId, {
        userId: currentUserId,
        title,
        body,
      });
      invalidatePostsForGroup(groupId);
      clearTrackedUploads(editPostTrackedUploadsRef.current);
      setEditingPostId(null);
      setEditPostBody('');
      setEditPostPhotoUrls([]);
      setEditPostFileAttachments([]);
    } catch {
      if (Platform.OS === 'web') window.alert('Failed to update post');
      else Alert.alert('Error', 'Failed to update post');
    } finally {
      setEditSaving(false);
    }
  }, [cancelEditPost, currentUserId, editPostBody, editPostFileAttachments, editPostPhotoUrls, editingPostId, invalidatePostsForGroup]);

  const confirmDeletePost = useCallback((postId: string, groupId: string) => {
    const run = () => {
      if (!currentUserId) return;
      if (editingPostId === postId) cancelEditPost();
      void GroupsService.deleteGroupPost(postId, currentUserId)
        .then(() => invalidatePostsForGroup(groupId))
        .catch(() => {
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
  }, [cancelEditPost, currentUserId, editingPostId, invalidatePostsForGroup]);

  return (
    <View style={styles.safe}>
      {/* Filters container */}
      <View style={styles.filtersContainer}>
        <View style={styles.filterToggleRow}>
          <CollapsibleFiltersButton
            expanded={showAdvancedFilters}
            onToggle={() => setShowAdvancedFilters((p) => !p)}
            filtersActive={hasFilters}
            onReset={() => setSelectedGroupIds([])}
          />
        </View>

        {showAdvancedFilters ? (
          <>
            <View style={styles.filterExpandedRow}>
              <Text style={styles.filterExpandedHeader}>Groups</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.pillsRow}
                contentContainerStyle={{ gap: 6, paddingRight: 20 }}
              >
                <Pill
                  label="All"
                  selected={selectedGroupIds.length === 0}
                  onPress={() => setSelectedGroupIds([])}
                />
                {groups.map((g) => {
                  const userColorHex = groupColors[g.id] || getDefaultGroupThemeFromName(g.name);
                  const p = getGroupColor(userColorHex);
                  const isSelected = selectedGroupIds.includes(g.id);
                  return (
                    <Pill
                      key={g.id}
                      label={g.name}
                      selected={isSelected}
                      activeColor={p.dot}
                      activeBg={p.label}
                      activeText={p.text}
                      inactiveBorderColor={p.dot}
                      onPress={() => {
                        const next = isSelected
                          ? selectedGroupIds.filter((id) => id !== g.id)
                          : [...selectedGroupIds, g.id];
                        setSelectedGroupIds(next);
                      }}
                      onLongPress={() => setSelectedGroupIds([g.id])}
                    />
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.filterExpandedRow}>
              <Text style={styles.filterExpandedHeader}>SORT BY</Text>
              <Pill label="Newest" selected onPress={() => {}} />
              <Pill label="Most Reactions" selected={false} onPress={() => {}} />
              <Pill label="Most Comments" selected={false} onPress={() => {}} />
            </View>
          </>
        ) : null}
      </View>

      {/* Posts content */}
      <View style={styles.postsContent}>
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
          contentContainerStyle={styles.scrollContent}
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => {
            scrollOffsetYRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
        >
          {/* New post composer */}
          <View style={styles.card}>
            <View style={styles.cardPad}>
              {newPostDraftDirty ? (
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
              <Text style={[formSectionTitleStyle, { marginBottom: 8 }]}>
                GROUP <Text style={{ color: Colors.notGoing }}>*</Text>
              </Text>
              {selectedGroup && selectedGroupTheme ? (
                <View
                  style={[
                    styles.selectedGroupRow,
                    {
                      backgroundColor: selectedGroupTheme.row,
                      borderColor: selectedGroupTheme.dot,
                      borderWidth: StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.groupAvatarWrap,
                      {
                        backgroundColor: selectedGroupTheme.cal,
                      },
                    ]}
                  >
                    <GroupAvatar
                      seed={selectedGroup.avatarSeed}
                      thumbnail={selectedGroup.thumbnail}
                      name={selectedGroup.name}
                      size={36}
                    />
                  </View>
                  <Text
                    style={[styles.selectedGroupName, { color: selectedGroupTheme.text }]}
                    numberOfLines={1}
                  >
                    {selectedGroup.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowGroupSelectModal(true)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Change group"
                  >
                    <Text style={[styles.changeGroupLink, { color: selectedGroupTheme.text }]}>
                      Change
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.selectGroupButton}
                  onPress={() => setShowGroupSelectModal(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="people-outline" size={20} color={Colors.textSub} />
                  <Text style={styles.selectGroupButtonText}>Select a group</Text>
                  <Ionicons name="chevron-down" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
              <TextInput
                key={`new-post-${newPostInputKey}`}
                value={newPostBody}
                onChangeText={setNewPostBody}
                placeholder="Write your post - use markdown for advanced formatting"
                placeholderTextColor={Colors.textMuted}
                style={styles.bodyInput}
                multiline
                textAlignVertical="top"
              />
              {newPostPhotoUrls.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.composerPhotosScroll}
                  contentContainerStyle={styles.composerPhotosScrollContent}
                >
                  {newPostPhotoUrls.map((uri, i) => (
                    <View key={`${uri}-${i}`} style={styles.composerPhotoThumbWrap}>
                      <TouchableOpacity
                        onPress={() => setImageLightbox({ urls: newPostPhotoUrls, index: i, onDelete: removeNewDraftMedia })}
                        activeOpacity={0.9}
                      >
                        <ResolvableImage storedUrl={uri} style={styles.composerPhotoThumb} resizeMode="cover" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() =>
                          confirmDestructive('Delete photo?', 'This photo will be permanently deleted.', () =>
                            removeNewDraftMedia(uri)
                          )
                        }
                        style={styles.composerPhotoRemoveBtn}
                        accessibilityLabel="Remove photo"
                      >
                        <Ionicons name="close" size={11} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              ) : null}
              {newPostFileAttachments.length > 0 ? (
                <View style={styles.composerFileChipsList}>
                  {newPostFileAttachments.map((file, i) => (
                    <View key={`${file.url}-${i}`} style={styles.composerFileChip}>
                      <TouchableOpacity
                        style={styles.composerFileChipOpen}
                        onPress={() =>
                          setImageLightbox({
                            urls: newPostFileAttachments.map((f) => f.url),
                            index: i,
                            alts: newPostFileAttachments.map((f) => f.name || ''),
                            onDelete: removeNewDraftMedia,
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
                        onPress={() =>
                          confirmDestructive('Delete file?', 'This file will be permanently deleted.', () =>
                            removeNewDraftMedia(file.url)
                          )
                        }
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
              <View style={styles.composerToolbar}>
                <View style={styles.composerActions}>
                  <AddImageButton
                    iconOnly
                    label="Add photo"
                    triggerIconName="camera-outline"
                    optionsModalTitle="Add photo or video"
                    linkModalTitle="Media URL"
                    disabled={isUploadingAttachment}
                    busy={isUploadingAttachment}
                    onBeforeOpen={requireNewPostGroup}
                    onTakePhoto={() => void takePhotoAndAddComposerPhoto()}
                    onChooseFromLibrary={() => void uploadComposerPhoto()}
                    onInsertLink={async (url) => {
                      if (!requireNewPostGroup()) return;
                      setNewPostPhotoUrls((prev) => [...prev, url.trim()]);
                    }}
                  />
                  <TouchableOpacity
                    style={[styles.composerIconBtn, isUploadingAttachment && styles.postBtnDisabled]}
                    onPress={() => {
                      if (!requireNewPostGroup()) return;
                      void attachFileToComposer();
                    }}
                    disabled={isUploadingAttachment}
                    accessibilityLabel="Attach file"
                  >
                    <Ionicons name="attach-outline" size={16} color={Colors.textSub} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.postBtn, (!canPost || createPostMutation.isPending) && styles.postBtnDisabled]}
                  disabled={!canPost || createPostMutation.isPending}
                  onPress={handleCreatePost}
                >
                  <Text style={styles.postBtnText}>
                    {createPostMutation.isPending ? 'Posting...' : 'Post'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <Text style={[styles.sectionLabel, { marginTop: 18 }]}>POSTS</Text>
          
          {postsLoading ? (
            <View style={styles.card}>
              <View style={styles.cardPad}>
                <ActivityIndicator color={Colors.textSub} />
              </View>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.card}>
              <View style={styles.cardPad}>
                <Text style={styles.emptyText}>
                  {hasFilters ? 'No posts match your filters' : 'No posts yet'}
                </Text>
              </View>
            </View>
          ) : (
            filtered.map((post) => {
              const group = groups.find(g => g.id === post.groupId);
              const userColorHex = groupColors[post.groupId] || getDefaultGroupThemeFromName(group?.name || '');
              const p = getGroupColor(userColorHex);
              const postOwner = usersById.get(post.userId);
              const { markdownSource, attachmentImages, attachmentFiles } =
                splitStoredPostBody(post.body || '');
              const joined = markdownSource.trim();
              const isEditing = editingPostId === post.id;
              const canDeleteThisPostMedia = canDeleteManagedMedia({
                currentUserId,
                group,
                resourceOwnerId: post.userId,
              });
              
              return (
                <View
                  key={post.id}
                  style={[styles.card, { marginBottom: 14 }]}
                  onLayout={(e) => {
                    postTopByIdRef.current[post.id] = e.nativeEvent.layout.y;
                  }}
                >
                  <View style={styles.cardPad}>
                    <View style={styles.postMetaHeaderRow}>
                      <View style={styles.postMetaTitleColumn}>
                        <View style={styles.postMetaAuthorRow}>
                          <UserAvatar
                            seed={getUserDisplayName(post.userId)}
                            backgroundColor={[postOwner?.avatarSeed ?? '']}
                            thumbnail={postOwner?.thumbnail}
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
                        <View style={styles.postGroupBadge}>
                          <Ionicons name="people-outline" size={14} color={Colors.textMuted} />
                          <Text style={styles.postGroupName} numberOfLines={1}>
                            {group?.name || 'Unknown'}
                          </Text>
                          <View style={[styles.postGroupDot, { backgroundColor: p.dot }]} />
                        </View>
                      </View>
                      <AnchoredOverflowMenu
                        width={COMMENT_THREAD_OPTIONS_MENU_WIDTH}
                        menu={(close) => (
                          <>
                            <TouchableOpacity
                              style={styles.postOptionsRow}
                              onPress={() => {
                                const groupName = groups.find((g) => g.id === post.groupId)?.name;
                                shareFromModal(close, () =>
                                  sharePost(post.groupId, post.id, {
                                    title: post.title,
                                    body: post.body,
                                    authorName: getUserDisplayName(post.userId),
                                    groupName,
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
                                  !canManagePost(post) &&
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
                                  !canManagePost(post) && styles.postOptionsRowLast,
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
                            {canManagePost(post) ? (
                              <TouchableOpacity
                                style={[styles.postOptionsRow, styles.postOptionsRowLast]}
                                onPress={() => {
                                  close();
                                  confirmDeletePost(post.id, post.groupId);
                                }}
                              >
                                <Ionicons name="trash-outline" size={20} color={Colors.notGoing} />
                                <Text style={[styles.postOptionsLabel, styles.postOptionsLabelDanger]}>
                                  Delete
                                </Text>
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
                    {isEditing ? (
                      <>
                        <View style={styles.forumDraftBar}>
                          <Text style={styles.forumDraftBarHint}>Editing post</Text>
                          <TouchableOpacity
                            onPress={cancelEditPost}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityLabel="Discard draft"
                          >
                            <Text style={styles.forumDraftBarDiscard}>Discard</Text>
                          </TouchableOpacity>
                        </View>
                        <TextInput
                          value={editPostBody}
                          onChangeText={setEditPostBody}
                          placeholder="Write your post - use markdown for advanced formatting"
                          placeholderTextColor={Colors.textMuted}
                          style={styles.bodyInput}
                          multiline
                          textAlignVertical="top"
                        />
                        {editPostPhotoUrls.length > 0 ? (
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.composerPhotosScroll}
                            contentContainerStyle={styles.composerPhotosScrollContent}
                          >
                            {editPostPhotoUrls.map((uri, i) => (
                              <View key={`${uri}-${i}`} style={styles.composerPhotoThumbWrap}>
                                <TouchableOpacity
                                  onPress={() =>
                                    setImageLightbox({
                                      urls: editPostPhotoUrls,
                                      index: i,
                                      alts: editPostPhotoUrls.map(() => ''),
                                      ownerName: getUserDisplayName(post.userId),
                                      ownerAvatarSeed: postOwner?.avatarSeed ?? null,
                                      ownerThumbnail: postOwner?.thumbnail ?? null,
                                      onDelete: removeEditDraftMedia,
                                    })
                                  }
                                  activeOpacity={0.9}
                                >
                                  <ResolvableImage storedUrl={uri} style={styles.composerPhotoThumb} resizeMode="cover" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() =>
                                    confirmDestructive(
                                      'Delete photo?',
                                      'This photo will be permanently deleted.',
                                      () => removeEditDraftMedia(uri)
                                    )
                                  }
                                  style={styles.composerPhotoRemoveBtn}
                                  accessibilityLabel="Remove photo"
                                >
                                  <Ionicons name="close" size={11} color="#fff" />
                                </TouchableOpacity>
                              </View>
                            ))}
                          </ScrollView>
                        ) : null}
                        {editPostFileAttachments.length > 0 ? (
                          <View style={styles.composerFileChipsList}>
                            {editPostFileAttachments.map((file, i) => (
                              <View key={`${file.url}-${i}`} style={styles.composerFileChip}>
                                <TouchableOpacity
                                  style={styles.composerFileChipOpen}
                                  onPress={() =>
                                    setImageLightbox({
                                      urls: editPostFileAttachments.map((f) => f.url),
                                      index: i,
                                      alts: editPostFileAttachments.map((f) => f.name || ''),
                                      ownerName: getUserDisplayName(post.userId),
                                      ownerAvatarSeed: postOwner?.avatarSeed ?? null,
                                      ownerThumbnail: postOwner?.thumbnail ?? null,
                                      onDelete: removeEditDraftMedia,
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
                                  onPress={() =>
                                    confirmDestructive(
                                      'Delete file?',
                                      'This file will be permanently deleted.',
                                      () => removeEditDraftMedia(file.url)
                                    )
                                  }
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
                        <View style={styles.composerToolbar}>
                          <View style={styles.composerActions}>
                            <AddImageButton
                              iconOnly
                              label="Add photo"
                              triggerIconName="camera-outline"
                              optionsModalTitle="Add photo or video"
                              linkModalTitle="Media URL"
                              disabled={isUploadingAttachment}
                              busy={isUploadingAttachment}
                              onTakePhoto={() => void takePhotoAndAddComposerPhoto('edit', post.groupId)}
                              onChooseFromLibrary={() => void uploadComposerPhoto('edit', post.groupId)}
                              onInsertLink={async (url) => {
                                addComposerPhoto(url.trim(), 'edit');
                              }}
                            />
                            <TouchableOpacity
                              style={[styles.composerIconBtn, isUploadingAttachment && styles.postBtnDisabled]}
                              onPress={() => void attachFileToComposer('edit', post.groupId)}
                              disabled={isUploadingAttachment}
                              accessibilityLabel="Attach file"
                            >
                              <Ionicons name="attach-outline" size={16} color={Colors.textSub} />
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity
                            style={[
                              styles.postBtn,
                              (!(editPostBody.trim() || editPostPhotoUrls.length || editPostFileAttachments.length) || editSaving) &&
                                styles.postBtnDisabled,
                            ]}
                            disabled={
                              !(editPostBody.trim() || editPostPhotoUrls.length || editPostFileAttachments.length) ||
                              editSaving
                            }
                            onPress={() => void submitEditPost(post.groupId)}
                          >
                            {editSaving ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Text style={styles.postBtnText}>Save changes</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </>
                    ) : joined ? (
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
                    ) : null}
                    {!isEditing && attachmentImages.length > 0 ? (
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
                    {!isEditing && attachmentFiles.length > 0 ? (
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
                    {post.reactions?.length > 0 ? (
                      <View style={styles.reactionRow}>
                        {post.reactions.map((entry) => (
                          <TouchableOpacity
                            key={`${post.id}-existing-${entry.emoji}`}
                            style={styles.reactionBtn}
                            onPress={() => void applyReaction({ kind: 'post', id: post.id, groupId: post.groupId }, entry.emoji)}
                            onLongPress={() => setReactionDetailModal({ emoji: entry.emoji, userIds: entry.userIds })}
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
                      }}
                    >
                    <View style={styles.reactionRow}>
                      <ReactionQuickPicker
                        onReact={(emoji) =>
                          void applyReaction({ kind: 'post', id: post.id, groupId: post.groupId }, emoji)
                        }
                        onViewAll={() =>
                          setReactionPickerTarget({ kind: 'post', id: post.id, groupId: post.groupId })
                        }
                        disabled={reactionBusy || !currentUserId}
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
                        onPress={() => {
                          setExpandedCommentsByPost((prev) => {
                            const opening = !prev[post.id];
                            if (opening) pendingScrollToCommentsPostIdRef.current = post.id;
                            return { ...prev, [post.id]: opening };
                          });
                        }}
                        activeOpacity={0.75}
                      >
                        <Ionicons name="chatbubble-outline" size={15} color={Colors.textSub} />
                        <Text style={styles.iconActionText}>
                          Comments ({post.comments?.length || 0})
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {expandedCommentsByPost[post.id] ? (
                      <ThreadedCommentsSection
                        comments={mapGroupCommentsToThread(post.comments ?? [])}
                        mentionMembers={mentionMembersForGroup(post.groupId)}
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
                        draftPhotoUrls={draftCommentPhotoUrlsByPost[post.id] ?? []}
                        onDraftPhotoUrlsChange={(urls) =>
                          setDraftCommentPhotoUrlsByPost((prev) => ({ ...prev, [post.id]: urls }))
                        }
                        onRemoveDraftPhotoAtIndex={(index) => {
                          const url = (draftCommentPhotoUrlsByPost[post.id] ?? [])[index];
                          if (url) {
                            deleteTrackedUploadIfNeeded(
                              currentUserId,
                              commentTrackedUploads(post.id),
                              url
                            );
                          }
                          setDraftCommentPhotoUrlsByPost((prev) => ({
                            ...prev,
                            [post.id]: (prev[post.id] ?? []).filter((_, i) => i !== index),
                          }));
                        }}
                        draftPendingFiles={(draftCommentFilesByPost[post.id] ?? []).map((f) => ({
                          id: f.id,
                          name: f.name,
                        }))}
                        onRemoveDraftPendingFile={(fileId) =>
                          setDraftCommentFilesByPost((prev) => {
                            const list = prev[post.id] ?? [];
                            const removed = list.find((f) => f.id === fileId);
                            if (removed) {
                              deleteTrackedUploadIfNeeded(
                                currentUserId,
                                commentTrackedUploads(post.id),
                                removed.url
                              );
                              removeLightboxUrl(removed.url);
                            }
                            return { ...prev, [post.id]: list.filter((f) => f.id !== fileId) };
                          })
                        }
                        onUploadDraftPhoto={async () => {
                          if (!currentUserId || uploadingCommentPhotoPostId === post.id) return;
                          try {
                            setUploadingCommentPhotoPostId(post.id);
                            const urls = await pickAndUploadCoverPhoto(currentUserId, {
                              groupId: post.groupId,
                            });
                            if (urls?.length) {
                              trackManagedUploadUrls(commentTrackedUploads(post.id), urls);
                              setDraftCommentPhotoUrlsByPost((prev) => ({
                                ...prev,
                                [post.id]: [...(prev[post.id] ?? []), ...urls],
                              }));
                            }
                          } finally {
                            setUploadingCommentPhotoPostId((cur) => (cur === post.id ? null : cur));
                          }
                        }}
                        onTakeDraftPhoto={async () => {
                          if (!currentUserId || uploadingCommentPhotoPostId === post.id) return;
                          try {
                            setUploadingCommentPhotoPostId(post.id);
                            const url = await takeAndUploadCoverPhoto(currentUserId, {
                              groupId: post.groupId,
                            });
                            if (url) {
                              trackManagedUploadUrl(commentTrackedUploads(post.id), url);
                              setDraftCommentPhotoUrlsByPost((prev) => ({
                                ...prev,
                                [post.id]: [...(prev[post.id] ?? []), url],
                              }));
                            }
                          } catch (e) {
                            Alert.alert('Upload', e instanceof Error ? e.message : 'Could not upload photo');
                          } finally {
                            setUploadingCommentPhotoPostId((cur) => (cur === post.id ? null : cur));
                          }
                        }}
                        onAddDraftPhotoByUrl={(url) => {
                          const clean = url.trim();
                          if (!clean) return;
                          setDraftCommentPhotoUrlsByPost((prev) => ({
                            ...prev,
                            [post.id]: [...(prev[post.id] ?? []), clean],
                          }));
                        }}
                        draftPhotoBusy={uploadingCommentPhotoPostId === post.id}
                        onAttachDraftFile={async () => {
                          if (!currentUserId || uploadingCommentPhotoPostId === post.id) return;
                          try {
                            setUploadingCommentPhotoPostId(post.id);
                            const uploaded = await pickAndUploadFileFromDevice(currentUserId, {
                              groupId: post.groupId,
                            });
                            if (!uploaded?.length) return;
                            const files = uploaded.map((file) => ({
                              id: forumId('comment-file'),
                              name: file.fileName || 'Attachment',
                              url: uploadUrlToDownloadUrl(file.publicUrl),
                            }));
                            trackManagedUploadUrls(
                              commentTrackedUploads(post.id),
                              files.map((f) => f.url)
                            );
                            setDraftCommentFilesByPost((prev) => ({
                              ...prev,
                              [post.id]: [...(prev[post.id] ?? []), ...files],
                            }));
                          } catch (e) {
                            if (e instanceof Error && e.message === 'cancelled') return;
                            Alert.alert('Upload', e instanceof Error ? e.message : 'Could not attach file');
                          } finally {
                            setUploadingCommentPhotoPostId((cur) => (cur === post.id ? null : cur));
                          }
                        }}
                        onOpenDraftPhoto={({ urls, index }) =>
                          setImageLightbox({
                            urls,
                            index,
                            alts: urls.map(() => ''),
                            ownerName: currentUserId ? getUserDisplayName(currentUserId) : group?.name,
                            onDelete: (url) => {
                              deleteTrackedUploadIfNeeded(
                                currentUserId,
                                commentTrackedUploads(post.id),
                                url
                              );
                              setDraftCommentPhotoUrlsByPost((prev) => ({
                                ...prev,
                                [post.id]: (prev[post.id] ?? []).filter((u) => u !== url),
                              }));
                              setDraftCommentFilesByPost((prev) => ({
                                ...prev,
                                [post.id]: (prev[post.id] ?? []).filter((f) => f.url !== url),
                              }));
                              removeLightboxUrl(url);
                            },
                          })
                        }
                        replyTargetId={replyTargetByPost[post.id] ?? null}
                        onReplyTargetChange={(id) =>
                          setReplyTargetByPost((prev) => ({ ...prev, [post.id]: id }))
                        }
                        onSubmitDraft={() => void addComment(post.id, post.groupId)}
                        commentEdit={
                          commentEdit?.postId === post.id ? { commentId: commentEdit.commentId } : null
                        }
                        commentEditText={commentEditText}
                        onCommentEditTextChange={setCommentEditText}
                        commentEditParentId={commentEditParentId}
                        onCommentEditParentIdChange={setCommentEditParentId}
                        onCancelEdit={cancelEditComment}
                        onSaveEdit={() => void saveEditedComment(post.groupId)}
                        saveEditBusy={commentSaving}
                        onToggleReaction={(commentId, emoji) =>
                          void applyReaction({ kind: 'comment', id: commentId, groupId: post.groupId }, emoji)
                        }
                        onReactionChipLongPress={(payload) => setReactionDetailModal(payload)}
                        onOpenFullReactionPicker={(commentId) =>
                          setReactionPickerTarget({ kind: 'comment', id: commentId, groupId: post.groupId })
                        }
                        onBeginEdit={(commentId) => {
                          const c = (post.comments ?? []).find((x) => x.id === commentId);
                          if (c) beginEditComment(post.id, c);
                        }}
                        confirmDeleteComment={(commentId) =>
                          confirmDeleteComment(post.id, commentId, post.groupId)
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
                          const full = (post.comments ?? []).find((x) => x.id === comment.id);
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
                                  ? (url) => confirmDeleteCommentFile(post, full, url)
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
              );
            })
          )}
        </KeyboardSafeScrollView>
      </View>

      {/* Group selection modal */}
      <Modal {...edgeToEdgeModalProps}
        visible={showGroupSelectModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGroupSelectModal(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowGroupSelectModal(false)}
          />
          <View style={styles.modalCardOuter}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Choose group</Text>
                <TouchableOpacity
                  onPress={() => setShowGroupSelectModal(false)}
                  style={styles.modalClose}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={styles.modalSubtitle}>Which group is this post for?</Text>
                <ScrollView
                  style={styles.modalScroll}
                  contentContainerStyle={styles.modalScrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  {groups.map((group) => {
                    const userColorHex = groupColors[group.id] || getDefaultGroupThemeFromName(group.name);
                    const p = getGroupColor(userColorHex);
                    
                    return (
                      <TouchableOpacity
                        key={group.id}
                        style={styles.modalGroupRow}
                        onPress={() => selectGroupForPost(group.id)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.modalGroupAvatarWrap, { backgroundColor: p.cal }]}>
                          <GroupAvatar
                            seed={group.avatarSeed}
                            thumbnail={group.thumbnail}
                            name={group.name}
                            size={44}
                          />
                        </View>
                        <View style={styles.modalGroupTextCol}>
                          <Text style={styles.modalGroupName}>{group.name}</Text>
                          {group.memberCount != null ? (
                            <Text style={styles.modalGroupMeta}>
                              {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
                            </Text>
                          ) : null}
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {reactionPickerTarget && currentUserId ? (
        <Modal
          {...edgeToEdgeModalProps}
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
                      disabled={reactionBusy}
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
        <Modal
          {...edgeToEdgeModalProps}
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
        onChangeIndex={(nextIndex) =>
          setImageLightbox((prev) => (prev ? { ...prev, index: nextIndex } : prev))
        }
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
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  filtersContainer: {
    backgroundColor: Colors.bg,
  },
  filterToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  pillsRow: { 
    flexGrow: 0,
    width: '100%',
  },
  filterExpandedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.bg,
  },
  filterExpandedHeader: {
    width: '100%',
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  postsContent: { 
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 110,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderStrong,
    overflow: 'hidden',
  },
  cardPad: {
    padding: 14,
  },
  selectGroupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    marginBottom: 12,
  },
  selectGroupButtonText: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Colors.textMuted,
  },
  selectedGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: Radius.md,
    marginBottom: 12,
  },
  groupAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  selectedGroupName: {
    flex: 1,
    fontSize: 15,
    fontFamily: Fonts.semiBold,
  },
  changeGroupLink: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
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
  },
  composerToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    marginBottom: 6,
  },
  composerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  composerIconBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    borderRadius: 9,
  },
  composerPhotosScroll: {
    marginTop: 12,
    marginBottom: 8,
  },
  composerPhotosScrollContent: {
    gap: 4,
    paddingVertical: 4,
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
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerFileChipsList: {
    marginTop: 12,
    marginBottom: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  composerFileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: Colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  composerFileChipIcon: {
    flexShrink: 0,
  },
  composerFileChipText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Colors.text,
    flexShrink: 1,
  },
  composerFileChipOpen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  composerFileChipRemove: {
    marginLeft: 4,
    flexShrink: 0,
  },
  postBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
  },
  postBtnDisabled: {
    opacity: 0.45,
  },
  postBtnText: {
    color: '#fff',
    fontFamily: Fonts.semiBold,
    fontSize: 13,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  emptyText: {
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    fontSize: 14,
    lineHeight: 21,
  },
  postMetaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  postMetaTitleColumn: {
    flex: 1,
    minWidth: 0,
  },
  postMetaAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  metaText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
    marginBottom: 12,
  },
  metaPostMe: {
    color: Colors.going,
    fontFamily: Fonts.semiBold,
  },
  postMetaTextGrow: {
    flex: 1,
    marginBottom: 0,
  },
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
  postGroupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  postGroupDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  postGroupName: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
    flexShrink: 1,
  },
  postAttachmentPhotosScroll: {
    marginTop: 8,
    marginBottom: 8,
  },
  postAttachmentFilesList: {
    marginTop: 6,
    marginBottom: 8,
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
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  reactionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  reactionLabel: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Colors.textSub,
  },
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
  iconActionText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.textSub,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalCardOuter: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '85%',
    flexGrow: 0,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
  },
  modalClose: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
    paddingTop: 16,
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    marginBottom: 16,
  },
  modalScroll: {
    maxHeight: 500,
  },
  modalScrollContent: {
    gap: 8,
  },
  modalGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bg,
  },
  modalGroupAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  modalGroupTextCol: {
    flex: 1,
    minWidth: 0,
  },
  modalGroupName: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
    marginBottom: 2,
  },
  modalGroupMeta: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  postCommentsSection: {
    marginTop: 8,
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderStrong,
    overflow: 'hidden',
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
});
