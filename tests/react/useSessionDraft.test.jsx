import React, { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionDraft } from '../../src/react/recovery/useSessionDraft.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('scoped session drafts', () => {
  let root;
  let container;
  let draft;
  function Form({ scope, initial = '' }) {
    draft = useSessionDraft(scope, initial);
    return <output>{draft[0]}</output>;
  }
  function render(scope, initial = '') {
    act(() => root.render(<StrictMode><Form scope={scope} initial={initial} /></StrictMode>));
  }
  beforeEach(() => {
    sessionStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it.each([
    { name: 'existing destination', stored: 'destination', expected: 'destination' },
    { name: 'empty destination', stored: null, expected: 'initial' },
    { name: 'corrupt destination', stored: '{broken', expected: 'initial', raw: true },
  ])('loads $name without writing the previous scope into it', ({ stored, expected, raw }) => {
    render('source');
    act(() => draft[1]('private source input'));
    const staleSetter = draft[1];
    if (stored !== null) sessionStorage.setItem('sm:draft:target', raw ? stored : JSON.stringify(stored));
    const write = vi.spyOn(sessionStorage, 'setItem');
    render('target', 'initial');
    expect(container.textContent).toBe(expected);
    expect(sessionStorage.getItem('sm:draft:source')).toBe(JSON.stringify('private source input'));
    expect(sessionStorage.getItem('sm:draft:target')).toBe(JSON.stringify(expected));
    expect(write.mock.calls.filter(([key]) => key === 'sm:draft:target').every(([, value]) => value === JSON.stringify(expected))).toBe(true);
    act(() => draft[1]((value) => value + ' edited'));
    act(() => staleSetter('late source update'));
    expect(container.textContent).toBe(expected + ' edited');
    act(() => draft[2]());
    expect(sessionStorage.getItem('sm:draft:target')).toBeNull();
    render('source');
    expect(container.textContent).toBe('private source input');
  });

  it('warns with only the key when persistence is refused and retains editable input', () => {
    vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => { throw new Error('private storage error'); });
    render('refused');
    act(() => draft[1]('private draft content'));
    expect(container.textContent).toBe('private draft content');
    expect(console.warn).toHaveBeenCalledWith('[recovery] session draft persist failed for key "sm:draft:refused"');
    expect(JSON.stringify(console.warn.mock.calls)).not.toContain('private');
  });
});
