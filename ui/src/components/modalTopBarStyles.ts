import { StyleSheet } from 'react-native';
import { Colors, Layout } from '../constants/theme';

/** Event modal, group modal, and `NavBar` — same bar + close geometry. */
export const modalTopBarStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: Layout.modalTopBarHeight,
    paddingHorizontal: 20,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    position: 'relative',
  },
  closeButton: {
    width: 44,
    height: 44,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -6,
  },
  /** Toolbar icons (watch / edit / delete) — same vertical bounds as close. */
  trailingIconTap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
