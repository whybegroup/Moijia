import { Redirect, useLocalSearchParams } from 'expo-router';

function useLegacyGroupIdParam(): string | null {
  const { id } = useLocalSearchParams<{ id: string }>();
  const raw = Array.isArray(id) ? id[0] : id;
  return raw || null;
}

/** Old `/group/:id` and `/group/:id/preferences` → groups tab detail */
export function LegacyRedirectToGroupDetail() {
  const gid = useLegacyGroupIdParam();
  if (!gid) return null;
  return <Redirect href={`/(tabs)/groups/${gid}`} />;
}

/** Old `/group/invite?id=` → groups invite flow */
export function LegacyRedirectToGroupInvite() {
  const gid = useLegacyGroupIdParam();
  if (!gid) return null;
  return <Redirect href={{ pathname: '/groups/invite', params: { id: gid } }} />;
}
