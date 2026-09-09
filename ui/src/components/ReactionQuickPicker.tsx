import { type ReactElement } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { Colors, Radius, Shadows } from '../constants/theme';
import { DEFAULT_COMMENT_QUICK_REACTIONS_LIST } from '../utils/commentQuickReactionsPrefs';
import { useCommentQuickReactions } from '../hooks/useCommentQuickReactions';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { AnchoredOverflowMenu } from './AnchoredOverflowMenu';
import { EmojiBar } from './EmojiBar';

type Props = {
  onReact: (emoji: string) => void;
  onViewAll: () => void;
  disabled?: boolean;
  children: ReactElement<{ onPress?: (e: GestureResponderEvent) => void }>;
};

export function ReactionQuickPicker({ onReact, onViewAll, disabled, children }: Props) {
  const { userId } = useCurrentUserContext();
  const { data: quickReactions = [...DEFAULT_COMMENT_QUICK_REACTIONS_LIST] } =
    useCommentQuickReactions(userId);

  return (
    <AnchoredOverflowMenu
      placement="above"
      align="start"
      wrapInCard={false}
      gap={8}
      menu={(close) => (
        <View style={styles.shadowWrap}>
          <View style={styles.card}>
            <EmojiBar
              compact
              quickReactions={quickReactions}
              onPressReaction={(emoji) => {
                close();
                onReact(emoji);
              }}
              onPressViewAll={() => {
                close();
                onViewAll();
              }}
              disabled={disabled}
              viewAllAccessibilityLabel="View all emojis"
            />
          </View>
        </View>
      )}
    >
      {children}
    </AnchoredOverflowMenu>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    borderRadius: Radius['2xl'],
    ...Shadows.md,
  },
  card: {
    borderRadius: Radius['2xl'],
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 10,
    overflow: 'visible',
  },
});
