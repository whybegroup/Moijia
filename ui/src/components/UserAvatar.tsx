import { useState, useEffect } from 'react';
import { Image, View, StyleProp, ViewStyle } from 'react-native';
import { avatarColor } from '../utils/helpers';
import { InitialsAvatar } from './Avatar';
import { ResolvableImage } from './ResolvableImage';
import { isDirectRenderableImageUrl } from '../services/resolveImageViewUrls';

interface UserAvatarProps {
  /** Seed for generated avatar (DiceBear bottts). Fallback: user.avatarSeed ?? user.name ?? DEFAULT_AVATAR_SEED */
  seed: string;
  backgroundColor?: string[];
  thumbnail?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

function isUrl(s: string): boolean {
  return s.startsWith('data:') || s.includes('://');
}

/** Renders user avatar: Image if thumbnail/bottts URL loads, letter initial otherwise. */
export function UserAvatar({ seed, backgroundColor, thumbnail, size = 36, style }: UserAvatarProps) {
  const [thumbnailError, setThumbnailError] = useState(false);
  const radius = size / 2;
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
          <Image source={{ uri: thumbTrim }} style={imgStyle} onError={() => setThumbnailError(true)} />
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

  let resolvedBackgroundColor = [];
  for (const color of backgroundColor ?? []) {
    if (color) {
      resolvedBackgroundColor.push(color);
    }
  }
  if (resolvedBackgroundColor.length === 0) {
    resolvedBackgroundColor = [avatarColor(seed)];
  }

  return <InitialsAvatar seed={seed.trim()} backgroundColor={resolvedBackgroundColor} size={size} style={containerStyle} />;
}
