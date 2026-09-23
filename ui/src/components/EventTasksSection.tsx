import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EventUpdate, type EventTask, type EventTaskInput, type User } from '@moijia/client';
import { Colors, Fonts, Radius, Shadows } from '../constants/theme';
import { Sheet } from './ui';
import { UserAvatar } from './UserAvatar';
import { edgeToEdgeModalProps } from './edgeToEdgeModalProps';
import { confirmDestructive } from '../utils/confirmDestructive';
import { SERIES_SCOPE_OPTIONS, type SeriesUpdateScope } from '../utils/seriesUpdateScopeOptions';
import {
  useCreateEventTask,
  useDeleteEventTask,
  useUpdateEventTask,
} from '../hooks/api/useEventTasks';

type AssignTarget = { kind: 'draft' } | { kind: 'task'; taskId: string } | null;

function errorMessage(err: unknown, fallback: string): string {
  const e = err as { body?: { message?: string }; message?: string };
  return e?.body?.message || e?.message || fallback;
}

export function EventTasksSection({
  eventId,
  tasks,
  memberIds,
  currentUserId,
  canEdit,
  repeating,
  getUser,
}: {
  eventId: string;
  tasks: EventTask[];
  memberIds: string[];
  currentUserId: string;
  canEdit: boolean;
  /** True when this date is one of several occurrences in a series. */
  repeating?: boolean;
  getUser: (userId: string) => User;
}) {
  const createTask = useCreateEventTask(eventId, currentUserId);
  const updateTask = useUpdateEventTask(eventId, currentUserId);
  const deleteTask = useDeleteEventTask(eventId, currentUserId);

  const [draft, setDraft] = useState('');
  const [draftAssigneeId, setDraftAssigneeId] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<AssignTarget>(null);
  const [seriesPrompt, setSeriesPrompt] = useState<{ action: 'add' } | { action: 'delete'; task: EventTask } | null>(
    null,
  );
  const [seriesScope, setSeriesScope] = useState<SeriesUpdateScope>(
    EventUpdate.seriesUpdateScope.THIS_OCCURRENCE,
  );

  const members = useMemo(() => {
    return memberIds
      .map((id) => {
        const u = getUser(id);
        return {
          id,
          displayName: u.displayName || u.name || 'Member',
          avatarSeed: u.avatarSeed,
          thumbnail: u.thumbnail,
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [memberIds, getUser]);

  const total = tasks.length;
  const done = tasks.filter((t) => t.completed).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  const selectedAssigneeId =
    assignTarget?.kind === 'draft'
      ? draftAssigneeId
      : assignTarget?.kind === 'task'
        ? (tasks.find((t) => t.id === assignTarget.taskId)?.assigneeId ?? null)
        : null;

  const createTaskNow = async (seriesUpdateScope?: SeriesUpdateScope) => {
    const title = draft.trim();
    if (!title || !canEdit || createTask.isPending) return;
    try {
      await createTask.mutateAsync({
        title,
        assigneeId: draftAssigneeId,
        createdBy: currentUserId,
        ...(seriesUpdateScope
          ? { seriesUpdateScope: seriesUpdateScope as EventTaskInput.seriesUpdateScope }
          : {}),
      });
      setDraft('');
      setDraftAssigneeId(null);
      setSeriesPrompt(null);
    } catch (err) {
      Alert.alert('Could not add task', errorMessage(err, 'Try again.'));
    }
  };

  const submitDraft = () => {
    const title = draft.trim();
    if (!title || !canEdit || createTask.isPending) return;
    if (repeating) {
      setSeriesScope(EventUpdate.seriesUpdateScope.THIS_OCCURRENCE);
      setSeriesPrompt({ action: 'add' });
      return;
    }
    void createTaskNow();
  };

  const toggle = (task: EventTask) => {
    if (!canEdit) return;
    updateTask.mutate(
      { taskId: task.id, input: { actorId: currentUserId, completed: !task.completed } },
      {
        onError: (err) => Alert.alert('Could not update task', errorMessage(err, 'Try again.')),
      },
    );
  };

  const assign = (assigneeId: string | null) => {
    if (!assignTarget) return;
    if (assignTarget.kind === 'draft') {
      setDraftAssigneeId(assigneeId);
      setAssignTarget(null);
      return;
    }
    const taskId = assignTarget.taskId;
    setAssignTarget(null);
    updateTask.mutate(
      { taskId, input: { actorId: currentUserId, assigneeId } },
      {
        onError: (err) => Alert.alert('Could not assign task', errorMessage(err, 'Try again.')),
      },
    );
  };

  const deleteTaskNow = (task: EventTask, seriesUpdateScope?: SeriesUpdateScope) => {
    deleteTask.mutate(
      { taskId: task.id, seriesUpdateScope },
      {
        onSuccess: () => setSeriesPrompt(null),
        onError: (err) => Alert.alert('Could not delete task', errorMessage(err, 'Try again.')),
      },
    );
  };

  const remove = (task: EventTask) => {
    if (repeating) {
      setSeriesScope(EventUpdate.seriesUpdateScope.THIS_OCCURRENCE);
      setSeriesPrompt({ action: 'delete', task });
      return;
    }
    confirmDestructive('Delete task', `Remove “${task.title}”?`, () => deleteTaskNow(task));
  };

  const confirmSeriesPrompt = () => {
    if (!seriesPrompt || createTask.isPending || deleteTask.isPending) return;
    if (seriesPrompt.action === 'add') {
      void createTaskNow(seriesScope);
      return;
    }
    deleteTaskNow(seriesPrompt.task, seriesScope);
  };

  const seriesPromptBusy = createTask.isPending || deleteTask.isPending;

  const assigneeLabel = (userId: string | null | undefined) => {
    if (!userId) return canEdit ? 'Assign' : 'Unassigned';
    const name = getUser(userId).displayName || 'Member';
    return userId === currentUserId ? 'You' : name;
  };

  return (
    <View>
      <Text style={styles.sectionLabel}>Tasks</Text>
      <View style={styles.card}>
        {total > 0 ? (
          <View
            style={styles.progress}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: pct }}
          >
            <View style={styles.progressLabels}>
              <Text style={styles.progressCount}>
                {done} of {total} complete
              </Text>
              <Text style={styles.progressPct}>{pct}%</Text>
            </View>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  { width: `${pct}%` },
                  pct === 100 ? styles.fillDone : null,
                ]}
              />
            </View>
          </View>
        ) : null}

        {tasks.map((task) => {
          const assigneeId = task.assigneeId || null;
          return (
            <View
              key={task.id}
              style={[styles.row, styles.rowBorder]}
            >
              <Pressable
                onPress={() => toggle(task)}
                disabled={!canEdit}
                hitSlop={6}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: task.completed, disabled: !canEdit }}
                accessibilityLabel={task.completed ? `Mark “${task.title}” incomplete` : `Complete “${task.title}”`}
                style={[styles.box, task.completed && styles.boxOn, !canEdit && styles.boxDisabled]}
              >
                {task.completed ? <Ionicons name="checkmark" size={14} color={Colors.accentFg} /> : null}
              </Pressable>
              <Text
                style={[styles.title, task.completed && styles.titleDone]}
              >
                {task.title}
              </Text>
              <Pressable
                onPress={() => canEdit && setAssignTarget({ kind: 'task', taskId: task.id })}
                disabled={!canEdit}
                style={styles.assignee}
                accessibilityRole="button"
                accessibilityLabel={`Assign ${task.title}`}
              >
                {assigneeId ? (
                  <UserAvatar
                    seed={getUser(assigneeId).displayName}
                    backgroundColor={[getUser(assigneeId).avatarSeed ?? '']}
                    thumbnail={getUser(assigneeId).thumbnail}
                    size={18}
                  />
                ) : (
                  <Ionicons name="person-add-outline" size={14} color={Colors.textSub} />
                )}
                <Text style={[styles.assigneeText, task.completed && styles.assigneeDone]} numberOfLines={1}>
                  {assigneeLabel(assigneeId)}
                </Text>
              </Pressable>
              {canEdit ? (
                <Pressable
                  onPress={() => remove(task)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${task.title}`}
                  style={styles.deleteBtn}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
          );
        })}

        {canEdit ? (
          <>
            {total > 0 ? <View style={styles.addDivider} /> : null}
            <View style={styles.addRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Add a task"
              placeholderTextColor={Colors.textMuted}
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={() => void submitDraft()}
              maxLength={200}
              editable={!createTask.isPending}
            />
            <Pressable
              onPress={() => setAssignTarget({ kind: 'draft' })}
              style={styles.assignee}
              accessibilityRole="button"
              accessibilityLabel="Assign new task"
            >
              {draftAssigneeId ? (
                <UserAvatar
                  seed={getUser(draftAssigneeId).displayName}
                  backgroundColor={[getUser(draftAssigneeId).avatarSeed ?? '']}
                  thumbnail={getUser(draftAssigneeId).thumbnail}
                  size={18}
                />
              ) : (
                <Ionicons name="person-add-outline" size={14} color={Colors.textSub} />
              )}
              <Text style={styles.assigneeText} numberOfLines={1}>
                {assigneeLabel(draftAssigneeId)}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void submitDraft()}
              disabled={!draft.trim() || createTask.isPending}
              style={[styles.addBtn, (!draft.trim() || createTask.isPending) && styles.addBtnDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Add task"
            >
              {createTask.isPending ? (
                <ActivityIndicator size="small" color={Colors.accentFg} />
              ) : (
                <Ionicons name="add" size={18} color={Colors.accentFg} />
              )}
            </Pressable>
          </View>
          </>
        ) : null}
      </View>

      <Sheet visible={assignTarget != null} onClose={() => setAssignTarget(null)} variant="dark" dimBackdrop={false}>
        <Text style={styles.sheetTitle}>Assign to</Text>
        <Pressable
          onPress={() => assign(null)}
          style={styles.memberRow}
          accessibilityRole="button"
          accessibilityState={{ selected: !selectedAssigneeId }}
        >
          <Ionicons name="person-outline" size={18} color="rgba(245,245,247,0.7)" />
          <Text style={styles.memberName}>Unassigned</Text>
          {!selectedAssigneeId ? (
            <Ionicons name="checkmark" size={18} color="#f5f5f7" />
          ) : (
            <View style={styles.checkSpacer} />
          )}
        </Pressable>
        {members.map((m) => {
          const selected = selectedAssigneeId === m.id;
          return (
            <Pressable
              key={m.id}
              onPress={() => assign(m.id)}
              style={styles.memberRow}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <UserAvatar
                seed={m.displayName}
                backgroundColor={[m.avatarSeed ?? '']}
                thumbnail={m.thumbnail}
                size={28}
              />
              <Text style={styles.memberName} numberOfLines={1}>
                {m.id === currentUserId ? `${m.displayName} (you)` : m.displayName}
              </Text>
              {selected ? (
                <Ionicons name="checkmark" size={18} color="#f5f5f7" />
              ) : (
                <View style={styles.checkSpacer} />
              )}
            </Pressable>
          );
        })}
      </Sheet>

      <Modal
        visible={seriesPrompt != null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (seriesPromptBusy) return;
          setSeriesPrompt(null);
        }}
        {...edgeToEdgeModalProps}
      >
        <View style={styles.scopeOverlay}>
          <View style={styles.scopeBox}>
            <Text style={styles.scopeTitle}>
              {seriesPrompt?.action === 'delete' ? 'Delete task' : 'Add task'}
            </Text>
            <Text style={styles.scopeMessage}>
              Choose how to apply this to the repeating event.
            </Text>
            <View style={styles.scopeCard}>
              {SERIES_SCOPE_OPTIONS.map((opt, i) => {
                const sel = seriesScope === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => !seriesPromptBusy && setSeriesScope(opt.key)}
                    style={[styles.scopeRow, i > 0 && styles.scopeRowBorder, sel && styles.scopeRowSelected]}
                    activeOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: sel }}
                  >
                    <View style={[styles.scopeRadioOuter, sel && styles.scopeRadioOuterOn]}>
                      {sel ? <View style={styles.scopeRadioInner} /> : null}
                    </View>
                    <View style={styles.scopeTextCol}>
                      <Text style={styles.scopeOptTitle}>{opt.title}</Text>
                      <Text style={styles.scopeOptSub}>{opt.sub}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.scopeActions}>
              <TouchableOpacity
                onPress={() => setSeriesPrompt(null)}
                style={styles.scopeCancelBtn}
                disabled={seriesPromptBusy}
              >
                <Text style={styles.scopeCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmSeriesPrompt}
                style={[styles.scopeSaveBtn, seriesPromptBusy && styles.scopeSaveBtnDisabled]}
                disabled={seriesPromptBusy}
              >
                {seriesPromptBusy ? (
                  <ActivityIndicator size="small" color={Colors.accentFg} />
                ) : (
                  <Text style={styles.scopeSaveText}>
                    {seriesPrompt?.action === 'delete' ? 'Delete' : 'Add'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderStrong,
    overflow: 'hidden',
  },
  progress: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  progressLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressCount: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Colors.textSub,
  },
  progressPct: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
  },
  track: {
    height: 6,
    borderRadius: 99,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 99,
    backgroundColor: Colors.accent,
  },
  fillDone: {
    backgroundColor: Colors.going,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  boxOn: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  boxDisabled: {
    opacity: 0.55,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: Fonts.medium,
    color: Colors.text,
  },
  titleDone: {
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
  },
  assignee: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 118,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: Colors.bg,
  },
  assigneeText: {
    flexShrink: 1,
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.textSub,
  },
  assigneeDone: {
    color: Colors.textMuted,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  addDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.borderStrong,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.text,
    paddingVertical: 8,
    paddingHorizontal: 4,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: {
    opacity: 0.35,
  },
  sheetTitle: {
    fontSize: 17,
    fontFamily: Fonts.semiBold,
    color: '#f5f5f7',
    marginBottom: 16,
    lineHeight: 24,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  memberName: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: '#f5f5f7',
  },
  checkSpacer: {
    width: 18,
  },
  scopeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  scopeBox: {
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    padding: 24,
    width: '100%',
    maxWidth: 400,
    ...Shadows.lg,
  },
  scopeTitle: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: Colors.text,
    marginBottom: 8,
  },
  scopeMessage: {
    fontSize: 14,
    color: Colors.textSub,
    fontFamily: Fonts.regular,
    lineHeight: 20,
    marginBottom: 12,
  },
  scopeCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  scopeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  scopeRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  scopeRowSelected: { backgroundColor: Colors.bg },
  scopeRadioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeRadioOuterOn: { borderColor: Colors.accent },
  scopeRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.accent,
  },
  scopeTextCol: { flex: 1, minWidth: 0 },
  scopeOptTitle: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text },
  scopeOptSub: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  scopeActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'stretch',
    marginTop: 18,
  },
  scopeCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeCancelText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.textSub },
  scopeSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeSaveBtnDisabled: { opacity: 0.45 },
  scopeSaveText: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentFg },
});
