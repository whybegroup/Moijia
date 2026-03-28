import { Redirect, useLocalSearchParams } from 'expo-router';

/** Old `/group/invite?id=` → groups tab stack */
export default function LegacyGroupInviteRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gid = Array.isArray(id) ? id[0] : id;
  if (!gid) return null;
  return <Redirect href={{ pathname: '/groups/invite', params: { id: gid } }} />;
}
