import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, Radius, Shadows } from '../constants/theme';
import { WEB_APP_MAX_WIDTH } from '../constants/webAppMaxWidth';
import { KeyboardSafeScrollView } from './KeyboardSafeScrollView';
import { NavBar } from './ui';
import { edgeToEdgeModalProps } from './edgeToEdgeModalProps';
import { usePurchases } from '../contexts/PurchasesContext';
import {
  getActiveSizeAddon,
  isPurchaseCancelled,
  listStoragePlanOptions,
  planLabelForStorage,
  purchasesErrorMessage,
  type StoragePlanOption,
} from '../services/revenueCat';
import { formatMemberLimit } from '../utils/groupTiers';
import type { GroupSizeTier } from '../utils/groupTiers';

const PLAN_COPY: Record<string, { blurb: string; popular?: boolean }> = {
  medium: { blurb: '10 GB and up to 50 members', popular: true },
  large: { blurb: '100 GB and unlimited members' },
};

const PERKS = [
  { icon: 'cloud-outline' as const, text: 'Photos, videos, and files in group storage' },
  { icon: 'people-outline' as const, text: 'Shared with everyone in the group' },
  { icon: 'phone-portrait-outline' as const, text: 'Follows this account on every device' },
];

function alertMessage(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(message);
  else Alert.alert(title, message);
}

export function StoragePaywall({
  visible,
  onClose,
  onPurchased,
  initialTier,
}: {
  visible: boolean;
  onClose: () => void;
  onPurchased?: (option: StoragePlanOption) => void;
  initialTier?: GroupSizeTier | null;
}) {
  const { sizeAddon, purchasePackage, restorePurchases } = usePurchases();
  const [options, setOptions] = useState<StoragePlanOption[]>([]);
  const [selected, setSelected] = useState<StoragePlanOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');

  const preferredTier = initialTier === 'large' ? 'large' : 'medium';

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void listStoragePlanOptions()
      .then((next) => {
        if (cancelled) return;
        setOptions(next);
        setSelected(
          next.find((option) => option.plan.tier === preferredTier) ??
            next.find((option) => option.plan.tier === 'medium') ??
            next[0] ??
            null
        );
        if (next.length === 0) {
          setError('Storage plans are not available right now. Try again in a moment.');
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load storage plans.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, preferredTier]);

  const selectedIsCurrent = selected != null && selected.plan.tier === sizeAddon?.tier;
  const ctaLabel = useMemo(() => {
    if (!selected) return 'Subscribe';
    if (selectedIsCurrent) return 'Current plan';
    if (sizeAddon != null) return `Switch to ${selected.plan.displayName}`;
    return `Get ${selected.plan.displayName}`;
  }, [selected, selectedIsCurrent, sizeAddon]);

  const subscribe = async () => {
    if (!selected || selectedIsCurrent || purchasing) return;
    setPurchasing(true);
    try {
      await purchasePackage(selected.pkg);
      onPurchased?.(selected);
      onClose();
    } catch (e) {
      if (!isPurchaseCancelled(e)) {
        alertMessage('Subscribe', purchasesErrorMessage(e, 'Could not complete purchase.'));
      }
    } finally {
      setPurchasing(false);
    }
  };

  const restore = async () => {
    if (restoring || purchasing) return;
    setRestoring(true);
    try {
      const info = await restorePurchases();
      const restored = getActiveSizeAddon(info);
      if (restored) {
        onClose();
        alertMessage('Restore purchases', `Restored ${planLabelForStorage(restored)}.`);
      } else {
        alertMessage(
          'Restore purchases',
          'No active media storage subscription was found for this store account.'
        );
      }
    } catch (e) {
      if (!isPurchaseCancelled(e)) {
        alertMessage('Restore purchases', purchasesErrorMessage(e, 'Could not restore purchases.'));
      }
    } finally {
      setRestoring(false);
    }
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
          <NavBar title="moijia storage" onClose={onClose} centerTitle />
          <KeyboardSafeScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.heroIcon}>
              <Ionicons name="cloud-outline" size={28} color={Colors.accentFg} />
            </View>
            <Text style={styles.headline}>More room for the group</Text>
            <Text style={styles.subhead}>
              Small groups include 1 GB and 20 members. Add Medium or Large for this group —
              billed monthly. Apple and Google prorate upgrades immediately and defer
              downgrades until the paid period ends.
            </Text>

            <View style={styles.perks}>
              {PERKS.map((perk) => (
                <View key={perk.text} style={styles.perkRow}>
                  <View style={styles.perkIcon}>
                    <Ionicons name={perk.icon} size={18} color={Colors.text} />
                  </View>
                  <Text style={styles.perkText}>{perk.text}</Text>
                </View>
              ))}
            </View>

            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator color={Colors.accent} />
              </View>
            ) : error ? (
              <Text style={styles.error}>{error}</Text>
            ) : (
              <View style={styles.plans}>
                {options.map((option) => {
                  const active = selected?.plan.packageId === option.plan.packageId;
                  const current = sizeAddon?.tier === option.plan.tier;
                  const copy = PLAN_COPY[option.plan.tier];
                  return (
                    <TouchableOpacity
                      key={option.plan.packageId}
                      onPress={() => setSelected(option)}
                      style={[styles.plan, active && styles.planActive]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      {copy?.popular ? (
                        <View style={styles.popular}>
                          <Text style={styles.popularText}>Most groups</Text>
                        </View>
                      ) : null}
                      <View style={styles.planTop}>
                        <View style={styles.planText}>
                          <Text style={styles.planGb}>{option.plan.displayName}</Text>
                          <Text style={styles.planBlurb}>
                            {copy?.blurb ?? `${option.plan.gb} GB · ${formatMemberLimit(option.plan.tier)}`}
                          </Text>
                        </View>
                        <View style={styles.planPriceBlock}>
                          <Text style={styles.planPrice}>{option.pkg.product.priceString}</Text>
                          <Text style={styles.planPeriod}>/ month</Text>
                        </View>
                      </View>
                      {current ? <Text style={styles.current}>Your current plan</Text> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </KeyboardSafeScrollView>

          <SafeAreaView edges={['bottom']} style={styles.footer}>
            <TouchableOpacity
              onPress={() => void subscribe()}
              disabled={!selected || selectedIsCurrent || purchasing || loading || restoring}
              style={[
                styles.cta,
                (!selected || selectedIsCurrent || purchasing || loading || restoring) && styles.ctaDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={ctaLabel}
            >
              {purchasing ? (
                <ActivityIndicator color={Colors.accentFg} />
              ) : (
                <Text style={styles.ctaText}>{ctaLabel}</Text>
              )}
            </TouchableOpacity>
            {Platform.OS !== 'web' ? (
              <TouchableOpacity
                onPress={() => void restore()}
                disabled={purchasing || restoring}
                style={styles.restore}
                accessibilityRole="button"
                accessibilityLabel="Restore purchases"
              >
                {restoring ? (
                  <ActivityIndicator color={Colors.textSub} />
                ) : (
                  <Text style={styles.restoreText}>Restore purchases</Text>
                )}
              </TouchableOpacity>
            ) : null}
            <Text style={styles.legal}>
              {Platform.OS === 'web'
                ? 'Billed monthly. Cancel anytime from the customer portal.'
                : 'Payment is charged to your Apple or Google account. The subscription renews each month until you cancel in the store settings or Customer Center.'}
            </Text>
          </SafeAreaView>
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
    backgroundColor: Colors.bg,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? WEB_APP_MAX_WIDTH : undefined,
    alignSelf: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28 },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  headline: {
    fontSize: 26,
    lineHeight: 32,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    marginBottom: 8,
  },
  subhead: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    marginBottom: 20,
  },
  perks: { gap: 10, marginBottom: 22 },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  perkIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perkText: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: Fonts.medium, color: Colors.text },
  center: { paddingVertical: 28, alignItems: 'center' },
  error: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.notGoing, lineHeight: 20 },
  plans: { gap: 10 },
  plan: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius['2xl'],
    padding: 16,
  },
  planActive: {
    borderColor: Colors.accent,
    ...Shadows.sm,
  },
  popular: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.accent,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  popularText: { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  planTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  planText: { flex: 1, minWidth: 0 },
  planGb: { fontSize: 20, fontFamily: Fonts.extraBold, color: Colors.text },
  planBlurb: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.regular, color: Colors.textSub, marginTop: 4 },
  planPriceBlock: { alignItems: 'flex-end' },
  planPrice: { fontSize: 18, fontFamily: Fonts.extraBold, color: Colors.text },
  planPeriod: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textMuted, marginTop: 2 },
  current: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.going, marginTop: 10 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: Colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  cta: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  restore: { paddingVertical: 12, alignItems: 'center' },
  restoreText: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.textSub },
  legal: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 8,
  },
});
