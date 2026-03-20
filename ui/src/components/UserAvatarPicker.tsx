import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Colors, Fonts, Radius } from '../constants/theme';
import { UserAvatar } from './UserAvatar';
import { getGroupColor, getDefaultGroupThemeFromName, groupAvatarBorderRadius, avatarColor } from '../utils/helpers';
import { IconsAvatar, InitialsAvatar } from './Avatar';
import { ICON_OPTIONS, BOTTT_PRESETS } from '../utils/avatar';
import ColorPicker, { ColorFormatsObject, HueSlider, OpacitySlider, Panel1 } from 'reanimated-color-picker';

const DEFAULT_COLOR_PICKER_HEX = '#6366f1';

function toValidHex(s: string): string {
  const trimmed = (s || '').trim();
  if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(trimmed)) return trimmed;
  return DEFAULT_COLOR_PICKER_HEX;
}

interface UserAvatarPickerProps {
  value: string;
  onChangeBackgroundColor: (colors: ColorFormatsObject) => void;
  /** When provided, shows URL input. Avatar uses thumbnail if valid URL, otherwise seed. */
  thumbnail?: string | null;
  onThumbnailChange?: (text: string | null) => void;
  /** For user variant: when provided, shows "Use initial" option to clear to letter avatar. */
  userName?: string;
  disabled?: boolean;
  loading?: boolean;
  inputStyle?: object;
  buttonStyle?: object;
  buttonTextStyle?: object;
}

export function UserAvatarPicker({
  value,
  onChangeBackgroundColor,
  thumbnail,
  onThumbnailChange,
  userName,
  inputStyle,
}: UserAvatarPickerProps) {
  const baseInputStyle = [{ padding: 10, paddingHorizontal: 12, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, fontSize: 14, color: Colors.text, fontFamily: Fonts.regular, flex: 1 }, inputStyle];
  const pickerValue = toValidHex(value);

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
          Choose background color
        </Text>
        <ColorPicker
          style={{ width: '100%' }}
          value={pickerValue}
          onCompleteJS={onChangeBackgroundColor}
        >
          <Panel1 />
          <HueSlider />
          <OpacitySlider />
        </ColorPicker>
      </View>
      <View style={{ marginTop: 8, alignItems: 'center' }}>
        <UserAvatar seed={userName} backgroundColor={[pickerValue]} thumbnail={thumbnail} size={56} style={{ width: 56, height: 56 }} />
      </View>
    </View>
  );
}
