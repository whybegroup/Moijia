import { useEffect, useMemo, useState } from 'react';
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
import { GROUP_TIERS, formatMemberLimit } from '../utils/groupTiers';
import { useSetGroupStorageLimit } from '../hooks/api/useGroups';
import { apiErrorMessage } from '../utils/apiErrors';
import { usePurchases } from '../contexts/PurchasesContext';
import { sizeAddonByTier } from '../config/revenueCat';
import { StoragePaywall } from './StoragePaywall';

const PAID: Array<'medium' | 'large'> = ['medium', 'large'];

export function GroupStorageRequestForm({
  groupId,
  userId,
  currentMaxBytes,
  usedBytes,
  sizeTier,
}: {
  groupId: string;
  userId: string;
  currentMaxBytes: number;
  usedBytes: number;
  sizeTier?: string | null;
}) {
  const setLimit = useSetGroupStorageLimit(groupId, userId);
  const { presentPaywall } = usePurchases();
  const currentTier = sizeTierFromGroup({ sizeTier, maxStorageBytes: currentMaxBytes });

  const [selected, setSelected] = useState<'medium' | 'large'>(
    currentTier === 'large' ? 'large' : 'medium'
  );
  const [paywallOpen, setPaywallOpen] = useState(false);

  useEffect(() => {
    setSelected(currentTier === 'large' ? 'large' : 'medium');
  }, [currentTier]);

  const requestedCap = GROUP_TIERS[selected].maxStorageBytes;
  const used = Math.max(0, usedBytes);
  const unchanged = selected === currentTier;
  const belowUsage = requestedCap < used;
  const needsPurchase = selected !== currentTier;
  const saving = setLimit.isPending;
  const canSubmit = !unchanged && !belowUsage && !saving;

  const applyLimit = async (tier: 'medium' | 'large') => {
    try {
      await setLimit.mutateAsync(tier);
    } catch (e) {
      const msg = apiErrorMessage(e, 'Could not update group size');
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    const plan = sizeAddonByTier(selected);
    if (plan && needsPurchase) {
      const outcome = await presentPaywall(plan);
      if (outcome === 'purchased' || outcome === 'restored' || outcome === 'already_pro') {
        await applyLimit(selected);
        return;
      }
      if (outcome === 'cancelled') return;
    }
    setPaywallOpen(true);
  };

  return (
    <View style={styles.requestBlock}>
      <Text style={styles.requestTitle}>Group size</Text>
      <Text style={styles.hint}>
        This group is {GROUP_TIERS[currentTier].label} ({formatStorageBytes(resolveGroupMaxStorageBytes(currentMaxBytes, currentTier))},{' '}
        {formatMemberLimit(currentTier).toLowerCase()}). Medium and Large are monthly add-ons for
        this group.
      </Text>
      <View style={styles.list}>
        {PAID.map((tier) => {
          const active = selected === tier;
          const spec = GROUP_TIERS[tier];
          return (
            <TouchableOpacity
              key={tier}
              onPress={() => setSelected(tier)}
              style={[styles.option, active && styles.optionActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <View>
                <Text style={styles.optionTitle}>{spec.label}</Text>
                <Text style={styles.optionBlurb}>
                  {spec.gb} GB · {formatMemberLimit(tier)}
                </Text>
              </View>
              <Text style={styles.optionMeta}>/ month</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {belowUsage ? (
        <Text style={styles.error}>
          This group is already using {formatStorageBytes(used)}. Choose a larger size or delete
          files first.
        </Text>
      ) : null}
      <TouchableOpacity
        onPress={() => void submit()}
        disabled={!canSubmit}
        style={[styles.submit, !canSubmit && styles.submitDisabled]}
        accessibilityRole="button"
      >
        {saving ? (
          <ActivityIndicator color={Colors.accentFg} />
        ) : (
          <Text style={styles.submitText}>
            {needsPurchase ? 'Continue to subscribe' : 'Update size'}
          </Text>
        )}
      </TouchableOpacity>
      <StoragePaywall
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        initialTier={selected}
        onPurchased={(option) => {
          void applyLimit(option.plan.tier);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  requestBlock: { marginTop: 4 },
  requestTitle: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text },
  hint: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textMuted, marginTop: 4, marginBottom: 12 },
  list: { gap: 8, marginBottom: 12 },
  option: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bg,
  },
  optionActive: { borderColor: Colors.accent, backgroundColor: Colors.surface },
  optionTitle: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.text },
  optionBlurb: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.textMuted, marginTop: 2 },
  optionMeta: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.textMuted },
  error: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Colors.notGoing,
    marginBottom: 10,
  },
  submit: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.lg,
    paddingVertical: 10,
    alignItems: 'center',
  },
  submitDisabled: { backgroundColor: Colors.border },
  submitText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentFg },
});
