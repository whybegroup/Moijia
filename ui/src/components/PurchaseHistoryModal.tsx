import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PurchaseHistoryEntry } from '@moijia/client';
import { Colors, Fonts } from '../constants/theme';
import { WEB_APP_MAX_WIDTH } from '../constants/webAppMaxWidth';
import { usePurchaseHistory } from '../hooks/api/useUsers';
import {
  listStoragePlanOptions,
  monthlyRateLabel,
  priceStringForTier,
  type StoragePlanOption,
} from '../services/revenueCat';
import { formatPlanDate } from '../utils/groupPlanPeriod';
import { edgeToEdgeModalProps } from './edgeToEdgeModalProps';
import { NavBar } from './ui';

function looksLikePrice(value: string): boolean {
  return /^\$?\d/.test(value.trim()) || value.trim().toLowerCase() === 'free';
}

function billingPrice(
  entry: PurchaseHistoryEntry,
  options: StoragePlanOption[]
): string | null {
  if (entry.kind === 'extra_group') return '$0.99';
  const blob = `${entry.productId ?? ''} ${entry.title}`;
  const tier = /large/i.test(blob)
    ? 'large'
    : /medium/i.test(blob)
      ? 'medium'
      : /small/i.test(blob) || entry.kind === 'cancel'
        ? 'small'
        : null;
  if (tier === 'small') return 'Free';
  if (tier === 'medium' || tier === 'large') {
    return (
      monthlyRateLabel(priceStringForTier(tier, options)) ||
      (tier === 'large' ? '$9.99/mo' : '$4.99/mo')
    );
  }
  return entry.detail && looksLikePrice(entry.detail) ? entry.detail : null;
}

function HistoryRow({
  entry,
  options,
}: {
  entry: PurchaseHistoryEntry;
  options: StoragePlanOption[];
}) {
  const when = entry.createdAt ? formatPlanDate(entry.createdAt) : '';
  const price = billingPrice(entry, options);
  const detail = entry.detail && !looksLikePrice(entry.detail) ? entry.detail : null;
  const line = [entry.title, detail].filter(Boolean).join(' · ');
  const meta = [price, when].filter(Boolean).join(' · ');
  return (
    <View style={styles.logRow}>
      <Text style={styles.logLine} numberOfLines={1}>
        {line}
      </Text>
      {meta ? (
        <Text style={styles.logMeta} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

export function PurchaseHistoryModal({
  visible,
  onClose,
  userId,
}: {
  visible: boolean;
  onClose: () => void;
  userId: string;
}) {
  const { data = [], isLoading } = usePurchaseHistory(userId, visible);
  const latest = data.slice(0, 20);
  const [options, setOptions] = useState<StoragePlanOption[]>([]);

  useEffect(() => {
    if (!visible) return;
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
          <NavBar title="Purchase history" onClose={onClose} centerTitle />
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {isLoading ? (
              <ActivityIndicator color={Colors.textSub} style={styles.loading} />
            ) : latest.length === 0 ? (
              <Text style={styles.empty}>No purchases yet.</Text>
            ) : (
              latest.map((entry) => <HistoryRow key={entry.id} entry={entry} options={options} />)
            )}
          </ScrollView>
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
  scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },
  loading: { marginTop: 32 },
  empty: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    textAlign: 'center',
    marginTop: 32,
  },
  logRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  logLine: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.text },
  logMeta: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.textMuted, marginTop: 2 },
});
