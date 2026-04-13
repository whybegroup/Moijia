import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  Alert,
} from 'react-native';
import { PollTextFont } from '@moijia/client';
import { Colors, Fonts, Radius } from '../constants/theme';

const FONT_LABELS: { key: PollTextFont; label: string }[] = [
  { key: PollTextFont.SANS, label: 'Sans' },
  { key: PollTextFont.SERIF, label: 'Serif' },
  { key: PollTextFont.MONO, label: 'Mono' },
];

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
  onChange: (htmlOrPlain: string) => void;
  textFont: PollTextFont;
  onTextFontChange: (f: PollTextFont) => void;
};

/** Native: plain text; server wraps as HTML. Link modal appends a safe &lt;a&gt; snippet. */
export function PollOptionTextEditor({ value, onChange, textFont, onTextFontChange }: Props) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');

  const appendLink = () => {
    const url = linkUrl.trim();
    if (!url) {
      Alert.alert('Link', 'Enter a URL.');
      return;
    }
    const label = linkLabel.trim() || url;
    const escapedLabel = label
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    let href = url;
    if (!/^https?:\/\//i.test(href)) {
      href = `https://${href}`;
    }
    const escapedHref = href.replace(/"/g, '&quot;');
    onChange(`${value}<a href="${escapedHref}">${escapedLabel}</a>`);
    setLinkOpen(false);
    setLinkUrl('');
    setLinkLabel('');
  };

  return (
    <View>
      <View style={styles.fontRow}>
        {FONT_LABELS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            onPress={() => onTextFontChange(key)}
            style={[styles.fontChip, textFont === key && styles.fontChipOn]}
          >
            <Text style={[styles.fontChipText, textFont === key && styles.fontChipTextOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.hint}>
        Plain text on mobile; formatting toolbar with bold, links, and more is available on web.
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Option label"
        placeholderTextColor={Colors.textMuted}
        multiline
        style={[
          styles.input,
          {
            fontFamily: fontFamilyForPollFont(textFont),
          },
        ]}
      />
      <TouchableOpacity onPress={() => setLinkOpen(true)} style={styles.linkBtn}>
        <Text style={styles.linkBtnText}>Insert link</Text>
      </TouchableOpacity>

      <Modal visible={linkOpen} transparent animationType="fade" onRequestClose={() => setLinkOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setLinkOpen(false)} />
          <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Insert link</Text>
          <TextInput
            value={linkUrl}
            onChangeText={setLinkUrl}
            placeholder="https://…"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            keyboardType="url"
            style={styles.modalInput}
          />
          <TextInput
            value={linkLabel}
            onChangeText={setLinkLabel}
            placeholder="Link text (optional)"
            placeholderTextColor={Colors.textMuted}
            style={styles.modalInput}
          />
          <View style={styles.modalActions}>
            <TouchableOpacity onPress={() => setLinkOpen(false)} style={styles.modalBtnGhost}>
              <Text style={styles.modalBtnGhostText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={appendLink} style={styles.modalBtn}>
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
  fontRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  fontChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  fontChipOn: { borderColor: Colors.accent, backgroundColor: `${Colors.accent}22` },
  fontChipText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textSub },
  fontChipTextOn: { color: Colors.accent, fontFamily: Fonts.semiBold },
  hint: {
    fontSize: 11,
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    marginBottom: 8,
    lineHeight: 15,
  },
  input: {
    minHeight: 72,
    padding: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    fontSize: 15,
    color: Colors.text,
    textAlignVertical: 'top',
  },
  linkBtn: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 6 },
  linkBtnText: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accent },
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
