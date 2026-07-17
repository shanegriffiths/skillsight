import { useState } from 'react';
import type { SearchAction } from './liveFilter.js';

/**
 * State of one view's `/` filter box: open flag + query text. Enter/Esc
 * consequences (cursor mapping, detail opening) are view-specific and live in
 * the views; this only owns the text.
 */
export function useLiveFilter() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const start = () => {
    setOpen(true);
    setQuery('');
  };
  const clear = () => {
    setOpen(false);
    setQuery('');
  };
  const edit = (a: SearchAction) => {
    if (a.type === 'type') setQuery((q) => q + a.text);
    else if (a.type === 'backspace') setQuery((q) => q.slice(0, -1));
  };
  return { open, query, start, clear, edit };
}
