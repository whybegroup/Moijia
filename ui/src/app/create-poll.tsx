import { useState, useEffect, useRef, useMemo, useCallback, type ChangeEvent } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import Toast from 'react-native-toast-message';
import { PollOptionInputKind, PollTextFont, type PollInput } from '@moijia/client';
import { Colors, Fonts, Radius } from '../constants/theme';
import { getGroupColor, getDefaultGroupThemeFromName, formatLocalDateInput } from '../utils/helpers';
import { localWallDateTimeToUtcIso } from '../utils/datetimeUtc';
import { NavBar, Field, Toggle, formSectionTitleStyle } from '../components/ui';
import { EventFormPopoverChrome } from '../components/EventFormPopoverChrome';
import { useGroups, useCreatePoll, useAllGroupMemberColors } from '../hooks/api';
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
import { firstSearchParam, parseReturnToParam, withReturnTo } from '../utils/navigationReturn';
import { PollRichTextInput } from '../components/PollRichTextInput';

function webPollDatetimeInputStyle(): Record<string, string | number> {
  return {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1.5px solid #E5E5E5',
    backgroundColor: '#FAFAFA',
    fontSize: 13,
    color: '#1A1A1A',
    fontFamily: 'DMSans_400Regular',
    boxSizing: 'border-box',
    outline: 'none',
    minWidth: 0,
    width: '100%',
  };
}

type OptionDraft = {
  id: string;
  inputKind: PollOptionInputKind;
  textFont: PollTextFont;
  textBody: string;
  date: string;
  time: string;
};

function newOptionDraft(): OptionDraft {
  return {
    id: uid(),
    inputKind: PollOptionInputKind.TEXT,
    textFont: PollTextFont.SANS,
    textBody: '',
    date: formatLocalDateInput(new Date()),
    time: '12:00',
  };
}

function stripForLength(s: string): number {
  const t = s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length;
}

export default function CreatePollScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const createReturnTo = useMemo(
    () => parseReturnToParam(firstSearchParam(params.returnTo)),
    [params.returnTo],
  );
  const { userId: currentUserId } = useCurrentUserContext();
  const { data: groups = [] } = useGroups(currentUserId ?? '');
  const { data: groupColors = {} } = useAllGroupMemberColors(currentUserId || '');
  const createPollMutation = useCreatePoll(currentUserId ?? '');

  const [form, setForm] = useState({
    title: '',
    description: '',
    groupId: '',
    coverPhotoDrafts: [] as CoverPhotoDraft[],
    anonymousVotes: false,
    multipleChoice: false,
    ranking: false,
  });
  const [optionDrafts, setOptionDrafts] = useState<OptionDraft[]>(() => [newOptionDraft(), newOptionDraft()]);
  const [coverPhotoBusy, setCoverPhotoBusy] = useState(false);
  const [pickerFor, setPickerFor] = useState<{ optionId: string; mode: 'date' | 'time' } | null>(null);

  const eventEligibleGroups = groups.filter(
    (g) => g.membershipStatus === 'member' || g.membershipStatus === 'admin',
  );

  useEffect(() => {
    if (eventEligibleGroups.length > 0 && !form.groupId) {
      setForm((p) => ({ ...p, groupId: eventEligibleGroups[0]!.id }));
    }
  }, [eventEligibleGroups, form.groupId]);

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

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

  const updateOption = (id: string, patch: Partial<OptionDraft>) => {
    setOptionDrafts((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addOption = () => setOptionDrafts((rows) => [...rows, newOptionDraft()]);

  const removeOption = (id: string) => {
    setOptionDrafts((rows) => (rows.length <= 2 ? rows : rows.filter((r) => r.id !== id)));
  };

  const optionsValid = useMemo(
    () =>
      optionDrafts.every((o) => {
        if (o.inputKind === PollOptionInputKind.DATETIME) {
          return !!(o.date?.trim() && o.time?.trim());
        }
        return stripForLength(o.textBody) > 0;
      }),
    [optionDrafts],
  );

  const ok =
    !!form.title.trim() &&
    !!form.groupId &&
    optionDrafts.length >= 2 &&
    optionsValid &&
    !!currentUserId;

  const dismiss = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (createReturnTo) {
      router.replace(createReturnTo as Href);
      return;
    }
    router.replace('/(tabs)/events');
  }, [router, createReturnTo]);

  const submit = async () => {
    if (!ok || !currentUserId) return;
    let coverPhotos: string[] = [];
    if (form.coverPhotoDrafts.length > 0) {
      try {
        coverPhotos = await uploadCoverPhotoDrafts(currentUserId, form.coverPhotoDrafts);
      } catch {
        Alert.alert('Error', 'Failed to upload photos. Try again.');
        return;
      }
    }

    const options = optionDrafts.map((o, i) => {
      if (o.inputKind === PollOptionInputKind.DATETIME) {
        return {
          id: o.id,
          inputKind: PollOptionInputKind.DATETIME,
          sortOrder: i,
          dateTimeValue: localWallDateTimeToUtcIso(o.date, o.time),
        };
      }
      return {
        id: o.id,
        inputKind: PollOptionInputKind.TEXT,
        sortOrder: i,
        textHtml: o.textBody.trim(),
        textFont: o.textFont,
      };
    });

    const body: PollInput = {
      id: uid(),
      groupId: form.groupId,
      createdBy: currentUserId,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      coverPhotos,
      options,
      anonymousVotes: form.anonymousVotes,
      multipleChoice: form.multipleChoice,
      ranking: form.ranking,
    };

    try {
      const created = await createPollMutation.mutateAsync(body);
      Toast.show({ type: 'success', text1: 'Poll created' });
      router.replace(withReturnTo(`/poll/${created.id}`, createReturnTo));
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'body' in e
          ? String((e as { body?: { error?: string } }).body?.error ?? '')
          : '';
      Alert.alert('Error', msg || 'Failed to create poll');
    }
  };

  return (
    <EventFormPopoverChrome onClose={dismiss}>
      <View style={styles.inner}>
        <NavBar
          title="New Poll"
          onClose={dismiss}
          right={
            <TouchableOpacity
              onPress={() => void submit()}
              disabled={!ok || createPollMutation.isPending}
              style={[styles.headerBtn, (!ok || createPollMutation.isPending) && styles.headerBtnDis]}
            >
              {createPollMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.accentFg} />
              ) : (
                <Text style={[styles.headerBtnText, !ok && { color: Colors.textMuted }]} numberOfLines={1}>
                  Create
                </Text>
              )}
            </TouchableOpacity>
          }
        />
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 100, width: '100%', alignSelf: 'stretch' }}
          showsVerticalScrollIndicator={false}
        >
          <Field label="Group" required>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {eventEligibleGroups.map((g) => {
                const userColorHex = groupColors[g.id] || getDefaultGroupThemeFromName(g.name);
                const p = getGroupColor(userColorHex);
                const sel = form.groupId === g.id;
                return (
                  <TouchableOpacity
                    key={g.id}
                    onPress={() => set('groupId', g.id)}
                    style={[styles.groupChip, sel && { borderColor: p.dot, backgroundColor: p.row }]}
                  >
                    <Text style={[styles.chipText, sel && { color: p.text, fontFamily: Fonts.semiBold }]}>
                      {g.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Field>

          <Field label="Poll title" required>
            <TextInput
              value={form.title}
              onChangeText={(v) => set('title', v)}
              placeholder="e.g. Where should we eat?"
              placeholderTextColor={Colors.textMuted}
              style={styles.input}
            />
          </Field>

          <Field label="Description">
            <View style={styles.descBox}>
              <TextInput
                value={form.description}
                onChangeText={(v) => set('description', v)}
                placeholder="Context, rules, or details"
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={4}
                maxLength={500}
                style={styles.descInput}
              />
              <Text style={styles.descCount}>{form.description.length}/500</Text>
            </View>
          </Field>

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
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ borderBottomWidth: 1, borderBottomColor: Colors.border }}
                  contentContainerStyle={{ gap: 4, padding: 10 }}
                >
                  {form.coverPhotoDrafts.map((d, i) => (
                    <View key={`${i}-${coverPhotoDraftDisplayUri(d)}`} style={{ position: 'relative' }}>
                      <ResolvableImage
                        storedUrl={coverPhotoDraftDisplayUri(d)}
                        style={{ width: 80, height: 80, borderRadius: Radius.lg }}
                        resizeMode="cover"
                      />
                      <TouchableOpacity onPress={() => removeCoverPhotoAt(i)} style={styles.removeThumb}>
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
            </View>
          </View>

          <Field label="Poll options" required>
            <Text style={styles.optionsHint}>Add at least two choices. Each can be formatted text or a date and time.</Text>
            {optionDrafts.map((o, index) => (
              <View key={o.id} style={styles.optionCard}>
                <View style={styles.optionHeader}>
                  <Text style={styles.optionIndex}>Option {index + 1}</Text>
                  <View style={styles.kindChips}>
                    <TouchableOpacity
                      onPress={() => updateOption(o.id, { inputKind: PollOptionInputKind.TEXT })}
                      style={[
                        styles.kindChip,
                        o.inputKind === PollOptionInputKind.TEXT && styles.kindChipOn,
                      ]}
                    >
                      <Text
                        style={[
                          styles.kindChipText,
                          o.inputKind === PollOptionInputKind.TEXT && styles.kindChipTextOn,
                        ]}
                      >
                        Text
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => updateOption(o.id, { inputKind: PollOptionInputKind.DATETIME })}
                      style={[
                        styles.kindChip,
                        o.inputKind === PollOptionInputKind.DATETIME && styles.kindChipOn,
                      ]}
                    >
                      <Text
                        style={[
                          styles.kindChipText,
                          o.inputKind === PollOptionInputKind.DATETIME && styles.kindChipTextOn,
                        ]}
                      >
                        Date & time
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {optionDrafts.length > 2 ? (
                    <TouchableOpacity onPress={() => removeOption(o.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="trash-outline" size={20} color={Colors.textMuted} />
                    </TouchableOpacity>
                  ) : (
                    <View style={{ width: 24 }} />
                  )}
                </View>

                {o.inputKind === PollOptionInputKind.TEXT ? (
                  <View>
                    <View style={styles.fontRow}>
                      {[
                        { key: PollTextFont.SANS, label: 'Sans' },
                        { key: PollTextFont.SERIF, label: 'Serif' },
                        { key: PollTextFont.MONO, label: 'Mono' },
                      ].map(({ key, label }) => (
                        <TouchableOpacity
                          key={key}
                          onPress={() => updateOption(o.id, { textFont: key })}
                          style={[styles.fontChip, o.textFont === key && styles.fontChipOn]}
                        >
                          <Text
                            style={[styles.fontChipText, o.textFont === key && styles.fontChipTextOn]}
                          >
                            {label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <PollRichTextInput
                      value={o.textBody}
                      onChange={(textBody) => updateOption(o.id, { textBody })}
                      placeholder="Option label"
                      textFont={o.textFont}
                    />
                  </View>
                ) : Platform.OS === 'web' ? (
                  <View style={styles.dtRow}>
                    <View style={styles.dtTouch}>
                      <Text style={styles.dtLabel}>Date</Text>
                      <input
                        type="date"
                        value={o.date}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          updateOption(o.id, { date: e.target.value })
                        }
                        style={webPollDatetimeInputStyle()}
                      />
                    </View>
                    <View style={styles.dtTouch}>
                      <Text style={styles.dtLabel}>Time</Text>
                      <input
                        type="time"
                        value={o.time}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          updateOption(o.id, { time: e.target.value })
                        }
                        style={webPollDatetimeInputStyle()}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={styles.dtRow}>
                    <TouchableOpacity
                      onPress={() => setPickerFor({ optionId: o.id, mode: 'date' })}
                      style={styles.dtTouch}
                    >
                      <Text style={styles.dtLabel}>Date</Text>
                      <Text style={styles.dtValue}>{o.date || 'Select'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setPickerFor({ optionId: o.id, mode: 'time' })}
                      style={styles.dtTouch}
                    >
                      <Text style={styles.dtLabel}>Time</Text>
                      <Text style={styles.dtValue}>{o.time || 'Select'}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {Platform.OS !== 'web' && pickerFor?.optionId === o.id && pickerFor.mode === 'date' ? (
                  <DateTimePicker
                    value={o.date ? new Date(`${o.date}T12:00:00`) : new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_, d) => {
                      if (Platform.OS === 'android') setPickerFor(null);
                      if (d) updateOption(o.id, { date: formatLocalDateInput(d) });
                    }}
                  />
                ) : null}
                {Platform.OS !== 'web' && pickerFor?.optionId === o.id && pickerFor.mode === 'time' ? (
                  <DateTimePicker
                    value={(() => {
                      const [h, m] = o.time.split(':').map(Number);
                      const x = new Date();
                      x.setHours(h || 0, m || 0, 0, 0);
                      return x;
                    })()}
                    mode="time"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_, d) => {
                      if (Platform.OS === 'android') setPickerFor(null);
                      if (d) {
                        const hh = String(d.getHours()).padStart(2, '0');
                        const mm = String(d.getMinutes()).padStart(2, '0');
                        updateOption(o.id, { time: `${hh}:${mm}` });
                      }
                    }}
                  />
                ) : null}
                {Platform.OS === 'ios' && pickerFor?.optionId === o.id ? (
                  <View style={styles.pickerDoneRow}>
                    <TouchableOpacity onPress={() => setPickerFor(null)} style={styles.pickerDoneBtn}>
                      <Text style={styles.pickerDoneText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            ))}
            <TouchableOpacity onPress={addOption} style={styles.addOptionBtn}>
              <Ionicons name="add-circle-outline" size={20} color={Colors.accent} />
              <Text style={styles.addOptionText}>Add option</Text>
            </TouchableOpacity>
          </Field>

          <Field label="Settings">
            <View style={styles.settingsCard}>
              <Toggle value={form.anonymousVotes} onChange={(v) => set('anonymousVotes', v)} label="Anonymous votes" />
              <Toggle
                value={form.multipleChoice}
                onChange={(v) => set('multipleChoice', v)}
                label="Allow multiple choices"
              />
              <Toggle value={form.ranking} onChange={(v) => set('ranking', v)} label="Ranking (ordered preferences)" />
            </View>
          </Field>

          <TouchableOpacity
            onPress={() => void submit()}
            style={[styles.submitBtn, (!ok || createPollMutation.isPending) && { backgroundColor: Colors.border }]}
            disabled={!ok || createPollMutation.isPending}
          >
            {createPollMutation.isPending ? (
              <ActivityIndicator color={Colors.accentFg} />
            ) : (
              <Text style={[styles.submitBtnText, !ok && { color: Colors.textMuted }]} numberOfLines={1}>
                Create poll
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </EventFormPopoverChrome>
  );
}

const styles = StyleSheet.create({
  inner: { flex: 1, backgroundColor: Colors.bg },
  headerBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    flexShrink: 0,
  },
  headerBtnDis: { backgroundColor: Colors.border },
  headerBtnText: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  groupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipText: { fontSize: 13, color: Colors.textSub, fontFamily: Fonts.regular },
  input: {
    padding: 10,
    paddingHorizontal: 14,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    fontSize: 14,
    color: Colors.text,
    fontFamily: Fonts.regular,
  },
  descBox: {
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    padding: 12,
  },
  descInput: {
    minHeight: 88,
    fontSize: 14,
    color: Colors.text,
    fontFamily: Fonts.regular,
    textAlignVertical: 'top',
  },
  descCount: { fontSize: 11, color: Colors.textMuted, marginTop: 8, fontFamily: Fonts.regular },
  photosSection: { marginTop: 8, marginBottom: 8 },
  photosCard: {
    marginTop: 8,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  photosToolbar: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  photoBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  removeThumb: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  optionsHint: {
    fontSize: 13,
    color: Colors.textMuted,
    fontFamily: Fonts.regular,
    marginBottom: 12,
    lineHeight: 18,
  },
  optionCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.xl,
    padding: 14,
    marginBottom: 12,
    backgroundColor: Colors.surface,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  optionIndex: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.text, flex: 1 },
  kindChips: { flexDirection: 'row', gap: 6 },
  kindChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  kindChipOn: { borderColor: Colors.accent, backgroundColor: `${Colors.accent}18` },
  kindChipText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.textSub },
  kindChipTextOn: { color: Colors.accent, fontFamily: Fonts.semiBold },
  dtRow: { flexDirection: 'row', gap: 10 },
  dtTouch: {
    flex: 1,
    padding: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  dtLabel: { fontSize: 11, color: Colors.textMuted, fontFamily: Fonts.regular, marginBottom: 4 },
  dtValue: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text },
  pickerDoneRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  pickerDoneBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
  },
  pickerDoneText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentFg },
  addOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  addOptionText: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.accent },
  settingsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
  },
  submitBtn: {
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: Radius.xl,
    backgroundColor: Colors.accent,
    alignItems: 'center',
  },
  submitBtnText: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.accentFg },
});
