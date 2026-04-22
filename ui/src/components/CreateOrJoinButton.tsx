import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Platform,
  ScrollView,
  Pressable,
  type TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useRouter, usePathname } from 'expo-router';
import { Colors, Fonts, Radius } from '../constants/theme';
import { useJoinByInviteCode } from '../hooks/api';
import { withReturnTo } from '../utils/navigationReturn';
import { NoGroupForActionModal } from './NoGroupForActionModal';

const webInputNoFocusRing = {
  outlineWidth: 0,
  outlineStyle: 'none',
} as unknown as TextStyle;

type Props = {
  userId: string | undefined;
  /** Groups where the user can host events (member or admin), same rule as Events tab */
  eventEligibleGroupCount: number;
};

export function CreateOrJoinButton({ userId, eventEligibleGroupCount }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const joinByCode = useJoinByInviteCode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [noGroupFor, setNoGroupFor] = useState<'event' | 'poll' | null>(null);
  const [inviteCode, setInviteCode] = useState('');

  const closeMenu = () => setMenuOpen(false);

  const onNewEvent = () => {
    closeMenu();
    if (eventEligibleGroupCount === 0) {
      setNoGroupFor('event');
      return;
    }
    router.push(withReturnTo('/create-event', pathname));
  };

  const onNewGroup = () => {
    closeMenu();
    router.push(withReturnTo('/create-group', pathname));
  };

  const onNewPoll = () => {
    closeMenu();
    if (eventEligibleGroupCount === 0) {
      setNoGroupFor('poll');
      return;
    }
    router.push(withReturnTo('/create-poll', pathname));
  };

  const onJoinSubmit = () => {
    if (!userId?.trim() || !inviteCode.trim()) return;
    joinByCode.mutate(
      { inviteCode: inviteCode.trim(), userId },
      {
        onSuccess: (data: { groupName?: string; status?: string }) => {
          setInviteCode('');
          const msg =
            data?.status === 'joined'
              ? `Joined ${data.groupName || 'the group'}`
              : `Submitted request to join ${data.groupName || 'the group'}`;
          Toast.show({ type: 'success', text1: msg });
          closeMenu();
        },
        onError: (e: any) => {
          const msg = e?.body?.error ?? e?.message ?? 'Invalid invite code';
          Toast.show({ type: 'error', text1: msg });
        },
      }
    );
  };

  return (
    <>
      <TouchableOpacity onPress={() => setMenuOpen(true)} style={styles.trigger}>
        <Text style={styles.triggerText}>+ Add</Text>
      </TouchableOpacity>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={closeMenu}>
        <View style={styles.menuRoot}>
          <Pressable style={styles.menuBackdropFill} onPress={closeMenu} />
          <View style={styles.menuCardOuter}>
            <View style={styles.menuCard}>
              <View style={styles.menuHeader}>
                <Text style={styles.menuTitle}>Create or join</Text>
                <TouchableOpacity onPress={closeMenu} style={styles.menuClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.menuScroll}
              >
                <TouchableOpacity style={styles.menuRow} onPress={onNewEvent} activeOpacity={0.7}>
                  <View style={styles.menuRowIcon}>
                    <Ionicons name="calendar-outline" size={22} color={Colors.text} />
                  </View>
                  <View style={styles.menuRowText}>
                    <Text style={styles.menuRowTitle}>New event</Text>
                    <Text style={styles.menuRowSubtitle}>Schedule something for your groups</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuRow} onPress={onNewPoll} activeOpacity={0.7}>
                  <View style={styles.menuRowIcon}>
                    <Ionicons name="bar-chart-outline" size={22} color={Colors.text} />
                  </View>
                  <View style={styles.menuRowText}>
                    <Text style={styles.menuRowTitle}>New poll</Text>
                    <Text style={styles.menuRowSubtitle}>Create a poll for your groups</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuRow} onPress={onNewGroup} activeOpacity={0.7}>
                  <View style={styles.menuRowIcon}>
                    <Ionicons name="people-outline" size={22} color={Colors.text} />
                  </View>
                  <View style={styles.menuRowText}>
                    <Text style={styles.menuRowTitle}>New group</Text>
                    <Text style={styles.menuRowSubtitle}>Start a group others can join</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                </TouchableOpacity>

                <View style={styles.menuDivider} />

                <Text style={styles.inviteHeading}>Join with invite code</Text>
                <Text style={styles.inviteDesc}>Got an invite link or code? Enter it here.</Text>
                <View style={styles.inviteRow}>
                  <TextInput
                    value={inviteCode}
                    onChangeText={setInviteCode}
                    placeholder="Enter invite code"
                    placeholderTextColor={Colors.textMuted}
                    style={[styles.inviteInput, Platform.OS === 'web' && webInputNoFocusRing]}
                    autoCapitalize="characters"
                  />
                  <TouchableOpacity
                    onPress={onJoinSubmit}
                    style={[styles.inviteJoinBtn, { opacity: inviteCode.trim() && userId ? 1 : 0.4 }]}
                    disabled={!inviteCode.trim() || !userId || joinByCode.isPending}
                  >
                    <Text style={styles.inviteJoinBtnText}>{joinByCode.isPending ? 'Joining…' : 'Join'}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      <NoGroupForActionModal
        visible={noGroupFor !== null}
        variant={noGroupFor === 'poll' ? 'poll' : 'event'}
        onDismiss={() => setNoGroupFor(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 34,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: Colors.accent,
  },
  triggerText: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  menuRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuBackdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
  },
  menuCardOuter: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '88%',
    paddingHorizontal: 20,
    zIndex: 1,
  },
  menuCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: Colors.border,
    width: '100%',
    maxHeight: '100%',
    overflow: 'hidden',
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  menuTitle: { fontSize: 18, fontFamily: Fonts.extraBold, color: Colors.text },
  menuClose: { padding: 4 },
  menuScroll: { padding: 16, paddingBottom: 24 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  menuRowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRowText: { flex: 1, minWidth: 0 },
  menuRowTitle: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.text },
  menuRowSubtitle: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textMuted, marginTop: 2 },
  menuDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 8,
  },
  inviteHeading: { fontSize: 14, fontFamily: Fonts.bold, color: Colors.text, marginBottom: 4 },
  inviteDesc: { fontSize: 13, color: Colors.textMuted, fontFamily: Fonts.regular, marginBottom: 12 },
  inviteRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  inviteInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    fontSize: 14,
    color: Colors.text,
    fontFamily: Fonts.regular,
  },
  inviteJoinBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
  },
  inviteJoinBtnText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentFg },
});
