import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants/theme';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { useGroups } from '../hooks/api/useGroups';
import { useOwnedGroupQuota } from '../hooks/api/useUsers';
import { isGroupOwnedByUser } from '../utils/groupStorage';
import { FREE_OWNED_GROUP_LIMIT } from '../utils/groupTiers';
import { OwnedGroupsModal } from './OwnedGroupsModal';

export function SubscriptionSettingsCard() {
  const { userId } = useCurrentUserContext();
  const { data: groups = [] } = useGroups(userId ?? '');
  const { data: quota } = useOwnedGroupQuota(userId ?? '');
  const [ownedModalOpen, setOwnedModalOpen] = useState(false);

  const ownedGroups = useMemo(
    () => groups.filter((group) => isGroupOwnedByUser(group, userId ?? '')),
    [groups, userId]
  );
  const ownedCount = quota?.ownedGroupCount ?? ownedGroups.length;
  const groupCapacity =
    quota?.groupCapacity ??
    (quota?.freeGroupLimit ?? FREE_OWNED_GROUP_LIMIT) + (quota?.extraGroupSlots ?? 0);
  const canOpenOwned = ownedCount > 0;

  const ownedValue = `${ownedCount}/${groupCapacity}`;
  const ownedRow = (
    <>
      <Text style={styles.infoLabel}>Groups you own</Text>
      <View style={styles.countHit}>
        <Text style={styles.infoValue}>{ownedValue}</Text>
        {canOpenOwned ? <Ionicons name="chevron-forward" size={16} color={Colors.text} /> : null}
      </View>
    </>
  );

  return (
    <>
      <Text style={styles.sectionLabel}>SUBSCRIPTION</Text>
      <View style={[styles.card, styles.cardGap]}>
        {canOpenOwned ? (
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
      </View>
      {userId ? (
        <OwnedGroupsModal
          visible={ownedModalOpen}
          onClose={() => setOwnedModalOpen(false)}
          groups={ownedGroups}
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
  infoLabel: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.text },
  infoValue: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.text, flexShrink: 1, textAlign: 'right' },
  countHit: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
