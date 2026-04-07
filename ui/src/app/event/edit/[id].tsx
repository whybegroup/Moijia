import { useState, useRef, useMemo, useEffect, type ChangeEvent } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, Modal, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors, Fonts, Radius } from '../../../constants/theme';
import { formatLocalDateInput } from '../../../utils/helpers';
import { useEvent, useGroup, useUpdateEvent, useDeleteEvent } from '../../../hooks/api';
import { NavBar, Field, Toggle, formSectionTitleStyle } from '../../../components/ui';
import { useCurrentUserContext } from '../../../contexts/CurrentUserContext';
import { ResolvableImage } from '../../../components/ResolvableImage';
import {
  pickDeferredCoverPhotoNative,
  createWebDeferredCoverPhoto,
  uploadCoverPhotoDrafts,
  revokeCoverPhotoDraftPreview,
  coverPhotoDraftDisplayUri,
  type CoverPhotoDraft,
} from '../../../services/pickAndUploadImage';
import type { EventDetailed } from '@moija/client';

export default function EditEventScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId: currentUserId } = useCurrentUserContext();
  
  const eventId = Array.isArray(id) ? id[0] : id;

  const { data: existingEvent, isLoading: eventLoading } = useEvent(eventId || '', currentUserId ?? '');
  const { data: eventGroup, isLoading: eventGroupLoading } = useGroup(
    existingEvent?.groupId || '',
    currentUserId ?? '',
  );
  const updateEventMutation = useUpdateEvent(eventId || '', currentUserId ?? '');
  const deleteEventMutation = useDeleteEvent(currentUserId ?? '');

  const formatTime = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const formFromEvent = (e: EventDetailed) => ({
    title: e.title || '',
    description: e.description || '',
    groupId: e.groupId || '',
    startDate: formatLocalDateInput(e.start),
    startTime: formatTime(e.start),
    startAllDay: e.isAllDay || false,
    endDate: formatLocalDateInput(e.end),
    endTime: formatTime(e.end),
    endAllDay: e.isAllDay || false,
    location: e.location || '',
    minAttendees: e.minAttendees ? String(e.minAttendees) : '',
    maxAttendees: e.maxAttendees ? String(e.maxAttendees) : '',
    allowMaybe: e.allowMaybe || false,
    enableWaitlist: e.enableWaitlist || false,
    coverPhotoDrafts: (e.coverPhotos || []).map((url) => ({ kind: 'remote' as const, url })),
  });

  const [form, setForm] = useState({
    title: existingEvent?.title || '',
    description: existingEvent?.description || '',
    groupId: existingEvent?.groupId || '',
    startDate: existingEvent ? formatLocalDateInput(existingEvent.start) : '',
    startTime: existingEvent ? formatTime(existingEvent.start) : '',
    startAllDay: existingEvent?.isAllDay || false,
    endDate: existingEvent ? formatLocalDateInput(existingEvent.end) : '',
    endTime: existingEvent ? formatTime(existingEvent.end) : '',
    endAllDay: existingEvent?.isAllDay || false,
    location: existingEvent?.location || '',
    minAttendees: existingEvent?.minAttendees ? String(existingEvent.minAttendees) : '',
    maxAttendees: existingEvent?.maxAttendees ? String(existingEvent.maxAttendees) : '',
    allowMaybe: existingEvent?.allowMaybe || false,
    enableWaitlist: existingEvent?.enableWaitlist || false,
    coverPhotoDrafts: [] as CoverPhotoDraft[],
  });
  const errors = { startDate: '', startTime: '', endDate: '', endTime: '' };
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [coverPhotoBusy, setCoverPhotoBusy] = useState(false);
  /** Only hydrate form when switching events; refetches after mutations must not wipe unsaved edits. */
  const hydratedEventIdRef = useRef<string | null>(null);

  // Update form when event loads
  useEffect(() => {
    if (!existingEvent) return;
    if (hydratedEventIdRef.current === existingEvent.id) return;
    hydratedEventIdRef.current = existingEvent.id;
    setForm(formFromEvent(existingEvent));
  }, [existingEvent]);

  const needGroupForPermission =
    !!existingEvent && !!currentUserId && existingEvent.createdBy !== currentUserId;
  const loading = eventLoading || (needGroupForPermission && eventGroupLoading);

  useEffect(() => {
    if (!eventId || !existingEvent || !currentUserId) return;
    if (loading) return;
    if (existingEvent.createdBy === currentUserId) return;
    const isElevated =
      eventGroup?.superAdminId === currentUserId ||
      (eventGroup?.adminIds ?? []).includes(currentUserId);
    if (!isElevated) {
      router.replace(`/event/${eventId}`);
    }
  }, [eventId, existingEvent, currentUserId, eventGroup, loading, router]);

  const isDirty = useMemo(() => {
    if (!existingEvent) return false;
    const b = formFromEvent(existingEvent);
    const sc = existingEvent.coverPhotos || [];
    if (form.coverPhotoDrafts.length !== sc.length) return true;
    for (let i = 0; i < form.coverPhotoDrafts.length; i++) {
      const d = form.coverPhotoDrafts[i];
      if (d.kind === 'pending') return true;
      if (d.kind === 'remote' && d.url !== sc[i]) return true;
    }
    return (
      form.title.trim() !== b.title.trim() ||
      form.description.trim() !== b.description.trim() ||
      form.startDate !== b.startDate ||
      form.startTime !== b.startTime ||
      form.endDate !== b.endDate ||
      form.endTime !== b.endTime ||
      form.startAllDay !== b.startAllDay ||
      form.endAllDay !== b.endAllDay ||
      form.location.trim() !== b.location.trim() ||
      form.minAttendees !== b.minAttendees ||
      form.maxAttendees !== b.maxAttendees ||
      form.allowMaybe !== b.allowMaybe ||
      form.enableWaitlist !== b.enableWaitlist
    );
  }, [existingEvent, form]);

  const resetFormFromEvent = () => {
    if (!existingEvent) return;
    setForm((prev) => {
      prev.coverPhotoDrafts.forEach((d) => revokeCoverPhotoDraftPreview(d));
      return formFromEvent(existingEvent);
    });
  };

  const coverPhotoFileInputRef = useRef<{ click: () => void } | null>(null);

  if (!eventId || loading || !existingEvent) {
    return null;
  }

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
  const ok  = !!form.title.trim() && !!form.startDate && !!form.endDate;

  const removeCoverPhotoAt = (index: number) => {
    setForm((p) => {
      const d = p.coverPhotoDrafts[index];
      if (d) revokeCoverPhotoDraftPreview(d);
      return { ...p, coverPhotoDrafts: p.coverPhotoDrafts.filter((_, j) => j !== index) };
    });
  };

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
        try {
          coverPhotos = await uploadCoverPhotoDrafts(currentUserId, form.coverPhotoDrafts);
        } catch {
          Alert.alert('Error', 'Failed to upload photos. Try again.');
          return;
        }
      }
      
      await updateEventMutation.mutateAsync({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        coverPhotos,
        start: start.toISOString(),
        end: end.toISOString(),
        isAllDay: isAllDay || undefined,
        location: form.location.trim(),
        minAttendees: form.minAttendees.trim() ? parseInt(form.minAttendees, 10) : undefined,
        maxAttendees: form.maxAttendees.trim() ? parseInt(form.maxAttendees, 10) : undefined,
        enableWaitlist: form.maxAttendees.trim() ? form.enableWaitlist : undefined,
        updatedBy: currentUserId,
        allowMaybe: form.allowMaybe,
      });
      
      router.push(`/event/${eventId}`);
    } catch {
      Alert.alert('Error', 'Failed to update event');
    }
  };

  const handleDeleteEvent = async () => {
    setShowDeleteConfirm(false);
    try {
      await deleteEventMutation.mutateAsync(eventId || '');
      router.push('/(tabs)/events');
    } catch {
      Alert.alert('Error', 'Failed to delete event');
    }
  };

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

  const handleStartDateChange = (_event: unknown, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowStartDatePicker(false);
    }
    if (selectedDate) {
      set('startDate', formatLocalDateInput(selectedDate));
    }
  };

  const handleEndDateChange = (_event: unknown, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndDatePicker(false);
    }
    if (selectedDate) {
      set('endDate', formatLocalDateInput(selectedDate));
    }
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
    }
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
          <View style={styles.navEditActions}>
            <TouchableOpacity
              onPress={resetFormFromEvent}
              disabled={!isDirty || updateEventMutation.isPending}
              style={[styles.resetBtn, (!isDirty || updateEventMutation.isPending) && styles.resetBtnDisabled]}
              activeOpacity={0.8}
            >
              <Text style={[styles.resetBtnText, (!isDirty || updateEventMutation.isPending) && { color: Colors.textMuted }]}>
                Reset
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={submit}
              style={[styles.headerBtn, !ok && styles.headerBtnDis]}
              disabled={updateEventMutation.isPending}
              activeOpacity={0.8}
            >
              {updateEventMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.accentFg} />
              ) : (
                <Text style={[styles.headerBtnText, !ok && { color: Colors.textMuted }]} numberOfLines={1}>
                  Save
                </Text>
              )}
            </TouchableOpacity>
          </View>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        <Field label="Group">
          <Text style={styles.groupReadonly}>
            {eventGroup?.name ?? 'Group'}
          </Text>
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
                    min={formatLocalDateInput(new Date())}
                    onChange={(e: any) => set('startDate', e.target.value)}
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
                      onChange={(e: any) => set('startTime', e.target.value)}
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
                    onChange={(e: any) => set('endDate', e.target.value)}
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
                      onChange={(e: any) => set('endTime', e.target.value)}
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
            <Text style={styles.photosDeferHint}>Photos upload when you save.</Text>
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

        <TouchableOpacity
          onPress={submit}
          style={[styles.submitBtn, (!ok || updateEventMutation.isPending) && { backgroundColor: Colors.border }]}
          disabled={!ok || updateEventMutation.isPending}
        >
          {updateEventMutation.isPending ? (
            <ActivityIndicator size="small" color={Colors.accentFg} />
          ) : (
            <Text style={[styles.submitBtnText, !ok && { color: Colors.textMuted }]}>Save Changes</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setShowDeleteConfirm(true)} style={styles.deleteBtn}>
          <Text style={styles.deleteBtnText}>Delete Event</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
        <View style={styles.deleteOverlay}>
          <View style={styles.deleteBox}>
            <Text style={styles.deleteTitle}>Delete Event</Text>
            <Text style={styles.deleteMessage}>Are you sure you want to delete this event? This action cannot be undone.</Text>
            <View style={styles.deleteActions}>
              <TouchableOpacity onPress={() => setShowDeleteConfirm(false)} style={styles.deleteCancelBtn}>
                <Text style={styles.deleteCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDeleteEvent} style={styles.deleteConfirmBtn}>
                <Text style={styles.deleteConfirmText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: Colors.bg },
  headerBtn:     { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.lg, backgroundColor: Colors.accent, flexShrink: 0 },
  headerBtnDis:  { backgroundColor: Colors.border },
  headerBtnText: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  navEditActions: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  resetBtn:      { paddingVertical: 8, paddingHorizontal: 4, flexShrink: 0 },
  resetBtnDisabled: { opacity: 0.45 },
  resetBtnText:  { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text },
  groupChip:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  chipText:      { fontSize: 13, color: Colors.textSub, fontFamily: Fonts.regular },
  groupReadonly: { fontSize: 14, color: Colors.text, fontFamily: Fonts.semiBold, paddingVertical: 4 },
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
  submitBtn:     { padding: 13, borderRadius: Radius.lg, backgroundColor: Colors.accent, alignItems: 'center', marginTop: 8 },
  submitBtnText: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.accentFg },
  deleteBtn:     { padding: 13, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', marginTop: 12, marginBottom: 24 },
  deleteBtnText: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text },
  deleteOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  deleteBox:     { backgroundColor: Colors.surface, borderRadius: Radius['2xl'], padding: 24, width: '100%', maxWidth: 320 },
  deleteTitle:   { fontSize: 18, fontFamily: Fonts.bold, color: Colors.text, marginBottom: 8 },
  deleteMessage: { fontSize: 14, color: Colors.textSub, fontFamily: Fonts.regular, lineHeight: 20, marginBottom: 20 },
  deleteActions: { flexDirection: 'row', gap: 12 },
  deleteCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  deleteCancelText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text },
  deleteConfirmBtn: { flex: 1, paddingVertical: 12, borderRadius: Radius.lg, backgroundColor: '#EF4444', alignItems: 'center' },
  deleteConfirmText: { fontSize: 14, fontFamily: Fonts.semiBold, color: '#fff' },
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
