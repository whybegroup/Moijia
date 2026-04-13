import { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Colors, Fonts, Radius } from '../../constants/theme';
import { NavBar } from '../../components/ui';
import { EventFormPopoverChrome } from '../../components/EventFormPopoverChrome';
import { usePoll } from '../../hooks/api';
import { useCurrentUserContext } from '../../contexts/CurrentUserContext';
import { firstSearchParam, parseReturnToParam } from '../../utils/navigationReturn';
import { PollOptionInputKind } from '@moija/client';

function stripHtmlPreview(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function PollDetailScreen() {
  const router = useRouter();
  const { id: rawId, returnTo } = useLocalSearchParams<{ id?: string | string[]; returnTo?: string | string[] }>();
  const id = useMemo(() => firstSearchParam(rawId), [rawId]);
  const returnToParsed = useMemo(() => parseReturnToParam(firstSearchParam(returnTo)), [returnTo]);
  const { userId } = useCurrentUserContext();
  const { data: poll, isLoading, isError } = usePoll(id ?? '', userId ?? '');

  const dismiss = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (returnToParsed) {
      router.replace(returnToParsed as Href);
      return;
    }
    router.replace('/(tabs)/events');
  };

  return (
    <EventFormPopoverChrome onClose={dismiss}>
      <View style={styles.inner}>
        <NavBar title="Poll" onClose={dismiss} />
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 48, width: '100%', alignSelf: 'stretch' }}
          showsVerticalScrollIndicator={false}
        >
          {!id || !userId ? (
            <Text style={styles.muted}>Missing poll or user.</Text>
          ) : isLoading ? (
            <ActivityIndicator color={Colors.accent} style={{ marginTop: 24 }} />
          ) : isError || !poll ? (
            <Text style={styles.muted}>Could not load this poll.</Text>
          ) : (
            <>
              <Text style={styles.title}>{poll.title}</Text>
              {poll.description ? <Text style={styles.desc}>{poll.description}</Text> : null}
              <Text style={styles.sectionLabel}>Options</Text>
              {poll.options
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((o, i) => (
                  <View key={o.id} style={styles.optionRow}>
                    <Text style={styles.optionIndex}>{i + 1}.</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      {o.inputKind === PollOptionInputKind.DATETIME ? (
                        <Text style={styles.optionText}>
                          {o.dateTimeValue ? new Date(o.dateTimeValue).toLocaleString() : '—'}
                        </Text>
                      ) : (
                        <Text style={styles.optionText}>{stripHtmlPreview(o.textHtml ?? '') || '—'}</Text>
                      )}
                    </View>
                  </View>
                ))}
              <Text style={styles.comingSoon}>Voting will be available in a later update.</Text>
            </>
          )}
        </ScrollView>
      </View>
    </EventFormPopoverChrome>
  );
}

const styles = StyleSheet.create({
  inner: { flex: 1, backgroundColor: Colors.bg },
  title: {
    fontSize: 22,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    marginBottom: 12,
  },
  desc: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    lineHeight: 22,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    marginBottom: 8,
  },
  optionIndex: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.textMuted },
  optionText: { fontSize: 15, fontFamily: Fonts.regular, color: Colors.text },
  muted: { fontSize: 15, color: Colors.textMuted, fontFamily: Fonts.regular, marginTop: 8 },
  comingSoon: {
    marginTop: 24,
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
});
