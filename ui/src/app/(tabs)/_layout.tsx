import type { ReactNode } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '../../constants/theme';
import { useCurrentUserContext } from '../../contexts/CurrentUserContext';
import { UserAvatar } from '../../components/UserAvatar';
import { EventsCalendarGlyph, GroupsPeopleGlyph } from '../../components/TabScreenIcons';

/** Renders in React Navigation's label slot (full tab width), not inside the ~31px icon wrapper. */
function TabBarLabel({
  focused,
  color,
  children,
}: {
  focused: boolean;
  color: string;
  children: string;
}) {
  return (
    <Text
      style={[styles.tabBarLabelText, { color }, focused && styles.tabBarLabelTextFocused]}
      numberOfLines={1}
    >
      {children}
    </Text>
  );
}

function TabBarGlyph({
  focused,
  iconNode,
  isAvatar,
  user,
}: {
  focused: boolean;
  iconNode?: ReactNode;
  isAvatar?: boolean;
  user?: { name: string; displayName?: string; thumbnail?: string | null; avatarSeed?: string | null } | null;
}) {
  if (isAvatar && user) {
    return (
      <View style={[styles.avatarWrap, focused && styles.iconWrapActive]}>
        <UserAvatar
          seed={user.displayName || user.name}
          thumbnail={user.thumbnail}
          backgroundColor={user.avatarSeed ? [user.avatarSeed] : undefined}
          size={26}
          style={styles.avatarImg}
        />
      </View>
    );
  }

  if (isAvatar && !user) {
    const c = focused ? Colors.text : Colors.textMuted;
    return (
      <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
        <Ionicons name="person-outline" size={20} color={c} />
      </View>
    );
  }

  return <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>{iconNode}</View>;
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { user: me } = useCurrentUserContext();

  const tabBarLabelFn = (props: { focused: boolean; color: string; children: string }) => (
    <TabBarLabel focused={props.focused} color={props.color}>
      {props.children}
    </TabBarLabel>
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: Colors.text,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabel: tabBarLabelFn,
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
        name="events"
        options={{
          title: 'Events',
          tabBarIcon: ({ focused }) => (
            <TabBarGlyph
              focused={focused}
              iconNode={<EventsCalendarGlyph size={20} color={focused ? Colors.text : Colors.textMuted} />}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="polls"
        options={{
          title: 'Polls',
          tabBarIcon: ({ focused }) => (
            <TabBarGlyph
              focused={focused}
              iconNode={
                <Ionicons
                  name="bar-chart-outline"
                  size={20}
                  color={focused ? Colors.text : Colors.textMuted}
                />
              }
            />
          ),
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Groups',
          tabBarIcon: ({ focused }) => (
            <TabBarGlyph
              focused={focused}
              iconNode={<GroupsPeopleGlyph size={20} color={focused ? Colors.text : Colors.textMuted} />}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabBarGlyph focused={focused} isAvatar user={me} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 40,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: { backgroundColor: '#F0F0EE' },
  avatarWrap: {
    width: 26,
    height: 26,
    minWidth: 26,
    minHeight: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 26, height: 26, minWidth: 26, minHeight: 26, borderRadius: 13 },
  tabBarLabelText: {
    fontSize: 10,
    fontFamily: Fonts.regular,
    textAlign: 'center',
    marginTop: 2,
  },
  tabBarLabelTextFocused: {
    fontFamily: Fonts.bold,
  },
});
