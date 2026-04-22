import { View, Text, StyleSheet, Platform } from 'react-native';
import type { ToastConfig } from 'react-native-toast-message';
import { Fonts } from '../constants/theme';

/** Translucent dark pill for every toast type. */
function ToastPill({ text1, text2 }: { text1?: string; text2?: string }) {
  return (
    <View style={styles.pill}>
      {text1 ? (
        <Text style={styles.line1} numberOfLines={4}>
          {text1}
        </Text>
      ) : null}
      {text2 ? (
        <Text style={styles.line2} numberOfLines={4}>
          {text2}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'center',
    maxWidth: 420,
    marginHorizontal: 28,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 9999,
    backgroundColor: 'rgba(10, 10, 10, 0.62)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35,
          shadowRadius: 12,
        }
      : { elevation: 12 }),
  },
  line1: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: '#FAFAFA',
    textAlign: 'center',
  },
  line2: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(250,250,250,0.78)',
    textAlign: 'center',
    marginTop: 4,
  },
});

export const appToastConfig: ToastConfig = {
  success: (props) => <ToastPill text1={props.text1} text2={props.text2} />,
  error: (props) => <ToastPill text1={props.text1} text2={props.text2} />,
  info: (props) => <ToastPill text1={props.text1} text2={props.text2} />,
};
