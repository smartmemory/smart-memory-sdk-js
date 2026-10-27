// Cheap unsaved-input keeper for forms that a recovery reload could interrupt (WEB-BLANK-AFTER-IDLE-1):
//   const [text, setText, clearDraft] = useSessionDraft('studio:inputs:text', '');
// The value lives in sessionStorage (this tab only) and survives location.reload(). Call clearDraft() on submit.
import { useCallback, useEffect, useState } from 'react';

const PREFIX = 'sm:draft:';

function read(key, initial) {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    return raw === null ? initial : JSON.parse(raw);
  } catch {
    return initial;
  }
}

export function useSessionDraft(key, initial) {
  const [value, setValue] = useState(() => (typeof window === 'undefined' ? initial : read(key, initial)));
  useEffect(() => {
    try {
      window.sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // storage full or unavailable: the draft is only lost on a reload
    }
  }, [key, value]);
  const clear = useCallback(() => {
    try {
      window.sessionStorage.removeItem(PREFIX + key);
    } catch {
      // nothing stored
    }
  }, [key]);
  return [value, setValue, clear];
}
