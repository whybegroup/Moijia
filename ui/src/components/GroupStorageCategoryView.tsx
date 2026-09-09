import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { usePathname, useLocalSearchParams, type Href } from 'expo-router';
import { useAppRouter as useRouter } from '../hooks/useAppRouter';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Radius } from '../constants/theme';
import { useGroup, useGroupStorageFiles, useDeleteGroupStorageFile } from '../hooks/api';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useMissingGroupRedirect } from '../hooks/useMissingResourceAlert';
import { ResolvableImage } from './ResolvableImage';
import { ImageLightboxModal } from './ImageLightboxModal';
import { FileExtensionPreview } from './FileExtensionPreview';
import { UserAvatar } from './UserAvatar';
import { apiErrorMessage } from '../utils/apiErrors';
import { confirmDestructive } from '../utils/confirmDestructive';
import { formatStorageBytes } from '../utils/groupStorage';
import { displayFileName, isImageFileUrl, isVideoFileUrl } from '../utils/fileKind';
import {
  isGroupStorageCategory,
  GROUP_STORAGE_CATEGORY_LABELS,
  type GroupStorageCategory,
} from '../utils/groupStorageCategories';
import { parseFromEventId, buildGroupStorageUrl } from '../utils/breadcrumbUrl';

const COLS = 3;
const GAP = 4;
const PAD = 20;

function fileNoun(n: number) {
  return n === 1 ? 'file' : 'files';
}

function fileIsDeletable(file: { canDelete?: boolean }, isAdmin: boolean) {
  if (typeof file.canDelete === 'boolean') return file.canDelete;
  return isAdmin;
}

export function GroupStorageCategoryView({
  groupId,
  category,
}: {
  groupId: string;
  category: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useLocalSearchParams<{ fromEventId?: string | string[] }>();
  const isInEventsTab = pathname.includes('/(tabs)/events/group') || pathname.includes('/events/group');
  const fromEventId = parseFromEventId(searchParams);
  const storageHref = buildGroupStorageUrl(groupId, { isInEventsTab, fromEventId });
  const fallbackHref = (
    isInEventsTab ? `/(tabs)/events/group/${groupId}` : `/(tabs)/groups/${groupId}`
  ) as Href;

  const validCategory = isGroupStorageCategory(category) ? (category as GroupStorageCategory) : null;

  useEffect(() => {
    if (!validCategory) router.replace(storageHref);
  }, [validCategory, router, storageHref]);

  const { userId: currentUserId } = useCurrentUserContext();
  const { data: group, isError, error: groupError, refetch: refetchGroup } = useGroup(
    groupId,
    currentUserId ?? ''
  );
  const canView =
    group?.membershipStatus === 'member' || group?.membershipStatus === 'admin';
  const isAdmin = group?.membershipStatus === 'admin';
  const { data: list, refetch: refetchFiles } = useGroupStorageFiles(
    groupId,
    validCategory ?? '',
    currentUserId ?? '',
    !!validCategory && canView
  );
  const deleteFile = useDeleteGroupStorageFile(groupId, currentUserId ?? '');
  const { refreshControl } = usePullToRefresh([refetchGroup, refetchFiles]);
  const { width: winW } = useWindowDimensions();
  const tile = Math.max(72, Math.floor((winW - PAD * 2 - GAP * (COLS - 1)) / COLS));

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useMissingGroupRedirect(isError, groupError, group?.membershipStatus, fallbackHref);

  useEffect(() => {
    if (group && !canView) router.replace(fallbackHref);
  }, [group, canView, router, fallbackHref]);

  const files = list?.files ?? [];
  const urls = useMemo(() => files.map((f) => f.url), [files]);
  const currentFile = lightboxIndex != null ? files[lightboxIndex] : undefined;
  const uploaderName = currentFile?.uploadedByName?.trim();
  const deletableUrls = useMemo(
    () => files.filter((f) => fileIsDeletable(f, !!isAdmin)).map((f) => f.url),
    [files, isAdmin]
  );
  const deletableSet = useMemo(() => new Set(deletableUrls), [deletableUrls]);
  const selectedCount = selected.size;
  const allSelected = deletableUrls.length > 0 && selectedCount === deletableUrls.length;

  useEffect(() => {
    const live = new Set(urls);
    setSelected((prev) => {
      const next = new Set([...prev].filter((u) => live.has(u)));
      return next.size === prev.size ? prev : next;
    });
  }, [urls]);

  useEffect(() => {
    if (files.length === 0 && selecting) {
      setSelecting(false);
      setSelected(new Set());
    }
  }, [files.length, selecting]);

  const exitSelect = useCallback(() => {
    setSelecting(false);
    setSelected(new Set());
  }, []);

  const enterSelect = useCallback((initial?: string) => {
    setLightboxIndex(null);
    setSelecting(true);
    setSelected(initial && deletableSet.has(initial) ? new Set([initial]) : new Set());
  }, [deletableSet]);

  const toggleSelected = useCallback((url: string) => {
    if (!deletableSet.has(url)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }, [deletableSet]);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      if (deletableUrls.length > 0 && prev.size === deletableUrls.length) return new Set();
      return new Set(deletableUrls);
    });
  }, [deletableUrls]);

  const performDelete = useCallback(
    async (listToDelete: string[]) => {
      if (listToDelete.length === 0) return;
      const many = listToDelete.length > 1;
      try {
        await deleteFile.mutateAsync(listToDelete);
        setSelected(new Set());
        setSelecting(false);
        setLightboxIndex((idx) => {
          if (idx == null) return null;
          const remaining = urls.filter((u) => !listToDelete.includes(u));
          if (remaining.length === 0) return null;
          return Math.min(idx, remaining.length - 1);
        });
      } catch (e) {
        const msg = apiErrorMessage(e, many ? 'Could not delete files' : 'Could not delete file');
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Error', msg);
      }
    },
    [deleteFile, urls]
  );

  const confirmDelete = useCallback(
    (toDelete: string | string[]) => {
      const listToDelete = (Array.isArray(toDelete) ? toDelete : [toDelete]).filter((u) =>
        deletableSet.has(u)
      );
      if (listToDelete.length === 0) return;
      const many = listToDelete.length > 1;
      const title = many ? `Delete ${listToDelete.length} files` : 'Delete file';
      const message = many
        ? 'These files will be removed from the group and deleted from storage.'
        : 'This file will be removed from the group and deleted from storage.';
      confirmDestructive(title, message, () => void performDelete(listToDelete));
    },
    [deletableSet, performDelete]
  );

  if (!group || !canView || !validCategory) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={Colors.textSub} />
      </View>
    );
  }

  const label = GROUP_STORAGE_CATEGORY_LABELS[validCategory];

  return (
    <View style={styles.page}>
      <ScrollView
        style={styles.scroll}
        refreshControl={refreshControl}
        contentContainerStyle={[styles.content, selecting && selectedCount > 0 && styles.contentWithBar]}
        alwaysBounceVertical
        showsVerticalScrollIndicator={false}
      >
        {files.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No files in {label.toLowerCase()}</Text>
          </View>
        ) : (
          <>
            {(selecting || deletableUrls.length > 0) ? (
            <View style={styles.toolbar}>
              {selecting ? (
                <>
                  <TouchableOpacity
                    onPress={exitSelect}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel selection"
                  >
                    <Text style={styles.toolbarAction}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={styles.toolbarCount}>
                    {selectedCount} selected
                  </Text>
                  <TouchableOpacity
                    onPress={toggleSelectAll}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={allSelected ? 'Deselect all' : 'Select all'}
                  >
                    <Text style={styles.toolbarAction}>{allSelected ? 'Deselect all' : 'Select all'}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  onPress={() => enterSelect()}
                  hitSlop={8}
                  style={styles.toolbarSelect}
                  accessibilityRole="button"
                  accessibilityLabel="Select files"
                >
                  <Text style={styles.toolbarAction}>Select</Text>
                </TouchableOpacity>
              )}
            </View>
            ) : null}
            <View style={styles.grid}>
              {files.map((file, i) => {
                const isSelected = selected.has(file.url);
                const canDelete = fileIsDeletable(file, !!isAdmin);
                const isImage = isImageFileUrl(file.url, file.fileName) || isVideoFileUrl(file.url, file.fileName);
                const shownName = displayFileName(file.url, file.fileName);
                return (
                  <View key={`${file.url}-${i}`} style={[styles.tileWrap, { width: tile, height: tile }]}>
                    <TouchableOpacity
                      onPress={() => (selecting ? toggleSelected(file.url) : setLightboxIndex(i))}
                      onLongPress={
                        canDelete
                          ? () => {
                              if (selecting) toggleSelected(file.url);
                              else enterSelect(file.url);
                            }
                          : undefined
                      }
                      delayLongPress={280}
                      activeOpacity={0.9}
                      accessibilityRole="button"
                      accessibilityLabel={
                        file.sourceLabel
                          ? `${file.sourceLabel}: ${shownName}`
                          : shownName
                      }
                      accessibilityState={selecting && canDelete ? { selected: isSelected } : undefined}
                      accessibilityHint={
                        selecting || !canDelete ? undefined : 'Long press to select'
                      }
                    >
                      {isImage ? (
                        <ResolvableImage
                          storedUrl={file.url}
                          style={{ width: tile, height: tile, backgroundColor: Colors.bg }}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={{ width: tile, height: tile }}>
                          <FileExtensionPreview url={file.url} fileName={file.fileName} />
                        </View>
                      )}
                      {selecting && isSelected ? <View style={styles.selectedDim} /> : null}
                    </TouchableOpacity>
                    {selecting && canDelete ? (
                      <View style={styles.checkBtn} pointerEvents="none">
                        <View style={[styles.check, isSelected && styles.checkOn]}>
                          {isSelected ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
                        </View>
                      </View>
                    ) : !selecting && canDelete ? (
                      <TouchableOpacity
                        onPress={() => confirmDelete(file.url)}
                        style={styles.removeBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Delete file"
                        disabled={deleteFile.isPending}
                      >
                        <Ionicons name="close" size={11} color="#fff" />
                      </TouchableOpacity>
                    ) : null}
                    {file.byteSize > 0 ? (
                      <View style={styles.sizeBadge} pointerEvents="none">
                        <Text style={styles.sizeText}>{formatStorageBytes(file.byteSize)}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
      {selecting ? (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            onPress={() => confirmDelete([...selected])}
            disabled={selectedCount === 0 || deleteFile.isPending}
            style={[styles.deleteBtn, selectedCount === 0 && styles.deleteBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${selectedCount} ${fileNoun(selectedCount)}`}
          >
            {deleteFile.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.deleteBtnText}>
                {selectedCount === 0
                  ? 'Delete'
                  : `Delete ${selectedCount} ${fileNoun(selectedCount)}`}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
      <ImageLightboxModal
        visible={!selecting && lightboxIndex != null && urls.length > 0}
        urls={urls}
        names={files.map((f) => f.fileName)}
        index={lightboxIndex ?? 0}
        onChangeIndex={(i) => setLightboxIndex(i)}
        onClose={() => setLightboxIndex(null)}
        headerAvatar={
          uploaderName ? (
            <UserAvatar
              seed={uploaderName}
              backgroundColor={[currentFile?.uploadedByAvatarSeed ?? '']}
              thumbnail={currentFile?.uploadedByThumbnail ?? null}
              size={28}
            />
          ) : undefined
        }
        title={uploaderName || currentFile?.sourceLabel || label}
        subtitle={
          uploaderName && currentFile?.sourceLabel && currentFile.sourceLabel !== uploaderName
            ? currentFile.sourceLabel
            : undefined
        }
        showCounter
        onDelete={
          lightboxIndex != null && fileIsDeletable(files[lightboxIndex] ?? {}, !!isAdmin)
            ? (url) => void performDelete([url])
            : undefined
        }
        deleting={deleteFile.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.bg },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: PAD, paddingTop: 12, paddingBottom: 40 },
  contentWithBar: { paddingBottom: 24 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
    marginBottom: 12,
  },
  toolbarSelect: { marginLeft: 'auto' },
  toolbarAction: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text },
  toolbarCount: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.textSub },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tileWrap: { position: 'relative', borderRadius: Radius.lg, overflow: 'hidden' },
  selectedDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  removeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent,
  },
  sizeBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sizeText: { color: '#fff', fontSize: 10, fontFamily: Fonts.semiBold },
  empty: {
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.textSub },
  bottomBar: {
    paddingHorizontal: PAD,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: Colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  deleteBtn: {
    backgroundColor: Colors.notGoing,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  deleteBtnDisabled: { opacity: 0.4 },
  deleteBtnText: { fontSize: 15, fontFamily: Fonts.semiBold, color: '#fff' },
});
