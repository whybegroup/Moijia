import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors, Fonts, Radius } from '../constants/theme';
import { usePurchases } from '../contexts/PurchasesContext';
import {
  getActiveSizeAddon,
  isPurchaseCancelled,
  planLabelForStorage,
  purchasesErrorMessage,
} from '../services/revenueCat';
import { StoragePaywall } from './StoragePaywall';

function alertMessage(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(message);
  else Alert.alert(title, message);
}

export function SubscriptionSettingsCard() {
  const {
    ready,
    hasPaidSizeAddon,
    sizeAddon,
    customerInfo,
    presentCustomerCenter,
    restorePurchases,
  } = usePurchases();
  const [busy, setBusy] = useState<'manage' | 'restore' | 'paywall' | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const subscribe = () => {
    if (busy) return;
    setPaywallOpen(true);
  };

  const manage = async () => {
    if (busy) return;
    setBusy('manage');
    try {
      await presentCustomerCenter();
    } catch (error) {
      alertMessage('Manage subscription', purchasesErrorMessage(error, 'Could not open subscription management.'));
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    if (busy) return;
    setBusy('restore');
    try {
      const info = await restorePurchases();
      const restored = getActiveSizeAddon(info);
      alertMessage(
        'Restore purchases',
        restored
          ? `Restored ${planLabelForStorage(restored)}.`
          : 'No Medium or Large group add-on was found for this store account.'
      );
    } catch (error) {
      if (isPurchaseCancelled(error)) {
        Toast.show({ type: 'info', text1: 'Restore cancelled' });
        return;
      }
      alertMessage('Restore purchases', purchasesErrorMessage(error, 'Could not restore purchases.'));
    } finally {
      setBusy(null);
    }
  };

  const entitlement = sizeAddon
    ? customerInfo?.entitlements.active[sizeAddon.entitlementId]
    : null;
  const expires = entitlement?.expirationDate
    ? new Date(entitlement.expirationDate).toLocaleDateString()
    : null;
  const renewing = entitlement?.willRenew !== false;

  return (
    <>
      <Text style={styles.sectionLabel}>SUBSCRIPTION</Text>
      <View style={[styles.card, styles.cardGap]}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabelMuted}>Group size add-ons</Text>
          <View style={[styles.badge, hasPaidSizeAddon ? styles.badgeOn : styles.badgeOff]}>
            <Text style={[styles.badgeText, hasPaidSizeAddon ? styles.badgeOnText : styles.badgeOffText]}>
              {hasPaidSizeAddon ? 'Active' : 'Free'}
            </Text>
          </View>
        </View>
        <View style={[styles.infoRow, styles.rowBorder]}>
          <Text style={styles.infoLabelMuted}>Plan</Text>
          <Text style={styles.infoValue}>
            {planLabelForStorage(sizeAddon)}
            {expires
              ? ` · ${renewing ? 'Renews' : 'Ends'} ${expires}`
              : ''}
          </Text>
        </View>
        {!renewing && hasPaidSizeAddon ? (
          <Text style={styles.deferNote}>
            Cancelled add-ons stay active until the store period ends (Apple, Google, and Stripe
            defer the downgrade). Then the group gets a 15-day grace before files over the Small
            limit are removed, oldest first.
          </Text>
        ) : null}

        {!ready ? (
          <View style={[styles.infoRow, styles.rowBorder, styles.centerRow]}>
            <ActivityIndicator color={Colors.textSub} />
          </View>
        ) : (
          <>
            <TouchableOpacity
              onPress={() => void subscribe()}
              disabled={busy != null}
              style={[styles.actionRow, styles.rowBorder]}
              accessibilityRole="button"
              accessibilityLabel={hasPaidSizeAddon ? 'Change group size plan' : 'Subscribe to a group size add-on'}
            >
              {busy === 'paywall' ? (
                <ActivityIndicator color={Colors.textSub} />
              ) : (
                <Text style={styles.actionText}>{hasPaidSizeAddon ? 'Change plan' : 'Subscribe'}</Text>
              )}
            </TouchableOpacity>
            {hasPaidSizeAddon ? (
              <TouchableOpacity
                onPress={() => void manage()}
                disabled={busy != null}
                style={[styles.actionRow, styles.rowBorder]}
                accessibilityRole="button"
                accessibilityLabel="Manage subscription"
              >
                {busy === 'manage' ? (
                  <ActivityIndicator color={Colors.textSub} />
                ) : (
                  <Text style={styles.actionText}>Manage subscription</Text>
                )}
              </TouchableOpacity>
            ) : null}
            {Platform.OS !== 'web' ? (
              <TouchableOpacity
                onPress={() => void restore()}
                disabled={busy != null}
                style={[styles.actionRow, styles.rowBorder]}
                accessibilityRole="button"
                accessibilityLabel="Restore purchases"
              >
                {busy === 'restore' ? (
                  <ActivityIndicator color={Colors.textSub} />
                ) : (
                  <Text style={styles.actionMuted}>Restore purchases</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </View>
      <StoragePaywall
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        initialTier={sizeAddon?.tier ?? 'medium'}
        currentTier={sizeAddon?.tier ?? 'small'}
      />
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
  centerRow: { justifyContent: 'center' },
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  infoLabelMuted: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textMuted, opacity: 0.65 },
  infoValue: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.text, flexShrink: 1, textAlign: 'right' },
  deferNote: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
    lineHeight: 18,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1 },
  badgeOn: { backgroundColor: Colors.goingBg, borderColor: Colors.goingBorder },
  badgeOff: { backgroundColor: Colors.bg, borderColor: Colors.border },
  badgeText: { fontSize: 12, fontFamily: Fonts.semiBold },
  badgeOnText: { color: Colors.going },
  badgeOffText: { color: Colors.textSub },
  actionRow: { padding: 14, alignItems: 'center' },
  actionText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text },
  actionMuted: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.textSub },
});
