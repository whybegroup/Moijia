import { useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Colors, Fonts, Radius } from '../constants/theme';
import {
  memberMatchesMentionFilter,
  primaryMentionSlug,
} from '../utils/mentionUtils';
import type { User } from '@moija/client';

type MentionMember = Pick<User, 'id' | 'displayName' | 'name'>;

export type ActiveMention = { start: number; query: string };

/**
 * Active @mention at end of text (cursor assumed at text.length).
 * Matches how the composer is used on the event screen.
 */
export function getActiveMentionAtEnd(text: string): ActiveMention | null {
  const cursor = text.length;
  if (cursor < 1) return null;
  let i = cursor - 1;
  while (i >= 0 && /[a-zA-Z0-9_]/.test(text[i]!)) i -= 1;
  if (i < 0 || text[i] !== '@') return null;
  const atStart = i === 0 || /\s/.test(text[i - 1]!);
  if (!atStart) return null;
  const query = text.slice(i + 1, cursor).toLowerCase();
  if (/[\s\n]/.test(query)) return null;
  return { start: i, query };
}

type Props = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (t: string) => void;
  members: MentionMember[];
  currentUserId?: string | null;
  /** Merged onto the outer wrapper (composer: flex row; omit when using `stacked`). */
  wrapperStyle?: StyleProp<ViewStyle>;
  /**
   * Intrinsic-height column for inline edit. Never merges `flex:1` (avoids web textarea overlapping siblings).
   */
  stacked?: boolean;
};

type SuggestionRow =
  | { kind: 'all' }
  | { kind: 'user'; user: MentionMember; slug: string };

export function CommentMentionInput({
  value,
  onChangeText,
  members,
  currentUserId,
  style,
  wrapperStyle,
  stacked = false,
  ...rest
}: Props) {
  const ctx = useMemo(() => getActiveMentionAtEnd(value), [value]);

  const suggestions = useMemo(() => {
    if (!ctx) return [];
    const q = ctx.query;
    const rows: SuggestionRow[] = [];
    if (!q || 'all'.startsWith(q)) {
      rows.push({ kind: 'all' });
    }
    const others = members.filter((m) => m.id !== currentUserId);
    for (const user of others) {
      if (!memberMatchesMentionFilter(user, q)) continue;
      rows.push({ kind: 'user', user, slug: primaryMentionSlug(user) });
    }
    return rows.slice(0, 50);
  }, [ctx, members, currentUserId]);

  const showList = ctx && suggestions.length > 0;

  const insertMention = (slug: string) => {
    if (!ctx) return;
    const before = value.slice(0, ctx.start);
    const after = value.slice(value.length);
    const token = slug.toLowerCase();
    onChangeText(`${before}@${token} ${after}`);
  };

  const rootStyle = stacked
    ? [styles.wrapStacked, wrapperStyle]
    : [styles.wrapComposer, wrapperStyle];

  const textField = (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      style={style}
      autoCorrect={false}
      autoCapitalize="sentences"
      underlineColorAndroid="transparent"
      {...rest}
    />
  );

  return (
    <View style={rootStyle}>
      {showList ? (
        <View style={styles.suggestPanel}>
          <Text style={styles.suggestHint}>Mention</Text>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            style={styles.suggestScroll}
          >
            {suggestions.map((row, idx) => {
              if (row.kind === 'all') {
                return (
                  <TouchableOpacity
                    key="all"
                    style={styles.suggestRow}
                    onPress={() => insertMention('all')}
                  >
                    <Text style={styles.suggestPrimary}>Everyone in group</Text>
                    <Text style={styles.suggestSecondary}>@all</Text>
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  key={`${row.user.id}-${idx}`}
                  style={styles.suggestRow}
                  onPress={() => insertMention(row.slug)}
                >
                  <Text style={styles.suggestPrimary} numberOfLines={1}>
                    {row.user.displayName}
                  </Text>
                  <Text style={styles.suggestSecondary} numberOfLines={1}>
                    @{row.slug}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
      {stacked ? <View style={styles.stackedInputMount}>{textField}</View> : textField}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Bottom bar: grow horizontally in the row. */
  wrapComposer: { flex: 1, minWidth: 0, flexDirection: 'column' },
  /** Inline comment edit: strict column flow — do not use flex:1 here (breaks RN Web multiline). */
  wrapStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    width: '100%',
    flexGrow: 0,
    flexShrink: 0,
  },
  /** Binds RN Web textarea layout to this box so the next sibling renders below, not on top. */
  stackedInputMount: {
    alignSelf: 'stretch',
    ...(Platform.OS === 'web'
      ? ({
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 0,
          flexShrink: 0,
          minHeight: 0,
        } as const)
      : {}),
  },
  suggestPanel: {
    marginBottom: 8,
    maxHeight: 320,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...{
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
  },
  suggestHint: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  suggestScroll: { maxHeight: 280 },
  suggestRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  suggestPrimary: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
  },
  suggestSecondary: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    marginTop: 2,
  },
});
