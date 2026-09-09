import { memo, useEffect, useMemo, useState } from 'react';
import { Image, Platform, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { twemojiUrlCandidates } from '../utils/twemojiUrl';
import { ensureTwemojiCached, peekTwemojiDisplayUri } from '../services/twemojiCache';

type Props = {
  emoji: string;
  /** Target visual size (dp / px). */
  size: number;
  /** Wraps the glyph (e.g. hit slop alignment). */
  containerStyle?: StyleProp<ViewStyle>;
  /** Extra text styles for non-iOS. */
  textStyle?: StyleProp<TextStyle>;
};

function nonIosEmojiTextStyle(fontSize: number): TextStyle {
  if (Platform.OS === 'android') {
    return { fontSize: fontSize + 1, lineHeight: fontSize + 8, includeFontPadding: false };
  }
  return { fontSize, lineHeight: fontSize + 4 };
}

const TwemojiImage = memo(function TwemojiImage({
  uri,
  side,
  onError,
}: {
  uri: string;
  side: number;
  onError?: () => void;
}) {
  const source = useMemo(
    () => ({
      uri,
      ...(uri.startsWith('file:') ? null : ({ cache: 'force-cache' as const })),
    }),
    [uri]
  );
  return (
    <Image
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      source={source}
      style={{ width: side, height: side }}
      resizeMode="contain"
      fadeDuration={0}
      onError={onError}
    />
  );
});

/**
 * Renders a single emoji for reactions. On iOS uses Twemoji raster images so glyphs show even when
 * React Native <Text> emoji fails (e.g. iOS 26.3 simulator CoreText path — see facebook/react-native#56183).
 */
export function ReactionEmojiGlyph({ emoji, size, containerStyle, textStyle }: Props) {
  const candidates = useMemo(() => twemojiUrlCandidates(emoji), [emoji]);
  const [uri, setUri] = useState(() => peekTwemojiDisplayUri(emoji) ?? candidates[0]);
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    const next = peekTwemojiDisplayUri(emoji) ?? candidates[0];
    setUri(next);
    setCandidateIndex(0);
    let cancelled = false;
    void ensureTwemojiCached(emoji).then((local) => {
      if (!cancelled && local) setUri(local);
    });
    return () => {
      cancelled = true;
    };
  }, [candidates, emoji]);

  if (Platform.OS === 'ios') {
    const side = Math.round(size * 0.92);
    const displayUri = uri || candidates[Math.min(candidateIndex, candidates.length - 1)];
    return (
      <View
        style={[
          {
            width: size,
            height: size,
            alignItems: 'center',
            justifyContent: 'center',
          },
          containerStyle,
        ]}
        accessibilityLabel={emoji}
        accessibilityRole="image"
      >
        {displayUri ? (
          <TwemojiImage
            uri={displayUri}
            side={side}
            onError={() => {
              setCandidateIndex((i) => {
                const next = i + 1;
                if (next < candidates.length) {
                  setUri(candidates[next]);
                  return next;
                }
                return i;
              });
            }}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View
      style={[
        {
          width: size + 8,
          height: size + 8,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'visible',
        },
        containerStyle,
      ]}
    >
      <Text
        allowFontScaling={false}
        maxFontSizeMultiplier={1}
        style={[nonIosEmojiTextStyle(size), textStyle]}
        accessibilityLabel={emoji}
      >
        {emoji}
      </Text>
    </View>
  );
}
