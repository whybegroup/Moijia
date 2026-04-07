import { type MutableRefObject } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { Colors, Fonts, Radius } from '../constants/theme';
import { GroupAvatar } from './GroupAvatar';
import { getGroupColor, getDefaultGroupThemeFromName, groupAvatarBorderRadius } from '../utils/helpers';
import { IconsAvatar } from './Avatar';
import { ICON_OPTIONS } from '../utils/avatar';
import type { PendingAvatarFile } from '../services/pickAndUploadImage';
import { AvatarThumbnailField } from './AvatarThumbnailField';

interface GroupAvatarPickerProps {
  defaultSeed: string;
  value: string;
  onChangeText: (text: string) => void;
  /** When provided, shows URL + S3 upload. Avatar uses thumbnail if valid URL, otherwise seed. */
  thumbnail?: string | null;
  onThumbnailChange?: (text: string | null) => void;
  uploadUserId?: string;
  disabled?: boolean;
  loading?: boolean;
  inputStyle?: object;
  buttonStyle?: object;
  buttonTextStyle?: object;
  deferFileUpload?: boolean;
  pendingAvatarFileRef?: MutableRefObject<PendingAvatarFile | null>;
}

export function GroupAvatarPicker({
  defaultSeed,
  value,
  onChangeText,
  thumbnail,
  onThumbnailChange,
  uploadUserId = '',
  inputStyle,
  deferFileUpload = false,
  pendingAvatarFileRef,
}: GroupAvatarPickerProps) {
  const { width: winW } = useWindowDimensions();
  /** Large preview: scales with modal width, capped for very wide screens. */
  const previewSize = Math.min(240, Math.max(140, Math.round(winW * 0.42)));

  const baseInputStyle = [{ padding: 10, paddingHorizontal: 12, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, fontSize: 14, color: Colors.text, fontFamily: Fonts.regular, flex: 1 }, inputStyle];

  return (
    <View style={{ flexGrow: 1 }}>
      {onThumbnailChange != null ? (
        <AvatarThumbnailField
          userId={uploadUserId}
          thumbnail={thumbnail ?? null}
          onThumbnailChange={onThumbnailChange}
          deferFileUpload={deferFileUpload}
          pendingAvatarFileRef={pendingAvatarFileRef}
        />
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
      <View
        style={{
          marginTop: 20,
          paddingVertical: 24,
          alignItems: 'center',
          justifyContent: 'center',
          flexGrow: 1,
          minHeight: previewSize + 48,
        }}
      >
        <View
          style={{
            width: previewSize,
            height: previewSize,
            borderRadius: groupAvatarBorderRadius(previewSize),
            borderWidth: 1,
            backgroundColor: getGroupColor(getDefaultGroupThemeFromName('Group')).row,
            borderColor: getGroupColor(getDefaultGroupThemeFromName('Group')).cal,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <GroupAvatar
            seed={value.trim() === '' ? 'auto' : value.trim()}
            thumbnail={thumbnail}
            size={previewSize}
            style={{ width: previewSize, height: previewSize }}
          />
        </View>
      </View>
    </View>
  );
}
