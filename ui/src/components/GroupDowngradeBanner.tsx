import { Text, View, StyleSheet } from 'react-native';
import { Colors, Fonts, Radius } from '../constants/theme';
import { GROUP_TIERS, parseSizeTier } from '../utils/groupTiers';

function formatWhen(raw: Date | string | null | undefined): string | null {
  if (!raw) return null;
  const ends = new Date(raw);
  if (Number.isNaN(ends.getTime())) return null;
  return ends.toLocaleDateString();
}

export function GroupDowngradeBanner({
  pendingSizeTier,
  graceEndsAt,
  deletionScheduledAt,
  uploadsClosed = true,
  compact = false,
}: {
  pendingSizeTier?: string | null;
  graceEndsAt?: Date | string | null;
  deletionScheduledAt?: Date | string | null;
  /** False while the plan is still active and the deletion date is only planned. */
  uploadsClosed?: boolean;
  compact?: boolean;
}) {
  const deletionWhen = formatWhen(deletionScheduledAt);
  if (deletionScheduledAt) {
    const when = deletionWhen ? `on ${deletionWhen}` : 'soon';
    return (
      <View style={[styles.banner, styles.bannerDanger, compact && styles.bannerCompact]} accessibilityRole="alert">
        <Text style={styles.title}>
          {deletionWhen ? `This group will be deleted on ${deletionWhen}` : 'This group will be deleted'}
        </Text>
        <Text style={styles.body}>
          {uploadsClosed
            ? `Unless this group is moved into Kept, it is permanently deleted ${when}, including its files. New uploads are closed. You can still download or delete files until then.`
            : `Unless this group is moved into Kept, it is permanently deleted ${when}, including its files. The plan keeps working until it ends. You can still download, delete files, or transfer the group.`}
        </Text>
      </View>
    );
  }

  if (!pendingSizeTier || !graceEndsAt) return null;
  const ends = formatWhen(graceEndsAt);
  if (!ends) return null;
  const pending = parseSizeTier(pendingSizeTier);
  const spec = GROUP_TIERS[pending];

  return (
    <View style={[styles.banner, compact && styles.bannerCompact]} accessibilityRole="alert">
      <Text style={styles.title}>Size change on {ends}</Text>
      <Text style={styles.body}>
        {`New uploads stop once this group is over ${spec.gb} GB. You can still download, delete files, or transfer it until ${ends}. On that date it becomes ${spec.label} (${spec.gb} GB), and older files over that limit are removed.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 14,
    borderRadius: Radius.lg,
    backgroundColor: Colors.maybeBg,
    borderWidth: 1,
    borderColor: Colors.maybeBorder,
  },
  bannerCompact: {
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 14,
  },
  bannerDanger: {
    backgroundColor: Colors.notGoingBg,
    borderColor: '#FECACA',
  },
  title: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text, marginBottom: 6 },
  body: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.regular, color: Colors.textSub },
});
