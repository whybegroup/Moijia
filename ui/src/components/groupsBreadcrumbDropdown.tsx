import { useState, useMemo, type ReactNode } from 'react';
import type { BreadcrumbSegment } from './GroupsBreadcrumbTrail';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Shadows } from '../constants/theme';
import { edgeToEdgeModalProps } from './edgeToEdgeModalProps';
import { clampToWebAppColumn, toWebAppColumnX, webAppColumnWidth } from '../utils/webAppColumnCoords';

export type BreadcrumbDropdownItem = {
  id: string;
  label: string;
};

/** Vertical gap between breadcrumb chevron and dropdown menu top. */
export const BREADCRUMB_DROPDOWN_TOP_OFFSET = 18;

export const BREADCRUMB_DROPDOWN_MENU_WIDTH = 240;
export const BREADCRUMB_DROPDOWN_GROUP_MENU_WIDTH = 200;

export function breadcrumbDropdownTop(anchorY?: number | null): number {
  return Math.max(12, (anchorY ?? 0) + BREADCRUMB_DROPDOWN_TOP_OFFSET);
}

export function breadcrumbDropdownLeft(
  anchorX?: number | null,
  menuWidth: number = BREADCRUMB_DROPDOWN_MENU_WIDTH
): number {
  const raw =
    anchorX == null
      ? webAppColumnWidth() - menuWidth - 12
      : toWebAppColumnX(anchorX) - menuWidth + 20;
  return clampToWebAppColumn(raw, menuWidth, 12);
}

export const groupsBreadcrumbDropdownStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  overlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
  },
  card: {
    position: 'absolute',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 0,
    paddingHorizontal: 0,
    maxHeight: 320,
    overflow: 'hidden',
    ...Shadows.lg,
  },
  list: { maxHeight: 300 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  rowBorderTop: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  rowSelected: {
    backgroundColor: Colors.bg,
  },
  rowPressed: {
    backgroundColor: '#E4E4E7',
  },
  rowPressedSelected: {
    backgroundColor: Colors.borderStrong,
  },
  rowText: { flex: 1, fontSize: 15, fontFamily: Fonts.medium, color: Colors.text },
  rowTextSelected: { fontFamily: Fonts.regular, color: Colors.textMuted },
});

type GroupsBreadcrumbDropdownModalProps = {
  visible: boolean;
  onClose: () => void;
  anchor: { x: number; y: number } | null;
  items: BreadcrumbDropdownItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  menuWidth?: number;
};

export function GroupsBreadcrumbDropdownModal({
  visible,
  onClose,
  anchor,
  items,
  selectedId,
  onSelect,
  menuWidth = BREADCRUMB_DROPDOWN_MENU_WIDTH,
}: GroupsBreadcrumbDropdownModalProps) {
  if (!visible || items.length === 0) {
    return null;
  }

  const menuLeft = breadcrumbDropdownLeft(anchor?.x, menuWidth);
  const menuTop = breadcrumbDropdownTop(anchor?.y);

  return (
    <Modal {...edgeToEdgeModalProps} visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={groupsBreadcrumbDropdownStyles.overlay}>
        <TouchableOpacity
          style={groupsBreadcrumbDropdownStyles.overlayBackdrop}
          onPress={onClose}
          activeOpacity={1}
        />
        <View style={[groupsBreadcrumbDropdownStyles.card, { top: menuTop, left: menuLeft, width: menuWidth }]}>
          <ScrollView style={groupsBreadcrumbDropdownStyles.list} keyboardShouldPersistTaps="handled">
            {items.map((item, idx) => {
              const isSelected = item.id === selectedId;
              const prevSelected = idx > 0 && items[idx - 1].id === selectedId;
              const showBorderTop = idx > 0 && !isSelected && !prevSelected;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    onClose();
                    onSelect(item.id);
                  }}
                  style={({ pressed }) => [
                    groupsBreadcrumbDropdownStyles.row,
                    showBorderTop && groupsBreadcrumbDropdownStyles.rowBorderTop,
                    isSelected && groupsBreadcrumbDropdownStyles.rowSelected,
                    pressed &&
                      (isSelected
                        ? groupsBreadcrumbDropdownStyles.rowPressedSelected
                        : groupsBreadcrumbDropdownStyles.rowPressed),
                  ]}
                  android_ripple={{ color: 'rgba(24, 24, 27, 0.14)' }}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text
                    style={[
                      groupsBreadcrumbDropdownStyles.rowText,
                      isSelected && groupsBreadcrumbDropdownStyles.rowTextSelected,
                    ]}
                    numberOfLines={2}
                  >
                    {item.label}
                  </Text>
                  {!isSelected ? (
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

type GroupSwitchChevronProps = Pick<
  BreadcrumbSegment,
  'showSwitchChevron' | 'switchChevronOpen' | 'onSwitchChevronPress'
>;

export function useGroupsBreadcrumbGroupSwitch(
  currentGroup: { id: string; name: string } | null | undefined,
  orderedSwitcherGroups: { id: string; name: string }[],
  onSwitchGroup?: (groupId: string) => void
): { chevronProps: Partial<GroupSwitchChevronProps>; modal: ReactNode } {
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  const isSwitchable = !!currentGroup && orderedSwitcherGroups.length > 1 && !!onSwitchGroup;

  const items = useMemo(
    (): BreadcrumbDropdownItem[] =>
      orderedSwitcherGroups.map((g) => ({ id: g.id, label: g.name })),
    [orderedSwitcherGroups]
  );

  const chevronProps = useMemo(
    () =>
      isSwitchable
        ? {
            showSwitchChevron: true as const,
            switchChevronOpen: visible,
            onSwitchChevronPress: (a: { x: number; y: number }) => {
              setAnchor(a);
              setVisible((open) => !open);
            },
          }
        : {},
    [isSwitchable, visible]
  );

  const modal =
    isSwitchable && currentGroup ? (
      <GroupsBreadcrumbDropdownModal
        visible={visible}
        onClose={() => setVisible(false)}
        anchor={anchor}
        items={items}
        selectedId={currentGroup.id}
        onSelect={onSwitchGroup}
        menuWidth={BREADCRUMB_DROPDOWN_GROUP_MENU_WIDTH}
      />
    ) : null;

  return { chevronProps, modal };
}
