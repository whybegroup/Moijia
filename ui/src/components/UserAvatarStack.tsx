import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Fonts } from '../constants/theme';
import { UserAvatar } from './UserAvatar';
import type { User } from '@boltup/client';

type DotUserIds = Set<string> | readonly string[];

export function UserAvatarStack({
  userIds,
  getUser,
  size = 22,
  max = 5,
  dotUserIds,
}: {
  userIds: string[];
  getUser: (id: string) => User;
  size?: number;
  max?: number;
  dotUserIds?: DotUserIds;
}) {
  const shown = userIds.slice(0, max);
  const extra = userIds.length - max;
  const dotSet =
    dotUserIds === undefined
      ? null
      : dotUserIds instanceof Set
        ? dotUserIds
        : new Set(dotUserIds);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {shown.map((uid, i) => {
        const user = getUser(uid);
        const showDot = dotSet?.has(uid) ?? false;
        return (
          <View
            key={uid}
            style={{
              marginLeft: i > 0 ? -(size * 0.3) : 0,
              zIndex: shown.length - i,
              borderRadius: size / 2,
              borderWidth: 2,
              borderColor: Colors.surface,
              position: 'relative',
            }}
          >
            <UserAvatar
              seed={user.displayName || user.name}
              backgroundColor={[user.avatarSeed]}
              thumbnail={user.thumbnail}
              size={size}
            />
            {showDot ? <View style={styles.avatarDot} /> : null}
          </View>
        );
      })}
      {extra > 0 && (
        <View
          style={[
            styles.avatarExtra,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              marginLeft: -(size * 0.3),
            },
          ]}
        >
          <Text style={{ fontSize: size * 0.3, fontFamily: Fonts.semiBold, color: Colors.textSub }}>
            +{extra}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatarDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 9,
    height: 9,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: Colors.surface,
    borderRadius: 10,
  },
  avatarExtra: {
    backgroundColor: Colors.border,
    borderWidth: 2,
    borderColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
