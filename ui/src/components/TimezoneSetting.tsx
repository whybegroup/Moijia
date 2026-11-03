import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTimeZones, rawTimeZones, type TimeZone } from '@vvo/tzdb';
import { Colors, Fonts, Radius } from '../constants/theme';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { useUpdateUser } from '../hooks/api/useUsers';
import { apiErrorMessage } from '../utils/apiErrors';

const ROW_HEIGHT = 64;

type ZoneRow = {
  id: string;
  group: string[];
  offsetMinutes: number;
  offsetLabel: string;
  title: string;
  cities: string[];
  country: string;
  abbreviation: string;
  search: string;
};

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, '0');
  const mins = String(abs % 60).padStart(2, '0');
  return `GMT${sign}${hours}:${mins}`;
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/_/g, ' ')
    .replace(/['’.]/g, '');
}

function offsetSearch(minutes: number): string {
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  const hh = String(hours).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');
  const clock = mins === 0 ? `${sign}${hours}` : `${sign}${hours}:${mm}`;
  return `gmt${sign}${hh}:${mm} gmt${clock} utc${sign}${hh}:${mm} utc${clock} ${sign}${hh}:${mm}`;
}

function toRow(zone: TimeZone): ZoneRow {
  const utc = zone.group.includes('UTC');
  const cities = utc ? [] : zone.mainCities.filter(Boolean);
  const title = utc ? 'Coordinated Universal Time' : zone.alternativeName;
  const offsetLabel = formatOffset(zone.currentTimeOffsetInMinutes);
  const search = [
    offsetLabel,
    offsetSearch(zone.currentTimeOffsetInMinutes),
    title,
    zone.alternativeName,
    zone.abbreviation,
    zone.dstAbbreviation,
    zone.currentAbbreviation,
    ...cities,
    zone.countryName,
    zone.continentName,
    ...zone.group,
  ]
    .filter(Boolean)
    .join(' ');
  return {
    id: utc ? 'UTC' : zone.name,
    group: zone.group,
    offsetMinutes: zone.currentTimeOffsetInMinutes,
    offsetLabel,
    title,
    cities,
    country: zone.countryName,
    abbreviation: zone.currentAbbreviation,
    search: fold(search),
  };
}

function catalog(): ZoneRow[] {
  const live = getTimeZones({ includeUtc: true });
  const known = new Set(live.map((zone) => zone.name));
  const missing: TimeZone[] = rawTimeZones
    .filter((zone) => !known.has(zone.name))
    .map((zone) => ({
      ...zone,
      currentTimeOffsetInMinutes: zone.rawOffsetInMinutes,
      currentTimeFormat: zone.rawFormat,
      currentAbbreviation: zone.abbreviation,
    }));
  const rows = [...live, ...missing].map(toRow);
  if (missing.length > 0) {
    rows.sort(
      (a, b) =>
        a.offsetMinutes - b.offsetMinutes ||
        a.title.localeCompare(b.title) ||
        (a.cities[0] || '').localeCompare(b.cities[0] || '')
    );
  }
  return rows;
}

let cachedZones: ZoneRow[] | null = null;
function allZones(): ZoneRow[] {
  if (!cachedZones) cachedZones = catalog();
  return cachedZones;
}

function matches(row: ZoneRow, timeZone: string): boolean {
  return row.id === timeZone || row.group.includes(timeZone);
}

function primaryLabel(row: ZoneRow): string {
  const city = row.cities[0];
  if (!city) return `(${row.offsetLabel}) ${row.title}`;
  return `(${row.offsetLabel}) ${row.title} — ${city}`;
}

function secondaryLabel(row: ZoneRow): string {
  const rest = row.cities.slice(1).join(', ');
  const abbr = row.abbreviation && !/^GMT/i.test(row.abbreviation) && row.abbreviation !== 'UTC'
    ? row.abbreviation
    : '';
  return [rest, row.country, abbr].filter(Boolean).join(' · ');
}

function closedValue(row: ZoneRow | undefined, selected: string): string {
  if (!row) return selected.replace(/_/g, ' ');
  const city = row.cities[0];
  return city ? `${city} · ${row.title}` : row.title;
}

export function TimezoneSetting() {
  const insets = useSafeAreaInsets();
  const { user, userId } = useCurrentUserContext();
  const updateUser = useUpdateUser(userId ?? '');
  const listRef = useRef<FlatList<ZoneRow>>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [pendingZone, setPendingZone] = useState<string | null>(null);
  const selected = user?.timeZone?.trim() || deviceTimeZone();
  const zones = useMemo(() => allZones(), []);
  const selectedRow = useMemo(
    () => zones.find((zone) => matches(zone, selected)),
    [zones, selected]
  );
  const filtered = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return zones;
    return zones.filter((zone) => zone.search.includes(q));
  }, [query, zones]);

  useEffect(() => {
    if (!open || query) return;
    const index = zones.findIndex((zone) => matches(zone, selected));
    if (index <= 0) return;
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index, viewPosition: 0.3, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, query, zones, selected]);

  const choose = async (timeZone: string) => {
    if (!userId || timeZone === selected || zones.some((zone) => zone.id === timeZone && matches(zone, selected))) {
      setOpen(false);
      return;
    }
    setError('');
    setPendingZone(timeZone);
    try {
      await updateUser.mutateAsync({ timeZone });
      setOpen(false);
      setQuery('');
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save time zone'));
    } finally {
      setPendingZone(null);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.row, styles.rowBorder]}
        onPress={() => {
          setError('');
          setOpen(true);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.rowText}>
          <Text style={styles.label}>Time zone</Text>
          <Text style={styles.value} numberOfLines={1}>
            {closedValue(selectedRow, selected)}
          </Text>
        </View>
        {selectedRow ? (
          <Text style={styles.offset} numberOfLines={1}>
            {selectedRow.offsetLabel}
          </Text>
        ) : null}
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[styles.modal, { paddingTop: insets.top + 8, paddingBottom: insets.bottom }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Time zone</Text>
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search cities, countries, or offsets"
            placeholderTextColor={Colors.textMuted}
            style={styles.search}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <FlatList
            ref={listRef}
            style={styles.list}
            data={filtered}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
            onScrollToIndexFailed={(info) => {
              listRef.current?.scrollToOffset({
                offset: info.averageItemLength * info.index,
                animated: false,
              });
            }}
            renderItem={({ item }) => {
              const active = matches(item, selected);
              const secondary = secondaryLabel(item);
              return (
                <TouchableOpacity
                  style={styles.option}
                  onPress={() => void choose(item.id)}
                  disabled={pendingZone !== null}
                >
                  <View style={styles.rowText}>
                    <Text style={styles.optionTitle} numberOfLines={2}>
                      {primaryLabel(item)}
                    </Text>
                    {secondary ? (
                      <Text style={styles.optionId} numberOfLines={1}>
                        {secondary}
                      </Text>
                    ) : null}
                  </View>
                  {pendingZone === item.id ? (
                    <ActivityIndicator size="small" color={Colors.textSub} />
                  ) : active ? (
                    <Ionicons name="checkmark" size={18} color={Colors.text} />
                  ) : null}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={<Text style={styles.empty}>No matching time zones</Text>}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  label: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textMuted, opacity: 0.65 },
  value: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.text },
  offset: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Colors.textSub,
    fontVariant: ['tabular-nums'],
  },
  modal: { flex: 1, backgroundColor: Colors.bg },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  modalTitle: { fontSize: 18, fontFamily: Fonts.extraBold, color: Colors.text },
  search: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    paddingHorizontal: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    color: Colors.text,
    fontFamily: Fonts.regular,
    fontSize: 15,
  },
  error: { color: Colors.notGoing, fontFamily: Fonts.regular, fontSize: 13, paddingHorizontal: 16, paddingBottom: 8 },
  list: { flex: 1 },
  option: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  optionTitle: { fontSize: 15, fontFamily: Fonts.medium, color: Colors.text },
  optionId: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.textMuted },
  empty: { padding: 16, color: Colors.textMuted, fontFamily: Fonts.regular },
});
