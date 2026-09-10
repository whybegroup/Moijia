import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, Radius } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';
import { needsEmailVerification, sendVerificationEmail } from '../config/firebase';
import { useAppRouter as useRouter } from '../hooks/useAppRouter';

function showMessage(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(message);
  else Alert.alert(title, message);
}

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { user, signOut, reloadUser } = useAuth();
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const sentOnMount = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      void reloadUser();
    }, 4000);
    return () => clearInterval(id);
  }, [reloadUser]);

  useEffect(() => {
    if (sentOnMount.current || !user?.email || user.emailVerified) return;
    sentOnMount.current = true;
    void sendVerificationEmail().catch((err: unknown) => {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
      if (code === 'auth/too-many-requests') return;
      showMessage(
        'Could not send email',
        'Could not send a verification email. Use Resend email, and check spam.'
      );
    });
  }, [user]);

  const handleResend = async () => {
    if (sending) return;
    setSending(true);
    try {
      await sendVerificationEmail();
      showMessage('Email sent', 'Check your inbox (and spam) for the verification link.');
    } catch (err: unknown) {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
      showMessage(
        'Could not send email',
        code === 'auth/too-many-requests'
          ? 'Too many attempts. Please wait a bit and try again.'
          : 'Could not send a verification email. Try again later.'
      );
    } finally {
      setSending(false);
    }
  };

  const handleChecked = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const next = await reloadUser();
      if (needsEmailVerification(next)) {
        showMessage('Not verified yet', 'Open the link in your email, then try again.');
        return;
      }
      router.replace('/(tabs)/groups');
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.body}>
          We sent a verification link to{user?.email ? ` ${user.email}` : ' your email'}. Open it
          before using moijia.
        </Text>
        <TouchableOpacity
          onPress={() => void handleChecked()}
          disabled={checking || sending}
          style={styles.primary}
          accessibilityRole="button"
          accessibilityLabel="I have verified my email"
        >
          {checking ? (
            <ActivityIndicator color={Colors.accentFg} />
          ) : (
            <Text style={styles.primaryText}>I have verified</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => void handleResend()}
          disabled={checking || sending}
          style={styles.secondary}
          accessibilityRole="button"
          accessibilityLabel="Resend verification email"
        >
          {sending ? (
            <ActivityIndicator color={Colors.text} />
          ) : (
            <Text style={styles.secondaryText}>Resend email</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => void signOut()}
          disabled={checking || sending}
          style={styles.signOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  safe: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    marginBottom: 12,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    marginBottom: 28,
  },
  primary: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryText: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  secondary: {
    marginTop: 12,
    borderRadius: Radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
  },
  secondaryText: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.text },
  signOut: { marginTop: 20, alignItems: 'center', paddingVertical: 8 },
  signOutText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    textDecorationLine: 'underline',
  },
});
