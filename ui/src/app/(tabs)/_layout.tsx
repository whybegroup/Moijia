import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '../../constants/theme';
import { useCurrentUserContext } from '../../contexts/CurrentUserContext';
import { UserAvatar } from '../../components/UserAvatar';

function TabIcon({ focused, label, icon, isAvatar, user }: { focused: boolean; label: string; icon: string; isAvatar?: boolean; user?: { name: string; displayName?: string; thumbnail?: string | null; avatarSeed?: string | null } | null }) {
  if (isAvatar && user) {
    return (
      <View style={styles.tabItem}>
        <View style={[styles.avatarWrap, focused && styles.iconWrapActive]}>
          <UserAvatar
            seed={user.displayName || user.name}
            thumbnail={user.thumbnail}
            backgroundColor={user.avatarSeed ? [user.avatarSeed] : undefined}
            size={26}
            style={styles.avatarImg}
          />
        </View>
        <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
      </View>
    );
  }
  
  return (
    <View style={styles.tabItem}>
      <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
        <Text style={styles.iconText}>{icon}</Text>
      </View>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { user: me } = useCurrentUserContext();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
        },
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="Events" icon="⚡" />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="Groups" icon="💬" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="Profile" icon="👤" isAvatar={true} user={me} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabItem: { alignItems: 'center', paddingTop: 8, gap: 3, flexShrink: 0 },
  iconWrap: {
    width: 40, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  iconWrapActive: { backgroundColor: '#F0F0EE' },
  iconText: { fontSize: 18 },
  avatarWrap: {
    width: 26, height: 26, minWidth: 26, minHeight: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImg: { width: 26, height: 26, minWidth: 26, minHeight: 26, borderRadius: 13, flexShrink: 0 },
  tabLabel: {
    fontSize: 10, fontFamily: Fonts.regular, color: Colors.textMuted,
  },
  tabLabelActive: {
    fontFamily: Fonts.bold, color: Colors.text,
  },
});
