import { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Platform,
  Pressable,
  type ScrollView,
  type TextStyle,
} from 'react-native';
import { KeyboardFormRoot, KeyboardSafeScrollView } from './KeyboardSafeScrollView';
import { edgeToEdgeModalProps } from './edgeToEdgeModalProps';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { usePathname } from 'expo-router';
import { useAppRouter as useRouter } from '../hooks/useAppRouter';
import { useGuardedPress } from '../hooks/useGuardedPress';
import { Colors, Fonts, Radius } from '../constants/theme';
import { useJoinByInviteCode } from '../hooks/api';
import { showJoinGroupToast } from '../utils/joinGroupToast';
import { withReturnTo } from '../utils/navigationReturn';
import { NoGroupForActionModal } from './NoGroupForActionModal';

const webInputNoFocusRing = {
  outlineWidth: 0,
  outlineStyle: 'none',
} as unknown as TextStyle;

export type CreateOrJoinMode = 'event' | 'poll' | 'group';

type Props = {
  userId: string | undefined;
  /** Groups where the user can host events (member or admin), same rule as Events tab */
  eventEligibleGroupCount: number;
  /** Limits Add to the current tab’s action (event / poll / group+join). */
  mode: CreateOrJoinMode;
  /** When set, create event/poll in this group (skips the group picker). */
  groupId?: string;
  /** Header matches the 34px tab-bar icons; fab is the bottom-right overlay. */
  variant?: 'fab' | 'header';
};

export function CreateOrJoinButton({
  userId,
  eventEligibleGroupCount,
  mode,
  groupId,
  variant = 'fab',
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const joinByCode = useJoinByInviteCode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [noGroupFor, setNoGroupFor] = useState<'event' | 'poll' | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const menuScrollRef = useRef<ScrollView>(null);

  const closeMenu = () => setMenuOpen(false);

  const scrollInviteIntoView = () => {
    if (Platform.OS === 'web') return;
    requestAnimationFrame(() => {
      menuScrollRef.current?.scrollToEnd({ animated: true });
    });
  };

  const goNewEvent = () => {
    closeMenu();
    if (!groupId && eventEligibleGroupCount === 0) {
      setNoGroupFor('event');
      return;
    }
    const path = groupId
      ? `/create-event?groupId=${encodeURIComponent(groupId)}`
      : '/create-event';
    router.push(withReturnTo(path, pathname));
  };

  const goNewGroup = () => {
    closeMenu();
    router.push(withReturnTo('/create-group', pathname));
  };

  const goNewPoll = () => {
    closeMenu();
    if (!groupId && eventEligibleGroupCount === 0) {
      setNoGroupFor('poll');
      return;
    }
    const path = groupId
      ? `/create-poll?groupId=${encodeURIComponent(groupId)}`
      : '/create-poll';
    router.push(withReturnTo(path, pathname));
  };

  const onNewGroup = useGuardedPress(goNewGroup);

  const onAddPress = useGuardedPress(() => {
    if (mode === 'event') {
      goNewEvent();
      return;
    }
    if (mode === 'poll') {
      goNewPoll();
      return;
    }
    setMenuOpen(true);
  });

  const onJoinSubmit = useGuardedPress(() => {
    if (!userId?.trim() || !inviteCode.trim()) return;
    joinByCode.mutate(
      { inviteCode: inviteCode.trim(), userId },
      {
        onSuccess: (data: { groupName?: string; status?: string; alreadyMember?: boolean }) => {
          setInviteCode('');
          showJoinGroupToast(data);
          closeMenu();
        },
        onError: (e: any) => {
          const msg = e?.body?.error ?? e?.message ?? 'Invalid invite code';
          Toast.show({ type: 'error', text1: msg });
        },
      }
    );
  }, { disabled: joinByCode.isPending, cooldownMs: 800 });

  return (
    <>
      <TouchableOpacity
        onPress={onAddPress}
        style={
          variant === 'header'
            ? [styles.headerBtn, menuOpen && styles.headerBtnActive]
            : [styles.fab, menuOpen && styles.fabActive]
        }
        accessibilityLabel="Add"
        accessibilityRole="button"
        activeOpacity={0.85}
        hitSlop={variant === 'header' ? 8 : undefined}
      >
        <Ionicons name="add" size={variant === 'header' ? 20 : 32} color={Colors.text} />
      </TouchableOpacity>

      {mode === 'group' ? (
        <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={closeMenu} {...edgeToEdgeModalProps}>
          <KeyboardFormRoot style={styles.menuRoot}>
            <Pressable style={styles.menuBackdropFill} onPress={closeMenu} />
            <View style={styles.menuCardOuter}>
              <View style={styles.menuCard}>
                <View style={styles.menuHeader}>
                  <Text style={styles.menuTitle}>Create or join</Text>
                  <TouchableOpacity
                    onPress={closeMenu}
                    style={styles.menuClose}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="close" size={22} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
                <KeyboardSafeScrollView
                  ref={menuScrollRef}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.menuScroll}
                >
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
                      onFocus={scrollInviteIntoView}
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
                      <Text style={styles.inviteJoinBtnText}>
                        {joinByCode.isPending ? 'Joining…' : 'Join'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </KeyboardSafeScrollView>
              </View>
            </View>
          </KeyboardFormRoot>
        </Modal>
      ) : null}

      <NoGroupForActionModal
        visible={noGroupFor !== null}
        variant={noGroupFor === 'poll' ? 'poll' : 'event'}
        onDismiss={() => setNoGroupFor(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnActive: {
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.bg,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  fabActive: {
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.bg,
  },
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
    flexGrow: 0,
    paddingHorizontal: 20,
    zIndex: 1,
  },
  menuCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: Colors.border,
    width: '100%',
    flexGrow: 0,
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
