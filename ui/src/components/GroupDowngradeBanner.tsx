import { Text, View, StyleSheet } from 'react-native';
import { Colors, Fonts, Radius } from '../constants/theme';
import { GROUP_TIERS, parseSizeTier } from '../utils/groupTiers';
import { GROUP_DOWNGRADE_GRACE_DAYS } from '../utils/groupTiers';

export function GroupDowngradeBanner({
  pendingSizeTier,
  graceEndsAt,
}: {
  pendingSizeTier?: string | null;
  graceEndsAt?: Date | string | null;
}) {
  if (!pendingSizeTier || !graceEndsAt) return null;
  const ends = new Date(graceEndsAt);
  if (Number.isNaN(ends.getTime())) return null;
  const pending = parseSizeTier(pendingSizeTier);
  const spec = GROUP_TIERS[pending];

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.title}>Size change on {ends.toLocaleDateString()}</Text>
      <Text style={styles.body}>
        This group has {GROUP_DOWNGRADE_GRACE_DAYS} days to stay at its current size. After that it
        becomes {spec.label} ({spec.gb} GB
        {spec.maxMembers != null ? `, ${spec.maxMembers} members` : ', unlimited members'}). Older
        files over the new storage cap will be deleted first. New members are blocked if the group
        is still over the member cap.
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
  title: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text, marginBottom: 6 },
  body: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.regular, color: Colors.textSub },
});
