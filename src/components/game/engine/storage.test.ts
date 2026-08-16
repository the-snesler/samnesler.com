import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadBest, saveBest } from './storage';

function useStorage(store: Storage | undefined): void {
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true });
}

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => map.delete(key),
    setItem: (key: string, value: string) => map.set(key, value)
  } as Storage;
}

const KEY = 'samnesler:runner:best';

describe('high score storage', () => {
  beforeEach(() => useStorage(memoryStorage()));
  afterEach(() => useStorage(undefined));

  it('starts at zero', () => {
    expect(loadBest()).toBe(0);
  });

  it('keeps only the best distance', () => {
    expect(saveBest(120.9)).toBe(true);
    expect(loadBest()).toBe(120);
    expect(saveBest(80)).toBe(false);
    expect(loadBest()).toBe(120);
    expect(saveBest(400)).toBe(true);
    expect(loadBest()).toBe(400);
  });

  it('ignores junk left in storage', () => {
    useStorage(memoryStorage({ [KEY]: 'not a number' }));
    expect(loadBest()).toBe(0);
    useStorage(memoryStorage({ [KEY]: '-12' }));
    expect(loadBest()).toBe(0);
  });

  it('survives storage that throws', () => {
    const hostile = {
      getItem: vi.fn(() => {
        throw new Error('blocked');
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked');
      })
    } as unknown as Storage;
    useStorage(hostile);
    expect(loadBest()).toBe(0);
    expect(() => saveBest(50)).not.toThrow();
  });

  it('does nothing when storage is missing entirely', () => {
    useStorage(undefined);
    expect(loadBest()).toBe(0);
    expect(saveBest(10)).toBe(true);
  });
});
