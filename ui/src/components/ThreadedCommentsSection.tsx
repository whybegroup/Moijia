import { useCallback, useMemo, useRef, useState, useEffect, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Platform,
  Animated,
  ActivityIndicator,
  type ScrollView,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Radius } from '../constants/theme';
import { confirmDestructive } from '../utils/confirmDestructive';
import { isContentEdited } from '../utils/helpers';
import { AnchoredOverflowMenu } from './AnchoredOverflowMenu';
import { ReactionQuickPicker } from './ReactionQuickPicker';
import {
  createScrollAboveKeyboardOnFocus,
  scrollNodeToTopOfViewport,
} from '../utils/scrollInputAboveKeyboard';
import { ReactionEmojiGlyph } from './ReactionEmojiGlyph';
import { CommentsSection } from './CommentsSection';
import { CommentReplyQuote } from './CommentReplyQuote';
import { AddImageButton } from './AddImageButton';
import { ResolvableImage } from './ResolvableImage';
import { FileExtensionIcon } from './FileExtensionPreview';
import { CommentMentionInput } from './CommentMentionInput';
import type { User } from '@moijia/client';

export const COMMENT_THREAD_OPTIONS_MENU_WIDTH = 240;

/** Minimal threaded comment shape (group post comments + mapped event comments). */
export type ThreadComment = {
  id: string;
  userId: string;
  body: string;
  parentCommentId: string | null;
  createdAt: string | number | Date;
  updatedAt?: string | number | Date;
  reactions: Array<{ emoji: string; count: number; userIds: string[] }>;
};

function toTimestamp(value: ThreadComment['createdAt']): number {
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function commentTimeLabel(
  comment: ThreadComment,
  formatCommentTime: (createdAt: ThreadComment['createdAt']) => string,
): string {
  const base = formatCommentTime(comment.createdAt);
  return isContentEdited(comment.createdAt, comment.updatedAt) ? `${base} · Edited` : base;
}

export function invalidReplyParentIds(editingId: string, comments: ThreadComment[]): Set<string> {
  const invalid = new Set<string>([editingId]);
  const walk = (cid: string) => {
    for (const ch of comments) {
      if (ch.parentCommentId === cid) {
        invalid.add(ch.id);
        walk(ch.id);
      }
    }
  };
  walk(editingId);
  return invalid;
}

/** Map API event comments (`text` + `replyToCommentId`) into thread rows. */
export function mapApiEventCommentsToThread(
  comments: Array<{
    id: string;
    userId: string;
    text: string;
    replyToCommentId?: string | null;
    createdAt: Date | string | number;
    updatedAt?: Date | string | number;
    reactions: ThreadComment['reactions'];
  }>
): ThreadComment[] {
  return comments.map((c) => ({
    id: c.id,
    userId: c.userId,
    body: c.text ?? '',
    parentCommentId: c.replyToCommentId ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    reactions: c.reactions,
  }));
}

export function buildCommentTree(comments: ThreadComment[]) {
  const sorted = [...comments].sort((a, b) => toTimestamp(a.createdAt) - toTimestamp(b.createdAt));
  // Keep visual ordering strictly chronological; reply parent only affects quote/context.
  const childrenOf = (_id: string) => [] as ThreadComment[];
  return { roots: sorted, childrenOf };
}

export type ThreadedCommentsSectionProps = {
  comments: ThreadComment[];
  /** Vertical offset of this thread’s container (for scroll positioning). */
  ancestorTopPx: number;
  scrollRef: React.RefObject<ScrollView | null>;
  scrollViewportYRef: React.MutableRefObject<number>;
  scrollOffsetYRef: React.MutableRefObject<number>;

  currentUserId: string | null | undefined;
  /** When true, owners/admins may delete comments they did not write. Edit stays author-only. */
  canModerateComments?: boolean;
  getUserDisplayName: (userId: string) => string;
  formatCommentTime: (createdAt: ThreadComment['createdAt']) => string;

  draftText: string;
  onDraftTextChange: (text: string) => void;
  draftPhotoUrls?: string[];
  onDraftPhotoUrlsChange?: (urls: string[]) => void;
  /** Prefer over filtering `draftPhotoUrls` when removing a staged photo (e.g. deferred uploads). */
  onRemoveDraftPhotoAtIndex?: (index: number) => void;
  /** Staged file attachments (uploaded on submit by parent). */
  draftPendingFiles?: Array<{ id: string; name: string }>;
  onRemoveDraftPendingFile?: (id: string) => void;
  onUploadDraftPhoto?: () => Promise<void> | void;
  onTakeDraftPhoto?: () => Promise<void> | void;
  onAddDraftPhotoByUrl?: (url: string) => Promise<void> | void;
  onAttachDraftFile?: () => Promise<void> | void;
  draftPhotoBusy?: boolean;
  onOpenDraftPhoto?: (payload: { urls: string[]; index: number }) => void;
  replyTargetId: string | null;
  onReplyTargetChange: (id: string | null) => void;
  onSubmitDraft: () => void;

  commentEdit: { commentId: string } | null;
  commentEditText: string;
  onCommentEditTextChange: (text: string) => void;
  commentEditParentId: string | null;
  onCommentEditParentIdChange: (id: string | null) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  saveEditBusy: boolean;
  /** Event comments cannot change reply parent while editing (API). Default true. */
  supportsEditReplyParent?: boolean;

  onToggleReaction: (commentId: string, emoji: string) => void;
  onReactionChipLongPress?: (payload: { emoji: string; userIds: string[] }) => void;
  onOpenFullReactionPicker: (commentId: string) => void;

  onBeginEdit: (commentId: string) => void;
  confirmDeleteComment: (commentId: string) => void;

  containerStyle?: StyleProp<ViewStyle>;

  renderAvatar: (userId: string, displayName: string) => ReactNode;
  /** Defaults to plain body text. */
  renderCommentBody?: (comment: ThreadComment) => ReactNode;
  /** Replace only the composer below the list (default: markdown plain TextInput). */
  renderComposer?: () => ReactNode;
  /** When set, draft and edit inputs use @mention autocomplete. */
  mentionMembers?: Array<Pick<User, 'id' | 'displayName' | 'name'>>;
  /** Deep-link: scroll to and briefly highlight this comment. */
  focusCommentId?: string;
  /**
   * Replace default edit UI for a comment. Return null to use built-in group-style editor.
   * Receives child subtree to render under the edited comment.
   */
  renderEditingComment?: (args: {
    comment: ThreadComment;
    childNodes: ReactNode;
  }) => ReactNode | null;
};

export function ThreadedCommentsSection({
  comments,
  ancestorTopPx,
  scrollRef,
  scrollViewportYRef,
  scrollOffsetYRef,
  currentUserId,
  canModerateComments = false,
  getUserDisplayName,
  formatCommentTime,
  draftText,
  onDraftTextChange,
  draftPhotoUrls = [],
  onDraftPhotoUrlsChange,
  onRemoveDraftPhotoAtIndex,
  draftPendingFiles = [],
  onRemoveDraftPendingFile,
  onUploadDraftPhoto,
  onTakeDraftPhoto,
  onAddDraftPhotoByUrl,
  onAttachDraftFile,
  draftPhotoBusy = false,
  onOpenDraftPhoto,
  replyTargetId,
  onReplyTargetChange,
  onSubmitDraft,
  commentEdit,
  commentEditText,
  onCommentEditTextChange,
  commentEditParentId,
  onCommentEditParentIdChange,
  onCancelEdit,
  onSaveEdit,
  saveEditBusy,
  supportsEditReplyParent = true,
  onToggleReaction,
  onReactionChipLongPress,
  onOpenFullReactionPicker,
  onBeginEdit,
  confirmDeleteComment,
  containerStyle,
  renderAvatar,
  renderCommentBody,
  renderComposer,
  mentionMembers,
  focusCommentId,
  renderEditingComment,
}: ThreadedCommentsSectionProps) {
  const consumedFocusCommentRef = useRef<string | null>(null);
  const commentRowRefs = useRef<Record<string, View | null>>({});
  const commentComposerRef = useRef<View | null>(null);
  const composerInputRef = useRef<TextInput | null>(null);
  const commentEditMountRef = useRef<View | null>(null);
  const commentRowTopByIdRef = useRef<Record<string, number>>({});
  const highlightOpacityByIdRef = useRef<Record<string, Animated.Value>>({});
  const [highlightedCommentIds, setHighlightedCommentIds] = useState<Record<string, true>>({});

  const getHighlightOpacity = useCallback((commentId: string) => {
    if (!highlightOpacityByIdRef.current[commentId]) {
      highlightOpacityByIdRef.current[commentId] = new Animated.Value(0);
    }
    return highlightOpacityByIdRef.current[commentId];
  }, []);

  const jumpToComment = useCallback(
    (commentId: string) => {
      const node = commentRowRefs.current[commentId] as
        | (View & {
            measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void;
          })
        | null;
      if (node?.measureInWindow) {
        node.measureInWindow((_x, y) => {
          const viewportY = scrollViewportYRef.current;
          const absoluteTarget = scrollOffsetYRef.current + (y - viewportY);
          scrollRef.current?.scrollTo({ y: Math.max(0, absoluteTarget - 18), animated: true });
        });
      } else {
        const y = commentRowTopByIdRef.current[commentId];
        if (typeof y !== 'number' || !Number.isFinite(y)) return;
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 18), animated: true });
      }
      const opacity = getHighlightOpacity(commentId);
      setHighlightedCommentIds((prev) => ({ ...prev, [commentId]: true }));
      opacity.stopAnimation();
      opacity.setValue(1);
      Animated.timing(opacity, {
        toValue: 0,
        duration: 1500,
        useNativeDriver: true,
      }).start(() => {
        setHighlightedCommentIds((prev) => {
          if (!prev[commentId]) return prev;
          const next = { ...prev };
          delete next[commentId];
          return next;
        });
      });
    },
    [getHighlightOpacity, scrollOffsetYRef, scrollRef, scrollViewportYRef]
  );

  useEffect(() => {
    if (!focusCommentId || consumedFocusCommentRef.current === focusCommentId) return;
    if (!comments.some((c) => c.id === focusCommentId)) return;
    consumedFocusCommentRef.current = focusCommentId;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => jumpToComment(focusCommentId));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [focusCommentId, comments, jumpToComment]);

  const commentsById = useMemo(() => new Map(comments.map((c) => [c.id, c])), [comments]);

  const { roots, childrenOf } = useMemo(() => buildCommentTree(comments), [comments]);
  const editingComment = useMemo(
    () => (commentEdit ? commentsById.get(commentEdit.commentId) ?? null : null),
    [commentEdit, commentsById]
  );

  const renderCommentNode = useCallback(
    (comment: ThreadComment, level: number): ReactNode => {
      const children = childrenOf(comment.id);
      const displayName = getUserDisplayName(comment.userId);
      const repliedTo = comment.parentCommentId
        ? commentsById.get(comment.parentCommentId) ?? null
        : null;
      const isMine = comment.userId === currentUserId;
      const isEditing = !!commentEdit && commentEdit.commentId === comment.id;

      if (isEditing) {
        const customEdit = renderEditingComment?.({
          comment,
          childNodes: <>{children.map((child) => renderCommentNode(child, level + 1))}</>,
        });
        if (customEdit != null) {
          return (
            <View
              key={comment.id}
              ref={(node) => {
                commentRowRefs.current[comment.id] = node;
              }}
              onLayout={(e) => {
                commentRowTopByIdRef.current[comment.id] =
                  ancestorTopPx + e.nativeEvent.layout.y;
              }}
            >
              {customEdit}
            </View>
          );
        }

        return (
          <View
            key={comment.id}
            ref={(node) => {
              commentRowRefs.current[comment.id] = node;
            }}
            onLayout={(e) => {
              commentRowTopByIdRef.current[comment.id] = ancestorTopPx + e.nativeEvent.layout.y;
            }}
          >
            <View style={styles.commentRow}>
              <View style={styles.commentHeaderRow}>
                <View style={styles.commentHeaderTitleCluster}>
                  <View style={styles.commentAuthorRow}>
                    {renderAvatar(comment.userId, displayName)}
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={styles.commentHeaderInlineRoot}
                    >
                      <Text style={[styles.commentName, styles.commentNameMe]}>
                        {`${displayName} (me)`}
                      </Text>
                      <Text style={styles.commentTimeInline}>
                        {' · '}
                        {commentTimeLabel(comment, formatCommentTime)}
                      </Text>
                    </Text>
                  </View>
                </View>
              </View>
              {(() => {
                const editParentRaw =
                  commentEditParentId === null
                    ? null
                    : comments.find((x) => x.id === commentEditParentId) ?? null;
                const editParent =
                  editParentRaw &&
                  editingComment &&
                  toTimestamp(editParentRaw.createdAt) > toTimestamp(editingComment.createdAt)
                    ? null
                    : editParentRaw;
                const hasReplyTarget =
                  supportsEditReplyParent && !!(commentEditParentId && editParent);

                return (
                  <View ref={commentEditMountRef} collapsable={false}>
                    {hasReplyTarget ? (
                      <View style={styles.commentEditReplyComposer}>
                        <View style={styles.composerReplyPreviewRow}>
                          <View style={[styles.replyQuoteStrip, styles.composerReplyQuoteStrip]}>
                            <Ionicons
                              name="return-down-forward"
                              size={14}
                              color={Colors.textMuted}
                              style={{ marginTop: 2 }}
                            />
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={styles.replyQuoteAuthor} numberOfLines={1}>
                                {getUserDisplayName(editParent!.userId)}
                              </Text>
                              <Text style={styles.replyQuotePreview} numberOfLines={2}>
                                {editParent!.body || '(no text)'}
                              </Text>
                            </View>
                          </View>
                          <TouchableOpacity
                            onPress={() => onCommentEditParentIdChange(null)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityLabel="Clear reply target"
                          >
                            <Ionicons name="close" size={20} color={Colors.textMuted} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : null}
                      {supportsEditReplyParent && commentEditParentId && !editParent ? (
                        <Text style={styles.commentEditStaleHint}>
                          Reply target unavailable — tap Reply on an earlier comment to attach this edit
                          to a thread.
                        </Text>
                      ) : null}
                      {mentionMembers ? (
                        <CommentMentionInput
                          stacked
                          value={commentEditText}
                          onChangeText={onCommentEditTextChange}
                          onFocus={scrollEditIntoView}
                          members={mentionMembers}
                          currentUserId={currentUserId}
                          placeholder={
                            supportsEditReplyParent && commentEditParentId
                              ? 'Write a reply'
                              : 'Edit comment'
                          }
                          placeholderTextColor={Colors.textMuted}
                          style={[styles.commentInput, styles.commentEditInput]}
                          multiline
                          textAlignVertical="top"
                        />
                      ) : (
                        <TextInput
                          value={commentEditText}
                          onChangeText={onCommentEditTextChange}
                          onFocus={scrollEditIntoView}
                          placeholder={
                            supportsEditReplyParent && commentEditParentId
                              ? 'Write a reply'
                              : 'Edit comment'
                          }
                          placeholderTextColor={Colors.textMuted}
                          style={[styles.commentInput, styles.commentEditInput]}
                          multiline
                          textAlignVertical="top"
                        />
                      )}
                      <View style={styles.commentEditActions}>
                        <TouchableOpacity onPress={onCancelEdit} style={styles.commentEditSecondaryBtn}>
                          <Text style={styles.commentEditSecondaryBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => void onSaveEdit()}
                          disabled={saveEditBusy || !commentEditText.trim()}
                          style={[
                            styles.commentEditPrimaryBtn,
                            (saveEditBusy || !commentEditText.trim()) &&
                              styles.commentEditPrimaryBtnDisabled,
                          ]}
                        >
                          {saveEditBusy ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.commentEditPrimaryBtnText}>Save</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })()}
            </View>
            {children.map((child) => renderCommentNode(child, level + 1))}
          </View>
        );
      }

      return (
        <View
          key={comment.id}
          ref={(node) => {
            commentRowRefs.current[comment.id] = node;
          }}
          onLayout={(e) => {
            commentRowTopByIdRef.current[comment.id] = ancestorTopPx + e.nativeEvent.layout.y;
          }}
        >
          <View style={styles.commentRow}>
            {highlightedCommentIds[comment.id] ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.commentRowHighlightOverlay,
                  { opacity: getHighlightOpacity(comment.id) },
                ]}
              />
            ) : null}
            <View style={styles.commentHeaderRow}>
              <View style={styles.commentHeaderTitleCluster}>
                <View style={styles.commentAuthorRow}>
                  {renderAvatar(comment.userId, displayName)}
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={styles.commentHeaderInlineRoot}
                  >
                    <Text style={[styles.commentName, isMine && styles.commentNameMe]}>
                      {isMine ? `${displayName} (me)` : displayName}
                    </Text>
                    <Text style={styles.commentTimeInline}>
                      {' · '}
                        {commentTimeLabel(comment, formatCommentTime)}
                    </Text>
                  </Text>
                </View>
              </View>
              {isMine || (comment.body ?? '').trim().length > 0 ? (
                <AnchoredOverflowMenu
                  width={COMMENT_THREAD_OPTIONS_MENU_WIDTH}
                  menu={(close) => (
                    <>
                      {(comment.body ?? '').trim().length > 0 ? (
                        <TouchableOpacity
                          style={[
                            styles.commentOptionsRow,
                            !isMine && !canModerateComments ? styles.commentOptionsRowLast : undefined,
                          ]}
                          onPress={async () => {
                            await Clipboard.setStringAsync((comment.body ?? '').trim());
                            close();
                            Toast.show({ type: 'success', text1: 'Copied' });
                          }}
                        >
                          <Ionicons name="copy-outline" size={20} color={Colors.text} />
                          <Text style={styles.commentOptionsLabel}>Copy</Text>
                        </TouchableOpacity>
                      ) : null}
                      {isMine ? (
                        <TouchableOpacity
                          style={[
                            styles.commentOptionsRow,
                            !(isMine || canModerateComments) ? styles.commentOptionsRowLast : undefined,
                          ]}
                          onPress={() => {
                            close();
                            onBeginEdit(comment.id);
                          }}
                        >
                          <Ionicons name="create-outline" size={20} color={Colors.text} />
                          <Text style={styles.commentOptionsLabel}>Edit</Text>
                        </TouchableOpacity>
                      ) : null}
                      {isMine || canModerateComments ? (
                        <TouchableOpacity
                          style={[styles.commentOptionsRow, styles.commentOptionsRowLast]}
                          onPress={() => {
                            close();
                            confirmDeleteComment(comment.id);
                          }}
                        >
                          <Ionicons name="trash-outline" size={20} color={Colors.notGoing} />
                          <Text style={[styles.commentOptionsLabel, styles.commentOptionsLabelDanger]}>
                            Delete
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </>
                  )}
                >
                  <TouchableOpacity
                    style={styles.commentMenuBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Comment options"
                  >
                    <Ionicons name="ellipsis-vertical" size={18} color={Colors.textSub} />
                  </TouchableOpacity>
                </AnchoredOverflowMenu>
              ) : null}
            </View>
            {repliedTo ? (
              <CommentReplyQuote
                onPress={() => jumpToComment(repliedTo.id)}
                author={getUserDisplayName(repliedTo.userId)}
                preview={repliedTo.body || '(no text)'}
                containerStyle={styles.replyQuoteStrip}
                pressedStyle={styles.replyQuotePressed}
                authorStyle={styles.replyQuoteAuthor}
                previewStyle={styles.replyQuotePreview}
                accessibilityLabel="Jump to replied comment"
              />
            ) : null}
            {renderCommentBody ? (
              renderCommentBody(comment)
            ) : (
              <Text style={styles.commentText}>{comment.body}</Text>
            )}
            {comment.reactions.length > 0 ? (
              <View style={styles.reactionChipsRow}>
                {comment.reactions.map((entry) => (
                  <TouchableOpacity
                    key={`${comment.id}-existing-${entry.emoji}`}
                    style={styles.reactionChip}
                    onPress={() => onToggleReaction(comment.id, entry.emoji)}
                    onLongPress={() =>
                      onReactionChipLongPress?.({
                        emoji: entry.emoji,
                        userIds: entry.userIds,
                      })
                    }
                  >
                    <View style={styles.reactionChipInner}>
                      <ReactionEmojiGlyph emoji={entry.emoji} size={17} />
                      <Text style={styles.reactionChipCount}>{entry.count}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <View style={styles.reactionRow}>
              <ReactionQuickPicker
                onReact={(emoji) => onToggleReaction(comment.id, emoji)}
                onViewAll={() => onOpenFullReactionPicker(comment.id)}
                disabled={!currentUserId}
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
                  if (commentEdit) {
                    if (commentEdit.commentId === comment.id) return;
                    const invalid = invalidReplyParentIds(commentEdit.commentId, comments);
                    const editing =
                      commentsById.get(commentEdit.commentId) ??
                      comments.find((x) => x.id === commentEdit.commentId) ??
                      null;
                    const isFutureParent =
                      !!editing &&
                      toTimestamp(comment.createdAt) > toTimestamp(editing.createdAt);
                    if (!invalid.has(comment.id) && !isFutureParent) {
                      onCommentEditParentIdChange(comment.id);
                    }
                    return;
                  }
                  onReplyTargetChange(comment.id);
                }}
              >
                <Ionicons
                  name="return-up-forward-outline"
                  size={15}
                  color={Colors.textSub}
                />
                <Text style={styles.iconActionText}>Reply</Text>
              </TouchableOpacity>
            </View>
          </View>
          {children.map((child) => renderCommentNode(child, level + 1))}
        </View>
      );
    },
    [
      ancestorTopPx,
      childrenOf,
      commentEdit,
      commentEditParentId,
      commentEditText,
      comments,
      commentsById,
      currentUserId,
      editingComment,
      formatCommentTime,
      getHighlightOpacity,
      getUserDisplayName,
      highlightedCommentIds,
      jumpToComment,
      onCancelEdit,
      onCommentEditParentIdChange,
      onCommentEditTextChange,
      onOpenFullReactionPicker,
      onReactionChipLongPress,
      onReplyTargetChange,
      onSaveEdit,
      onToggleReaction,
      canModerateComments,
      confirmDeleteComment,
      onBeginEdit,
      renderAvatar,
      renderCommentBody,
      renderEditingComment,
      saveEditBusy,
      supportsEditReplyParent,
    ]
  );

  const replyTargetComment = replyTargetId ? commentsById.get(replyTargetId) : undefined;

  const canSubmitDraft =
    draftText.trim().length > 0 || draftPhotoUrls.length > 0 || draftPendingFiles.length > 0;

  const scrollComposerIntoView = useMemo(
    () =>
      createScrollAboveKeyboardOnFocus({
        scrollRef,
        scrollOffsetYRef,
        targetRef: commentComposerRef,
      }),
    [scrollOffsetYRef, scrollRef]
  );

  useEffect(() => {
    if (!replyTargetId) return;
    let cancelled = false;
    const bringComposerToTop = () => {
      if (cancelled) return;
      scrollNodeToTopOfViewport({
        scrollRef,
        scrollViewportYRef,
        scrollOffsetYRef,
        targetRef: commentComposerRef,
      });
    };
    const focusTimer = setTimeout(() => {
      if (!cancelled) composerInputRef.current?.focus();
    }, 30);
    const t1 = setTimeout(bringComposerToTop, 50);
    const t2 = setTimeout(bringComposerToTop, Platform.OS === 'android' ? 360 : 180);
    return () => {
      cancelled = true;
      clearTimeout(focusTimer);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [replyTargetId, scrollOffsetYRef, scrollRef, scrollViewportYRef]);

  const scrollEditIntoView = useMemo(
    () =>
      createScrollAboveKeyboardOnFocus({
        scrollRef,
        scrollOffsetYRef,
        targetRef: commentEditMountRef,
      }),
    [scrollOffsetYRef, scrollRef]
  );

  return (
    <>
      <CommentsSection
        isEmpty={comments.length === 0}
        containerStyle={containerStyle}
      >
        <>
          {roots.map((r) => renderCommentNode(r, 0))}
          {renderComposer ? (
            renderComposer()
          ) : (
            <View ref={commentComposerRef} collapsable={false} style={styles.commentComposer}>
              {replyTargetComment ? (
                <View style={styles.composerReplyPreviewRow}>
                  <View style={[styles.replyQuoteStrip, styles.composerReplyQuoteStrip]}>
                    <Ionicons
                      name="return-down-forward"
                      size={14}
                      color={Colors.textMuted}
                      style={{ marginTop: 2 }}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.replyQuoteAuthor} numberOfLines={1}>
                        {getUserDisplayName(replyTargetComment.userId)}
                      </Text>
                      <Text style={styles.replyQuotePreview} numberOfLines={2}>
                        {replyTargetComment.body || '(no text)'}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => onReplyTargetChange(null)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Cancel reply"
                  >
                    <Ionicons name="close" size={20} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : null}
              {mentionMembers ? (
                <CommentMentionInput
                  stacked
                  inputRef={composerInputRef}
                  value={draftText}
                  onChangeText={onDraftTextChange}
                  onFocus={scrollComposerIntoView}
                  members={mentionMembers}
                  currentUserId={currentUserId}
                  placeholder={replyTargetId ? 'Write a reply' : 'Add a comment'}
                  placeholderTextColor={Colors.textMuted}
                  style={styles.commentInput}
                  multiline
                />
              ) : (
                <TextInput
                  ref={composerInputRef}
                  value={draftText}
                  onChangeText={onDraftTextChange}
                  onFocus={scrollComposerIntoView}
                  placeholder={replyTargetId ? 'Write a reply' : 'Add a comment'}
                  placeholderTextColor={Colors.textMuted}
                  style={styles.commentInput}
                  multiline
                />
              )}
              {onDraftPhotoUrlsChange && (onUploadDraftPhoto || onTakeDraftPhoto || onAddDraftPhotoByUrl) ? (
                <View style={styles.commentComposerAttachRow}>
                  <AddImageButton
                    iconOnly
                    label="Add photo"
                    triggerIconName="camera-outline"
                    optionsModalTitle="Add photo or video"
                    linkModalTitle="Media URL"
                    disabled={draftPhotoBusy}
                    busy={draftPhotoBusy}
                    onTakePhoto={onTakeDraftPhoto ? () => void onTakeDraftPhoto() : undefined}
                    onChooseFromLibrary={
                      onUploadDraftPhoto ? () => void onUploadDraftPhoto() : undefined
                    }
                    onInsertLink={
                      onAddDraftPhotoByUrl
                        ? async (url) => {
                            await onAddDraftPhotoByUrl(url.trim());
                          }
                        : undefined
                    }
                  />
                  {onAttachDraftFile ? (
                    <TouchableOpacity
                      style={[styles.commentAttachFileBtn, draftPhotoBusy && styles.replyBtnDisabled]}
                      onPress={() => void onAttachDraftFile()}
                      disabled={draftPhotoBusy}
                      accessibilityLabel="Attach file"
                    >
                      <Ionicons name="attach-outline" size={16} color={Colors.textSub} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
              {draftPhotoUrls.length > 0 &&
              (onDraftPhotoUrlsChange || onRemoveDraftPhotoAtIndex) ? (
                <View style={styles.commentComposerPhotoRow}>
                  {draftPhotoUrls.map((uri, i) => (
                    <View key={`${uri}-${i}`} style={styles.commentComposerPhotoThumbWrap}>
                      <TouchableOpacity
                        onPress={() => onOpenDraftPhoto?.({ urls: draftPhotoUrls, index: i })}
                        activeOpacity={0.9}
                      >
                        <ResolvableImage
                          storedUrl={uri}
                          style={styles.commentComposerPhotoThumb}
                          resizeMode="cover"
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          confirmDestructive(
                            'Delete photo?',
                            'This photo will be permanently deleted.',
                            () => {
                              if (onRemoveDraftPhotoAtIndex) {
                                onRemoveDraftPhotoAtIndex(i);
                              } else if (onDraftPhotoUrlsChange) {
                                onDraftPhotoUrlsChange(draftPhotoUrls.filter((_, idx) => idx !== i));
                              }
                            }
                          );
                        }}
                        style={styles.commentComposerPhotoRemoveBtn}
                        accessibilityLabel="Remove photo"
                      >
                        <Ionicons name="close" size={11} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : null}
              {draftPendingFiles.length > 0 && onRemoveDraftPendingFile ? (
                <View style={styles.commentComposerPendingFilesRow}>
                  {draftPendingFiles.map((f) => (
                    <View key={f.id} style={styles.commentComposerPendingFileChip}>
                      <FileExtensionIcon url={f.name} fileName={f.name} size={14} />
                      <Text style={styles.commentComposerPendingFileName} numberOfLines={1}>
                        {f.name}
                      </Text>
                      <TouchableOpacity
                        onPress={() =>
                          confirmDestructive(
                            'Delete file?',
                            'This file will be permanently deleted.',
                            () => onRemoveDraftPendingFile(f.id)
                          )
                        }
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        accessibilityLabel="Remove file"
                      >
                        <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : null}
              <TouchableOpacity
                style={[styles.replyBtn, !canSubmitDraft && styles.replyBtnDisabled]}
                onPress={() => void onSubmitDraft()}
                disabled={!canSubmitDraft}
              >
                <Text style={styles.replyBtnText}>{replyTargetId ? 'Reply' : 'Comment'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      </CommentsSection>
    </>
  );
}

const styles = StyleSheet.create({
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
  postCommentsSection: {
    marginTop: 8,
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    overflow: 'hidden',
  },
  commentComposer: {
    marginTop: 8,
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
  },
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
  replyBtnDisabled: { opacity: 0.45 },
  replyBtnText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textSub },
  commentComposerAttachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentAttachFileBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    borderRadius: 9,
  },
  commentComposerPhotoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  commentComposerPhotoThumbWrap: { position: 'relative' },
  commentComposerPhotoThumb: {
    width: 72,
    height: 72,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  commentComposerPhotoRemoveBtn: {
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
  commentComposerPendingFilesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  commentComposerPendingFileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  commentComposerPendingFileName: {
    flexShrink: 1,
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: Colors.textSub,
  },
  commentRow: {
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
  commentAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  commentHeaderInlineRoot: {
    flex: 1,
    minWidth: 0,
  },
  commentName: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.text },
  commentNameMe: { color: Colors.going },
  commentMenuBtn: { padding: 2 },
  commentTimeInline: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    flexShrink: 0,
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
  reactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    flexWrap: 'wrap',
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
  iconActionText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textSub },
});
