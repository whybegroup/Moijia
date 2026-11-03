import { useMemo, useState } from 'react';
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
import { Colors, Fonts, Radius } from '../constants/theme';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { useUpdateUser } from '../hooks/api/useUsers';
import { apiErrorMessage } from '../utils/apiErrors';

const FALLBACK_ZONES = [
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Africa/Cairo',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function zoneOptions(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  try {
    const zones = intl.supportedValuesOf?.('timeZone');
    if (zones && zones.length > 0) return [...zones];
  } catch {
    /* use the fallback list */
  }
  return FALLBACK_ZONES;
}

function zoneTitle(timeZone: string): string {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longGeneric' })
      .formatToParts(new Date())
      .find((part) => part.type === 'timeZoneName')?.value;
    if (name) return name;
  } catch {
    /* show the id */
  }
  return timeZone.replace(/_/g, ' ');
}

function zoneCity(timeZone: string): string {
  const city = timeZone.split('/').pop() || timeZone;
  return city.replace(/_/g, ' ');
}

export function TimezoneSetting() {
  const insets = useSafeAreaInsets();
  const { user, userId } = useCurrentUserContext();
  const updateUser = useUpdateUser(userId ?? '');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [pendingZone, setPendingZone] = useState<string | null>(null);
  const selected = user?.timeZone?.trim() || deviceTimeZone();
  const zones = useMemo(() => zoneOptions(), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return zones;
    return zones.filter((zone) => {
      const haystack = `${zone} ${zoneTitle(zone)} ${zoneCity(zone)}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [query, zones]);

  const choose = async (timeZone: string) => {
    if (!userId || timeZone === selected) {
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
            {zoneTitle(selected)}
          </Text>
        </View>
        <Text style={styles.city} numberOfLines={1}>
          {zoneCity(selected)}
        </Text>
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
            placeholder="Search cities"
            placeholderTextColor={Colors.textMuted}
            style={styles.search}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <FlatList
            data={filtered}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const active = item === selected;
              return (
                <TouchableOpacity
                  style={styles.option}
                  onPress={() => void choose(item)}
                  disabled={pendingZone !== null}
                >
                  <View style={styles.rowText}>
                    <Text style={styles.optionTitle}>{zoneTitle(item)}</Text>
                    <Text style={styles.optionId}>{item}</Text>
                  </View>
                  {pendingZone === item ? (
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
  city: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.textMuted, maxWidth: 120 },
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
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  optionTitle: { fontSize: 15, fontFamily: Fonts.medium, color: Colors.text },
  optionId: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.textMuted },
  empty: { padding: 16, color: Colors.textMuted, fontFamily: Fonts.regular },
});
