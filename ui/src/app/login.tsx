import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  BackHandler,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signInWithGoogle, signInWithEmail, signUpWithEmail, sendPasswordReset, needsEmailVerification } from '../config/firebase';
import { googleIosClientId, googleWebClientId } from '../config/googleAuth';
import { signInWithGoogleIdTokenNative } from '../config/googleSignIn';
import { Colors, Fonts, Radius, Shadows } from '../constants/theme';
import { WEB_APP_MAX_WIDTH } from '../constants/webAppMaxWidth';
import { LegalDocumentModal, type LegalDocumentId } from '../components/LegalDocumentModal';
import { useAppRouter as useRouter } from '../hooks/useAppRouter';

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
    'auth/missing-email': 'Please enter your email address.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
  };
  return map[code];
}

/** Android Google Sign-In status 10 = DEVELOPER_ERROR (SHA-1 / OAuth client mismatch). */
function nativeGoogleSignInHint(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('code' in err)) return undefined;
  const c = String((err as { code: unknown }).code);
  if (c === '10') {
    return 'Google Sign-In (code 10): (1) Put Firebase\'s google-services.json in android/app/ (Project settings → download; rebuild). (2) Register SHA-1 from android/app/debug.keystore for com.moijia.moijia (ui: npm run android:signing → :app:signingReport, debug). (3) EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = Web client ID from the same project. Use an emulator image with Google Play, not AOSP without Play Store.';
  }
  return undefined;
}

export default function LoginScreen() {
  const router = useRouter();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const wideViewport = windowWidth / Math.max(windowHeight, 1) > 0.68;
  const [emailMode, setEmailMode] = useState<AuthMode | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocumentId | null>(null);

  const showError = (msg: string) => {
    setError(msg);
    if (Platform.OS === 'web') window.alert(msg);
    else Alert.alert('Error', msg);
  };

  const openEmail = (mode: AuthMode) => {
    setEmailMode(mode);
    setError('');
    setPassword('');
    setConfirmPassword('');
    setAcceptedTerms(false);
  };

  const closeEmail = () => {
    if (loading) return;
    setEmailMode(null);
    setError('');
  };

  const openLegal = (document: LegalDocumentId) => {
    Keyboard.dismiss();
    setLegalDoc(document);
  };

  useEffect(() => {
    if (!emailMode && !legalDoc) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (legalDoc) {
        setLegalDoc(null);
        return true;
      }
      if (loading) return true;
      setEmailMode(null);
      setError('');
      return true;
    });
    return () => sub.remove();
  }, [emailMode, legalDoc, loading]);

  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      showError('Please enter your email address.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await sendPasswordReset(trimmedEmail);
      const msg =
        'If an account exists for that email, you will get a reset link shortly. Check spam, and use Continue with Google if you signed up with Google.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Check your email', msg);
    } catch (err: any) {
      showError(authErrorMessage(err?.code) ?? err?.message ?? 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  const goAfterAuth = (authed: Parameters<typeof needsEmailVerification>[0]) => {
    setEmailMode(null);
    router.replace(needsEmailVerification(authed) ? '/verify-email' : '/(tabs)/groups');
  };

  const handleEmailAuth = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      showError('Please enter email and password');
      return;
    }
    if (emailMode === 'signup') {
      if (password.length < 6) {
        showError('Password must be at least 6 characters');
        return;
      }
      if (password !== confirmPassword) {
        showError('Passwords do not match');
        return;
      }
      if (!acceptedTerms) {
        setError('Please accept the Terms of Service and Privacy Policy.');
        return;
      }
    }
    setError('');
    setLoading(true);
    try {
      const authed =
        emailMode === 'signup'
          ? await signUpWithEmail(trimmedEmail, password)
          : await signInWithEmail(trimmedEmail, password);
      goAfterAuth(authed);
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
        const authed = await signInWithGoogle();
        goAfterAuth(authed);
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
      await goAfterAuth(await signInWithGoogle(tokens.idToken, tokens.accessToken));
    } catch (err: any) {
      if (err?.code === 'GOOGLE_SIGN_IN_TIMEOUT') {
        showError(
          'Google sign-in timed out. If a Google sheet is still open, dismiss it (swipe down on iOS, or Back on Android), then try again.',
        );
        return;
      }
      const firebaseGoogle =
        err?.code === 'auth/invalid-credential'
          ? 'Google sign-in could not be verified. On Android, register the SHA-1 from android/app/debug.keystore in Firebase for com.moijia.moijia, and use the Web client ID in EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.'
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
    <View style={styles.container}>
      {emailMode == null ? (
      <>
      <Image
        source={require('../../assets/splash.png')}
        style={[styles.bgImage, wideViewport && styles.bgImageWide]}
        resizeMode={wideViewport ? 'contain' : 'cover'}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.googleButton, (loading || !googleReady) && styles.buttonDisabled]}
            onPress={handleGoogleSignIn}
            disabled={loading || !googleReady}
            activeOpacity={0.8}
          >
            {loading && !emailMode ? (
              <ActivityIndicator color={Colors.text} />
            ) : (
              <>
                <View style={styles.googleIcon}>
                  <Text style={styles.googleIconText}>G</Text>
                </View>
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={[styles.emailButton, loading && styles.buttonDisabled]}
            onPress={() => openEmail('signin')}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.emailButtonText}>Log in with email</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => openEmail('signup')}
            disabled={loading}
            activeOpacity={0.7}
            style={loading && styles.buttonDisabled}
          >
            <Text style={styles.signupLink}>Sign up with email</Text>
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            By continuing, you agree to our{' '}
            <Text
              style={styles.disclaimerLink}
              onPress={() => openLegal('terms')}
              accessibilityRole="link"
            >
              Terms of Service
            </Text>
            {' '}and{' '}
            <Text
              style={styles.disclaimerLink}
              onPress={() => openLegal('privacy')}
              accessibilityRole="link"
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </View>
      </SafeAreaView>
      </>
      ) : (
      <SafeAreaView style={styles.emailSafe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.emailHeader}>
          <TouchableOpacity
            onPress={closeEmail}
            disabled={loading}
            hitSlop={12}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </TouchableOpacity>
        </View>
        <KeyboardAvoidingView
          style={styles.emailAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.emailBody}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.emailColumn}>
            <View style={styles.modalBrand}>
              <Image
                source={require('../../assets/favicon.png')}
                style={styles.modalLogo}
                accessibilityLabel="moijia"
              />
              <Text style={styles.sheetTitle}>
                {emailMode === 'signup' ? 'Sign up' : 'Log in'}
              </Text>
            </View>

              <Text style={styles.fieldLabel}>Email</Text>
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
              <Text style={styles.fieldLabel}>Password</Text>
              <TextInput
                placeholder="Password"
                placeholderTextColor={Colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                style={styles.input}
                editable={!loading}
              />
              {emailMode === 'signup' && (
                <>
                  <Text style={styles.fieldLabel}>Confirm password</Text>
                  <TextInput
                    placeholder="Confirm password"
                    placeholderTextColor={Colors.textMuted}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    style={styles.input}
                    editable={!loading}
                  />
                </>
              )}

              {emailMode === 'signup' && (
                <View style={styles.termsRow}>
                  <Pressable
                    onPress={() => {
                      setAcceptedTerms((checked) => !checked);
                      setError('');
                    }}
                    disabled={loading}
                    hitSlop={8}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: acceptedTerms, disabled: loading }}
                    accessibilityLabel="I accept the Terms of Service and Privacy Policy"
                    style={[styles.termsBox, acceptedTerms && styles.termsBoxOn]}
                  >
                    {acceptedTerms ? (
                      <Ionicons name="checkmark" size={14} color={Colors.accentFg} />
                    ) : null}
                  </Pressable>
                  <Text style={styles.termsLabel}>
                    I accept the{' '}
                    <Text
                      style={styles.termsLink}
                      onPress={() => openLegal('terms')}
                      accessibilityRole="link"
                    >
                      Terms of Service
                    </Text>
                    {' '}and{' '}
                    <Text
                      style={styles.termsLink}
                      onPress={() => openLegal('privacy')}
                      accessibilityRole="link"
                    >
                      Privacy Policy
                    </Text>
                    .
                  </Text>
                </View>
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
                  <Text style={styles.emailButtonText}>
                    {emailMode === 'signup' ? 'Sign up' : 'Log in'}
                  </Text>
                )}
              </TouchableOpacity>

              {emailMode === 'signin' && (
                <TouchableOpacity
                  onPress={handleForgotPassword}
                  disabled={loading}
                  activeOpacity={0.7}
                  style={loading && styles.buttonDisabled}
                >
                  <Text style={styles.inlineLink}>Forgot password?</Text>
                </TouchableOpacity>
              )}

              {emailMode === 'signin' ? (
                <Text style={styles.footerPrompt}>
                  Do not have an account yet?{' '}
                  <Text
                    style={styles.footerLink}
                    onPress={() => openEmail('signup')}
                  >
                    Sign up
                  </Text>
                </Text>
              ) : (
                <Text style={styles.footerPrompt}>
                  Already have an account?{' '}
                  <Text
                    style={styles.footerLink}
                    onPress={() => openEmail('signin')}
                  >
                    Log in
                  </Text>
                </Text>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      )}

      <LegalDocumentModal
        document={legalDoc}
        onClose={() => setLegalDoc(null)}
        onChange={setLegalDoc}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#FAFAF9',
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    ...(Platform.OS === 'web' ? ({ objectFit: 'cover', objectPosition: 'center center' } as object) : null),
  },
  bgImageWide: Platform.OS === 'web' ? ({ objectFit: 'contain' } as object) : {},
  safe: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  actions: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 12,
  },
  emailSafe: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  emailHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailAvoid: {
    flex: 1,
  },
  emailBody: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  emailColumn: {
    width: '100%',
    maxWidth: WEB_APP_MAX_WIDTH,
    alignSelf: 'center',
    gap: 10,
  },
  modalBrand: {
    alignItems: 'center',
    marginBottom: 24,
    gap: 8,
  },
  modalLogo: {
    width: 64,
    height: 64,
  },
  modalWordmark: {
    fontSize: 22,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    letterSpacing: -0.4,
  },
  sheetTitle: {
    fontSize: 28,
    fontFamily: Fonts.extraBold,
    color: Colors.text,
    textAlign: 'center',
    letterSpacing: -0.6,
    marginTop: 4,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 6,
  },
  termsBox: {
    width: 22,
    height: 22,
    marginTop: 1,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  termsBoxOn: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  termsLabel: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
  },
  termsLink: {
    fontFamily: Fonts.medium,
    color: '#2d668b',
    textDecorationLine: 'underline',
  },
  fieldLabel: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
    marginTop: 4,
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
    marginTop: 8,
  },
  emailButtonText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: Colors.accentFg,
  },
  signupLink: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  inlineLink: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: '#2d668b',
    textAlign: 'center',
    marginTop: 8,
  },
  footerPrompt: {
    paddingTop: 4,
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.text,
    textAlign: 'center',
  },
  footerLink: {
    fontFamily: Fonts.semiBold,
    color: '#2d668b',
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
    color: Colors.textSub,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4,
  },
  disclaimerLink: {
    fontFamily: Fonts.medium,
    color: '#2d668b',
    textDecorationLine: 'underline',
  },
});
