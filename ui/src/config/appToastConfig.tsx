import { View, Text, StyleSheet, Platform } from 'react-native';
import type { ToastConfig } from 'react-native-toast-message';
import { Colors, Fonts, Radius, Shadows } from '../constants/theme';

function ToastCard({
  text1,
  text2,
  accent,
}: {
  text1?: string;
  text2?: string;
  accent: string;
}) {
  return (
    <View style={styles.card}>
      <View style={[styles.accentBar, { backgroundColor: accent }]} />
      <View style={styles.body}>
        {text1 ? <Text style={styles.line1}>{text1}</Text> : null}
        {text2 ? <Text style={styles.line2}>{text2}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
    flexDirection: 'row',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    ...(Platform.OS === 'ios' ? (Shadows.md as object) : { elevation: 6 }),
  },
  accentBar: {
    width: 4,
  },
  body: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  line1: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    color: Colors.text,
  },
  line2: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: Colors.textSub,
    marginTop: 4,
    lineHeight: 18,
  },
});

export const appToastConfig: ToastConfig = {
  success: (props) => (
    <ToastCard text1={props.text1} text2={props.text2} accent={Colors.going} />
  ),
  error: (props) => (
    <ToastCard text1={props.text1} text2={props.text2} accent={Colors.notGoing} />
  ),
  info: (props) => (
    <ToastCard text1={props.text1} text2={props.text2} accent={Colors.maybe} />
  ),
};
