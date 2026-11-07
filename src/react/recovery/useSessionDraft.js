// Cheap unsaved-input keeper for forms that a recovery reload could interrupt (WEB-BLANK-AFTER-IDLE-1):
//   const [text, setText, clearDraft] = useSessionDraft('studio:inputs:text', '');
// The value lives in sessionStorage (this tab only) and survives location.reload(). Call clearDraft() on submit.
import { useCallback, useEffect, useState } from 'react';

const PREFIX = 'sm:draft:';

function warn(operation, key) {
  // Never log draft content or storage exceptions, which may contain the input.
  console.warn(`[recovery] session draft ${operation} failed for key "${PREFIX + key}"`);
}

function read(key, initial) {
  if (typeof window === 'undefined') return initial;
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    return raw === null ? initial : JSON.parse(raw);
  } catch {
    warn('read', key);
    return initial;
  }
}

export function useSessionDraft(key, initial) {
  const [draft, setDraft] = useState(() => ({ key, value: read(key, initial) }));
  // Reset during render so React discards the old scope's render before any effect can persist it.
  if (draft.key !== key) setDraft({ key, value: read(key, initial) });
  const { key: draftKey, value } = draft;
  useEffect(() => {
    try {
      window.sessionStorage.setItem(PREFIX + draftKey, JSON.stringify(value));
    } catch {
      warn('persist', draftKey);
    }
  }, [draftKey, value]);
  const setValue = useCallback((next) => {
    // An async handler retained by the previous scope must not replace the current draft.
    setDraft((current) => current.key !== key ? current : {
      key, value: typeof next === 'function' ? next(current.value) : next,
    });
  }, [key]);
  const clear = useCallback(() => {
    try {
      window.sessionStorage.removeItem(PREFIX + key);
    } catch {
      warn('clear', key);
    }
  }, [key]);
  return [value, setValue, clear];
}
