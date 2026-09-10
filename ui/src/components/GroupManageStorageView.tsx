import { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { usePathname, useLocalSearchParams, type Href } from 'expo-router';
import { useAppRouter as useRouter } from '../hooks/useAppRouter';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Radius } from '../constants/theme';
import { KeyboardSafeScrollView } from './KeyboardSafeScrollView';
import { useGroup, useGroupStorageBreakdown } from '../hooks/api';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useMissingGroupRedirect } from '../hooks/useMissingResourceAlert';
import { GroupStorageUsageBar } from './GroupStorageUsageBar';
import { GroupDowngradeBanner } from './GroupDowngradeBanner';
import { formatStorageBytes, resolveGroupMaxStorageBytes } from '../utils/groupStorage';
import { parseFromEventId, buildGroupStorageCategoryUrl } from '../utils/breadcrumbUrl';
import {
  GROUP_STORAGE_CATEGORY_COLORS,
  GROUP_STORAGE_CATEGORY_LABELS,
  groupStorageCategoryUsages,
} from '../utils/groupStorageCategories';

export function GroupManageStorageView({ groupId }: { groupId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useLocalSearchParams<{ fromEventId?: string | string[] }>();
  const isInEventsTab = pathname.includes('/(tabs)/events/group') || pathname.includes('/events/group');
  const fromEventId = parseFromEventId(searchParams);
  const fallbackHref = (
    isInEventsTab ? `/(tabs)/events/group/${groupId}` : `/(tabs)/groups/${groupId}`
  ) as Href;

  const { userId: currentUserId } = useCurrentUserContext();
  const { data: group, isError, error: groupError, refetch: refetchGroup } = useGroup(
    groupId,
    currentUserId ?? ''
  );
  const isMember =
    group?.membershipStatus === 'member' || group?.membershipStatus === 'admin';
  const canView = !!currentUserId && isMember;

  const { data: breakdown, refetch: refetchBreakdown } = useGroupStorageBreakdown(
    groupId,
    currentUserId ?? '',
    canView
  );
  const { refreshControl } = usePullToRefresh([refetchGroup, refetchBreakdown]);

  useMissingGroupRedirect(isError, groupError, group?.membershipStatus, fallbackHref);

  useEffect(() => {
    if (group && !canView) {
      router.replace(fallbackHref);
    }
  }, [group, canView, router, fallbackHref]);

  if (!group || !canView) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={Colors.textSub} />
      </View>
    );
  }

  const usedBytes = breakdown?.usedBytes ?? group.usedStorageBytes ?? 0;
  const maxBytes = resolveGroupMaxStorageBytes(
    breakdown?.maxBytes ?? group.maxStorageBytes,
    group.sizeTier
  );
  const categories = groupStorageCategoryUsages(breakdown?.categories);

  return (
    <View style={styles.page}>
      <KeyboardSafeScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={refreshControl}
        alwaysBounceVertical
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <GroupDowngradeBanner
            pendingSizeTier={group.pendingSizeTier}
            graceEndsAt={group.graceEndsAt}
          />
          <GroupStorageUsageBar
            usedBytes={usedBytes}
            maxBytes={maxBytes}
            categories={breakdown ? categories : undefined}
            showSectionLabel={false}
          />
          <Text style={styles.sectionLabel}>MEDIA BY TYPE</Text>
          <View style={styles.card}>
            {categories.map((cat, i) => (
              <TouchableOpacity
                key={cat.id}
                onPress={() =>
                  router.push(
                    buildGroupStorageCategoryUrl(groupId, cat.id, { isInEventsTab, fromEventId })
                  )
                }
                style={[styles.row, i < categories.length - 1 && styles.rowBorder]}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${GROUP_STORAGE_CATEGORY_LABELS[cat.id]}, ${formatStorageBytes(cat.usedBytes)}`}
              >
                <View
                  style={[styles.rowDot, { backgroundColor: GROUP_STORAGE_CATEGORY_COLORS[cat.id] }]}
                />
                <Text style={styles.rowLabel}>
                  {GROUP_STORAGE_CATEGORY_LABELS[cat.id]} ({formatStorageBytes(cat.usedBytes)})
                </Text>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </KeyboardSafeScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: { paddingTop: 16, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginHorizontal: 20,
    marginBottom: 10,
    marginTop: 16,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    overflow: 'hidden',
    marginHorizontal: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 10,
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  rowDot: { width: 10, height: 10, borderRadius: 5 },
  rowLabel: { flex: 1, fontSize: 14, fontFamily: Fonts.medium, color: Colors.text },
});
