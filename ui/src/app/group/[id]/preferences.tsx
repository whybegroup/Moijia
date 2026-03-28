import { Redirect, useLocalSearchParams } from 'expo-router';

/** Old `/group/:id/preferences` → groups tab stack */
export default function LegacyGroupPreferencesRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gid = Array.isArray(id) ? id[0] : id;
  if (!gid) return null;
  return <Redirect href={`/groups/${gid}/preferences`} />;
}
