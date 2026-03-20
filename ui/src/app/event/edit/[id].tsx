import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Image, Alert, Modal, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors, Fonts, Radius } from '../../../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName } from '../../../utils/helpers';
import { useEvent, useGroups, useUpdateEvent, useAllGroupMemberColors } from '../../../hooks/api';
import { NavBar, Field, Toggle } from '../../../components/ui';
import { useCurrentUserContext } from '../../../contexts/CurrentUserContext';

export default function EditEventScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId: currentUserId } = useCurrentUserContext();
  
  const eventId = Array.isArray(id) ? id[0] : id;

  const { data: existingEvent, isLoading: eventLoading } = useEvent(eventId || '', currentUserId ?? '');
  const { data: groups = [], isLoading: groupsLoading } = useGroups(currentUserId ?? '');
  const { data: groupColors = {} } = useAllGroupMemberColors(currentUserId);
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
    maxAttendees: existingEvent?.maxAttendees ? String(existingEvent.maxAttendees) : '',
    allowMaybe: existingEvent?.allowMaybe || false,
    enableWaitlist: existingEvent?.enableWaitlist || false,
    description: existingEvent?.description || '',
    coverPhotos: existingEvent?.coverPhotos || [],
  });
  const [errors, setErrors] = useState({
    date: '',
    startTime: '',
    endTime: '',
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

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
        maxAttendees: existingEvent.maxAttendees ? String(existingEvent.maxAttendees) : '',
        allowMaybe: existingEvent.allowMaybe || false,
        enableWaitlist: existingEvent.enableWaitlist || false,
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
        maxAttendees: form.maxAttendees.trim() ? parseInt(form.maxAttendees, 10) : undefined,
        enableWaitlist: form.maxAttendees.trim() ? form.enableWaitlist : undefined,
        updatedBy: currentUserId,
        allowMaybe: form.allowMaybe,
      });
      
      router.push(`/event/${eventId}`);
    } catch (error) {
      console.error('Failed to update event:', error);
      Alert.alert('Error', 'Failed to update event');
    }
  };

  const [showCoverPhotoModal, setShowCoverPhotoModal] = useState(false);
  const [coverPhotoUrl, setCoverPhotoUrl] = useState('');

  const handleAddCoverPhoto = () => {
    const url = coverPhotoUrl.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      Alert.alert('Invalid URL', 'Please enter a valid image URL (e.g. https://example.com/image.jpg)');
      return;
    }
    set('coverPhotos', [...form.coverPhotos, url]);
    setCoverPhotoUrl('');
    setShowCoverPhotoModal(false);
  };

  const getTimeDate = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours || 0);
    date.setMinutes(minutes || 0);
    return date;
  };

  const getMinimumStartTime = () => {
    const selectedDate = new Date(form.date);
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    
    if (selectedDate.getTime() === todayDate.getTime()) {
      return new Date();
    }
    return undefined;
  };

  const getMinimumEndTime = () => {
    if (!form.startTime) return undefined;
    const [h, m] = form.startTime.split(':').map(Number);
    const minTime = new Date();
    minTime.setHours(h, m + 1, 0, 0);
    return minTime;
  };

  const validateDate = (dateStr: string) => {
    if (!dateStr) {
      setErrors(e => ({ ...e, date: '' }));
      return;
    }
    const selectedDate = new Date(dateStr);
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    
    if (selectedDate < todayDate) {
      setErrors(e => ({ ...e, date: 'Date cannot be in the past' }));
    } else {
      setErrors(e => ({ ...e, date: '' }));
    }
  };

  const validateStartTime = (timeStr: string, dateStr: string) => {
    if (!timeStr || !dateStr) {
      setErrors(e => ({ ...e, startTime: '' }));
      return;
    }
    
    const selectedDate = new Date(dateStr);
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    
    if (selectedDate.getTime() === todayDate.getTime()) {
      const [h, m] = timeStr.split(':').map(Number);
      const now = new Date();
      const selectedTime = new Date();
      selectedTime.setHours(h, m, 0, 0);
      
      if (selectedTime <= now) {
        setErrors(e => ({ ...e, startTime: 'Start time must be in the future' }));
        return;
      }
    }
    
    setErrors(e => ({ ...e, startTime: '' }));
  };

  const validateEndTime = (endTimeStr: string, startTimeStr: string) => {
    if (!endTimeStr || !startTimeStr) {
      setErrors(e => ({ ...e, endTime: '' }));
      return;
    }
    
    const [sh, sm] = startTimeStr.split(':').map(Number);
    const [eh, em] = endTimeStr.split(':').map(Number);
    
    const startMinutes = sh * 60 + sm;
    const endMinutes = eh * 60 + em;
    
    if (endMinutes <= startMinutes) {
      setErrors(e => ({ ...e, endTime: 'End time must be after start time' }));
    } else {
      setErrors(e => ({ ...e, endTime: '' }));
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      const dateStr = selectedDate.toISOString().slice(0, 10);
      set('date', dateStr);
      validateDate(dateStr);
      validateStartTime(form.startTime, dateStr);
    }
  };

  const handleDateInputChange = (dateStr: string) => {
    set('date', dateStr);
    validateDate(dateStr);
    validateStartTime(form.startTime, dateStr);
  };

  const handleStartTimeChange = (event: any, selectedTime?: Date) => {
    if (Platform.OS === 'android') {
      setShowStartTimePicker(false);
    }
    if (selectedTime) {
      const hours = String(selectedTime.getHours()).padStart(2, '0');
      const minutes = String(selectedTime.getMinutes()).padStart(2, '0');
      const timeStr = `${hours}:${minutes}`;
      set('startTime', timeStr);
      validateStartTime(timeStr, form.date);
      validateEndTime(form.endTime, timeStr);
    }
  };

  const handleStartTimeInputChange = (timeStr: string) => {
    set('startTime', timeStr);
    validateStartTime(timeStr, form.date);
    validateEndTime(form.endTime, timeStr);
  };

  const handleEndTimeChange = (event: any, selectedTime?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndTimePicker(false);
    }
    if (selectedTime) {
      const hours = String(selectedTime.getHours()).padStart(2, '0');
      const minutes = String(selectedTime.getMinutes()).padStart(2, '0');
      const timeStr = `${hours}:${minutes}`;
      set('endTime', timeStr);
      validateEndTime(timeStr, form.startTime);
    }
  };

  const handleEndTimeInputChange = (timeStr: string) => {
    set('endTime', timeStr);
    validateEndTime(timeStr, form.startTime);
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
            <Text style={[styles.headerBtnText, !ok && { color: Colors.textMuted }]} numberOfLines={1}>
              Save
            </Text>
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        <Field label="Group" required>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {groups.filter((g) => g.membershipStatus === 'admin').map((g) => {
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
          <TextInput value={form.title} onChangeText={v => set('title', v)} placeholder="e.g. Game Night" placeholderTextColor={Colors.textMuted} style={styles.input} />
        </Field>

        <Field label="Subtitle">
          <TextInput value={form.subtitle} onChangeText={v => set('subtitle', v)} placeholder="e.g. Bring your favorite board games" placeholderTextColor={Colors.textMuted} style={styles.input} />
        </Field>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field label="Date" required>
              {errors.date ? <Text style={styles.errorText}>{errors.date}</Text> : null}
              {Platform.OS === 'web' ? (
                <input
                  type="date"
                  value={form.date}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e: any) => handleDateInputChange(e.target.value)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: errors.date ? '1.5px solid #EF4444' : '1.5px solid #E5E5E5',
                    backgroundColor: '#FAFAFA',
                    fontSize: 14,
                    color: '#1A1A1A',
                    fontFamily: 'DMSans_400Regular',
                    width: '100%',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              ) : (
                <TouchableOpacity onPress={() => setShowDatePicker(true)} activeOpacity={1}>
                  <View pointerEvents="none">
                    <TextInput 
                      value={form.date} 
                      placeholder="YYYY-MM-DD" 
                      placeholderTextColor={Colors.textMuted} 
                      style={[styles.input, errors.date && styles.inputError]}
                      editable={false}
                    />
                  </View>
                </TouchableOpacity>
              )}
            </Field>
          </View>
          {!form.isAllDay && <>
            <View style={{ flex: 1 }}>
              <Field label="Start time" required>
                {errors.startTime ? <Text style={styles.errorText}>{errors.startTime}</Text> : null}
                {Platform.OS === 'web' ? (
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(e: any) => handleStartTimeInputChange(e.target.value)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: errors.startTime ? '1.5px solid #EF4444' : '1.5px solid #E5E5E5',
                      backgroundColor: '#FAFAFA',
                      fontSize: 14,
                      color: '#1A1A1A',
                      fontFamily: 'DMSans_400Regular',
                      width: '100%',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                ) : (
                  <TouchableOpacity onPress={() => setShowStartTimePicker(true)} activeOpacity={1}>
                    <View pointerEvents="none">
                      <TextInput 
                        value={form.startTime} 
                        placeholder="HH:MM" 
                        placeholderTextColor={Colors.textMuted} 
                        style={[styles.input, errors.startTime && styles.inputError]}
                        editable={false}
                      />
                    </View>
                  </TouchableOpacity>
                )}
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="End time">
                {errors.endTime ? <Text style={styles.errorText}>{errors.endTime}</Text> : null}
                {Platform.OS === 'web' ? (
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(e: any) => handleEndTimeInputChange(e.target.value)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: errors.endTime ? '1.5px solid #EF4444' : '1.5px solid #E5E5E5',
                      backgroundColor: '#FAFAFA',
                      fontSize: 14,
                      color: '#1A1A1A',
                      fontFamily: 'DMSans_400Regular',
                      width: '100%',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                ) : (
                  <TouchableOpacity onPress={() => setShowEndTimePicker(true)} activeOpacity={1}>
                    <View pointerEvents="none">
                      <TextInput 
                        value={form.endTime} 
                        placeholder="HH:MM" 
                        placeholderTextColor={Colors.textMuted} 
                        style={[styles.input, errors.endTime && styles.inputError]}
                        editable={false}
                      />
                    </View>
                  </TouchableOpacity>
                )}
              </Field>
            </View>
          </>}
        </View>

        {Platform.OS !== 'web' && showDatePicker && (
          <DateTimePicker
            value={form.date ? new Date(form.date) : new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleDateChange}
            minimumDate={new Date()}
          />
        )}
        {Platform.OS === 'ios' && showDatePicker && (
          <View style={styles.datePickerActions}>
            <TouchableOpacity onPress={() => setShowDatePicker(false)} style={styles.datePickerBtn}>
              <Text style={styles.datePickerBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {Platform.OS !== 'web' && showStartTimePicker && (
          <DateTimePicker
            value={getTimeDate(form.startTime)}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleStartTimeChange}
            minimumDate={getMinimumStartTime()}
          />
        )}
        {Platform.OS === 'ios' && showStartTimePicker && (
          <View style={styles.datePickerActions}>
            <TouchableOpacity onPress={() => setShowStartTimePicker(false)} style={styles.datePickerBtn}>
              <Text style={styles.datePickerBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {Platform.OS !== 'web' && showEndTimePicker && (
          <DateTimePicker
            value={getTimeDate(form.endTime)}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleEndTimeChange}
            minimumDate={getMinimumEndTime()}
          />
        )}
        {Platform.OS === 'ios' && showEndTimePicker && (
          <View style={styles.datePickerActions}>
            <TouchableOpacity onPress={() => setShowEndTimePicker(false)} style={styles.datePickerBtn}>
              <Text style={styles.datePickerBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.settingsCard, { marginBottom: 18 }]}>
          <Toggle value={form.isAllDay} onChange={v => set('isAllDay', v)} label="All-day event" />
        </View>

        <Field label="Location">
          <TextInput value={form.location} onChangeText={v => set('location', v)} placeholder="e.g. Central Park" placeholderTextColor={Colors.textMuted} style={styles.input} />
        </Field>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field label="Min Attendees">
              <TextInput 
                value={form.minAttendees} 
                onChangeText={v => set('minAttendees', v)} 
                placeholder="1" 
                placeholderTextColor={Colors.textMuted} 
                keyboardType="number-pad" 
                style={styles.input} 
              />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Max Attendees">
              <TextInput 
                value={form.maxAttendees} 
                onChangeText={v => set('maxAttendees', v)} 
                placeholder="None" 
                placeholderTextColor={Colors.textMuted} 
                keyboardType="number-pad" 
                style={styles.input} 
              />
            </Field>
          </View>
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
                      <Ionicons name="close" size={11} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
            <TextInput value={form.description} onChangeText={v => set('description', v)}
              placeholder={'Add notes, directions, agenda, or a helpful link'}
              placeholderTextColor={Colors.textMuted}
              multiline numberOfLines={5} style={styles.descInput} />
            <View style={styles.descToolbar}>
              <TouchableOpacity onPress={() => setShowCoverPhotoModal(true)} style={styles.photoBtn}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name="camera-outline" size={16} color={Colors.textSub} />
                  <Text style={{ fontSize: 12, color: Colors.textSub, fontFamily: Fonts.medium }}>Add photo</Text>
                </View>
              </TouchableOpacity>
              <Text style={{ fontSize: 11, color: Colors.textMuted }}>{form.description.length}/500</Text>
            </View>

        {showCoverPhotoModal && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setShowCoverPhotoModal(false)}>
            <View style={styles.urlModalOverlay}>
              <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowCoverPhotoModal(false)} activeOpacity={1} />
              <View style={styles.urlModalCard}>
                <Text style={styles.urlModalTitle}>Add image from URL</Text>
                <TextInput
                  value={coverPhotoUrl}
                  onChangeText={setCoverPhotoUrl}
                  placeholder="https://example.com/image.jpg"
                  placeholderTextColor={Colors.textMuted}
                  style={styles.photoUrlInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TouchableOpacity onPress={() => setShowCoverPhotoModal(false)} style={styles.secondaryBtn} activeOpacity={0.8}>
                    <Text style={styles.secondaryBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleAddCoverPhoto} style={[styles.secondaryBtn, { borderColor: Colors.accent, backgroundColor: Colors.accent }]} activeOpacity={0.8}>
                    <Text style={[styles.secondaryBtnText, { color: Colors.accentFg }]}>Add</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
          </View>
        </Field>

        <Field label="Settings">
          <View style={styles.settingsCard}>
            <Toggle value={form.allowMaybe} onChange={v => set('allowMaybe', v)} label="Allow 'Maybe' responses" />
            {form.maxAttendees.trim() ? (
              <Toggle value={form.enableWaitlist} onChange={v => set('enableWaitlist', v)} label="Enable waitlist" />
            ) : null}
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
  headerBtn:     { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.lg, backgroundColor: Colors.accent, flexShrink: 0 },
  headerBtnDis:  { backgroundColor: Colors.border },
  headerBtnText: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  groupChip:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  chipText:      { fontSize: 13, color: Colors.textSub, fontFamily: Fonts.regular },
  input:         { padding: 10, paddingHorizontal: 14, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bg, fontSize: 14, color: Colors.text, fontFamily: Fonts.regular },
  inputError:    { borderColor: '#EF4444' },
  errorText:     { fontSize: 12, color: '#EF4444', fontFamily: Fonts.regular, marginBottom: 4 },
  datePickerActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 8 },
  datePickerBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.lg, backgroundColor: Colors.accent },
  datePickerBtnText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  settingsCard:  { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 16 },
  descBox:       { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.border, overflow: 'hidden' },
  descInput:     { padding: 12, paddingHorizontal: 14, fontSize: 14, color: Colors.text, fontFamily: Fonts.regular, minHeight: 100, textAlignVertical: 'top' },
  descToolbar:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 8, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  photoUrlInput: { paddingHorizontal: 10, paddingVertical: 10, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, fontSize: 14, color: Colors.text, fontFamily: Fonts.regular },
  photoBtn:      { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
  urlModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.32)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  urlModalCard:    { backgroundColor: Colors.surface, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, padding: 16, width: '100%', maxWidth: 360 },
  urlModalTitle:   { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text, marginBottom: 12 },
  secondaryBtn:    { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  secondaryBtnText:{ fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.text },
  removeThumb:   { position: 'absolute', top: -5, right: -5, width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.text, borderWidth: 2, borderColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  submitBtn:     { padding: 13, borderRadius: Radius.lg, backgroundColor: Colors.accent, alignItems: 'center', marginTop: 8 },
  submitBtnText: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.accentFg },
});
