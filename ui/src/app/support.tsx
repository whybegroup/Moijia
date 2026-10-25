import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SupportService } from '@moijia/client';
import { useAppRouter as useRouter } from '../hooks/useAppRouter';
import { Colors, Fonts, Radius, Shadows } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';
import { apiErrorMessage } from '../utils/apiErrors';
import { KeyboardSafeScrollView } from '../components/KeyboardSafeScrollView';
import { NavBar } from '../components/ui';
import '../config/apiBase';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_MESSAGE_LENGTH = 10;

export default function SupportScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    setName((current) => current || user.displayName || '');
    setEmail((current) => current || user.email || '');
  }, [user]);

  const canSend =
    name.trim().length > 0 &&
    EMAIL_RE.test(email.trim()) &&
    message.trim().length >= MIN_MESSAGE_LENGTH &&
    !sending;

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    setError('');
    try {
      await SupportService.submitSupport({
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
      });
      setSent(true);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not send your message.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <NavBar
        title="Support"
        centerTitle
        onClose={router.canGoBack() ? () => router.back() : undefined}
      />
      <KeyboardSafeScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {sent ? (
          <View style={styles.sentCard}>
            <View style={styles.sentIcon}>
              <Ionicons name="checkmark" size={22} color={Colors.going} />
            </View>
            <Text style={styles.sentTitle}>Message sent</Text>
            <Text style={styles.sentBody}>We’ll reply to {email.trim()}.</Text>
            <TouchableOpacity
              onPress={() => {
                setSent(false);
                setMessage('');
              }}
              style={styles.againBtn}
              accessibilityRole="button"
            >
              <Text style={styles.againText}>Send another</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.lead}>
              Tell us what you need help with and we’ll get back to you.
            </Text>
            <Text style={styles.label}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              maxLength={80}
              style={styles.input}
            />
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@email.com"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              maxLength={200}
              style={styles.input}
            />
            <Text style={styles.label}>Message</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="How can we help?"
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
              maxLength={4000}
              style={[styles.input, styles.message]}
            />
            <Text style={styles.requirement}>At least {MIN_MESSAGE_LENGTH} characters</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity
              onPress={() => void submit()}
              disabled={!canSend}
              style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              {sending ? (
                <ActivityIndicator color={Colors.accentFg} />
              ) : (
                <Ionicons name="paper-plane" size={18} color={canSend ? Colors.accentFg : Colors.textMuted} />
              )}
              <Text style={[styles.sendText, !canSend && styles.sendTextDisabled]}>
                {sending ? 'Sending' : 'Send'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.hint}>
              For storage subscriptions, you can also manage or cancel in your Apple, Google, or web
              store settings.
            </Text>
          </>
        )}
      </KeyboardSafeScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },
  lead: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
    marginBottom: 8,
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
    marginBottom: 16,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  },
  message: {
    minHeight: 140,
    marginBottom: 8,
  },
  requirement: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  error: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.regular,
    color: Colors.notGoing,
    marginTop: 8,
  },
  sendBtn: {
    marginTop: 16,
    backgroundColor: Colors.accent,
    borderRadius: Radius.lg,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Shadows.sm,
  },
  sendBtnDisabled: {
    backgroundColor: Colors.border,
    ...Shadows.xs,
  },
  sendText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: Colors.accentFg,
  },
  sendTextDisabled: {
    color: Colors.textMuted,
  },
  hint: {
    marginTop: 16,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
  },
  sentCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 24,
    alignItems: 'center',
  },
  sentIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.goingBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  sentTitle: {
    fontSize: 18,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  sentBody: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    textAlign: 'center',
    marginBottom: 8,
  },
  againBtn: {
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  againText: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
  },
});
