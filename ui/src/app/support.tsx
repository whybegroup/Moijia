import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppRouter as useRouter } from '../hooks/useAppRouter';
import { Colors, Fonts, Radius } from '../constants/theme';
import { LEGAL_CONTACT_EMAIL } from '../constants/legal';
import { NavBar } from '../components/ui';

const MAILTO = `mailto:${LEGAL_CONTACT_EMAIL}?subject=${encodeURIComponent('moijia support')}`;

export default function SupportScreen() {
  const router = useRouter();

  const openEmail = () => {
    void Linking.openURL(MAILTO).catch(() => {
      if (Platform.OS === 'web') window.alert(`Email ${LEGAL_CONTACT_EMAIL}`);
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <NavBar
        title="Support"
        centerTitle
        onClose={router.canGoBack() ? () => router.back() : undefined}
      />
      <View style={styles.body}>
        <Text style={styles.lead}>Need help with moijia? Send us an email and we will get back to you.</Text>
        <TouchableOpacity
          onPress={openEmail}
          style={styles.emailBtn}
          accessibilityRole="link"
          accessibilityLabel={`Email ${LEGAL_CONTACT_EMAIL}`}
        >
          <Text style={styles.emailBtnText}>Email {LEGAL_CONTACT_EMAIL}</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>
          For storage subscriptions, you can also manage or cancel in your Apple, Google, or web
          store settings.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  body: { paddingHorizontal: 20, paddingTop: 16 },
  lead: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    marginBottom: 20,
  },
  emailBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
  },
  emailBtnText: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  hint: {
    marginTop: 16,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
});
