import React, { useRef, useLayoutEffect } from 'react';

export interface RupiahInputProps {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  autoFocus?: boolean;
}

export function formatRupiahDisplay(value: number): string {
  if (!value || !Number.isFinite(value) || value <= 0) return '';
  return `Rp. ${Math.round(value).toLocaleString('id-ID')}`;
}

function countDigits(str: string): number {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 48 && code <= 57) count++;
  }
  return count;
}

function findCaretForDigitIndex(formatted: string, targetDigitIndex: number): number {
  if (!formatted) return 0;
  if (targetDigitIndex <= 0) return formatted.startsWith('Rp. ') ? 4 : 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    const code = formatted.charCodeAt(i);
    if (code >= 48 && code <= 57) {
      seen++;
      if (seen === targetDigitIndex) {
        return i + 1;
      }
    }
  }
  return formatted.length;
}

export const RupiahInput: React.FC<RupiahInputProps> = ({
  value,
  onChange,
  placeholder = 'Rp. 0',
  className = '',
  required = false,
  disabled = false,
  id,
  name,
  autoFocus = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingDigitCaretRef = useRef<number | null>(null);

  const displayValue = formatRupiahDisplay(value);

  useLayoutEffect(() => {
    const targetDigits = pendingDigitCaretRef.current;
    if (targetDigits !== null && inputRef.current && document.activeElement === inputRef.current) {
      const nextPos = findCaretForDigitIndex(displayValue, targetDigits);
      inputRef.current.setSelectionRange(nextPos, nextPos);
      pendingDigitCaretRef.current = null;
    }
  }, [displayValue]);

  const commitDigits = (digitsStr: string, nextDigitCaret: number | null) => {
    if (!digitsStr) {
      pendingDigitCaretRef.current = 0;
      onChange(0);
      return;
    }
    const capped = digitsStr.slice(0, 12);
    const parsed = parseInt(capped, 10);
    const safeVal = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    pendingDigitCaretRef.current = safeVal > 0 ? nextDigitCaret : 0;
    onChange(safeVal);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const selectionEnd = e.target.selectionEnd ?? raw.length;
    const digitsBeforeCursor = countDigits(raw.slice(0, selectionEnd));
    const allDigits = raw.replace(/\D/g, '');
    commitDigits(allDigits, digitsBeforeCursor);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;

    if (e.key === 'Backspace' && start === end && displayValue) {
      if (start <= 4 && displayValue.startsWith('Rp. ')) {
        e.preventDefault();
        return;
      }
      if (start > 0 && displayValue[start - 1] === '.') {
        e.preventDefault();
        const digitsBefore = countDigits(displayValue.slice(0, start));
        const allDigits = displayValue.replace(/\D/g, '');
        if (digitsBefore > 0) {
          const updatedDigits =
            allDigits.slice(0, digitsBefore - 1) + allDigits.slice(digitsBefore);
          commitDigits(updatedDigits, digitsBefore - 1);
        }
      }
    }
  };

  const handleClickOrFocus = (e: React.SyntheticEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    if (!displayValue || !displayValue.startsWith('Rp. ')) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start === end && start < 4) {
      requestAnimationFrame(() => {
        if (document.activeElement === el) {
          el.setSelectionRange(4, 4);
        }
      });
    }
  };

  return (
    <input
      ref={inputRef}
      id={id}
      name={name}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      autoFocus={autoFocus}
      disabled={disabled}
      required={required}
      value={displayValue}
      placeholder={placeholder}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onClick={handleClickOrFocus}
      className={className}
    />
  );
};
