import React, { type MutableRefObject } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { Colors, Fonts } from '../constants/theme';
import { UserAvatar } from './UserAvatar';
import ColorPicker, { ColorFormatsObject, HueSlider, OpacitySlider, Panel1 } from 'reanimated-color-picker';
import type { PendingAvatarFile } from '../services/pickAndUploadImage';
import { AvatarThumbnailField } from './AvatarThumbnailField';

const DEFAULT_COLOR_PICKER_HEX = '#6366f1';

function toValidHex(s: string): string {
  const trimmed = (s || '').trim();
  if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(trimmed)) return trimmed;
  return DEFAULT_COLOR_PICKER_HEX;
}

interface UserAvatarPickerProps {
  value: string;
  onChangeBackgroundColor: (colors: ColorFormatsObject) => void;
  /** When provided, shows URL + S3 upload. Avatar uses thumbnail if valid URL, otherwise seed. */
  thumbnail?: string | null;
  onThumbnailChange?: (text: string | null) => void;
  /** Firebase uid for presigned uploads */
  uploadUserId?: string;
  /** For user variant: when provided, shows "Use initial" option to clear to letter avatar. */
  userName?: string;
  disabled?: boolean;
  loading?: boolean;
  buttonStyle?: object;
  buttonTextStyle?: object;
  deferFileUpload?: boolean;
  pendingAvatarFileRef?: MutableRefObject<PendingAvatarFile | null>;
}

export function UserAvatarPicker({
  value,
  onChangeBackgroundColor,
  thumbnail,
  onThumbnailChange,
  uploadUserId = '',
  userName,
  deferFileUpload = false,
  pendingAvatarFileRef,
}: UserAvatarPickerProps) {
  const { width: winW } = useWindowDimensions();
  const previewSize = Math.min(240, Math.max(140, Math.round(winW * 0.42)));
  const pickerValue = toValidHex(value);

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
        <UserAvatar
          seed={userName}
          backgroundColor={[pickerValue]}
          thumbnail={thumbnail}
          size={previewSize}
          style={{ width: previewSize, height: previewSize }}
        />
      </View>
    </View>
  );
}
