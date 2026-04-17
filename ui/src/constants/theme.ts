import { StyleSheet, Platform } from 'react-native';

// ── Colors ────────────────────────────────────────────────────────────────────
export const Colors = {
  bg:           '#F4F4F5',
  surface:      '#FFFFFF',
  border:       '#EBEBEA',
  borderStrong: '#D4D4D2',
  text:         '#18181B',
  textSub:      '#71717A',
  textMuted:    '#A1A1AA',
  accent:       '#18181B',
  accentFg:     '#FAFAF9',
  going:        '#16A34A',
  goingBg:      '#F0FDF4',
  goingBorder:  '#BBF7D0',
  maybe:        '#D97706',
  maybeBg:      '#FFFBEB',
  maybeBorder:  '#FDE68A',
  notGoing:     '#DC2626',
  notGoingBg:   '#FEF2F2',
  todayRed:     '#EF4444',
  overlay:      'rgba(0,0,0,0.32)',
};

// Group palettes
export const GroupPalettes = [
  { row:'#FFF0F6', cal:'#F9A8D4', text:'#9D174D', dot:'#EC4899', label:'#FCE4EE' },
  { row:'#EFF6FF', cal:'#93C5FD', text:'#1E40AF', dot:'#3B82F6', label:'#DBEAFE' },
  { row:'#F0FDF4', cal:'#86EFAC', text:'#14532D', dot:'#22C55E', label:'#DCFCE7' },
  { row:'#FFFBEB', cal:'#FCD34D', text:'#78350F', dot:'#F59E0B', label:'#FEF3C7' },
  { row:'#F5F3FF', cal:'#C4B5FD', text:'#4C1D95', dot:'#8B5CF6', label:'#EDE9FE' },
];

// ── Typography ────────────────────────────────────────────────────────────────
export const Fonts = {
  regular:    'DMSans_400Regular',
  medium:     'DMSans_500Medium',
  semiBold:   'DMSans_700Bold',
  bold:       'DMSans_700Bold',
  extraBold:  'DMSans_700Bold',
};

export const TextStyles = StyleSheet.create({
  h1:      { fontFamily: 'DMSans_700Bold', fontSize: 22, color: Colors.text, lineHeight: 28 },
  h2:      { fontFamily: 'DMSans_700Bold',       fontSize: 18, color: Colors.text, lineHeight: 24 },
  h3:      { fontFamily: 'DMSans_700Bold',       fontSize: 16, color: Colors.text, lineHeight: 22 },
  body:    { fontFamily: 'DMSans_400Regular',    fontSize: 14, color: Colors.text, lineHeight: 20 },
  bodySm:  { fontFamily: 'DMSans_400Regular',    fontSize: 13, color: Colors.text, lineHeight: 18 },
  caption: { fontFamily: 'DMSans_400Regular',    fontSize: 12, color: Colors.textMuted, lineHeight: 16 },
  label:   { fontFamily: 'DMSans_600SemiBold',   fontSize: 12, color: Colors.textSub },
  mono:    { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 14 },
});

// ── Spacing ───────────────────────────────────────────────────────────────────
export const Spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 28,
};

/** Tab chrome: top bar height matches 16px vertical padding + 34px controls (icon buttons). */
export const Layout = {
  tabHeaderMinHeight: Spacing.lg * 2 + 34,
  /** Modal NavBar / event detail header; tightened to reduce vertical chrome. */
  modalTopBarHeight: 60,
};

// ── Border Radius ─────────────────────────────────────────────────────────────
export const Radius = {
  sm:   6,
  md:   8,
  lg:   12,
  xl:   16,
  '2xl':20,
  full: 9999,
};

// ── Shadows ───────────────────────────────────────────────────────────────────
export const Shadows = {
  xs: Platform.select({
    ios:     { shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.05, shadowRadius:2 },
    android: { elevation: 1 },
    web:     { boxShadow:'0 1px 2px rgba(0,0,0,0.05)' },
  }),
  sm: Platform.select({
    ios:     { shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.08, shadowRadius:3 },
    android: { elevation: 2 },
    web:     { boxShadow:'0 1px 3px rgba(0,0,0,0.08)' },
  }),
  md: Platform.select({
    ios:     { shadowColor:'#000', shadowOffset:{width:0,height:4}, shadowOpacity:0.08, shadowRadius:12 },
    android: { elevation: 4 },
    web:     { boxShadow:'0 4px 12px rgba(0,0,0,0.08)' },
  }),
  lg: Platform.select({
    ios:     { shadowColor:'#000', shadowOffset:{width:0,height:10}, shadowOpacity:0.10, shadowRadius:24 },
    android: { elevation: 8 },
    web:     { boxShadow:'0 10px 24px rgba(0,0,0,0.10)' },
  }),
};
