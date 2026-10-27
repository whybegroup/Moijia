import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
import { edgeToEdgeModalProps } from './edgeToEdgeModalProps';
import { AppToastMount } from './AppToastMount';
import { usePurchases } from '../contexts/PurchasesContext';
import { isPurchaseCancelled, purchasesErrorMessage } from '../services/revenueCat';
import { PRO_PRICE_LABEL } from '../config/revenueCat';

const PERKS = [
  { icon: 'people-outline' as const, text: 'Create up to 10 groups' },
  { icon: 'cloud-outline' as const, text: 'Each group is Medium, with 10 GB of storage' },
  { icon: 'phone-portrait-outline' as const, text: 'Follows this account on every device' },
];

export function StoragePaywall({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { purchasePro, restorePurchases, presentCustomerCenter } = usePurchases();
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    if (purchasing) return;
    setPurchasing(true);
    setError('');
    try {
      const info = await purchasePro();
      if (!info) {
        Toast.show({ type: 'info', text1: 'Purchase cancelled' });
        return;
      }
      Toast.show({ type: 'success', text1: 'You are on Pro' });
      onClose();
    } catch (e) {
      if (isPurchaseCancelled(e)) {
        Toast.show({ type: 'info', text1: 'Purchase cancelled' });
        return;
      }
      setError(purchasesErrorMessage(e, 'Could not start Pro.'));
    } finally {
      setPurchasing(false);
    }
  };

  const restore = async () => {
    if (restoring) return;
    setRestoring(true);
    setError('');
    try {
      await restorePurchases();
      Toast.show({ type: 'success', text1: 'Purchases restored' });
      onClose();
    } catch (e) {
      setError(purchasesErrorMessage(e, 'Could not restore purchases.'));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Modal {...edgeToEdgeModalProps} visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.kicker}>MOIJIA PRO</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <Text style={styles.price}>{PRO_PRICE_LABEL}</Text>
          <Text style={styles.blurb}>
            A monthly plan for the groups you own. Free stays at 2 Small groups. Enterprise is arranged with us
            outside the app.
          </Text>
          <View style={styles.perks}>
            {PERKS.map((perk) => (
              <View key={perk.text} style={styles.perkRow}>
                <Ionicons name={perk.icon} size={20} color={Colors.textSub} />
                <Text style={styles.perkText}>{perk.text}</Text>
              </View>
            ))}
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity
            style={[styles.cta, purchasing && styles.ctaDisabled]}
            onPress={() => void confirm()}
            disabled={purchasing}
            accessibilityRole="button"
          >
            {purchasing ? (
              <ActivityIndicator color={Colors.accentFg} />
            ) : (
              <Text style={styles.ctaText}>Subscribe · {PRO_PRICE_LABEL}</Text>
            )}
          </TouchableOpacity>
          <View style={styles.links}>
            <TouchableOpacity onPress={() => void restore()} disabled={restoring}>
              <Text style={styles.link}>{restoring ? 'Restoring…' : 'Restore purchases'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void presentCustomerCenter().catch(() => undefined)}>
              <Text style={styles.link}>Manage subscription</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.legal}>
            Payment is charged to your Apple or Google account. Pro renews each month until you cancel in the store
            settings. Groups larger than Small become Small 15 days after Pro expires.
          </Text>
        </View>
        <AppToastMount />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center' },
  sheet: { flex: 1, width: '100%', maxWidth: WEB_APP_MAX_WIDTH, padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    letterSpacing: 0.8,
  },
  price: { marginTop: 18, fontSize: 34, fontFamily: Fonts.bold, color: Colors.text },
  blurb: { marginTop: 8, fontSize: 15, lineHeight: 22, fontFamily: Fonts.regular, color: Colors.textSub },
  perks: { marginTop: 24, gap: 14 },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  perkText: { flex: 1, fontSize: 15, fontFamily: Fonts.medium, color: Colors.text },
  error: { marginTop: 16, color: Colors.notGoing, fontFamily: Fonts.medium, fontSize: 14 },
  cta: {
    marginTop: 28,
    backgroundColor: Colors.accent,
    borderRadius: Radius.lg,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: Colors.accentFg, fontFamily: Fonts.semiBold, fontSize: 16 },
  links: { marginTop: 16, flexDirection: 'row', justifyContent: 'space-between' },
  link: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.textSub },
  legal: { marginTop: 20, fontSize: 12, lineHeight: 18, fontFamily: Fonts.regular, color: Colors.textMuted },
});
