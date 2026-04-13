import React, { useRef, useCallback, useEffect, createElement } from 'react';
import { View, StyleSheet } from 'react-native';
import { PollTextFont } from '@moija/client';
import { Colors, Radius } from '../constants/theme';

const fontChipDomBase: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 999,
  border: `1px solid ${Colors.border}`,
  backgroundColor: Colors.surface,
  fontSize: 12,
  fontFamily: 'system-ui, sans-serif',
  cursor: 'pointer',
};

const fontChipDomOn: React.CSSProperties = {
  borderColor: Colors.accent,
  backgroundColor: `${Colors.accent}14`,
  color: Colors.accent,
  fontWeight: 600,
};

const tbBtnDomStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 8,
  border: `1px solid ${Colors.border}`,
  backgroundColor: Colors.surface,
  fontSize: 14,
  fontWeight: 600,
  color: Colors.text,
  cursor: 'pointer',
};

const tbBtnLabelDomStyle: React.CSSProperties = { fontFamily: 'system-ui, sans-serif' };

const FONT_LABELS: { key: PollTextFont; label: string }[] = [
  { key: PollTextFont.SANS, label: 'Sans' },
  { key: PollTextFont.SERIF, label: 'Serif' },
  { key: PollTextFont.MONO, label: 'Mono' },
];

function fontFamilyCss(f: PollTextFont): string {
  switch (f) {
    case PollTextFont.SERIF:
      return 'Georgia, "Times New Roman", serif';
    case PollTextFont.MONO:
      return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    default:
      return 'DM Sans, DMSans_400Regular, system-ui, sans-serif';
  }
}

type Props = {
  value: string;
  onChange: (html: string) => void;
  textFont: PollTextFont;
  onTextFontChange: (f: PollTextFont) => void;
};

function exec(cmd: string, val?: string) {
  try {
    document.execCommand(cmd, false, val);
  } catch {
    /* ignore */
  }
}

export function PollOptionTextEditor({ value, onChange, textFont, onTextFontChange }: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastExternal = useRef(value);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value !== lastExternal.current) {
      lastExternal.current = value;
      if (el.innerHTML !== value) {
        el.innerHTML = value || '';
      }
    }
  }, [value]);

  const focusEditor = useCallback(() => {
    editorRef.current?.focus();
  }, []);

  const onInput = useCallback(() => {
    const html = editorRef.current?.innerHTML ?? '';
    lastExternal.current = html;
    onChange(html);
  }, [onChange]);

  const run = useCallback(
    (cmd: string, arg?: string) => {
      focusEditor();
      exec(cmd, arg);
      onInput();
    },
    [focusEditor, onInput],
  );

  const onLink = useCallback(() => {
    focusEditor();
    const url = typeof window !== 'undefined' ? window.prompt('Link URL', 'https://') : null;
    if (url?.trim()) {
      exec('createLink', url.trim());
      onInput();
    }
  }, [focusEditor, onInput]);

  const toolbarBtn = (label: string, cmd: string) =>
    createElement(
      'button',
      {
        type: 'button' as const,
        style: tbBtnDomStyle,
        onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
        onClick: () => run(cmd),
      },
      createElement('span', { style: tbBtnLabelDomStyle }, label),
    );

  return (
    <View>
      <View style={styles.fontRow}>
        {FONT_LABELS.map(({ key, label }) =>
          createElement('button', {
            type: 'button' as const,
            key,
            style: {
              ...fontChipDomBase,
              ...(textFont === key ? fontChipDomOn : {}),
            },
            onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
            onClick: () => onTextFontChange(key),
            children: label,
          }),
        )}
      </View>
      <View style={styles.toolbar}>
        {toolbarBtn('B', 'bold')}
        {toolbarBtn('I', 'italic')}
        {toolbarBtn('U', 'underline')}
        {createElement('button', {
          type: 'button' as const,
          style: tbBtnDomStyle,
          onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
          onClick: onLink,
          children: '🔗',
        })}
        {createElement('button', {
          type: 'button' as const,
          style: tbBtnDomStyle,
          onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
          onClick: () => run('removeFormat'),
          children: 'Clear',
        })}
      </View>
      {createElement('div', {
        ref: editorRef,
        contentEditable: true,
        className: 'poll-option-rich-editor',
        onInput,
        style: {
          minHeight: 72,
          padding: 12,
          borderRadius: Radius.lg,
          border: `1px solid ${Colors.border}`,
          backgroundColor: Colors.bg,
          fontSize: 15,
          color: Colors.text,
          fontFamily: fontFamilyCss(textFont),
          outline: 'none',
        },
        'data-placeholder': 'Option label',
      })}
      {createElement('style', {
        children: `
        .poll-option-rich-editor:empty:before {
          content: attr(data-placeholder);
          color: ${Colors.textMuted};
          pointer-events: none;
        }
      `,
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fontRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
    alignItems: 'center',
  },
});
