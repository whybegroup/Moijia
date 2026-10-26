import { Image, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, Redirect } from 'expo-router';
import Head from 'expo-router/head';
import { useAuth } from '../contexts/AuthContext';
import { needsEmailVerification } from '../config/firebase';
import { Colors, Fonts, Radius } from '../constants/theme';
import { PRIVACY_PATH, SUPPORT_PATH, TERMS_PATH } from '../constants/legal';

const PURPOSE =
  'moijia is a group workspace. People in a group plan events, run polls, post updates and comments, and keep photos, videos, and files in shared storage.';

export default function Index() {
  const { user, loading } = useAuth();

  if (Platform.OS !== 'web') {
    return <Redirect href="/(tabs)/groups" />;
  }

  if (!loading && user && !needsEmailVerification(user)) {
    return <Redirect href="/(tabs)/groups" />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <Head>
        <title>moijia</title>
        <meta name="description" content={PURPOSE} />
      </Head>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Image
          source={require('../../assets/favicon.png')}
          style={styles.logo}
          accessibilityLabel="moijia"
        />
        <Text style={styles.name}>moijia</Text>
        <Text style={styles.lead}>{PURPOSE}</Text>

        <View style={styles.list}>
          <Text style={styles.item}>Plan events and track who is going.</Text>
          <Text style={styles.item}>Ask the group with polls.</Text>
          <Text style={styles.item}>Share posts and comments.</Text>
          <Text style={styles.item}>Store photos, videos, and files together.</Text>
        </View>

        <Text style={styles.note}>
          Sign in with Google or email to open your groups. You can read this page, the privacy
          policy, and the terms of service without an account.
        </Text>

        <Link href="/login" style={styles.signIn}>
          Sign in
        </Link>

        <View style={styles.legal}>
          <Link href={PRIVACY_PATH} style={styles.legalLink}>
            Privacy Policy
          </Link>
          <Text style={styles.dot}>·</Text>
          <Link href={TERMS_PATH} style={styles.legalLink}>
            Terms of Service
          </Link>
          <Text style={styles.dot}>·</Text>
          <Link href={SUPPORT_PATH} style={styles.legalLink}>
            Support
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 40,
    alignItems: 'flex-start',
  },
  logo: {
    width: 64,
    height: 64,
    marginBottom: 16,
  },
  name: {
    fontFamily: Fonts.extraBold,
    fontSize: 32,
    lineHeight: 38,
    color: Colors.text,
    letterSpacing: -0.6,
  },
  lead: {
    marginTop: 16,
    fontFamily: Fonts.regular,
    fontSize: 16,
    lineHeight: 24,
    color: Colors.text,
  },
  list: {
    marginTop: 20,
    gap: 8,
  },
  item: {
    fontFamily: Fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.text,
  },
  note: {
    marginTop: 20,
    fontFamily: Fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textSub,
  },
  signIn: {
    marginTop: 24,
    alignSelf: 'stretch',
    textAlign: 'center',
    backgroundColor: Colors.accent,
    color: Colors.accentFg,
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    lineHeight: 22,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  legal: {
    marginTop: 28,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  legalLink: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: '#2d668b',
    textDecorationLine: 'underline',
  },
  dot: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: Colors.textMuted,
  },
});
