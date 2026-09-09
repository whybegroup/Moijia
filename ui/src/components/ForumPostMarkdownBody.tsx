import { memo, useCallback, useMemo, type ComponentProps, type Dispatch, type SetStateAction } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Markdown, { MarkdownIt } from 'react-native-markdown-display';
import { Colors, Fonts, Radius } from '../constants/theme';
import { useAppRouter } from '../hooks/useAppRouter';
import { openContentLink } from '../utils/inAppLinks';
import { MentionText } from './MentionText';
import { FileExtensionPreview } from './FileExtensionPreview';
import { DeletedImagePlaceholder, PostMediaImage } from './DeletedPostMedia';
import { isImageFileUrl, isVideoFileUrl } from '../utils/fileKind';
import { isDeletedFileHref, isDeletedImageSrc, isDeletedMediaUrl } from '../utils/deletedMedia';

/**
 * The library's default parser leaves markdown-it's `linkify` off, so bare URLs stay inert
 * text. Fuzzy matching stays off so only explicit http(s) URLs autolink, matching the
 * behaviour of event comments.
 */
const markdownParser = MarkdownIt({ typographer: true, linkify: true });
markdownParser.linkify.set({ fuzzyLink: false, fuzzyEmail: false });

export type ForumPostImageLightboxState = {
  urls: string[];
  index: number;
  alts?: string[];
  ownerName?: string;
  ownerAvatarSeed?: string | null;
  ownerThumbnail?: string | null;
  onDelete?: (url: string) => void;
} | null;

export function dropLightboxItem<T extends { urls: string[]; index: number; alts?: string[] }>(
  prev: T,
  url: string
): T | null {
  const idx = prev.urls.indexOf(url);
  if (idx < 0) return prev;
  const urls = prev.urls.filter((_, i) => i !== idx);
  if (urls.length === 0) return null;
  const alts = prev.alts ? prev.alts.filter((_, i) => i !== idx) : prev.alts;
  const index = Math.min(idx < prev.index ? prev.index - 1 : prev.index, urls.length - 1);
  return { ...prev, urls, alts, index };
}

type ForumPostMarkdownBodyProps = {
  markdownBody: string;
  markdownStyles: NonNullable<ComponentProps<typeof Markdown>['style']>;
  posterDisplayName: string;
  ownerAvatarSeed: string | null;
  ownerThumbnail: string | null;
  setImageLightbox: Dispatch<SetStateAction<ForumPostImageLightboxState>>;
  onDeleteUrl?: (url: string) => void;
};

export const ForumPostMarkdownBody = memo(function ForumPostMarkdownBody({
  markdownBody,
  markdownStyles,
  posterDisplayName,
  ownerAvatarSeed,
  ownerThumbnail,
  setImageLightbox,
  onDeleteUrl,
}: ForumPostMarkdownBodyProps) {
  const router = useAppRouter();

  const rules = useMemo(
    () => ({
      paragraph: (node: any, children: any, _parent: any, mdStyles: any) => (
        <View key={node.key} style={[mdStyles._VIEW_SAFE_paragraph, styles.markdownParagraphColumn]}>
          {children}
        </View>
      ),
      text: (node: any, _children: any, _parent: any, mdStyles: any, inheritedStyles: Record<string, unknown> = {}) => {
        const content = typeof node.content === 'string' ? node.content : '';
        return (
          <MentionText
            key={node.key}
            text={content}
            style={[inheritedStyles, mdStyles.text]}
            mentionStyle={styles.mentionInBody}
          />
        );
      },
      image: (node: any, _children: any, _parent: any, _mdStyles: any) => {
        const rawSrc = node.attributes?.src;
        const src = typeof rawSrc === 'string' ? rawSrc.trim() : '';
        if (!src) return null;
        const alt = typeof node.attributes?.alt === 'string' ? node.attributes.alt : '';
        const deletedImage = isDeletedImageSrc(src);
        const deletedFile = isDeletedFileHref(src);
        const isImage = deletedImage || isImageFileUrl(src, alt);
        const isVideo = isVideoFileUrl(src, alt);
        const isMedia = isImage || isVideo;
        const wrapStyle = isMedia ? styles.markdownImageWrap : styles.markdownFileWrap;
        if (deletedImage || deletedFile) {
          return (
            <View key={node.key} style={wrapStyle}>
              {isImage ? (
                <DeletedImagePlaceholder style={styles.inlineImage} />
              ) : (
                <FileExtensionPreview url={src} fileName={alt || 'File'} variant="inline" />
              )}
            </View>
          );
        }
        return (
          <View key={node.key} style={wrapStyle}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() =>
                setImageLightbox({
                  urls: [src],
                  index: 0,
                  alts: [alt],
                  ownerName: posterDisplayName,
                  ownerAvatarSeed,
                  ownerThumbnail,
                  onDelete: onDeleteUrl,
                })
              }
            >
              {isMedia ? (
                <PostMediaImage storedUrl={src} style={styles.inlineImage} resizeMode="cover" />
              ) : (
                <FileExtensionPreview url={src} fileName={alt} variant="inline" />
              )}
            </TouchableOpacity>
          </View>
        );
      },
      link: (node: any, children: any, _parent: any, mdStyles: any) => {
        const href = typeof node.attributes?.href === 'string' ? node.attributes.href.trim() : '';
        if (isDeletedFileHref(href) || isDeletedMediaUrl(href)) {
          return (
            <Text key={node.key} style={styles.deletedFileName}>
              {children} (deleted)
            </Text>
          );
        }
        return (
          <Text
            key={node.key}
            style={mdStyles.link}
            onPress={() => {
              if (href) openContentLink(router, href);
            }}
          >
            {children}
          </Text>
        );
      },
    }),
    [posterDisplayName, ownerAvatarSeed, ownerThumbnail, setImageLightbox, onDeleteUrl, router]
  );

  const onLinkPress = useCallback(
    (url: string) => {
      if (isDeletedMediaUrl(url)) return false;
      openContentLink(router, url);
      return false;
    },
    [router]
  );

  return (
    <Markdown
      style={markdownStyles}
      mergeStyle
      rules={rules}
      markdownit={markdownParser}
      onLinkPress={onLinkPress}
    >
      {markdownBody}
    </Markdown>
  );
});

const styles = StyleSheet.create({
  mentionInBody: { color: Colors.accent, fontFamily: Fonts.semiBold },
  inlineImage: {
    width: '100%',
    height: 180,
    borderRadius: Radius.lg,
    backgroundColor: Colors.border,
  },
  /**
   * Paragraph inherits `flexWrap: 'wrap'` from the library's row-based default. In a
   * wrapping column, a flex line is sized from its content, so `stretch` would size text
   * to its intrinsic width and long lines would never break. `nowrap` keeps one line whose
   * cross size is the paragraph width.
   */
  markdownParagraphColumn: {
    flexDirection: 'column',
    alignItems: 'stretch',
    flexWrap: 'nowrap',
    width: '100%',
  },
  markdownImageWrap: { width: '100%', alignSelf: 'stretch', marginVertical: 6 },
  markdownFileWrap: { width: '100%', alignSelf: 'stretch', marginVertical: 6 },
  deletedFileName: {
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
    textDecorationColor: Colors.textMuted,
    fontFamily: Fonts.regular,
  },
});
