import { useEffect, useMemo, useState } from 'react';
import { resolveGroupMaxStorageBytes } from '../utils/groupStorage';
import { Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { GroupScoped } from '@moijia/client';
import { Colors, Fonts, Radius } from '../constants/theme';
import { WEB_APP_MAX_WIDTH } from '../constants/webAppMaxWidth';
import { useGroup } from '../hooks/api/useGroups';
import {
  listStoragePlanOptions,
  monthlyRateLabel,
  priceStringForTier,
  type StoragePlanOption,
} from '../services/revenueCat';
import { formatPlanDate, parseMaybeDate } from '../utils/groupPlanPeriod';
import { GROUP_TIERS, parseSizeTier, type GroupSizeTier } from '../utils/groupTiers';
import { GroupAvatar } from './GroupAvatar';
import { GroupStorageRequestForm } from './GroupStorageRequestForm';
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
      accessibilityLabel={`${group.name}, ${planLine(tier, options)}. Show subscription details`}
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

function GroupPlanDetail({
  group,
  userId,
  enabled,
  editingPlan,
  onEditingPlanChange,
}: {
  group: GroupScoped;
  userId: string;
  enabled: boolean;
  editingPlan: boolean;
  onEditingPlanChange: (editing: boolean) => void;
}) {
  const { data: live, refetch } = useGroup(group.id, userId, { enabled });
  const current = live ?? group;
  const tier = parseSizeTier(current.sizeTier);
  const form = (
    <GroupStorageRequestForm
      groupId={current.id}
      userId={userId}
      currentMaxBytes={resolveGroupMaxStorageBytes(current.maxStorageBytes, current.sizeTier)}
      usedBytes={current.usedStorageBytes ?? 0}
      sizeTier={current.sizeTier}
      pendingSizeTier={current.pendingSizeTier}
      graceEndsAt={current.graceEndsAt}
      sizeStartedAt={current.sizeStartedAt}
      embedPaywall
      paywallOpen={editingPlan}
      onPaywallVisibilityChange={onEditingPlanChange}
      onUpdated={async () => {
        await refetch();
      }}
    />
  );

  if (editingPlan) {
    return <View style={styles.detailFill}>{form}</View>;
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.detailCard}>
        <View style={styles.groupRow}>
          <GroupAvatar
            seed={current.avatarSeed ?? current.name}
            thumbnail={current.thumbnail}
            size={40}
          />
          <View style={styles.meta}>
            <Text style={styles.name} numberOfLines={1}>
              {current.name}
            </Text>
            <Text style={styles.detail}>{GROUP_TIERS[tier].label} group</Text>
          </View>
        </View>
        {form}
      </View>
    </ScrollView>
  );
}

export function OwnedGroupsModal({
  visible,
  onClose,
  userId,
  groups,
}: {
  visible: boolean;
  onClose: () => void;
  userId: string;
  groups: GroupScoped[];
}) {
  const [options, setOptions] = useState<StoragePlanOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState(false);
  const sorted = useMemo(
    () => [...groups].sort((a, b) => a.name.localeCompare(b.name)),
    [groups]
  );
  const selected = selectedId ? sorted.find((group) => group.id === selectedId) ?? null : null;

  useEffect(() => {
    if (!visible) {
      setSelectedId(null);
      setEditingPlan(false);
      return;
    }
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

  const handleRequestClose = () => {
    if (editingPlan) {
      setEditingPlan(false);
      return;
    }
    if (selected) {
      setSelectedId(null);
      return;
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={handleRequestClose}
      {...edgeToEdgeModalProps}
    >
      <View style={styles.frame}>
        <SafeAreaView style={styles.page} edges={['top', 'left', 'right']}>
          <NavBar
            title={selected ? selected.name : 'Groups you own'}
            onClose={handleRequestClose}
            centerTitle
          />
          {selected ? (
            <GroupPlanDetail
              group={selected}
              userId={userId}
              enabled={visible}
              editingPlan={editingPlan}
              onEditingPlanChange={setEditingPlan}
            />
          ) : (
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
                    onPress={() => setSelectedId(group.id)}
                  />
                ))
              )}
            </ScrollView>
          )}
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
  detailFill: { flex: 1, minHeight: 0 },
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
  detailCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  meta: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.text },
  detail: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textSub, marginTop: 2 },
  pending: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.textSub, marginTop: 2 },
});
