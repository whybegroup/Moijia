import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Colors, Fonts, Radius } from '../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, formatLocalDateInput } from '../utils/helpers';
import { NavBar, Field, Toggle, formSectionTitleStyle } from '../components/ui';
import { useGroups, useCreateEvent, useAllGroupMemberColors } from '../hooks/api';
import { uid } from '../utils/api-helpers';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { ResolvableImage } from '../components/ResolvableImage';
import {
  pickDeferredCoverPhotoNative,
  createWebDeferredCoverPhoto,
  uploadCoverPhotoDrafts,
  revokeCoverPhotoDraftPreview,
  coverPhotoDraftDisplayUri,
  type CoverPhotoDraft,
} from '../services/pickAndUploadImage';

export default function CreateEventScreen() {
  const router = useRouter();
  const calendarParams = useLocalSearchParams<{ start?: string; end?: string }>();
  const { userId: currentUserId } = useCurrentUserContext();
  const today = formatLocalDateInput(new Date());
  const { data: groups = [] } = useGroups(currentUserId ?? '');
  const { data: groupColors = {} } = useAllGroupMemberColors(currentUserId || '');
  const createEventMutation = useCreateEvent(currentUserId ?? '');

  const [form, setForm] = useState({
    title: '', description: '', groupId: '',
    startDate: today, startTime: '19:00', startAllDay: false,
    endDate: today, endTime: '21:00', endAllDay: false,
    location: '', minAttendees: '1', maxAttendees: '',
    allowMaybe: false, enableWaitlist: false, coverPhotoDrafts: [] as CoverPhotoDraft[],
    activityOptionDrafts: [''] as string[],
  });
  const [errors, setErrors] = useState({
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
  });
  const [coverPhotoBusy, setCoverPhotoBusy] = useState(false);

  const eventEligibleGroups = groups.filter(
    (g) => g.membershipStatus === 'member' || g.membershipStatus === 'admin',
  );
  useEffect(() => {
    if (eventEligibleGroups.length > 0 && !form.groupId) {
      setForm((p) => ({ ...p, groupId: eventEligibleGroups[0].id }));
    }
  }, [eventEligibleGroups, form.groupId]);

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const coverPhotoFileInputRef = useRef<{ click: () => void } | null>(null);

  const addCoverPhotoFromPicker = async () => {
    if (!currentUserId) return;
    if (Platform.OS === 'web') {
      coverPhotoFileInputRef.current?.click();
      return;
    }
    if (coverPhotoBusy) return;
    setCoverPhotoBusy(true);
    try {
      const picked = await pickDeferredCoverPhotoNative();
      if (picked) {
        setForm((p) => ({
          ...p,
          coverPhotoDrafts: [
            ...p.coverPhotoDrafts,
            { kind: 'pending', previewUri: picked.previewUri, pending: picked.pending },
          ],
        }));
      }
    } finally {
      setCoverPhotoBusy(false);
    }
  };

  const onCoverPhotoWebFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentUserId) return;
    if (!file.type.startsWith('image/')) {
      Alert.alert('Upload', 'Please choose an image file.');
      return;
    }
    const { previewUri, pending } = createWebDeferredCoverPhoto(file);
    setForm((p) => ({
      ...p,
      coverPhotoDrafts: [...p.coverPhotoDrafts, { kind: 'pending', previewUri, pending }],
    }));
  };

  const removeCoverPhotoAt = (index: number) => {
    setForm((p) => {
      const d = p.coverPhotoDrafts[index];
      if (d) revokeCoverPhotoDraftPreview(d);
      return { ...p, coverPhotoDrafts: p.coverPhotoDrafts.filter((_, j) => j !== index) };
    });
  };

  const ok  = !!form.title.trim() && !!form.startDate && !!form.endDate && !!form.groupId;

  const submit = async () => {
    if (!ok) return;
    try {
      const [sh, sm] = form.startTime.split(':').map(Number);
      const [eh, em] = form.endTime.split(':').map(Number);
      
      const start = new Date(form.startDate + 'T' + String(sh).padStart(2, '0') + ':' + String(sm || 0).padStart(2, '0') + ':00');
      const end   = new Date(form.endDate + 'T' + String(eh).padStart(2, '0') + ':' + String(em || 0).padStart(2, '0') + ':00');
      
      if (form.startAllDay) {
        start.setHours(0, 0, 0, 0);
      }
      if (form.endAllDay) {
        end.setHours(23, 59, 59, 999);
      }
      
      const isAllDay = form.startAllDay && form.endAllDay && form.startDate === form.endDate;

      let coverPhotos: string[] = [];
      if (form.coverPhotoDrafts.length > 0) {
        if (!currentUserId) {
          Alert.alert('Error', 'You must be signed in to upload photos.');
          return;
        }
        try {
          coverPhotos = await uploadCoverPhotoDrafts(currentUserId, form.coverPhotoDrafts);
        } catch {
          Alert.alert('Error', 'Failed to upload photos. Try again.');
          return;
        }
      }
      
      const activityOptionLabels = form.activityOptionDrafts
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const newEvent = {
        id: uid(),
        groupId: form.groupId,
        createdBy: currentUserId,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        coverPhotos,
        start: start.toISOString(),
        end: end.toISOString(),
        isAllDay: isAllDay || undefined,
        location: form.location.trim() || undefined,
        minAttendees: form.minAttendees.trim() ? parseInt(form.minAttendees, 10) : undefined,
        maxAttendees: form.maxAttendees.trim() ? parseInt(form.maxAttendees, 10) : undefined,
        enableWaitlist: form.maxAttendees.trim() ? form.enableWaitlist : undefined,
        allowMaybe: form.allowMaybe,
        ...(activityOptionLabels.length > 0 ? { activityOptionLabels } : {}),
      };
      
      await createEventMutation.mutateAsync(newEvent);
      router.replace('/(tabs)/events');
    } catch {
      Alert.alert('Error', 'Failed to create event');
    }
  };

  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  const getTimeDate = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours || 0);
    date.setMinutes(minutes || 0);
    return date;
  };

  const getMinimumStartTime = () => {
    const selectedDate = new Date(form.startDate);
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    
    if (selectedDate.getTime() === todayDate.getTime()) {
      return new Date();
    }
    return undefined;
  };

  const getMinimumEndTime = () => {
    if (form.startDate !== form.endDate) return undefined;
    if (!form.startTime) return undefined;
    const [h, m] = form.startTime.split(':').map(Number);
    const minTime = new Date();
    minTime.setHours(h, m + 1, 0, 0);
    return minTime;
  };

  const validateStartDate = (dateStr: string) => {
    if (!dateStr) {
      setErrors(e => ({ ...e, startDate: '' }));
      return;
    }
    const selectedDate = new Date(dateStr);
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    
    if (selectedDate < todayDate) {
      setErrors(e => ({ ...e, startDate: 'Date cannot be in the past' }));
    } else {
      setErrors(e => ({ ...e, startDate: '' }));
    }
  };

  const validateEndDate = (endDateStr: string, startDateStr: string) => {
    if (!endDateStr || !startDateStr) {
      setErrors(e => ({ ...e, endDate: '' }));
      return;
    }
    const endDate = new Date(endDateStr);
    const startDate = new Date(startDateStr);
    
    if (endDate < startDate) {
      setErrors(e => ({ ...e, endDate: 'End date cannot be before start date' }));
    } else {
      setErrors(e => ({ ...e, endDate: '' }));
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

  const validateEndTime = (endTimeStr: string, startTimeStr: string, endDateStr: string, startDateStr: string) => {
    if (!endTimeStr || !startTimeStr) {
      setErrors(e => ({ ...e, endTime: '' }));
      return;
    }
    
    if (startDateStr !== endDateStr) {
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

  const handleStartDateChange = (_event: unknown, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowStartDatePicker(false);
    }
    if (selectedDate) {
      const dateStr = formatLocalDateInput(selectedDate);
      set('startDate', dateStr);
      validateStartDate(dateStr);
      validateStartTime(form.startTime, dateStr);
      validateEndDate(form.endDate, dateStr);
      validateEndTime(form.endTime, form.startTime, form.endDate, dateStr);
    }
  };

  const handleEndDateChange = (_event: unknown, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndDatePicker(false);
    }
    if (selectedDate) {
      const dateStr = formatLocalDateInput(selectedDate);
      set('endDate', dateStr);
      validateEndDate(dateStr, form.startDate);
      validateEndTime(form.endTime, form.startTime, dateStr, form.startDate);
    }
  };

  const handleStartDateInputChange = (dateStr: string) => {
    set('startDate', dateStr);
    validateStartDate(dateStr);
    validateStartTime(form.startTime, dateStr);
    validateEndDate(form.endDate, dateStr);
  };

  const handleEndDateInputChange = (dateStr: string) => {
    set('endDate', dateStr);
    validateEndDate(dateStr, form.startDate);
    validateEndTime(form.endTime, form.startTime, dateStr, form.startDate);
  };

  const handleStartTimeChange = (_event: unknown, selectedTime?: Date) => {
    if (Platform.OS === 'android') {
      setShowStartTimePicker(false);
    }
    if (selectedTime) {
      const hours = String(selectedTime.getHours()).padStart(2, '0');
      const minutes = String(selectedTime.getMinutes()).padStart(2, '0');
      const timeStr = `${hours}:${minutes}`;
      set('startTime', timeStr);
      validateStartTime(timeStr, form.startDate);
      validateEndTime(form.endTime, timeStr, form.endDate, form.startDate);
    }
  };

  const handleStartTimeInputChange = (timeStr: string) => {
    set('startTime', timeStr);
    validateStartTime(timeStr, form.startDate);
    validateEndTime(form.endTime, timeStr, form.endDate, form.startDate);
  };

  const handleEndTimeChange = (_event: unknown, selectedTime?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndTimePicker(false);
    }
    if (selectedTime) {
      const hours = String(selectedTime.getHours()).padStart(2, '0');
      const minutes = String(selectedTime.getMinutes()).padStart(2, '0');
      const timeStr = `${hours}:${minutes}`;
      set('endTime', timeStr);
      validateEndTime(timeStr, form.startTime, form.endDate, form.startDate);
    }
  };

  const handleEndTimeInputChange = (timeStr: string) => {
    set('endTime', timeStr);
    validateEndTime(timeStr, form.startTime, form.endDate, form.startDate);
  };

  const calendarPresetAppliedRef = useRef(false);
  useEffect(() => {
    if (calendarPresetAppliedRef.current) return;
    const rawS = calendarParams.start;
    const rawE = calendarParams.end;
    const sStr = typeof rawS === 'string' ? rawS : Array.isArray(rawS) ? rawS[0] : undefined;
    const eStr = typeof rawE === 'string' ? rawE : Array.isArray(rawE) ? rawE[0] : undefined;
    if (!sStr || !eStr) return;
    const start = new Date(sStr);
    const end = new Date(eStr);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
      return;
    }
    calendarPresetAppliedRef.current = true;
    const pad = (n: number) => String(n).padStart(2, '0');
    const startDate = formatLocalDateInput(start);
    const endDate = formatLocalDateInput(end);
    const startTime = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
    const endTime = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
    setForm((prev) => ({
      ...prev,
      startDate,
      startTime,
      endDate,
      endTime,
      startAllDay: false,
      endAllDay: false,
    }));
    setErrors((e) => ({
      ...e,
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
    }));
  }, [calendarParams.start, calendarParams.end]);

  return (
    <SafeAreaView style={styles.safe}>
      <NavBar title="New Event" onBack={() => router.replace('/(tabs)/events')}
        right={
          <TouchableOpacity onPress={submit} style={[styles.headerBtn, !ok && styles.headerBtnDis]}>
            <Text style={[styles.headerBtnText, !ok && { color: Colors.textMuted }]} numberOfLines={1}>
              Create
            </Text>
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        <Field label="Group" required>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {eventEligibleGroups.map((g) => {
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

        <Field label="Event description">
          <View style={styles.descBox}>
            <TextInput
              value={form.description}
              onChangeText={(v) => set('description', v)}
              placeholder="Add notes, directions, agenda, or a helpful link"
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={5}
              maxLength={500}
              style={styles.descInput}
            />
            <View style={styles.descToolbar}>
              <Text style={{ fontSize: 11, color: Colors.textMuted }}>{form.description.length}/500</Text>
            </View>
          </View>
        </Field>

        <View style={{ marginBottom: 8 }}>
          <Text style={formSectionTitleStyle}>Activity ideas (optional)</Text>
          <Text style={{ fontSize: 13, color: Colors.textMuted, fontFamily: Fonts.regular, marginBottom: 10 }}>
            Add options for what to do; members can add more and vote on the event page.
          </Text>
          {form.activityOptionDrafts.map((line, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <TextInput
                value={line}
                onChangeText={(v) =>
                  setForm((p) => ({
                    ...p,
                    activityOptionDrafts: p.activityOptionDrafts.map((x, j) => (j === i ? v : x)),
                  }))
                }
                placeholder={`Option ${i + 1}`}
                placeholderTextColor={Colors.textMuted}
                style={[styles.input, { flex: 1 }]}
              />
              {form.activityOptionDrafts.length > 1 ? (
                <TouchableOpacity
                  onPress={() =>
                    setForm((p) => ({
                      ...p,
                      activityOptionDrafts: p.activityOptionDrafts.filter((_, j) => j !== i),
                    }))
                  }
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle-outline" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
          <TouchableOpacity
            onPress={() => setForm((prev) => ({ ...prev, activityOptionDrafts: [...prev.activityOptionDrafts, ''] }))}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
          >
            <Ionicons name="add-circle-outline" size={20} color={Colors.textSub} />
            <Text style={{ fontSize: 14, color: Colors.text, fontFamily: Fonts.medium }}>Add another option</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.dateTimeSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Start</Text>
            <TouchableOpacity 
              onPress={() => set('startAllDay', !form.startAllDay)}
              style={styles.allDayChip}
              activeOpacity={0.7}
            >
              <Text style={[styles.allDayChipText, form.startAllDay && styles.allDayChipTextActive]}>
                All-day
              </Text>
              <View style={[styles.allDayCheckbox, form.startAllDay && styles.allDayCheckboxActive]}>
                {form.startAllDay && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
            </TouchableOpacity>
          </View>
          
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Date" required>
                {errors.startDate ? <Text style={styles.errorText}>{errors.startDate}</Text> : null}
                {Platform.OS === 'web' ? (
                  <input
                    type="date"
                    value={form.startDate}
                    min={today}
                    onChange={(e: any) => handleStartDateInputChange(e.target.value)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: errors.startDate ? '1.5px solid #EF4444' : '1.5px solid #E5E5E5',
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
                  <TouchableOpacity onPress={() => setShowStartDatePicker(true)} activeOpacity={1}>
                    <View pointerEvents="none">
                      <TextInput 
                        value={form.startDate} 
                        placeholder="YYYY-MM-DD" 
                        placeholderTextColor={Colors.textMuted} 
                        style={[styles.input, errors.startDate && styles.inputError]}
                        editable={false}
                      />
                    </View>
                  </TouchableOpacity>
                )}
              </Field>
            </View>
            {!form.startAllDay && (
              <View style={{ flex: 1 }}>
                <Field label="Time" required>
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
            )}
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.dateTimeSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>End</Text>
            <TouchableOpacity 
              onPress={() => set('endAllDay', !form.endAllDay)}
              style={styles.allDayChip}
              activeOpacity={0.7}
            >
              <Text style={[styles.allDayChipText, form.endAllDay && styles.allDayChipTextActive]}>
                All-day
              </Text>
              <View style={[styles.allDayCheckbox, form.endAllDay && styles.allDayCheckboxActive]}>
                {form.endAllDay && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
            </TouchableOpacity>
          </View>
          
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Date" required>
                {errors.endDate ? <Text style={styles.errorText}>{errors.endDate}</Text> : null}
                {Platform.OS === 'web' ? (
                  <input
                    type="date"
                    value={form.endDate}
                    min={form.startDate}
                    onChange={(e: any) => handleEndDateInputChange(e.target.value)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: errors.endDate ? '1.5px solid #EF4444' : '1.5px solid #E5E5E5',
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
                  <TouchableOpacity onPress={() => setShowEndDatePicker(true)} activeOpacity={1}>
                    <View pointerEvents="none">
                      <TextInput 
                        value={form.endDate} 
                        placeholder="YYYY-MM-DD" 
                        placeholderTextColor={Colors.textMuted} 
                        style={[styles.input, errors.endDate && styles.inputError]}
                        editable={false}
                      />
                    </View>
                  </TouchableOpacity>
                )}
              </Field>
            </View>
            {!form.endAllDay && (
              <View style={{ flex: 1 }}>
                <Field label="Time" required>
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
            )}
          </View>
        </View>

        {Platform.OS !== 'web' && showStartDatePicker && (
          <DateTimePicker
            value={form.startDate ? new Date(form.startDate) : new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleStartDateChange}
            minimumDate={new Date()}
          />
        )}
        {Platform.OS === 'ios' && showStartDatePicker && (
          <View style={styles.datePickerActions}>
            <TouchableOpacity onPress={() => setShowStartDatePicker(false)} style={styles.datePickerBtn}>
              <Text style={styles.datePickerBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {Platform.OS !== 'web' && showEndDatePicker && (
          <DateTimePicker
            value={form.endDate ? new Date(form.endDate) : new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleEndDateChange}
            minimumDate={form.startDate ? new Date(form.startDate) : new Date()}
          />
        )}
        {Platform.OS === 'ios' && showEndDatePicker && (
          <View style={styles.datePickerActions}>
            <TouchableOpacity onPress={() => setShowEndDatePicker(false)} style={styles.datePickerBtn}>
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

        <View style={styles.photosSection}>
          {Platform.OS === 'web' && (
            <input
              ref={(el) => {
                coverPhotoFileInputRef.current = el;
              }}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={onCoverPhotoWebFileChange}
            />
          )}
          <Text style={formSectionTitleStyle}>
            Photos{form.coverPhotoDrafts.length > 0 ? ` · ${form.coverPhotoDrafts.length}` : ''}
          </Text>
          <View style={styles.photosCard}>
            {form.coverPhotoDrafts.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={{ borderBottomWidth: 1, borderBottomColor: Colors.border }}
                contentContainerStyle={{ gap: 4, padding: 10 }}>
                {form.coverPhotoDrafts.map((d, i) => (
                  <View key={`${i}-${coverPhotoDraftDisplayUri(d)}`} style={{ position: 'relative' }}>
                    <ResolvableImage
                      storedUrl={coverPhotoDraftDisplayUri(d)}
                      style={{ width: 80, height: 80, borderRadius: Radius.lg }}
                      resizeMode="cover"
                    />
                    <TouchableOpacity onPress={() => removeCoverPhotoAt(i)}
                      style={styles.removeThumb}>
                      <Ionicons name="close" size={11} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
            <View style={[styles.photosToolbar, form.coverPhotoDrafts.length === 0 && { borderTopWidth: 0 }]}>
              <TouchableOpacity
                onPress={() => void addCoverPhotoFromPicker()}
                style={styles.photoBtn}
                disabled={coverPhotoBusy || !currentUserId}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  {coverPhotoBusy ? (
                    <ActivityIndicator size="small" color={Colors.textSub} />
                  ) : (
                    <Ionicons name="camera-outline" size={16} color={Colors.textSub} />
                  )}
                  <Text style={{ fontSize: 12, color: Colors.textSub, fontFamily: Fonts.medium }}>Add photo</Text>
                </View>
              </TouchableOpacity>
            </View>
            <Text style={styles.photosDeferHint}>Photos upload when you create the event.</Text>
          </View>
        </View>

        <Field label="Settings">
          <View style={styles.settingsCard}>
            <Toggle value={form.allowMaybe} onChange={v => set('allowMaybe', v)} label="Allow 'Maybe' responses" />
            {form.maxAttendees.trim() ? (
              <Toggle value={form.enableWaitlist} onChange={v => set('enableWaitlist', v)} label="Enable waitlist" />
            ) : null}
          </View>
        </Field>

        <TouchableOpacity onPress={submit} style={[styles.submitBtn, !ok && { backgroundColor: Colors.border }]} disabled={!ok}>
          <Text style={[styles.submitBtnText, !ok && { color: Colors.textMuted }]} numberOfLines={1}>
            Create Event
          </Text>
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
  descToolbar:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', padding: 8, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  photosSection: { marginTop: 0, marginBottom: 18 },
  photosCard:    { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  photosToolbar: { flexDirection: 'row', alignItems: 'center', padding: 8, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  photosDeferHint: { fontSize: 11, color: Colors.textMuted, fontFamily: Fonts.regular, paddingHorizontal: 12, paddingBottom: 10, lineHeight: 16 },
  photoBtn:      { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
  removeThumb:   { position: 'absolute', top: -5, right: -5, width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.text, borderWidth: 2, borderColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  submitBtn:     { paddingVertical: 14, paddingHorizontal: 20, borderRadius: Radius.lg, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 8, minHeight: 48 },
  submitBtnText: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.accentFg, textAlign: 'center' },
  dateTimeSection: { marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text },
  allDayChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  allDayChipText: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.textSub },
  allDayChipTextActive: { color: Colors.text },
  allDayCheckbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  allDayCheckboxActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 8 },
});
