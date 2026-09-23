import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants/theme';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { useGroups } from '../hooks/api/useGroups';
import { useOwnedGroupQuota } from '../hooks/api/useUsers';
import { groupHasSizeSubscription, isGroupOwnedByUser } from '../utils/groupStorage';
import { FREE_OWNED_GROUP_LIMIT } from '../utils/groupTiers';
import { GroupSubscriptionsModal } from './GroupSubscriptionsModal';
import { OwnedGroupsModal } from './OwnedGroupsModal';
import { PurchaseHistoryModal } from './PurchaseHistoryModal';

export function SubscriptionSettingsCard() {
  const { userId } = useCurrentUserContext();
  const { data: groups = [] } = useGroups(userId ?? '');
  const { data: quota } = useOwnedGroupQuota(userId ?? '');
  const [subsModalOpen, setSubsModalOpen] = useState(false);
  const [ownedModalOpen, setOwnedModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const ownedGroups = useMemo(
    () => groups.filter((group) => isGroupOwnedByUser(group, userId ?? '')),
    [groups, userId]
  );
  const subscribedGroups = useMemo(
    () => ownedGroups.filter(groupHasSizeSubscription),
    [ownedGroups]
  );
  const ownedCount = quota?.ownedGroupCount ?? ownedGroups.length;
  const groupCapacity =
    quota?.groupCapacity ??
    (quota?.freeGroupLimit ?? FREE_OWNED_GROUP_LIMIT) + (quota?.extraGroupSlots ?? 0);
  const subscribedCount = subscribedGroups.length;
  const canOpenSubs = ownedCount > 0;

  const ownedValue = `${ownedCount}/${groupCapacity}`;
  const ownedRow = (
    <>
      <Text style={styles.infoLabel}>Groups you own</Text>
      <View style={styles.countHit}>
        <Text style={styles.infoValue}>{ownedValue}</Text>
        {canOpenSubs ? <Ionicons name="chevron-forward" size={16} color={Colors.text} /> : null}
      </View>
    </>
  );
  const subscribedRow = (
    <>
      <Text style={styles.infoLabel}>Groups with subscriptions</Text>
      <View style={styles.countHit}>
        <Text style={styles.infoValue}>{subscribedCount}</Text>
        {canOpenSubs ? <Ionicons name="chevron-forward" size={16} color={Colors.text} /> : null}
      </View>
    </>
  );

  return (
    <>
      <Text style={styles.sectionLabel}>SUBSCRIPTION</Text>
      <View style={[styles.card, styles.cardGap]}>
        {canOpenSubs ? (
          <TouchableOpacity
            style={styles.infoRow}
            onPress={() => setOwnedModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Groups you own, ${ownedValue}. Show details`}
          >
            {ownedRow}
          </TouchableOpacity>
        ) : (
          <View style={styles.infoRow}>{ownedRow}</View>
        )}
        {canOpenSubs ? (
          <TouchableOpacity
            style={[styles.infoRow, styles.rowBorder]}
            onPress={() => setSubsModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Groups with subscriptions, ${subscribedCount}. Show details`}
          >
            {subscribedRow}
          </TouchableOpacity>
        ) : (
          <View style={[styles.infoRow, styles.rowBorder]}>{subscribedRow}</View>
        )}
        <TouchableOpacity
          style={[styles.historyRow, styles.rowBorder]}
          onPress={() => setHistoryOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Purchase history"
        >
          <Text style={styles.historyText}>Purchase history</Text>
        </TouchableOpacity>
      </View>
      <OwnedGroupsModal
        visible={ownedModalOpen}
        onClose={() => setOwnedModalOpen(false)}
        groups={ownedGroups}
      />
      {userId ? (
        <GroupSubscriptionsModal
          visible={subsModalOpen}
          onClose={() => setSubsModalOpen(false)}
          userId={userId}
          groups={subscribedGroups}
        />
      ) : null}
      {userId ? (
        <PurchaseHistoryModal
          visible={historyOpen}
          onClose={() => setHistoryOpen(false)}
          userId={userId}
        />
      ) : null}
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
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  infoLabel: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.text },
  infoValue: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.text, flexShrink: 1, textAlign: 'right' },
  countHit: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  historyRow: { padding: 14, alignItems: 'center' },
  historyText: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textMuted, textAlign: 'center' },
});
