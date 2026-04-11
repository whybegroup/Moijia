import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle,
  ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform,
  type TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Shadows, Fonts } from '../constants/theme';
import { modalTopBarStyles } from './modalTopBarStyles';
import { avatarColor } from '../utils/helpers';

/** Same as Field labels — Photos and other form-style section titles. */
export const formSectionTitleStyle: TextStyle = {
  fontSize: 12,
  fontFamily: Fonts.semiBold,
  color: Colors.textSub,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  marginBottom: 6,
};

// ── Avatar ────────────────────────────────────────────────────────────────────
interface AvatarProps {
  name: string;
  size?: number;
  dot?: boolean;
  onPress?: () => void;
}
export function Avatar({ name, size = 36, dot = false, onPress }: AvatarProps) {
  const bg = avatarColor(name);
  const content = (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={{ color: '#fff', fontSize: size * 0.38, fontFamily: Fonts.bold }}>
        {name[0].toUpperCase()}
      </Text>
      {dot && (
        <View style={[styles.avatarDot, { borderRadius: 10 }]}/>
      )}
    </View>
  );
  if (onPress) return <TouchableOpacity onPress={onPress}>{content}</TouchableOpacity>;
  return content;
}

export function AvatarStack({ names, size = 22, max = 5, dotsForNames = [] }: { names: string[]; size?: number; max?: number; dotsForNames?: string[] }) {
  const shown = names.slice(0, max);
  const extra = names.length - max;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {shown.map((n, i) => (
        <View key={i} style={{ marginLeft: i > 0 ? -(size * 0.3) : 0, zIndex: shown.length - i, borderRadius: size / 2, borderWidth: 2, borderColor: Colors.surface }}>
          <Avatar name={n} size={size} dot={dotsForNames.includes(n)} />
        </View>
      ))}
      {extra > 0 && (
        <View style={[styles.avatarExtra, { width: size, height: size, borderRadius: size / 2, marginLeft: -(size * 0.3) }]}>
          <Text style={{ fontSize: size * 0.3, fontFamily: Fonts.semiBold, color: Colors.textSub }}>+{extra}</Text>
        </View>
      )}
    </View>
  );
}

// ── Pill / Chip ───────────────────────────────────────────────────────────────
interface PillProps {
  label: string;
  /** Renders before label (e.g. vector icon); avoids emoji in custom-font Text on iOS */
  leading?: React.ReactNode;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  activeColor?: string;
  activeBg?: string;
  activeText?: string;
  inactiveBorderColor?: string;
}
export function Pill({ label, leading, selected, onPress, onLongPress, activeColor, activeBg, activeText, inactiveBorderColor }: PillProps) {
  const fg = selected ? (activeText || Colors.accentFg) : Colors.textSub;
  const ff = selected ? Fonts.semiBold : Fonts.regular;
  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.pill,
        leading && styles.pillWithLeading,
        selected ? {
          borderColor: activeColor || Colors.accent,
          backgroundColor: activeBg || Colors.accent,
        } : {
          borderColor: inactiveBorderColor || Colors.border,
          backgroundColor: 'transparent',
        },
      ]}
    >
      {leading ? <View style={styles.pillLeading}>{leading}</View> : null}
      <Text style={[styles.pillText, { color: fg, fontFamily: ff }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ── Button ────────────────────────────────────────────────────────────────────
interface BtnProps {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  full?: boolean;
  small?: boolean;
}
export function Btn({ label, onPress, variant = 'primary', disabled, full, small }: BtnProps) {
  const bg = disabled ? Colors.border :
    variant === 'primary' ? Colors.accent :
    variant === 'danger'  ? Colors.notGoingBg :
    Colors.surface;
  const fg = disabled ? Colors.textMuted :
    variant === 'primary' ? Colors.accentFg :
    variant === 'danger'  ? Colors.notGoing :
    Colors.text;
  const border = variant === 'secondary' || variant === 'ghost' || variant === 'danger'
    ? Colors.border : 'transparent';

  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onPress}
      style={[styles.btn, { backgroundColor: bg, borderColor: border, width: full ? '100%' : undefined, paddingHorizontal: small ? 12 : 20, paddingVertical: small ? 7 : 10 }]}
      activeOpacity={disabled ? 1 : 0.7}
    >
      <Text style={{ color: fg, fontSize: small ? 13 : 14, fontFamily: Fonts.semiBold }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────
export function Toggle({ value, onChange, label, style, small }: { value: boolean; onChange: (v: boolean) => void; label: string; style?: StyleProp<ViewStyle>; small?: boolean }) {
  return (
    <TouchableOpacity onPress={() => onChange(!value)} style={[styles.toggleRow, small && styles.toggleSmall, !small && styles.toggleFullWidth, style]} activeOpacity={0.8}>
      <Text style={[styles.toggleLabel, small && styles.toggleLabelSmall]}>{label}</Text>
      <View style={[styles.toggleTrack, small && styles.toggleTrackSmall, { backgroundColor: value ? Colors.accent : Colors.border }]}>
        <View style={[styles.toggleThumb, small && styles.toggleThumbSmall, { left: value ? (small ? 16 : 22) : 2 }]} />
      </View>
    </TouchableOpacity>
  );
}

// ── NavBar ────────────────────────────────────────────────────────────────────
interface NavBarProps {
  /** Omit or pass empty string for no centered title */
  title?: string;
  onClose?: () => void;
  right?: React.ReactNode;
  /**
   * When true, title is centered on the full bar width; left and right slots use equal flex so
   * close + actions stay aligned without shifting the title.
   */
  centerTitle?: boolean;
}
export function NavBar({ title = '', onClose, right, centerTitle }: NavBarProps) {
  if (centerTitle) {
    return (
      <View style={modalTopBarStyles.bar}>
        <View style={styles.navBarSide}>
          {onClose ? (
            <TouchableOpacity
              onPress={onClose}
              style={modalTopBarStyles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={26} color={Colors.textSub} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 70 }} />
          )}
        </View>
        {title ? (
          <View style={styles.navTitleOverlay} pointerEvents="none">
            <Text style={styles.navTitleCentered} numberOfLines={1}>
              {title}
            </Text>
          </View>
        ) : null}
        <View style={[styles.navBarSide, styles.navBarSideEnd]}>{right}</View>
      </View>
    );
  }

  return (
    <View style={modalTopBarStyles.bar}>
      {onClose ? (
        <TouchableOpacity
          onPress={onClose}
          style={modalTopBarStyles.closeButton}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={26} color={Colors.textSub} />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 70 }} />
      )}
      {title ? (
        <Text style={styles.navTitle} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={styles.navTitleSpacer} />
      )}
      <View style={styles.navRight}>{right}</View>
    </View>
  );
}

// ── Bottom Sheet ──────────────────────────────────────────────────────────────
interface SheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Matches comment / reaction dark panels (`#2c2c2e`, dim backdrop). */
  variant?: 'light' | 'dark';
}
export function Sheet({ visible, onClose, children, variant = 'light' }: SheetProps) {
  const insets = useSafeAreaInsets();
  const isDark = variant === 'dark';
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <TouchableOpacity
          style={isDark ? styles.sheetOverlayDark : styles.sheetOverlay}
          onPress={onClose}
          activeOpacity={1}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[
              isDark ? styles.sheetContainerDark : styles.sheetContainer,
              { paddingBottom: insets.bottom + 16 },
            ]}
          >
            <View style={isDark ? styles.sheetHandleDark : styles.sheetHandle} />
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            >
              {children}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Section Label ─────────────────────────────────────────────────────────────
export function SectionLabel({ label }: { label: string }) {
  return (
    <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
export function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={styles.fieldLabel}>{label}{required ? ' *' : ''}</Text>
      {children}
    </View>
  );
}

// ── Text Input ────────────────────────────────────────────────────────────────
interface TInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  keyboardType?: any;
}
export function TInput({ value, onChange, placeholder, multiline, rows = 3, maxLength, keyboardType }: TInputProps) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={Colors.textMuted}
      multiline={multiline}
      numberOfLines={multiline ? rows : 1}
      maxLength={maxLength}
      keyboardType={keyboardType}
      style={[styles.tInput, multiline && { height: rows * 22, textAlignVertical: 'top' }]}
    />
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarDot: {
    position: 'absolute', top: -2, right: -2,
    width: 9, height: 9,
    backgroundColor: '#71717A',
    borderWidth: 2, borderColor: Colors.surface,
  },
  avatarExtra: {
    backgroundColor: Colors.border,
    borderWidth: 2, borderColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  pill: {
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1,
    flexShrink: 0,
  },
  pillWithLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pillLeading: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillText: { fontSize: 12 },
  btn: {
    borderRadius: Radius.lg, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  toggleSmall: {
    paddingVertical: 0, borderBottomWidth: 0, gap: 8,
  },
  toggleFullWidth: { width: '100%', alignSelf: 'stretch' },
  toggleLabel: { fontSize: 14, color: Colors.text, fontFamily: Fonts.regular, flex: 1 },
  toggleLabelSmall: { fontSize: 12, flex: 0 },
  toggleTrack: { width: 44, height: 24, borderRadius: 12, position: 'relative', flexShrink: 0 },
  toggleTrackSmall: { width: 34, height: 20, borderRadius: 10 },
  toggleThumb: {
    position: 'absolute', top: 2, width: 20, height: 20,
    borderRadius: 10, backgroundColor: '#fff',
    ...Shadows.sm,
  },
  toggleThumbSmall: {
    width: 16, height: 16, borderRadius: 8,
  },
  navBarSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minWidth: 0,
    zIndex: 1,
  },
  navBarSideEnd: {
    justifyContent: 'flex-end',
  },
  navTitleOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 96,
  },
  navTitleCentered: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Colors.text,
    textAlign: 'center',
    maxWidth: '100%',
  },
  navTitle: { flex: 1, fontSize: 16, fontFamily: Fonts.bold, color: Colors.text, textAlign: 'center', minWidth: 0 },
  navTitleSpacer: { flex: 1, minWidth: 0 },
  navRight: { alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 },
  sheetOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheetOverlayDark: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' },
  sheetContainer: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    maxHeight: '85%', paddingHorizontal: 20,
  },
  sheetContainerDark: {
    backgroundColor: '#2c2c2e',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '85%',
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  sheetHandle: {
    width: 32, height: 3, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center',
    marginTop: 10, marginBottom: 4,
  },
  sheetHandleDark: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.28)',
    marginTop: 8,
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 11, fontFamily: Fonts.semiBold,
    color: Colors.textMuted, letterSpacing: 0.8,
    marginBottom: 10,
  },
  fieldLabel: formSectionTitleStyle,
  tInput: {
    padding: 10, paddingHorizontal: 14,
    borderRadius: Radius.lg, borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    fontSize: 14, color: Colors.text,
    fontFamily: Fonts.regular,
  },
});
