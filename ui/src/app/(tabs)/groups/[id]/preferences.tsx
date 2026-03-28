import { Redirect, useLocalSearchParams } from 'expo-router';

/** Preferences merged into group detail; keep route for bookmarks. */
export default function GroupPreferencesRedirectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gid = Array.isArray(id) ? id[0] : id;
  if (!gid) return null;
  return <Redirect href={`/groups/${gid}`} />;
}
