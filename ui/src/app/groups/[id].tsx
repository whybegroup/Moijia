import { Redirect, useLocalSearchParams } from 'expo-router';
import { firstSearchParam } from '../../utils/navigationReturn';

/** Deep links and old `/groups/:id` URLs open the groups tab detail (not a root modal). */
export default function GroupDetailRedirect() {
  const params = useLocalSearchParams<{ id: string; returnTo?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  if (!id) return null;
  const rt = firstSearchParam(params.returnTo);
  const href = rt
    ? (`/(tabs)/groups/${id}?returnTo=${encodeURIComponent(rt)}` as const)
    : (`/(tabs)/groups/${id}` as const);
  return <Redirect href={href} />;
}
