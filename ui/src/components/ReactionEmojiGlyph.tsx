import { useEffect, useMemo, useState } from 'react';
import { Image, Platform, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { twemojiUrlCandidates } from '../utils/twemojiUrl';

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

/**
 * Renders a single emoji for reactions. On iOS uses Twemoji raster images so glyphs show even when
 * React Native <Text> emoji fails (e.g. iOS 26.3 simulator CoreText path — see facebook/react-native#56183).
 */
export function ReactionEmojiGlyph({ emoji, size, containerStyle, textStyle }: Props) {
  const candidates = useMemo(() => twemojiUrlCandidates(emoji), [emoji]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  useEffect(() => {
    setCandidateIndex(0);
  }, [emoji]);
  const uri = candidates[Math.min(candidateIndex, candidates.length - 1)];

  if (Platform.OS === 'ios') {
    const side = Math.round(size * 0.92);
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
        <Image
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          source={{ uri }}
          style={{ width: side, height: side }}
          resizeMode="contain"
          onError={() => {
            setCandidateIndex((i) => (i + 1 < candidates.length ? i + 1 : i));
          }}
        />
      </View>
    );
  }

  return (
    <Text
      style={[nonIosEmojiTextStyle(size), textStyle]}
      accessibilityLabel={emoji}
    >
      {emoji}
    </Text>
  );
}
