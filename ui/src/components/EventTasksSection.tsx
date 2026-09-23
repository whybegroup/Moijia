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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { EventTask, User } from '@moijia/client';
import { Colors, Fonts } from '../constants/theme';
import { Sheet } from './ui';
import { UserAvatar } from './UserAvatar';
import { confirmDestructive } from '../utils/confirmDestructive';
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
  getUser,
}: {
  eventId: string;
  tasks: EventTask[];
  memberIds: string[];
  currentUserId: string;
  canEdit: boolean;
  getUser: (userId: string) => User;
}) {
  const createTask = useCreateEventTask(eventId, currentUserId);
  const updateTask = useUpdateEventTask(eventId, currentUserId);
  const deleteTask = useDeleteEventTask(eventId, currentUserId);

  const [draft, setDraft] = useState('');
  const [draftAssigneeId, setDraftAssigneeId] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<AssignTarget>(null);

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

  const submitDraft = async () => {
    const title = draft.trim();
    if (!title || !canEdit || createTask.isPending) return;
    try {
      await createTask.mutateAsync({
        title,
        assigneeId: draftAssigneeId,
        createdBy: currentUserId,
      });
      setDraft('');
      setDraftAssigneeId(null);
    } catch (err) {
      Alert.alert('Could not add task', errorMessage(err, 'Try again.'));
    }
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

  const remove = (task: EventTask) => {
    confirmDestructive('Delete task', `Remove “${task.title}”?`, () => {
      deleteTask.mutate(task.id, {
        onError: (err) => Alert.alert('Could not delete task', errorMessage(err, 'Try again.')),
      });
    });
  };

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
        ) : (
          <Text style={styles.empty}>No tasks yet</Text>
        )}

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
          <View style={[styles.addRow, total > 0 ? styles.rowBorder : null]}>
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
        ) : null}
      </View>

      <Sheet visible={assignTarget != null} onClose={() => setAssignTarget(null)}>
        <Text style={styles.sheetTitle}>Assign to</Text>
        <Pressable
          onPress={() => assign(null)}
          style={styles.memberRow}
          accessibilityRole="button"
          accessibilityState={{ selected: !selectedAssigneeId }}
        >
          <Ionicons name="person-outline" size={18} color={Colors.textSub} />
          <Text style={styles.memberName}>Unassigned</Text>
          {!selectedAssigneeId ? (
            <Ionicons name="checkmark" size={18} color={Colors.text} />
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
                <Ionicons name="checkmark" size={18} color={Colors.text} />
              ) : (
                <View style={styles.checkSpacer} />
              )}
            </Pressable>
          );
        })}
      </Sheet>
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
  empty: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textMuted,
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
    color: Colors.text,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  memberName: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: Colors.text,
  },
  checkSpacer: {
    width: 18,
  },
});
