import { Fragment } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants/theme';

export type BreadcrumbSegment = {
  label: string;
  onPress?: () => void;
  /** When true (typically on the last segment), shows a small chevron after the label. */
  showSwitchChevron?: boolean;
};

export type GroupsBreadcrumbTrailProps = {
  segments: BreadcrumbSegment[];
};

export function GroupsBreadcrumbTrail({ segments }: GroupsBreadcrumbTrailProps) {
  return (
    <View style={styles.breadcrumbBar}>
      <View style={styles.breadcrumbInner}>
        {segments.map((seg, i) => {
          const isLast = i === segments.length - 1;
          const textStyle =
            segments.length === 1 ? styles.breadcrumbLink : isLast ? styles.breadcrumbCurrent : styles.breadcrumbLink;
          const body = (
            <>
              <Text style={textStyle} numberOfLines={1}>
                {seg.label}
              </Text>
              {seg.showSwitchChevron ? (
                <Ionicons name="chevron-down" size={14} color={Colors.textMuted} style={styles.breadcrumbChevron} />
              ) : null}
            </>
          );
          return (
            <Fragment key={`${seg.label}-${i}`}>
              {i > 0 ? <Text style={styles.breadcrumbSep}>{' > '}</Text> : null}
              {seg.onPress ? (
                <TouchableOpacity
                  onPress={seg.onPress}
                  style={[
                    styles.breadcrumbSegTouchable,
                    isLast && segments.length > 1 && styles.breadcrumbSegTouchableLast,
                  ]}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={seg.label}
                >
                  {body}
                </TouchableOpacity>
              ) : (
                <View
                  style={[
                    styles.breadcrumbSegTouchable,
                    isLast && segments.length > 1 && styles.breadcrumbSegTouchableLast,
                  ]}
                >
                  {body}
                </View>
              )}
            </Fragment>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  breadcrumbBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: Colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  breadcrumbInner: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  breadcrumbSep: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textMuted },
  breadcrumbLink: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.textSub },
  breadcrumbCurrent: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text },
  breadcrumbSegTouchable: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  breadcrumbSegTouchableLast: { flex: 1, minWidth: 0 },
  breadcrumbChevron: { flexShrink: 0, marginTop: 1 },
});
