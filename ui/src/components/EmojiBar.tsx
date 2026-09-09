import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { Colors } from '../constants/theme';
import { ReactionEmojiGlyph } from './ReactionEmojiGlyph';

type EmojiBarProps = {
  quickReactions: string[];
  activeEmojis?: string[];
  onPressReaction: (emoji: string) => void;
  onPressViewAll: () => void;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  viewAllAccessibilityLabel?: string;
};

export function EmojiBar({
  quickReactions,
  activeEmojis = [],
  onPressReaction,
  onPressViewAll,
  disabled = false,
  compact = false,
  style,
  viewAllAccessibilityLabel = 'More emojis',
}: EmojiBarProps) {
  return (
    <View style={[styles.row, compact && styles.rowCompact, style]}>
      {quickReactions.map((emoji) => {
        const active = activeEmojis.includes(emoji);
        return (
          <TouchableOpacity
            key={emoji}
            onPress={() => onPressReaction(emoji)}
            disabled={disabled}
            style={[styles.quickHit, active && styles.quickHitActive]}
            accessibilityLabel={`React with ${emoji}`}
          >
            <ReactionEmojiGlyph emoji={emoji} size={24} />
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        style={styles.moreBtn}
        onPress={onPressViewAll}
        disabled={disabled}
        accessibilityLabel={viewAllAccessibilityLabel}
        activeOpacity={0.75}
      >
        <View style={styles.moreInner}>
          <Ionicons name="happy-outline" size={22} color={Colors.textSub} allowFontScaling={false} />
          <View style={styles.morePlus} pointerEvents="none">
            <Ionicons name="add" size={11} color={Colors.textSub} allowFontScaling={false} />
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  rowCompact: {
    alignSelf: 'flex-start',
  },
  quickHit: {
    minWidth: 40,
    minHeight: 40,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    overflow: 'visible',
  },
  quickHitActive: {
    opacity: 0.85,
  },
  moreBtn: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  moreInner: {
    position: 'relative',
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  morePlus: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
});
