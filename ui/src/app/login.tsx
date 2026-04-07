import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform, TextInput, ScrollView, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from '../config/firebase';
import { googleIosClientId, googleWebClientId } from '../config/googleAuth';
import { signInWithGoogleIdTokenNative } from '../config/googleSignIn';
import { Colors, Fonts, Radius, Shadows } from '../constants/theme';

type AuthMode = 'signin' | 'signup';

function authErrorMessage(code: string | undefined): string | undefined {
  if (!code) return undefined;
  const map: Record<string, string> = {
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/email-already-in-use': 'An account with this email already exists. Try signing in instead.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/operation-not-allowed': 'Email/password sign-in is not enabled. Contact support.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled',
    'auth/popup-blocked': 'Pop-up was blocked. Please allow pop-ups for this site.',
  };
  return map[code];
}

/** Android Google Sign-In status 10 = DEVELOPER_ERROR (SHA-1 / OAuth client mismatch). */
function nativeGoogleSignInHint(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('code' in err)) return undefined;
  const c = String((err as { code: unknown }).code);
  if (c === '10') {
    return 'Google Sign-In (code 10): (1) Put Firebase’s google-services.json in android/app/ (Project settings → download; rebuild). (2) Register SHA-1 from android/app/debug.keystore for com.whybe.moija (ui: npm run android:signing → :app:signingReport, debug). (3) EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = Web client ID from the same project. Use an emulator image with Google Play, not AOSP without Play Store.';
  }
  return undefined;
}

export default function LoginScreen() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const showError = (msg: string) => {
    setError(msg);
    if (Platform.OS === 'web') window.alert(msg);
    else Alert.alert('Error', msg);
  };

  const handleEmailAuth = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      showError('Please enter email and password');
      return;
    }
    if (mode === 'signup') {
      if (password.length < 6) {
        showError('Password must be at least 6 characters');
        return;
      }
      if (password !== confirmPassword) {
        showError('Passwords do not match');
        return;
      }
    }
    setError('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        await signUpWithEmail(trimmedEmail, password);
      } else {
        await signInWithEmail(trimmedEmail, password);
      }
    } catch (err: any) {
      showError(authErrorMessage(err?.code) ?? err?.message ?? 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    if (Platform.OS === 'web') {
      setLoading(true);
      try {
        await signInWithGoogle();
      } catch (err: any) {
        showError(authErrorMessage(err?.code) ?? err?.message ?? 'Failed to sign in');
      } finally {
        setLoading(false);
      }
      return;
    }
    if (!googleWebClientId) {
      showError('Google sign-in is not configured (missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID).');
      return;
    }
    if (Platform.OS === 'ios' && !googleIosClientId) {
      showError('Google sign-in is not configured (missing EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID).');
      return;
    }
    setLoading(true);
    try {
      const tokens = await signInWithGoogleIdTokenNative(googleWebClientId);
      if (!tokens) {
        return;
      }
      await signInWithGoogle(tokens.idToken, tokens.accessToken);
    } catch (err: any) {
      if (err?.code === 'GOOGLE_SIGN_IN_TIMEOUT') {
        showError(
          'Google sign-in timed out. If a Google sheet is still open, dismiss it (swipe down on iOS, or Back on Android), then try again.',
        );
        return;
      }
      const firebaseGoogle =
        err?.code === 'auth/invalid-credential'
          ? 'Google sign-in could not be verified. On Android, register the SHA-1 from android/app/debug.keystore in Firebase for com.whybe.moija, and use the Web client ID in EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.'
          : undefined;
      showError(
        nativeGoogleSignInHint(err) ??
          firebaseGoogle ??
          authErrorMessage(err?.code) ??
          err?.message ??
          'Failed to sign in',
      );
    } finally {
      setLoading(false);
    }
  };

  const googleReady =
    Platform.OS === 'web' ||
    (!!googleWebClientId && (Platform.OS !== 'ios' || !!googleIosClientId));

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Text style={styles.logo}>⚡</Text>
            </View>
            <Text style={styles.appName}>Moija</Text>
            <Text style={styles.tagline}>Connect, plan, and hang out with your crew</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                onPress={() => { setMode('signin'); setError(''); }}
                style={[styles.toggleBtn, mode === 'signin' && styles.toggleBtnActive]}
              >
                <Text style={[styles.toggleText, mode === 'signin' && styles.toggleTextActive]}>Sign in</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setMode('signup'); setError(''); }}
                style={[styles.toggleBtn, mode === 'signup' && styles.toggleBtnActive]}
              >
                <Text style={[styles.toggleText, mode === 'signup' && styles.toggleTextActive]}>Sign up</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              placeholder="Email"
              placeholderTextColor={Colors.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.input}
              editable={!loading}
            />
            <TextInput
              placeholder="Password"
              placeholderTextColor={Colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={styles.input}
              editable={!loading}
            />
            {mode === 'signup' && (
              <TextInput
                placeholder="Confirm password"
                placeholderTextColor={Colors.textMuted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                style={styles.input}
                editable={!loading}
              />
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.emailButton, loading && styles.buttonDisabled]}
              onPress={handleEmailAuth}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={Colors.accentFg} />
              ) : (
                <Text style={styles.emailButtonText}>{mode === 'signup' ? 'Create account' : 'Sign in'}</Text>
              )}
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={[styles.googleButton, (loading || !googleReady) && styles.buttonDisabled]}
              onPress={handleGoogleSignIn}
              disabled={loading || !googleReady}
              activeOpacity={0.8}
            >
              <View style={styles.googleIcon}>
                <Text style={styles.googleIconText}>G</Text>
              </View>
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.disclaimer}>
            By continuing, you agree to our Terms of Service and Privacy Policy
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 40,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    gap: 16,
    marginBottom: 32,
  },
  form: {
    gap: 12,
    marginBottom: 24,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  toggleBtnActive: {
    borderColor: Colors.text,
    backgroundColor: Colors.text,
  },
  toggleText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: Colors.textSub,
  },
  toggleTextActive: {
    color: Colors.accentFg,
  },
  input: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    fontSize: 16,
    color: Colors.text,
    fontFamily: Fonts.regular,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' as any, outlineWidth: 0 } as any) : {}),
  },
  errorText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.notGoing,
  },
  emailButton: {
    paddingVertical: 16,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
  },
  emailButtonText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: Colors.accentFg,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    ...Shadows.lg,
  },
  logo: {
    fontSize: 56,
  },
  appName: {
    fontSize: 36,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 24,
  },
  buttonContainer: {
    gap: 16,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
    ...Shadows.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  googleIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  googleIconText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: '#4285F4',
  },
  googleButtonText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
  },
  disclaimer: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
