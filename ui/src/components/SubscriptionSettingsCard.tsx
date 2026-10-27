import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Fonts } from '../constants/theme';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { usePurchases } from '../contexts/PurchasesContext';
import { useOwnedGroupQuota } from '../hooks/api/useUsers';
import { PRO_PRICE_LABEL, parseSubscriptionTier, subscriptionPlanLabel } from '../utils/subscriptionTiers';
import { formatPlanDate } from '../utils/groupPlanPeriod';
import { downgradeIsPending, pendingDowngradeAt } from '../utils/downgradePlan';
import { FREE_OWNED_GROUP_LIMIT } from '../utils/groupTiers';
import { StoragePaywall } from './StoragePaywall';

export function SubscriptionSettingsCard() {
  const { userId } = useCurrentUserContext();
  const { data: quota } = useOwnedGroupQuota(userId ?? '');
  const { presentCustomerCenter } = usePurchases();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const tier = parseSubscriptionTier(quota?.subscriptionTier);
  const periodDate = quota?.subscriptionExpiresAt ? formatPlanDate(quota.subscriptionExpiresAt) : '';
  const periodLabel = quota?.subscriptionWillRenew ? 'Renews' : 'Expires';
  const downgradePending = downgradeIsPending(quota);
  const downgradeDate = pendingDowngradeAt(quota);
  const downgradeWhen = downgradeDate ? formatPlanDate(downgradeDate) : '';
  const choosingKeepers = downgradePending && (quota?.ownedGroupCount ?? 0) > FREE_OWNED_GROUP_LIMIT;
  const subscriptionWarning = quota?.subscriptionWarning?.trim() ?? '';

  return (
    <>
      <Text style={styles.sectionLabel}>SUBSCRIPTION</Text>
      <View style={[styles.card, styles.cardGap]}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Current plan</Text>
          <Text style={styles.infoValue}>{subscriptionPlanLabel(tier)}</Text>
        </View>
        {tier === 'pro' ? (
          <View style={[styles.infoRow, styles.actionRow]}>
            <Text style={styles.infoLabel}>Price</Text>
            <Text style={styles.infoValue}>{PRO_PRICE_LABEL}</Text>
          </View>
        ) : null}
        {tier === 'pro' && periodDate ? (
          <View style={[styles.infoRow, styles.actionRow]}>
            <Text style={[styles.infoLabel, !quota?.subscriptionWillRenew && styles.expires]}>{periodLabel}</Text>
            <Text style={[styles.infoValue, !quota?.subscriptionWillRenew && styles.expires]}>{periodDate}</Text>
          </View>
        ) : null}
        {subscriptionWarning ? (
          <View style={[styles.infoRow, styles.actionRow]}>
            <Text style={styles.warning}>{subscriptionWarning}</Text>
          </View>
        ) : null}
        {downgradePending ? (
          <View style={[styles.infoRow, styles.actionRow]}>
            <Text style={styles.notice}>
              {choosingKeepers
                ? `${downgradeWhen ? `On ${downgradeWhen}, only` : 'Only'} the two groups under Kept will stay. The others will be permanently deleted.`
                : `${downgradeWhen ? `On ${downgradeWhen}, groups` : 'Groups'} you own will become Small (1 GB).`}
            </Text>
          </View>
        ) : null}
        {tier === 'free' ? (
          <TouchableOpacity
            style={[styles.infoRow, styles.actionRow]}
            onPress={() => setPaywallOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Upgrade to Pro"
          >
            <Text style={styles.actionText}>Upgrade to Pro</Text>
          </TouchableOpacity>
        ) : null}
        {tier === 'pro' ? (
          <TouchableOpacity
            style={[styles.infoRow, styles.actionRow]}
            onPress={() => void presentCustomerCenter().catch(() => undefined)}
            accessibilityRole="button"
            accessibilityLabel="Manage subscription"
          >
            <Text style={styles.actionText}>Manage subscription</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <StoragePaywall visible={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  cardGap: { marginBottom: 20 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  actionRow: { borderTopWidth: 1, borderTopColor: Colors.border },
  infoLabel: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.text },
  infoValue: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.text, flexShrink: 1, textAlign: 'right' },
  expires: { color: Colors.notGoing, fontFamily: Fonts.semiBold },
  actionText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accent },
  notice: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: Fonts.semiBold, color: Colors.notGoing },
  warning: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: Fonts.semiBold, color: Colors.notGoing },
});
