import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Image, Alert, Modal, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors, Fonts, Radius } from '../../../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName } from '../../../utils/helpers';
import { useEvent, useGroup, useUpdateEvent, useAllGroupMemberColors, useDeleteEvent } from '../../../hooks/api';
import { NavBar, Field, Toggle } from '../../../components/ui';
import { useCurrentUserContext } from '../../../contexts/CurrentUserContext';

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
  const { data: groupColors = {} } = useAllGroupMemberColors(currentUserId);
  const updateEventMutation = useUpdateEvent(eventId || '', currentUserId ?? '');
  const deleteEventMutation = useDeleteEvent(currentUserId ?? '');

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
    startDate: existingEvent ? formatDate(existingEvent.start) : '',
    startTime: existingEvent ? formatTime(existingEvent.start) : '',
    startAllDay: existingEvent?.isAllDay || false,
    endDate: existingEvent ? formatDate(existingEvent.end) : '',
    endTime: existingEvent ? formatTime(existingEvent.end) : '',
    endAllDay: existingEvent?.isAllDay || false,
    location: existingEvent?.location || '',
    minAttendees: existingEvent?.minAttendees ? String(existingEvent.minAttendees) : '',
    maxAttendees: existingEvent?.maxAttendees ? String(existingEvent.maxAttendees) : '',
    allowMaybe: existingEvent?.allowMaybe || false,
    enableWaitlist: existingEvent?.enableWaitlist || false,
    description: existingEvent?.description || '',
    coverPhotos: existingEvent?.coverPhotos || [],
  });
  const [errors, setErrors] = useState({
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
  });
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Update form when event loads
  React.useEffect(() => {
    if (existingEvent) {
      setForm({
        title: existingEvent.title || '',
        subtitle: existingEvent.subtitle || '',
        groupId: existingEvent.groupId || '',
        startDate: formatDate(existingEvent.start),
        startTime: formatTime(existingEvent.start),
        startAllDay: existingEvent.isAllDay || false,
        endDate: formatDate(existingEvent.end),
        endTime: formatTime(existingEvent.end),
        endAllDay: existingEvent.isAllDay || false,
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

  const needGroupForPermission =
    !!existingEvent && !!currentUserId && existingEvent.createdBy !== currentUserId;
  const loading = eventLoading || (needGroupForPermission && eventGroupLoading);

  React.useEffect(() => {
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

  if (!eventId || loading || !existingEvent) {
    return null;
  }

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
  const ok  = !!form.title.trim() && !!form.startDate && !!form.endDate;

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
      
      await updateEventMutation.mutateAsync({
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || undefined,
        description: form.description.trim() || undefined,
        coverPhotos: form.coverPhotos,
        start: start.toISOString(),
        end: end.toISOString(),
        isAllDay: isAllDay || undefined,
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

  const handleDeleteEvent = async () => {
    setShowDeleteConfirm(false);
    try {
      await deleteEventMutation.mutateAsync(eventId || '');
      router.push('/(tabs)/feed');
    } catch (error) {
      console.error('Failed to delete event:', error);
      Alert.alert('Error', 'Failed to delete event');
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

  const handleStartDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowStartDatePicker(false);
    }
    if (selectedDate) {
      const dateStr = selectedDate.toISOString().slice(0, 10);
      set('startDate', dateStr);
    }
  };

  const handleEndDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndDatePicker(false);
    }
    if (selectedDate) {
      const dateStr = selectedDate.toISOString().slice(0, 10);
      set('endDate', dateStr);
    }
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
    }
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
    }
  };

  const handleEndTimeInputChange = (timeStr: string) => {
    set('endTime', timeStr);
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

        <Field label="Group">
          <Text style={styles.groupReadonly}>
            {eventGroup?.name ?? 'Group'}
          </Text>
        </Field>

        <Field label="Event Title" required>
          <TextInput value={form.title} onChangeText={v => set('title', v)} placeholder="e.g. Game Night" placeholderTextColor={Colors.textMuted} style={styles.input} />
        </Field>

        <Field label="Subtitle">
          <TextInput value={form.subtitle} onChangeText={v => set('subtitle', v)} placeholder="e.g. Bring your favorite board games" placeholderTextColor={Colors.textMuted} style={styles.input} />
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
                    min={new Date().toISOString().slice(0, 10)}
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
