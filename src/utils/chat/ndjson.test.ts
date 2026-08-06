import { describe, expect, it } from 'vitest';

import { createLineSplitter } from '@/utils/chat/ndjson';

describe('createLineSplitter', () => {
  it('returns complete lines and withholds a trailing fragment', () => {
    const splitter = createLineSplitter();
    expect(splitter.push('{"a":1}\n{"b":2}\n{"c"')).toEqual(['{"a":1}', '{"b":2}']);
    expect(splitter.push(':3}\n')).toEqual(['{"c":3}']);
  });

  it('reassembles a line split across many chunks', () => {
    const splitter = createLineSplitter();
    const line = '{"t":"text","d":"hello world"}';
    const collected: string[] = [];
    for (const char of (line + '\n').split('')) collected.push(...splitter.push(char));
    expect(collected).toEqual([line]);
  });

  it('skips blank lines', () => {
    const splitter = createLineSplitter();
    expect(splitter.push('{"a":1}\n\n\n{"b":2}\n')).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('flushes an unterminated final line', () => {
    const splitter = createLineSplitter();
    expect(splitter.push('{"a":1}')).toEqual([]);
    expect(splitter.flush()).toEqual(['{"a":1}']);
  });

  it('flushes nothing when the buffer is empty or whitespace', () => {
    const splitter = createLineSplitter();
    expect(splitter.flush()).toEqual([]);
    splitter.push('  \n');
    expect(splitter.flush()).toEqual([]);
  });

  it('does not re-emit after a flush', () => {
    const splitter = createLineSplitter();
    splitter.push('{"a":1}');
    expect(splitter.flush()).toEqual(['{"a":1}']);
    expect(splitter.flush()).toEqual([]);
  });
});
