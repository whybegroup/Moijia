import { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import type { GroupScoped } from '@moijia/client';
import { Colors, Fonts, Radius } from '../constants/theme';
import { WEB_APP_MAX_WIDTH } from '../constants/webAppMaxWidth';
import {
  listStoragePlanOptions,
  monthlyRateLabel,
  priceStringForTier,
  type StoragePlanOption,
} from '../services/revenueCat';
import { formatPlanDate, parseMaybeDate } from '../utils/groupPlanPeriod';
import { GROUP_TIERS, parseSizeTier, type GroupSizeTier } from '../utils/groupTiers';
import { GroupAvatar } from './GroupAvatar';
import { edgeToEdgeModalProps } from './edgeToEdgeModalProps';
import { NavBar } from './ui';

function planLine(tier: GroupSizeTier, options: StoragePlanOption[]): string {
  if (tier === 'small') return 'Free';
  const rate = monthlyRateLabel(priceStringForTier(tier, options));
  const name = GROUP_TIERS[tier].label;
  return rate ? `${name} · ${rate}` : name;
}

function GroupPlanRow({
  group,
  options,
  onPress,
}: {
  group: GroupScoped;
  options: StoragePlanOption[];
  onPress: () => void;
}) {
  const tier = parseSizeTier(group.sizeTier);
  const pending = group.pendingSizeTier ? parseSizeTier(group.pendingSizeTier) : null;
  const pendingChange = pending != null && pending !== tier;
  const graceEnds = parseMaybeDate(group.graceEndsAt);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${group.name}, ${planLine(tier, options)}. Open group`}
    >
      <GroupAvatar seed={group.avatarSeed ?? group.name} thumbnail={group.thumbnail} size={40} />
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={1}>
          {group.name}
        </Text>
        <Text style={styles.detail}>{planLine(tier, options)}</Text>
        {pendingChange ? (
          <Text style={styles.pending}>
            {planLine(pending, options)}
            {graceEnds ? ` from ${formatPlanDate(graceEnds)}` : ''}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

export function OwnedGroupsModal({
  visible,
  onClose,
  groups,
}: {
  visible: boolean;
  onClose: () => void;
  groups: GroupScoped[];
}) {
  const router = useRouter();
  const [options, setOptions] = useState<StoragePlanOption[]>([]);
  const sorted = useMemo(
    () => [...groups].sort((a, b) => a.name.localeCompare(b.name)),
    [groups]
  );

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void listStoragePlanOptions()
      .then((next) => {
        if (!cancelled) setOptions(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const openGroup = (groupId: string) => {
    onClose();
    router.push(`/(tabs)/groups/${groupId}` as Href);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
      {...edgeToEdgeModalProps}
    >
      <View style={styles.frame}>
        <SafeAreaView style={styles.page} edges={['top', 'left', 'right']}>
          <NavBar title="Groups you own" onClose={onClose} centerTitle />
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {sorted.length === 0 ? (
              <Text style={styles.empty}>You do not own any groups yet.</Text>
            ) : (
              sorted.map((group) => (
                <GroupPlanRow
                  key={group.id}
                  group={group}
                  options={options}
                  onPress={() => openGroup(group.id)}
                />
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    backgroundColor: Platform.OS === 'web' ? '#E4E4E7' : Colors.bg,
  },
  page: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Colors.bg,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? WEB_APP_MAX_WIDTH : undefined,
    alignSelf: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32, gap: 10 },
  empty: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    textAlign: 'center',
    marginTop: 32,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  meta: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.text },
  detail: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textSub, marginTop: 2 },
  pending: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.textSub, marginTop: 2 },
});
