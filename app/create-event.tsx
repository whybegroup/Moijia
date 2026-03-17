import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, SafeAreaView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Fonts, Radius } from '../constants/theme';
import { paletteOf } from '../utils/helpers';
import { GROUPS, TAGS, addEvent, uid, type Event } from '../data/mock';
import { NavBar, Field, Toggle } from '../components/ui';

export default function CreateEventScreen() {
  const router = useRouter();
  const today  = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    title: '', subtitle: '', groupId: GROUPS[0].id,
    date: today, startTime: '19:00', endTime: '21:00',
    isAllDay: false, location: '', minAttendees: '', deadline: '',
    allowMaybe: false, description: '', coverPhotos: [] as string[], tags: [] as string[],
  });

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
  const ok  = !!form.title.trim() && !!form.date;

  const submit = () => {
    if (!ok) return;
    const [sh, sm] = form.startTime.split(':').map(Number);
    const [eh, em] = form.endTime.split(':').map(Number);
    const start = new Date(form.date + 'T' + String(sh).padStart(2, '0') + ':' + String(sm || 0).padStart(2, '0') + ':00');
    const end   = new Date(form.date + 'T' + String(eh).padStart(2, '0') + ':' + String(em || 0).padStart(2, '0') + ':00');
    if (form.isAllDay) {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }
    let deadline: Date | undefined;
    if (form.deadline.trim()) {
      const [dh, dm] = form.deadline.split(':').map(Number);
      deadline = new Date(form.date + 'T' + String(dh).padStart(2, '0') + ':' + String(dm || 0).padStart(2, '0') + ':00');
    }
    const newEvent: Event = {
      id: uid(),
      groupId: form.groupId,
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || undefined,
      description: form.description.trim() || undefined,
      coverPhotos: form.coverPhotos,
      start,
      end,
      isAllDay: form.isAllDay || undefined,
      location: form.location.trim() || undefined,
      minAttendees: form.minAttendees.trim() ? parseInt(form.minAttendees, 10) : undefined,
      deadline,
      allowMaybe: form.allowMaybe,
      tags: form.tags.length ? form.tags : undefined,
      rsvps: [],
      noResponse: [],
      comments: [],
    };
    addEvent(newEvent);
    router.replace('/(tabs)/feed');
  };

  const pickPhotos = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ allowsMultipleSelection: true, mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!r.canceled) set('coverPhotos', [...form.coverPhotos, ...r.assets.map(a => a.uri)]);
  };

  const toggleTag = (t: string) => set('tags', form.tags.includes(t) ? form.tags.filter(x => x !== t) : [...form.tags, t]);

  return (
    <SafeAreaView style={styles.safe}>
      <NavBar title="New Event" onBack={() => router.replace('/(tabs)/feed')}
        right={
          <TouchableOpacity onPress={submit} style={[styles.headerBtn, !ok && styles.headerBtnDis]}>
            <Text style={[styles.headerBtnText, !ok && { color: Colors.textMuted }]}>Create</Text>
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        <Field label="Group" required>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {GROUPS.map(g => {
              const p = paletteOf(g); const sel = form.groupId === g.id;
              return (
                <TouchableOpacity key={g.id} onPress={() => set('groupId', g.id)}
                  style={[styles.groupChip, sel && { borderColor: p.dot, backgroundColor: p.row }]}>
                  <Text style={{ fontSize: 16 }}>{g.emoji}</Text>
                  <Text style={[styles.chipText, sel && { color: p.text, fontFamily: Fonts.semiBold }]}>{g.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Field>

        <Field label="Event Title" required>
          <TextInput value={form.title} onChangeText={v => set('title', v)} placeholder="e.g. 금요일 포차 번개 🍻" placeholderTextColor={Colors.textMuted} style={styles.input} />
        </Field>

        <Field label="Subtitle">
          <TextInput value={form.subtitle} onChangeText={v => set('subtitle', v)} placeholder="e.g. Friday night vibes — come through!" placeholderTextColor={Colors.textMuted} style={styles.input} />
        </Field>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Field label="Date" required><TextInput value={form.date} onChangeText={v => set('date', v)} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.textMuted} style={styles.input} /></Field></View>
          {!form.isAllDay && <>
            <View style={{ flex: 1 }}><Field label="Start" required><TextInput value={form.startTime} onChangeText={v => set('startTime', v)} placeholder="HH:MM" placeholderTextColor={Colors.textMuted} style={styles.input} /></Field></View>
            <View style={{ flex: 1 }}><Field label="End"><TextInput value={form.endTime} onChangeText={v => set('endTime', v)} placeholder="HH:MM" placeholderTextColor={Colors.textMuted} style={styles.input} /></Field></View>
          </>}
        </View>

        <View style={[styles.settingsCard, { marginBottom: 18 }]}>
          <Toggle value={form.isAllDay} onChange={v => set('isAllDay', v)} label="All-day event" />
        </View>

        <Field label="Location">
          <TextInput value={form.location} onChangeText={v => set('location', v)} placeholder="e.g. Pocha 32 · Koreatown" placeholderTextColor={Colors.textMuted} style={styles.input} />
        </Field>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Field label="Min Attendees"><TextInput value={form.minAttendees} onChangeText={v => set('minAttendees', v)} placeholder="None" placeholderTextColor={Colors.textMuted} keyboardType="number-pad" style={styles.input} /></Field></View>
          <View style={{ flex: 1 }}><Field label="RSVP Deadline"><TextInput value={form.deadline} onChangeText={v => set('deadline', v)} placeholder="HH:MM" placeholderTextColor={Colors.textMuted} style={styles.input} /></Field></View>
        </View>

        <Field label="Description">
          <View style={styles.descBox}>
            {form.coverPhotos.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={{ borderBottomWidth: 1, borderBottomColor: Colors.border }}
                contentContainerStyle={{ gap: 4, padding: 10 }}>
                {form.coverPhotos.map((uri, i) => (
                  <View key={i} style={{ position: 'relative' }}>
                    <Image source={{ uri }} style={{ width: 80, height: 80, borderRadius: Radius.lg }} />
                    <TouchableOpacity onPress={() => set('coverPhotos', form.coverPhotos.filter((_, j) => j !== i))}
                      style={styles.removeThumb}>
                      <Text style={{ fontSize: 9, color: '#fff' }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
            <TextInput value={form.description} onChangeText={v => set('description', v)}
              placeholder={'Add details, notes, or a link...\n\nTip: URLs will be clickable ↗'}
              placeholderTextColor={Colors.textMuted}
              multiline numberOfLines={5} style={styles.descInput} />
            <View style={styles.descToolbar}>
              <TouchableOpacity onPress={pickPhotos} style={styles.photoBtn}>
                <Text style={{ fontSize: 12, color: Colors.textSub, fontFamily: Fonts.medium }}>📷 Add photo</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 11, color: Colors.textMuted }}>{form.description.length}/500</Text>
            </View>
          </View>
        </Field>

        <Field label="Tags">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {TAGS.map(t => {
              const sel = form.tags.includes(t);
              return (
                <TouchableOpacity key={t} onPress={() => toggleTag(t)}
                  style={[styles.tagChip, sel && { borderColor: Colors.accent, backgroundColor: Colors.accent }]}>
                  <Text style={[styles.chipText, sel && { color: Colors.accentFg }]}>{t}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Field>

        <Field label="Settings">
          <View style={styles.settingsCard}>
            <Toggle value={form.allowMaybe} onChange={v => set('allowMaybe', v)} label="Allow 'Maybe' responses" />
          </View>
        </Field>

        <TouchableOpacity onPress={submit} style={[styles.submitBtn, !ok && { backgroundColor: Colors.border }]} disabled={!ok}>
          <Text style={[styles.submitBtnText, !ok && { color: Colors.textMuted }]}>Create Event</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: Colors.bg },
  headerBtn:     { paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.lg, backgroundColor: Colors.accent },
  headerBtnDis:  { backgroundColor: Colors.border },
  headerBtnText: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  groupChip:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  chipText:      { fontSize: 13, color: Colors.textSub, fontFamily: Fonts.regular },
  input:         { padding: 10, paddingHorizontal: 14, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bg, fontSize: 14, color: Colors.text, fontFamily: Fonts.regular },
  settingsCard:  { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 16 },
  descBox:       { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.border, overflow: 'hidden' },
  descInput:     { padding: 12, paddingHorizontal: 14, fontSize: 14, color: Colors.text, fontFamily: Fonts.regular, minHeight: 100, textAlignVertical: 'top' },
  descToolbar:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 8, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  photoBtn:      { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
  removeThumb:   { position: 'absolute', top: -5, right: -5, width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.text, borderWidth: 2, borderColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  tagChip:       { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  submitBtn:     { padding: 13, borderRadius: Radius.lg, backgroundColor: Colors.accent, alignItems: 'center', marginTop: 8 },
  submitBtnText: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.accentFg },
});
