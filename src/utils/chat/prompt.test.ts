import { describe, expect, it } from 'vitest';

import { findProject } from '@/utils/chat/prompt';

describe('findProject', () => {
  it('returns detailed data for a catalog project', () => {
    const result = findProject('shelfie');

    expect(result).toMatchObject({
      id: 'shelfie',
      name: 'Shelfie',
      shortType: 'selfhosted app'
    });
    if ('error' in result) throw new Error(result.error);
    expect(result.longDescription).toContain('Aside');
  });

  it('does not expose data for an unknown project id', () => {
    expect(findProject('not-a-project')).toMatchObject({ error: expect.stringContaining('No project') });
  });

  it('does not treat certificates as detailed projects', () => {
    expect(findProject('fcc-back-end-development-and-apis')).toEqual({
      error: 'No detailed description is available for "fcc-back-end-development-and-apis".'
    });
  });
});
