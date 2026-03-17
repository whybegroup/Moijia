import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Radius, GroupPalettes } from '../constants/theme';
import { NavBar, Field, Toggle } from '../components/ui';

const EMOJIS = ['🏙️','🍜','👨‍👩‍👧','⛰️','🏀','🎤','🍻','🎮','🌸','💼','🎵','🏐'];

export default function CreateGroupScreen() {
  const router = useRouter();
  const [form, setForm] = useState({
    name:      '',
    desc:      '',
    isPrivate: false,
    palette:   0,
    emoji:     '🏙️',
  });
  const set  = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
  const valid = !!form.name.trim();
  const p     = GroupPalettes[form.palette];

  return (
    <SafeAreaView style={styles.safe}>
      <NavBar
        title="New Group"
        onBack={() => router.back()}
        right={
          <TouchableOpacity
            onPress={() => valid && router.back()}
            style={[styles.createBtn, !valid && styles.createBtnDisabled]}
          >
            <Text style={[styles.createBtnText, !valid && { color: Colors.textMuted }]}>Create</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        {/* Color picker */}
        <Field label="Color">
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
            {GroupPalettes.map((pal, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => set('palette', i)}
                style={[
                  styles.colorDot,
                  { backgroundColor: pal.dot },
                  form.palette === i && styles.colorDotSelected,
                ]}
              />
            ))}
          </View>
        </Field>

        {/* Emoji picker */}
        <Field label="Emoji">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {EMOJIS.map(e => (
              <TouchableOpacity
                key={e}
                onPress={() => set('emoji', e)}
                style={[styles.emojiBtn, form.emoji === e && styles.emojiBtnActive]}
              >
                <Text style={{ fontSize: 22 }}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Field>

        {/* Live preview */}
        <View style={[styles.preview, { backgroundColor: p.row, borderColor: p.cal }]}>
          <View style={[styles.previewIcon, { backgroundColor: Colors.surface, borderColor: p.cal }]}>
            <Text style={{ fontSize: 24 }}>{form.emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.previewName, { color: Colors.text }]}>
              {form.name || 'Group name'}
            </Text>
            <Text style={styles.previewSub}>Just you so far</Text>
          </View>
        </View>

        <Field label="Group Name" required>
          <TextInput
            value={form.name} onChangeText={v => set('name', v)}
            placeholder="e.g. KTown Hangout"
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
          />
        </Field>

        <Field label="Description">
          <TextInput
            value={form.desc} onChangeText={v => set('desc', v)}
            placeholder="What's this group about?"
            placeholderTextColor={Colors.textMuted}
            multiline numberOfLines={3}
            style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
          />
        </Field>

        <Field label="Settings">
          <View style={styles.settingsCard}>
            <Toggle
              value={form.isPrivate}
              onChange={v => set('isPrivate', v)}
              label="Private group (invite only)"
            />
          </View>
        </Field>

        <TouchableOpacity
          onPress={() => valid && router.back()}
          style={[styles.submitBtn, !valid && styles.submitBtnDisabled]}
        >
          <Text style={[styles.submitBtnText, !valid && { color: Colors.textMuted }]}>Create Group</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: Colors.bg },
  createBtn:         { paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.lg, backgroundColor: Colors.accent },
  createBtnDisabled: { backgroundColor: Colors.border },
  createBtnText:     { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  colorDot:          { width: 36, height: 36, borderRadius: 18 },
  colorDotSelected:  { borderWidth: 3, borderColor: Colors.text, transform: [{ scale: 1.1 }] },
  emojiBtn:          { width: 44, height: 44, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  emojiBtnActive:    { borderColor: Colors.text, backgroundColor: Colors.bg },
  preview:           { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: Radius.xl, borderWidth: 1, marginBottom: 24 },
  previewIcon:       { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  previewName:       { fontSize: 15, fontFamily: Fonts.bold },
  previewSub:        { fontSize: 12, color: Colors.textMuted, fontFamily: Fonts.regular },
  input:             { padding: 10, paddingHorizontal: 14, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bg, fontSize: 14, color: Colors.text, fontFamily: Fonts.regular },
  settingsCard:      { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 16 },
  submitBtn:         { padding: 13, borderRadius: Radius.lg, backgroundColor: Colors.accent, alignItems: 'center', marginTop: 8 },
  submitBtnDisabled: { backgroundColor: Colors.border },
  submitBtnText:     { fontSize: 15, fontFamily: Fonts.bold, color: Colors.accentFg },
});
