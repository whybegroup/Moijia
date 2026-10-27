import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Fonts } from '../constants/theme';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { usePurchases } from '../contexts/PurchasesContext';
import { useOwnedGroupQuota } from '../hooks/api/useUsers';
import { parseSubscriptionTier, subscriptionPlanLabel } from '../utils/subscriptionTiers';
import { StoragePaywall } from './StoragePaywall';

export function SubscriptionSettingsCard() {
  const { userId } = useCurrentUserContext();
  const { data: quota } = useOwnedGroupQuota(userId ?? '');
  const { presentCustomerCenter } = usePurchases();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const tier = parseSubscriptionTier(quota?.subscriptionTier);

  return (
    <>
      <Text style={styles.sectionLabel}>SUBSCRIPTION</Text>
      <View style={[styles.card, styles.cardGap]}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Current plan</Text>
          <Text style={styles.infoValue}>{subscriptionPlanLabel(tier)}</Text>
        </View>
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
  actionText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accent },
});
