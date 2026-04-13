import React, { useRef, useEffect, useCallback, createElement } from 'react';
import { View, StyleSheet } from 'react-native';
import { PollTextFont } from '@moija/client';
import { Colors, Radius } from '../constants/theme';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
  placeholder?: string;
  textFont: PollTextFont;
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

function exec(cmd: string, val?: string) {
  try {
    document.execCommand(cmd, false, val);
  } catch {
    /* ignore */
  }
}

export function PollRichTextInput({ value, onChange, placeholder, textFont }: Props) {
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
    const raw = editorRef.current?.innerHTML ?? '';
    const html = raw === '<br>' ? '' : raw;
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
    if (url == null || !url.trim()) return;
    let href = url.trim();
    if (!/^https?:\/\//i.test(href)) {
      href = `https://${href}`;
    }
    exec('createLink', href);
    onInput();
  }, [focusEditor, onInput]);

  const onClear = useCallback(() => {
    const el = editorRef.current;
    focusEditor();
    exec('removeFormat');
    exec('unlink');
    if (el) {
      el.innerHTML = '';
      lastExternal.current = '';
      onChange('');
    }
  }, [focusEditor, onChange]);

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

  const ph = placeholder ?? 'Option label';

  return (
    <View>
      <View style={styles.toolbar}>
        {toolbarBtn('B', 'bold')}
        {toolbarBtn('I', 'italic')}
        {toolbarBtn('U', 'underline')}
        {createElement('button', {
          type: 'button' as const,
          style: tbBtnDomStyle,
          onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
          onClick: onLink,
          children: createElement('span', { style: tbBtnLabelDomStyle }, 'Link'),
        })}
        {createElement('button', {
          type: 'button' as const,
          style: tbBtnDomStyle,
          onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
          onClick: onClear,
          children: createElement('span', { style: tbBtnLabelDomStyle }, 'Clear'),
        })}
      </View>
      {createElement('div', {
        ref: editorRef,
        contentEditable: true,
        className: 'poll-rich-text-input',
        onInput,
        'data-placeholder': ph,
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
      })}
      {createElement('style', {
        children: `
        .poll-rich-text-input:empty:before {
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
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
    alignItems: 'center',
  },
});
