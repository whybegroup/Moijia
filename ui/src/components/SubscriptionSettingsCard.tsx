import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Fonts } from '../constants/theme';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { usePurchases } from '../contexts/PurchasesContext';
import { useOwnedGroupQuota } from '../hooks/api/useUsers';
import { formatPlanDate } from '../utils/groupPlanPeriod';
import { DowngradeNotice } from './DowngradeNotice';
import { StoragePaywall } from './StoragePaywall';

export function SubscriptionSettingsCard() {
  const { userId } = useCurrentUserContext();
  const { data: quota } = useOwnedGroupQuota(userId ?? '');
  const { presentCustomerCenter } = usePurchases();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const periodDate = quota?.subscriptionExpiresAt ? formatPlanDate(quota.subscriptionExpiresAt) : '';
  const downgradeDate = quota?.plannedDowngradeAt ?? null;
  const subscriptionWarning = quota?.subscriptionWarning?.trim() ?? '';

  return (
    <>
      <Text style={styles.sectionLabel}>SUBSCRIPTION</Text>
      {quota?.downgradePending ? (
        <DowngradeNotice
          choosing={quota.choosingKeepers}
          when={downgradeDate}
          graceStarted={quota.graceStarted}
        />
      ) : null}
      <View style={[styles.card, styles.cardGap]}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Current plan</Text>
          <Text style={styles.infoValue}>{quota?.planLabel ?? ''}</Text>
        </View>
        {quota?.priceLabel ? (
          <View style={[styles.infoRow, styles.actionRow]}>
            <Text style={styles.infoLabel}>Price</Text>
            <Text style={styles.infoValue}>{quota.priceLabel}</Text>
          </View>
        ) : null}
        {quota?.periodLabel && periodDate ? (
          <View style={[styles.infoRow, styles.actionRow]}>
            <Text style={[styles.infoLabel, quota.periodLabel === 'Expires' && styles.expires]}>{quota.periodLabel}</Text>
            <Text style={[styles.infoValue, quota.periodLabel === 'Expires' && styles.expires]}>{periodDate}</Text>
          </View>
        ) : null}
        {subscriptionWarning ? (
          <View style={[styles.infoRow, styles.actionRow]}>
            <Text style={styles.warning}>{subscriptionWarning}</Text>
          </View>
        ) : null}
        {quota?.showUpgrade ? (
          <TouchableOpacity
            style={[styles.infoRow, styles.actionRow]}
            onPress={() => setPaywallOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Upgrade to Pro"
          >
            <Text style={styles.actionText}>Upgrade to Pro</Text>
          </TouchableOpacity>
        ) : null}
        {quota?.showManage ? (
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
  warning: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: Fonts.semiBold, color: Colors.notGoing },
});
