import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * Keeps a scroll container pinned to the bottom while content streams in, but yields the moment
 * the reader scrolls up — and stays yielded until they come back down.
 *
 * This is the small piece of shadcn's <MessageScroller> we actually need. That component's
 * primitive (@shadcn/react) requires React >= 19, and this site aliases react to preact/compat 18.
 */
export function useStickToBottom<T extends HTMLElement>(dependency: unknown) {
  const ref = useRef<T>(null);
  const pinned = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  const sync = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    pinned.current = distance < 32;
    setAtBottom(pinned.current);
  }, []);

  const scrollToBottom = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
    pinned.current = true;
    setAtBottom(true);
  }, []);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [dependency]);

  return { ref, onScroll: sync, atBottom, scrollToBottom };
}
