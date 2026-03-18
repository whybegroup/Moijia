import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Fonts, Radius } from '../../../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName } from '../../../utils/helpers';
import { useEvent, useGroups, useUpdateEvent, useAllGroupMemberColors } from '../../../hooks/api';
import { NavBar, Field, Toggle } from '../../../components/ui';

const ME_ID = 'u1';

export default function EditEventScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  
  const eventId = Array.isArray(id) ? id[0] : id;

  const { data: existingEvent, isLoading: eventLoading } = useEvent(eventId || '');
  const { data: groups = [], isLoading: groupsLoading } = useGroups();
  const { data: groupColors = {} } = useAllGroupMemberColors(ME_ID);
  const updateEventMutation = useUpdateEvent(eventId || '');

  // Format date and times from existing event
  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toISOString().slice(0, 10);
  };
  const formatTime = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const [form, setForm] = useState({
    title: existingEvent?.title || '',
    subtitle: existingEvent?.subtitle || '',
    groupId: existingEvent?.groupId || '',
    date: existingEvent ? formatDate(existingEvent.start) : '',
    startTime: existingEvent ? formatTime(existingEvent.start) : '',
    endTime: existingEvent ? formatTime(existingEvent.end) : '',
    isAllDay: existingEvent?.isAllDay || false,
    location: existingEvent?.location || '',
    minAttendees: existingEvent?.minAttendees ? String(existingEvent.minAttendees) : '',
    deadline: existingEvent?.deadline ? formatTime(existingEvent.deadline) : '',
    allowMaybe: existingEvent?.allowMaybe || false,
    description: existingEvent?.description || '',
    coverPhotos: existingEvent?.coverPhotos || [],
  });

  // Update form when event loads
  React.useEffect(() => {
    if (existingEvent) {
      setForm({
        title: existingEvent.title || '',
        subtitle: existingEvent.subtitle || '',
        groupId: existingEvent.groupId || '',
        date: formatDate(existingEvent.start),
        startTime: formatTime(existingEvent.start),
        endTime: formatTime(existingEvent.end),
        isAllDay: existingEvent.isAllDay || false,
        location: existingEvent.location || '',
        minAttendees: existingEvent.minAttendees ? String(existingEvent.minAttendees) : '',
        deadline: existingEvent.deadline ? formatTime(existingEvent.deadline) : '',
        allowMaybe: existingEvent.allowMaybe || false,
        description: existingEvent.description || '',
        coverPhotos: existingEvent.coverPhotos || [],
      });
    }
  }, [existingEvent]);

  const loading = eventLoading || groupsLoading;

  if (!eventId || loading || !existingEvent) {
    return null;
  }

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
  const ok  = !!form.title.trim() && !!form.date;

  const submit = async () => {
    if (!ok) return;
    try {
      const [sh, sm] = form.startTime.split(':').map(Number);
      const [eh, em] = form.endTime.split(':').map(Number);
      const start = new Date(form.date + 'T' + String(sh).padStart(2, '0') + ':' + String(sm || 0).padStart(2, '0') + ':00');
      const end   = new Date(form.date + 'T' + String(eh).padStart(2, '0') + ':' + String(em || 0).padStart(2, '0') + ':00');
      if (form.isAllDay) {
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
      }
      let deadline: string | undefined;
      if (form.deadline.trim()) {
        const [dh, dm] = form.deadline.split(':').map(Number);
        const deadlineDate = new Date(form.date + 'T' + String(dh).padStart(2, '0') + ':' + String(dm || 0).padStart(2, '0') + ':00');
        deadline = deadlineDate.toISOString();
      }
      
      await updateEventMutation.mutateAsync({
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || undefined,
        description: form.description.trim() || undefined,
        coverPhotos: form.coverPhotos,
        start: start.toISOString(),
        end: end.toISOString(),
        isAllDay: form.isAllDay || undefined,
        location: form.location.trim() || undefined,
        minAttendees: form.minAttendees.trim() ? parseInt(form.minAttendees, 10) : undefined,
        deadline,
        allowMaybe: form.allowMaybe,
        updatedBy: ME_ID,
      });
      
      router.push(`/event/${eventId}`);
    } catch (error) {
      console.error('Failed to update event:', error);
      Alert.alert('Error', 'Failed to update event');
    }
  };

  const pickPhotos = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ 
      allowsMultipleSelection: true, 
      mediaTypes: ImagePicker.MediaTypeOptions.Images, 
      quality: 0.8,
      base64: true,
    });
    
    if (!r.canceled) {
      const uris = r.assets.map(asset => {
        // On web, convert to base64 data URI for persistence
        if (asset.base64 && asset.uri.startsWith('blob:')) {
          return `data:image/jpeg;base64,${asset.base64}`;
        }
        return asset.uri;
      });
      set('coverPhotos', [...form.coverPhotos, ...uris]);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push(`/event/${eventId}`);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <NavBar title="Edit Event" onBack={handleBack}
        right={
          <TouchableOpacity onPress={submit} style={[styles.headerBtn, !ok && styles.headerBtnDis]}>
            <Text style={[styles.headerBtnText, !ok && { color: Colors.textMuted }]}>Save</Text>
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        <Field label="Group" required>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {groups.map(g => {
              const userColorHex = groupColors[g.id] || getDefaultGroupThemeFromName(g.name);
              const p = getGroupColor(userColorHex);
              const sel = form.groupId === g.id;
              return (
                <TouchableOpacity key={g.id} onPress={() => set('groupId', g.id)}
                  style={[styles.groupChip, sel && { borderColor: p.dot, backgroundColor: p.row }]}>
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

        <Field label="Settings">
          <View style={styles.settingsCard}>
            <Toggle value={form.allowMaybe} onChange={v => set('allowMaybe', v)} label="Allow 'Maybe' responses" />
          </View>
        </Field>

        <TouchableOpacity onPress={submit} style={[styles.submitBtn, !ok && { backgroundColor: Colors.border }]} disabled={!ok}>
          <Text style={[styles.submitBtnText, !ok && { color: Colors.textMuted }]}>Save Changes</Text>
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
  submitBtn:     { padding: 13, borderRadius: Radius.lg, backgroundColor: Colors.accent, alignItems: 'center', marginTop: 8 },
  submitBtnText: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.accentFg },
});
