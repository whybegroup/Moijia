import { ActivityIndicator, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PurchaseHistoryEntry } from '@moijia/client';
import { Colors, Fonts, Radius } from '../constants/theme';
import { WEB_APP_MAX_WIDTH } from '../constants/webAppMaxWidth';
import { usePurchaseHistory } from '../hooks/api/useUsers';
import { formatPlanDate } from '../utils/groupPlanPeriod';
import { edgeToEdgeModalProps } from './edgeToEdgeModalProps';
import { NavBar } from './ui';

function HistoryRow({ entry }: { entry: PurchaseHistoryEntry }) {
  const when = entry.createdAt ? formatPlanDate(entry.createdAt) : '';
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{entry.title}</Text>
      {entry.detail ? <Text style={styles.detail}>{entry.detail}</Text> : null}
      {when ? <Text style={styles.when}>{when}</Text> : null}
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
            ) : data.length === 0 ? (
              <Text style={styles.empty}>No purchases yet.</Text>
            ) : (
              data.map((entry) => <HistoryRow key={entry.id} entry={entry} />)
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
  scrollContent: { padding: 16, paddingBottom: 32, gap: 10 },
  loading: { marginTop: 32 },
  empty: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    textAlign: 'center',
    marginTop: 32,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  title: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.text },
  detail: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textSub, marginTop: 2 },
  when: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textMuted, marginTop: 6 },
});
