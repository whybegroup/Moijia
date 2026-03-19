import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Colors, Fonts, Radius } from '../constants/theme';
import { GroupAvatar } from './GroupAvatar';
import { getGroupColor, getDefaultGroupThemeFromName, groupAvatarBorderRadius, avatarColor } from '../utils/helpers';
import { IconsAvatar, InitialsAvatar } from './Avatar';
import { ICON_OPTIONS, BOTTT_PRESETS } from '../utils/avatar';

interface GroupAvatarPickerProps {
  defaultSeed: string;
  value: string;
  onChangeText: (text: string) => void;
  /** When provided, shows URL input. Avatar uses thumbnail if valid URL, otherwise seed. */
  thumbnail?: string | null;
  onThumbnailChange?: (text: string | null) => void;
  disabled?: boolean;
  loading?: boolean;
  inputStyle?: object;
  buttonStyle?: object;
  buttonTextStyle?: object;
}

export function GroupAvatarPicker({
  defaultSeed,
  value,
  onChangeText,
  thumbnail,
  onThumbnailChange,
  inputStyle,
}: GroupAvatarPickerProps) {
  const baseInputStyle = [{ padding: 10, paddingHorizontal: 12, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, fontSize: 14, color: Colors.text, fontFamily: Fonts.regular, flex: 1 }, inputStyle];

  return (
    <View>
      {onThumbnailChange != null ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textMuted, marginBottom: 6 }}>Add from URL</Text>
          <TextInput
            value={thumbnail ?? ''}
            onChangeText={(t) => onThumbnailChange(t.trim() || null)}
            placeholder="https://example.com/image.jpg"
            placeholderTextColor={Colors.textMuted}
            style={[baseInputStyle, { flex: 1 }]}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: Fonts.regular, marginTop: 4 }}>
            Use this image when a valid URL is provided; otherwise it uses the seed below.
          </Text>
        </View>
      ) : null}
      <View style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textMuted, marginBottom: 6 }}>
          Choose style
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
          {ICON_OPTIONS.map((preset) => (
            <TouchableOpacity
              key={preset}
              onPress={() => onChangeText(preset)}
              style={{
                width: 44,
                height: 44,
                borderRadius: groupAvatarBorderRadius(44),
                borderWidth: 2,
                borderColor: Colors.border,
                backgroundColor: Colors.bg,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
              activeOpacity={0.8}
            >
              <IconsAvatar seed={preset} size={36} style={{ width: 36, height: 36 }} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <View style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textMuted, marginBottom: 6 }}>
          Avatar seed (or type custom)
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={defaultSeed}
            placeholderTextColor={Colors.textMuted}
            style={baseInputStyle}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>
      <View style={{ marginTop: 8, alignItems: 'center' }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: groupAvatarBorderRadius(56),
            borderWidth: 1,
            backgroundColor: getGroupColor(getDefaultGroupThemeFromName('Group')).row,
            borderColor: getGroupColor(getDefaultGroupThemeFromName('Group')).cal,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <GroupAvatar seed={value.trim() === '' ? 'auto' : value.trim()} thumbnail={thumbnail} size={56} style={{ width: 56, height: 56 }} />
        </View>
      </View>
    </View>
  );
}
