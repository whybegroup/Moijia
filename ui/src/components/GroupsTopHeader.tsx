import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors, Fonts, Layout } from '../constants/theme';
import { GroupsPeopleGlyph } from './TabScreenIcons';
import { CreateOrJoinButton } from './CreateOrJoinButton';

export type GroupsTopHeaderProps = {
  userId?: string;
  eventEligibleGroupCount: number;
  showNotifs: boolean;
  onToggleNotifs: () => void;
  unreadCount: number;
  /** Inserted after create/join, before the bell (e.g. draft Save/Reset on group detail). */
  trailingActions?: ReactNode;
};

export function GroupsTopHeader({
  userId,
  eventEligibleGroupCount,
  showNotifs,
  onToggleNotifs,
  unreadCount,
  trailingActions,
}: GroupsTopHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTitleRow}>
        <GroupsPeopleGlyph size={22} color={Colors.text} />
        <Text style={styles.title} numberOfLines={1}>
          Groups
        </Text>
      </View>
      <View style={styles.headerActions}>
        <CreateOrJoinButton userId={userId} eventEligibleGroupCount={eventEligibleGroupCount} />
        {trailingActions}
        <TouchableOpacity
          onPress={onToggleNotifs}
          style={[styles.iconBtn, showNotifs && { borderColor: Colors.borderStrong, backgroundColor: Colors.bg }]}
        >
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={Colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </Svg>
          {unreadCount > 0 && <View style={styles.bellDot} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: Layout.tabHeaderMinHeight,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  title: { fontSize: 18, fontFamily: Fonts.extraBold, color: Colors.text, flexShrink: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.notGoing,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
});
