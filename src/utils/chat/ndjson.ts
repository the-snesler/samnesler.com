/**
 * Incremental newline-delimited JSON splitter.
 *
 * Chunk boundaries from a network stream land wherever TCP puts them, so a single JSON object is
 * routinely split across two reads. Callers feed decoded string chunks in and get back only the
 * lines that are actually complete; the trailing fragment is held for the next chunk.
 */
export function createLineSplitter() {
  let buffer = '';

  return {
    /** Returns every complete line in `chunk` (plus any fragment carried over). */
    push(chunk: string): string[] {
      buffer += chunk;
      const lines: string[] = [];

      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.trim()) lines.push(line);
      }

      return lines;
    },

    /** Whatever is left when the stream ends, if it isn't just whitespace. */
    flush(): string[] {
      const rest = buffer;
      buffer = '';
      return rest.trim() ? [rest] : [];
    }
  };
}
