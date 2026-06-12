import { type KeyboardEvent, type ClipboardEvent, useEffect, useRef } from 'react';

/**
 * Uncontrolled contenteditable. The DOM owns the content while focused;
 * external html only re-applies when the element is not being edited.
 */
export function RichText({
  html, onChange, onKeyDown, onPaste, onFocus, onBlur,
  placeholder = '', showPhAlways = false, className = '', readOnly = false,
  registerEl, autoFocus = false,
}: {
  html: string;
  onChange: (html: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>, el: HTMLDivElement) => void;
  onPaste?: (e: ClipboardEvent<HTMLDivElement>, el: HTMLDivElement) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  showPhAlways?: boolean;
  className?: string;
  readOnly?: boolean;
  registerEl?: (el: HTMLDivElement | null) => void;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastHtml = useRef<string>('');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el && lastHtml.current === html) return;
    if (el.innerHTML !== html) {
      el.innerHTML = html;
      lastHtml.current = html;
    }
  }, [html]);

  useEffect(() => {
    registerEl?.(ref.current);
    if (autoFocus && ref.current && !readOnly) ref.current.focus();
    return () => registerEl?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      data-rich-text
      className={`rich-text ${showPhAlways ? 'show-ph' : ''} ${className}`}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      data-ph={placeholder}
      onInput={() => {
        const el = ref.current;
        if (!el) return;
        // normalize: a lone <br> means empty
        if (el.innerHTML === '<br>') el.innerHTML = '';
        lastHtml.current = el.innerHTML;
        onChange(el.innerHTML);
      }}
      onKeyDown={(e) => ref.current && onKeyDown?.(e, ref.current)}
      onPaste={(e) => ref.current && onPaste?.(e, ref.current)}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest('a');
        if (a && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          window.open(a.getAttribute('href') ?? '', '_blank', 'noopener');
        }
        const mention = (e.target as HTMLElement).closest('.zmention[data-page-id]');
        if (mention) {
          const pid = mention.getAttribute('data-page-id');
          if (pid) import('../../lib/store').then((m) => m.openPage(pid));
        }
      }}
    />
  );
}
