import React, { useState, useEffect } from 'react';
import { Image, View, StyleProp, ViewStyle } from 'react-native';
import { IconsAvatar } from './Avatar';
import { groupAvatarBorderRadius } from '../utils/helpers';
import { ResolvableImage } from './ResolvableImage';
import { isDirectRenderableImageUrl } from '../services/resolveImageViewUrls';

const DEFAULT_AVATAR_SEED = 'auto';

interface GroupAvatarProps {
  /** Seed for generated avatar (DiceBear icons). Fallback: group.avatarSeed ?? group.name ?? DEFAULT_AVATAR_SEED */
  seed?: string;
  thumbnail?: string | null;
  /** When provided, uses group.avatarSeed/name for seed and group.thumbnail - overrides seed/thumbnail */
  name?: string;
  size?: number;
  /** Override border radius (default: size / 3). Use to match container for no gap. */
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

function isUrl(s: string): boolean {
  return s.startsWith('data:') || s.includes('://');
}

/** Renders group avatar: Image if thumbnail is valid URL and loads, IconsAvatar (seed) otherwise. */
export function GroupAvatar({ seed, thumbnail, size = 36, borderRadius, style }: GroupAvatarProps) {
  const [thumbnailError, setThumbnailError] = useState(false);
  const radius = borderRadius ?? groupAvatarBorderRadius(size);
  const containerStyle: StyleProp<ViewStyle> = [
    { width: size, height: size, borderRadius: radius, overflow: 'hidden' },
    style,
  ];

  const thumbTrim = thumbnail?.trim() ?? '';
  useEffect(() => {
    setThumbnailError(false);
  }, [thumbTrim]);

  const useImage = thumbTrim && isUrl(thumbTrim);
  const imgStyle = { width: size, height: size, borderRadius: radius };
  if (useImage && !thumbnailError) {
    return (
      <View style={containerStyle}>
        {isDirectRenderableImageUrl(thumbTrim) ? (
          <Image
            source={{ uri: thumbTrim }}
            style={imgStyle}
            onError={() => setThumbnailError(true)}
          />
        ) : (
          <ResolvableImage
            storedUrl={thumbTrim}
            style={imgStyle}
            resizeMode="cover"
            onError={() => setThumbnailError(true)}
          />
        )}
      </View>
    );
  }

  const resolvedSeed = (seed ?? DEFAULT_AVATAR_SEED).trim();
  return <IconsAvatar seed={resolvedSeed} size={size} style={containerStyle} />;
}
