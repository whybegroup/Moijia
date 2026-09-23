import { Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { GroupScoped } from '@moijia/client';
import { Colors, Fonts, Radius } from '../constants/theme';
import { WEB_APP_MAX_WIDTH } from '../constants/webAppMaxWidth';
import { useGroup, useGroups } from '../hooks/api/useGroups';
import { GROUP_TIERS, parseSizeTier } from '../utils/groupTiers';
import { groupHasSizeSubscription, isGroupOwnedByUser } from '../utils/groupStorage';
import { GroupAvatar } from './GroupAvatar';
import { GroupStorageRequestForm } from './GroupStorageRequestForm';
import { edgeToEdgeModalProps } from './edgeToEdgeModalProps';
import { NavBar } from './ui';

function GroupSubscriptionCard({
  group,
  userId,
  enabled,
  onUpdated,
}: {
  group: GroupScoped;
  userId: string;
  enabled: boolean;
  onUpdated: () => Promise<void>;
}) {
  const { data: live } = useGroup(group.id, userId, { enabled });
  const current = live ?? group;
  const tier = parseSizeTier(current.sizeTier);

  return (
    <View style={styles.card}>
      <View style={styles.groupRow}>
        <GroupAvatar
          seed={current.avatarSeed ?? current.name}
          thumbnail={current.thumbnail}
          size={40}
        />
        <View style={styles.groupMeta}>
          <Text style={styles.groupName} numberOfLines={1}>
            {current.name}
          </Text>
          <Text style={styles.groupTier}>{GROUP_TIERS[tier].label} group</Text>
        </View>
      </View>
      <GroupStorageRequestForm
        groupId={current.id}
        userId={userId}
        currentMaxBytes={current.maxStorageBytes}
        usedBytes={current.usedStorageBytes ?? 0}
        sizeTier={current.sizeTier}
        pendingSizeTier={current.pendingSizeTier}
        graceEndsAt={current.graceEndsAt}
        sizeStartedAt={current.sizeStartedAt}
        onUpdated={onUpdated}
      />
    </View>
  );
}

export function GroupSubscriptionsModal({
  visible,
  onClose,
  userId,
  groups,
}: {
  visible: boolean;
  onClose: () => void;
  userId: string;
  groups: GroupScoped[];
}) {
  const { data: liveGroups = [], refetch } = useGroups(userId);
  const owned = liveGroups.filter((group) => isGroupOwnedByUser(group, userId));
  const subscribed = owned.filter(groupHasSizeSubscription);
  const shown =
    subscribed.length > 0
      ? subscribed
      : groups.map((group) => owned.find((item) => item.id === group.id) ?? group);

  const refreshShown = async () => {
    await refetch();
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
          <NavBar title="Group subscriptions" onClose={onClose} centerTitle />
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {shown.length === 0 ? (
              <Text style={styles.empty}>None of your groups have a Medium or Large plan yet.</Text>
            ) : (
              shown.map((group) => (
                <GroupSubscriptionCard
                  key={group.id}
                  group={group}
                  userId={userId}
                  enabled={visible}
                  onUpdated={refreshShown}
                />
              ))
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
  scrollContent: { padding: 16, paddingBottom: 32, gap: 14 },
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
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  groupMeta: { flex: 1, minWidth: 0 },
  groupName: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.text },
  groupTier: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textSub, marginTop: 2 },
});
