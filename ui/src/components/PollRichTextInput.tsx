import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { PollTextFont } from '@moijia/client';
import { Colors, Fonts, Radius } from '../constants/theme';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fontFamilyForPollFont(f: PollTextFont): string {
  switch (f) {
    case PollTextFont.SERIF:
      return 'Georgia, Times New Roman, serif';
    case PollTextFont.MONO:
      return Platform.select({
        ios: 'Menlo',
        android: 'monospace',
        default: 'monospace',
      }) as string;
    default:
      return 'DMSans_400Regular';
  }
}

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  textFont: PollTextFont;
};

export function PollRichTextInput({ value, onChange, placeholder, textFont }: Props) {
  const inputRef = useRef<TextInput>(null);
  const [sel, setSel] = useState({ start: 0, end: 0 });
  const [pendingSel, setPendingSel] = useState<{ start: number; end: number } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  useEffect(() => {
    if (pendingSel && inputRef.current) {
      const { start, end } = pendingSel;
      setPendingSel(null);
      requestAnimationFrame(() => {
        try {
          inputRef.current?.setNativeProps({ selection: { start, end } });
        } catch {
          /* noop */
        }
      });
    }
  }, [pendingSel, value]);

  const wrapSelection = useCallback(
    (open: string, close: string) => {
      const { start, end } = sel;
      if (start === end) return;
      const left = value.slice(0, start);
      const mid = value.slice(start, end);
      const right = value.slice(end);
      const next = left + open + mid + close + right;
      onChange(next);
      setPendingSel({ start: start + open.length, end: start + open.length + mid.length });
    },
    [value, onChange, sel],
  );

  const onBold = () => wrapSelection('<strong>', '</strong>');
  const onItalic = () => wrapSelection('<em>', '</em>');
  const onUnderline = () => wrapSelection('<u>', '</u>');

  const applyLink = (rawUrl: string) => {
    const url = rawUrl.trim();
    if (!url) {
      Alert.alert('Link', 'Enter a URL.');
      return;
    }
    let href = url;
    if (!/^https?:\/\//i.test(href)) {
      href = `https://${href}`;
    }
    const { start, end } = sel;
    if (start === end) {
      Alert.alert('Link', 'Select text to turn into a link.');
      return;
    }
    const left = value.slice(0, start);
    const mid = value.slice(start, end);
    const right = value.slice(end);
    const open = `<a href="${escapeAttr(href)}">`;
    const close = '</a>';
    const next = left + open + mid + close + right;
    onChange(next);
    setPendingSel({ start: start + open.length, end: start + open.length + mid.length });
    setLinkOpen(false);
    setLinkUrl('');
  };

  const promptLinkAndroid = () => {
    const { start, end } = sel;
    if (start === end) {
      Alert.alert('Link', 'Select text to turn into a link.');
      return;
    }
    setLinkUrl('');
    setLinkOpen(true);
  };

  const onLink = () => {
    const { start, end } = sel;
    if (start === end) {
      Alert.alert('Link', 'Select text to turn into a link.');
      return;
    }
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Link',
        'URL',
        (t) => {
          if (t == null) return;
          applyLink(t);
        },
        'plain-text',
        'https://',
      );
    } else {
      promptLinkAndroid();
    }
  };

  const onClear = () => {
    const plain = value.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    onChange(plain);
  };

  const tbBtn = (label: string, onPress: () => void) => (
    <TouchableOpacity onPress={onPress} style={styles.tbBtn}>
      <Text style={styles.tbBtnText}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View>
      <View style={styles.toolbar}>
        {tbBtn('B', onBold)}
        {tbBtn('I', onItalic)}
        {tbBtn('U', onUnderline)}
        {tbBtn('Link', onLink)}
        {tbBtn('Clear', onClear)}
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        multiline
        onSelectionChange={(e) => setSel(e.nativeEvent.selection)}
        style={[styles.input, { fontFamily: fontFamilyForPollFont(textFont) }]}
        textAlignVertical="top"
        autoCapitalize="sentences"
        autoCorrect
      />

      <Modal visible={linkOpen} transparent animationType="fade" onRequestClose={() => setLinkOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setLinkOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Link URL</Text>
            <TextInput
              value={linkUrl}
              onChangeText={setLinkUrl}
              placeholder="https://…"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              keyboardType="url"
              style={styles.modalInput}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setLinkOpen(false)} style={styles.modalBtnGhost}>
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => applyLink(linkUrl)} style={styles.modalBtn}>
                <Text style={styles.modalBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  tbBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  tbBtnText: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.text },
  input: {
    minHeight: 72,
    padding: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    fontSize: 15,
    color: Colors.text,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    zIndex: 1,
  },
  modalTitle: { fontSize: 17, fontFamily: Fonts.bold, color: Colors.text, marginBottom: 12 },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: 12,
    fontSize: 14,
    marginBottom: 10,
    fontFamily: Fonts.regular,
    color: Colors.text,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  modalBtnGhost: { paddingVertical: 10, paddingHorizontal: 14 },
  modalBtnGhostText: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.textMuted },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
  },
  modalBtnText: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.accentFg },
});
