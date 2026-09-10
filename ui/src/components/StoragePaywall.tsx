import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, Radius } from '../constants/theme';
import { WEB_APP_MAX_WIDTH } from '../constants/webAppMaxWidth';
import { KeyboardSafeScrollView } from './KeyboardSafeScrollView';
import { edgeToEdgeModalProps } from './edgeToEdgeModalProps';
import { AppToastMount } from './AppToastMount';
import { usePurchases } from '../contexts/PurchasesContext';
import {
  getActiveSizeAddon,
  isPurchaseCancelled,
  listStoragePlanOptions,
  planLabelForStorage,
  purchasesErrorMessage,
  type StoragePlanOption,
} from '../services/revenueCat';
import { GROUP_TIERS } from '../utils/groupTiers';
import type { GroupSizeTier } from '../utils/groupTiers';
import { formatPlanDate } from '../utils/groupPlanPeriod';

const PLAN_BLURB: Record<GroupSizeTier, string> = {
  small: 'Free forever, for small groups',
  medium: 'Store more files and more members',
  large: 'Even more files and unlimited members',
};

const ALL_TIERS: GroupSizeTier[] = ['small', 'medium', 'large'];

const PERKS = [
  { icon: 'images-outline' as const, text: 'Photos, videos, and files in group storage' },
  { icon: 'people-outline' as const, text: 'Shared with everyone in the group' },
  { icon: 'phone-portrait-outline' as const, text: 'Follows this account on every device' },
];

function planTitle(tier: GroupSizeTier): string {
  const spec = GROUP_TIERS[tier];
  if (spec.maxMembers == null) return `${spec.label} (${spec.gb}GB + unlimited members)`;
  return `${spec.label} (${spec.gb}GB + ${spec.maxMembers} members)`;
}

function monthlyPrice(priceString: string): string {
  const raw = priceString.trim();
  if (/\/\s*mo/i.test(raw) || /month/i.test(raw)) return raw;
  return `${raw}/month`;
}

function priceForTier(tier: GroupSizeTier, options: StoragePlanOption[]): string {
  if (tier === 'small') return 'Free';
  const option = options.find((item) => item.plan.tier === tier);
  return option ? monthlyPrice(option.pkg.product.priceString) : 'Unavailable';
}

export function StoragePaywall({
  visible,
  onClose,
  onPurchased,
  onSwitchToSmall,
  currentTier,
  scheduledTier,
  periodEndsAt,
  goingToSmall,
  selectedEffectiveFrom,
}: {
  visible: boolean;
  onClose: () => void;
  onPurchased?: (option: StoragePlanOption) => void;
  onSwitchToSmall?: () => Promise<void>;
  initialTier?: GroupSizeTier | null;
  currentTier?: GroupSizeTier | null;
  scheduledTier?: GroupSizeTier | null;
  periodEndsAt?: Date | string | null;
  goingToSmall?: boolean;
  selectedEffectiveFrom?: Date | string | null;
}) {
  const { sizeAddon, purchasePackage, restorePurchases, presentCustomerCenter } = usePurchases();
  const [options, setOptions] = useState<StoragePlanOption[]>([]);
  const [selected, setSelected] = useState<GroupSizeTier | null>(null);
  const [loading, setLoading] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');

  const activeTier: GroupSizeTier = currentTier ?? sizeAddon?.tier ?? 'small';
  const nextTier: GroupSizeTier = scheduledTier ?? activeTier;
  const periodStamp = periodEndsAt ? formatPlanDate(periodEndsAt) : '';
  const activeDateLine =
    periodStamp && activeTier !== 'small'
      ? goingToSmall
        ? `Expires ${periodStamp}`
        : `Renews ${periodStamp}`
      : null;
  const selectedDateLine = selectedEffectiveFrom
    ? `Effective from ${formatPlanDate(selectedEffectiveFrom)}`
    : null;

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void listStoragePlanOptions()
      .then((next) => {
        if (cancelled) return;
        setOptions(next);
        setSelected(nextTier);
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
  }, [visible, nextTier]);

  const selectedIsScheduled = selected != null && selected === nextTier;
  const selectedPaidMissing =
    selected != null &&
    selected !== 'small' &&
    !options.some((item) => item.plan.tier === selected);
  const ctaLabel = useMemo(() => {
    if (!selected) return 'Choose a plan';
    if (selectedIsScheduled) return 'Selected plan';
    const name = GROUP_TIERS[selected].label;
    if (selected === 'small') return `Switch to ${name} — Free`;
    const option = options.find((item) => item.plan.tier === selected);
    const price = option ? monthlyPrice(option.pkg.product.priceString) : '';
    const verb = activeTier === 'small' ? 'Upgrade' : 'Switch';
    return price ? `${verb} to ${name} — ${price}` : `${verb} to ${name}`;
  }, [selected, selectedIsScheduled, activeTier, options]);

  const confirm = async () => {
    if (!selected || selectedIsScheduled || purchasing) return;
    setPurchasing(true);
    try {
      if (selected === 'small') {
        if (onSwitchToSmall) {
          await onSwitchToSmall();
          onClose();
          Toast.show({ type: 'success', text1: 'Switched to Small' });
        } else {
          onClose();
          await presentCustomerCenter();
        }
        return;
      }
      const option = options.find((item) => item.plan.tier === selected);
      if (!option) return;
      const info = await purchasePackage(option.pkg);
      if (!info) {
        Toast.show({ type: 'info', text1: 'Purchase cancelled' });
        return;
      }
      onPurchased?.(option);
      onClose();
      if (activeTier === 'large' && selected === 'medium') {
        Toast.show({ type: 'success', text1: 'Medium starts at the end of this period' });
      }
    } catch (e) {
      if (isPurchaseCancelled(e)) {
        Toast.show({ type: 'info', text1: 'Purchase cancelled' });
        return;
      }
      Toast.show({
        type: 'error',
        text1: purchasesErrorMessage(e, 'Could not complete purchase.'),
      });
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
        Toast.show({ type: 'success', text1: `Restored ${planLabelForStorage(restored)}.` });
      } else {
        Toast.show({
          type: 'info',
          text1: 'No active media storage subscription was found for this store account.',
        });
      }
    } catch (e) {
      if (isPurchaseCancelled(e)) {
        Toast.show({ type: 'info', text1: 'Restore cancelled' });
        return;
      }
      Toast.show({
        type: 'error',
        text1: purchasesErrorMessage(e, 'Could not restore purchases.'),
      });
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
          <View style={styles.topRow}>
            <View style={styles.heroIcon}>
              <Ionicons name="cloud-outline" size={22} color={Colors.accentFg} />
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={26} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <KeyboardSafeScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.headline}>More room for the group</Text>
            <Text style={styles.subhead}>
              Keep photos, videos, and files together. Upgrade anytime — your plan stays with this
              account.
            </Text>

            <View style={styles.perks}>
              {PERKS.map((perk) => (
                <View key={perk.text} style={styles.perkRow}>
                  <Ionicons name={perk.icon} size={18} color={Colors.text} />
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
                {ALL_TIERS.map((tier) => {
                  const isActive = activeTier === tier;
                  const isScheduled = nextTier === tier;
                  const split = nextTier !== activeTier;
                  const isPicked = selected === tier;
                  const priceLabel = priceForTier(tier, options);
                  const locked = isScheduled;
                  return (
                    <TouchableOpacity
                      key={tier}
                      onPress={() => setSelected(tier)}
                      disabled={locked}
                      style={[
                        styles.plan,
                        locked && styles.planLocked,
                        isPicked && !locked && styles.planSelected,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isPicked || locked, disabled: locked }}
                      accessibilityLabel={`${planTitle(tier)}${isActive ? ', active plan' : ''}${split && isScheduled ? ', selected plan' : ''}`}
                    >
                      {isActive || (split && isScheduled) ? (
                        <View style={styles.pillRow}>
                          {isActive ? (
                            <View style={styles.planPill}>
                              <Text style={styles.planPillText}>Active plan</Text>
                            </View>
                          ) : null}
                          {split && isScheduled ? (
                            <View style={styles.planPill}>
                              <Text style={styles.planPillText}>Selected plan</Text>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                      <Text style={styles.planTitle}>{planTitle(tier)}</Text>
                      <Text style={styles.planBlurb}>{PLAN_BLURB[tier]}</Text>
                      <Text style={styles.planPrice}>{priceLabel}</Text>
                      {isActive && activeDateLine ? (
                        <Text style={styles.planDate}>{activeDateLine}</Text>
                      ) : null}
                      {split && isScheduled && selectedDateLine ? (
                        <Text style={styles.planDate}>{selectedDateLine}</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </KeyboardSafeScrollView>

          <SafeAreaView edges={['bottom']} style={styles.footer}>
            <TouchableOpacity
              onPress={() => void confirm()}
              disabled={
                !selected ||
                selectedIsScheduled ||
                selectedPaidMissing ||
                purchasing ||
                loading ||
                restoring
              }
              style={[
                styles.cta,
                (!selected ||
                  selectedIsScheduled ||
                  selectedPaidMissing ||
                  purchasing ||
                  loading ||
                  restoring) &&
                  styles.ctaDisabled,
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
        <AppToastMount />
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28 },
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
  perks: { gap: 12, marginBottom: 22 },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  perkText: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: Fonts.medium, color: Colors.text },
  center: { paddingVertical: 28, alignItems: 'center' },
  error: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.notGoing, lineHeight: 20 },
  plans: { gap: 10 },
  plan: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: Radius['2xl'],
    padding: 16,
  },
  planSelected: {
    borderColor: Colors.text,
  },
  planLocked: {
    backgroundColor: '#ECECEE',
    borderColor: 'transparent',
  },
  planPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#E4E4E7',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  planPillText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textSub },
  planTitle: { fontSize: 16, fontFamily: Fonts.extraBold, color: Colors.text },
  planBlurb: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    marginTop: 4,
  },
  planPrice: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text, marginTop: 8 },
  planDate: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.textSub,
    marginTop: 6,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: Colors.bg,
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
