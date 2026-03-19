import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { generateInitialsSvg, generateIconsSvg } from '../utils/avatar';

interface InitialsAvatarProps {
  seed: string;
  backgroundColor: string[];
  size?: number;
  style?: StyleProp<ViewStyle>;
}

interface IconsAvatarProps {
  seed: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function InitialsAvatar({ seed, backgroundColor, size = 256, style }: InitialsAvatarProps) {
  const svg = React.useMemo(() => generateInitialsSvg(seed, backgroundColor, size), [seed, backgroundColor, size]);
  return (
    <View style={[{ width: size, height: size, minWidth: size, minHeight: size, overflow: 'hidden', flexShrink: 0 }, style]}>
      <SvgXml xml={svg} width={size} height={size} />
    </View>
  );
}

export function IconsAvatar({ seed, size = 256, style }: IconsAvatarProps) {
  const svg = React.useMemo(() => generateIconsSvg(seed, size), [seed, size]);
  return (
    <View style={[{ width: size, height: size, overflow: 'hidden' }, style]}>
      <SvgXml xml={svg} width={size} height={size} />
    </View>
  );
}
