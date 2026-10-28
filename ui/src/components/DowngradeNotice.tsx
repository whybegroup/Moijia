import { StyleSheet, Text, View } from 'react-native';
import { Colors, Fonts, Radius } from '../constants/theme';
import { downgradeWarningBody } from '../utils/downgradePlan';
import { formatPlanDate } from '../utils/groupPlanPeriod';

export function DowngradeNotice({
  choosing,
  when,
  graceStarted,
}: {
  choosing: boolean;
  when: Date | null;
  graceStarted: boolean;
}) {
  const date = when ? formatPlanDate(when) : '';
  return (
    <View style={styles.notice} accessibilityRole="alert">
      <Text style={styles.noticeTitle}>{date ? `On ${date}` : 'After this plan ends'}</Text>
      <Text style={styles.noticeBody}>{downgradeWarningBody(choosing, graceStarted)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    marginTop: 8,
    marginBottom: 4,
    padding: 14,
    borderRadius: Radius.lg,
    backgroundColor: Colors.maybeBg,
    borderWidth: 1,
    borderColor: Colors.maybeBorder,
  },
  noticeTitle: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text, marginBottom: 6 },
  noticeBody: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.regular, color: Colors.textSub },
});
