import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Colors, Fonts, Radius } from '../constants/theme';
import {
  formatStorageBytes,
  resolveGroupMaxStorageBytes,
  sizeTierFromGroup,
} from '../utils/groupStorage';
import { GROUP_TIERS, formatMemberLimit, parseSizeTier, type GroupSizeTier } from '../utils/groupTiers';
import { useSetGroupStorageLimit, useCancelGroupStorageSubscription } from '../hooks/api/useGroups';
import { apiErrorMessage } from '../utils/apiErrors';
import { StoragePaywall } from './StoragePaywall';
import { GroupDowngradeBanner } from './GroupDowngradeBanner';
import { usePurchases } from '../contexts/PurchasesContext';
import { sizeAddonByTier } from '../config/revenueCat';
import {
  formatPlanDate,
  nextMonthlyAnniversary,
  parseMaybeDate,
} from '../utils/groupPlanPeriod';

function resolvePeriodEnd(input: {
  sizeStartedAt?: Date | string | null;
  graceEndsAt?: Date | string | null;
  expirationDate?: string | null;
  originalPurchaseDate?: string | null;
}): Date | null {
  const started =
    parseMaybeDate(input.sizeStartedAt) ?? parseMaybeDate(input.originalPurchaseDate);
  if (started) return nextMonthlyAnniversary(started);
  return parseMaybeDate(input.expirationDate) ?? parseMaybeDate(input.graceEndsAt);
}

function planSummary(tier: GroupSizeTier): string {
  return `${formatStorageBytes(GROUP_TIERS[tier].maxStorageBytes)} · ${formatMemberLimit(tier)}`;
}

export function GroupStorageRequestForm({
  groupId,
  userId,
  currentMaxBytes,
  usedBytes,
  sizeTier,
  pendingSizeTier,
  graceEndsAt,
  sizeStartedAt,
}: {
  groupId: string;
  userId: string;
  currentMaxBytes: number;
  usedBytes: number;
  sizeTier?: string | null;
  pendingSizeTier?: string | null;
  graceEndsAt?: Date | string | null;
  sizeStartedAt?: Date | string | null;
}) {
  const setLimit = useSetGroupStorageLimit(groupId, userId);
  const cancelSub = useCancelGroupStorageSubscription(groupId, userId);
  const { customerInfo } = usePurchases();
  const currentTier = sizeTierFromGroup({ sizeTier, maxStorageBytes: currentMaxBytes });
  const scheduledTier = pendingSizeTier ? parseSizeTier(pendingSizeTier) : currentTier;
  const spec = GROUP_TIERS[currentTier];
  const scheduledSpec = GROUP_TIERS[scheduledTier];
  const [paywallOpen, setPaywallOpen] = useState(false);
  const addon = sizeAddonByTier(currentTier);
  const entitlement = addon ? customerInfo?.entitlements.active[addon.entitlementId] : null;
  const goingToSmall = scheduledTier === 'small' && currentTier !== 'small';
  const pendingChange = scheduledTier !== currentTier;
  const periodEnd = useMemo(
    () =>
      resolvePeriodEnd({
        sizeStartedAt,
        graceEndsAt,
        expirationDate: entitlement?.expirationDate,
        originalPurchaseDate: entitlement?.originalPurchaseDate,
      }),
    [sizeStartedAt, graceEndsAt, entitlement?.expirationDate, entitlement?.originalPurchaseDate]
  );
  const startedOn = parseMaybeDate(sizeStartedAt) ?? parseMaybeDate(entitlement?.originalPurchaseDate);
  const periodLabel =
    currentTier === 'small' && scheduledTier === 'small'
      ? null
      : periodEnd
        ? goingToSmall || entitlement?.willRenew === false
          ? `Expires ${formatPlanDate(periodEnd)}`
          : `Renews ${formatPlanDate(periodEnd)}`
        : null;
  const effectiveFrom = pendingChange ? periodEnd : startedOn;
  const effectiveLine = effectiveFrom ? `Effective from ${formatPlanDate(effectiveFrom)}` : null;

  const applyLimit = async (tier: 'medium' | 'large') => {
    try {
      await setLimit.mutateAsync(tier);
    } catch (e) {
      const msg = apiErrorMessage(e, 'Could not update group size');
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    }
  };

  return (
    <View style={styles.requestBlock}>
      <GroupDowngradeBanner
        compact
        pendingSizeTier={pendingSizeTier}
        graceEndsAt={graceEndsAt ?? periodEnd}
      />
      <Text style={styles.kicker}>Active plan</Text>
      <Text style={styles.planName}>{spec.label}</Text>
      <Text style={styles.planMeta}>
        {formatStorageBytes(resolveGroupMaxStorageBytes(currentMaxBytes, currentTier))} ·{' '}
        {formatMemberLimit(currentTier)}
      </Text>
      {usedBytes > 0 ? (
        <Text style={styles.used}>{formatStorageBytes(usedBytes)} used</Text>
      ) : null}
      {periodLabel ? <Text style={styles.period}>{periodLabel}</Text> : null}

      <Text style={[styles.kicker, styles.kickerSpaced]}>Selected plan</Text>
      <Text style={styles.planName}>{scheduledSpec.label}</Text>
      <Text style={styles.planMeta}>{planSummary(scheduledTier)}</Text>
      {effectiveLine ? <Text style={styles.period}>{effectiveLine}</Text> : null}

      <TouchableOpacity
        onPress={() => setPaywallOpen(true)}
        disabled={setLimit.isPending}
        style={styles.submit}
        accessibilityRole="button"
        accessibilityLabel="Modify group storage plan"
      >
        {setLimit.isPending ? (
          <ActivityIndicator color={Colors.accentFg} />
        ) : (
          <Text style={styles.submitText}>Modify storage plan</Text>
        )}
      </TouchableOpacity>
      <StoragePaywall
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        currentTier={currentTier}
        scheduledTier={scheduledTier}
        periodEndsAt={periodEnd}
        goingToSmall={goingToSmall || entitlement?.willRenew === false}
        selectedEffectiveFrom={effectiveFrom}
        onPurchased={(option) => {
          void applyLimit(option.plan.tier);
        }}
        onSwitchToSmall={async () => {
          await cancelSub.mutateAsync();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  requestBlock: { marginTop: 4 },
  kicker: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  kickerSpaced: { marginTop: 16 },
  planName: { fontSize: 18, fontFamily: Fonts.extraBold, color: Colors.text },
  planMeta: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    marginTop: 4,
  },
  used: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  period: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Colors.textSub,
    marginTop: 6,
  },
  submit: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.lg,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 14,
  },
  submitText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentFg },
});
