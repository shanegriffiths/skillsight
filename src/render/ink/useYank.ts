import { useEffect, useState } from 'react';
import { copyToClipboard } from './clipboard.js';

/** Clipboard copy + a self-clearing "copied …" toast for the footer line. */
export function useYank(): { toast: string; copy: (text: string, label: string) => void } {
  const [toast, setToast] = useState('');
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 1500);
    return () => clearTimeout(t);
  }, [toast]);
  return {
    toast,
    copy: (text, label) => {
      copyToClipboard(text);
      setToast(`copied ${label}`);
    },
  };
}
