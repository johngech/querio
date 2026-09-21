import { describe, expect, it } from 'bun:test';
import { QueryMapper } from '../../packages/core/src/compiler/index';

describe('QueryMapper', () => {
  describe('toOrderBy', () => {
    it('returns undefined for empty sort', () => {
      expect(QueryMapper.toOrderBy([])).toBeUndefined();
    });

    it('builds single sort', () => {
      expect(QueryMapper.toOrderBy([{ field: 'createdAt', direction: 'desc' }])).toEqual([
        { createdAt: 'desc' },
      ]);
    });

    it('builds multiple sorts', () => {
      expect(
        QueryMapper.toOrderBy([
          { field: 'createdAt', direction: 'desc' },
          { field: 'name', direction: 'asc' },
        ]),
      ).toEqual([{ createdAt: 'desc' }, { name: 'asc' }]);
    });
  });

  describe('toSkipTake', () => {
    const skipTakeCases: [number, number, { skip: number; take: number }][] = [
      [1, 10, { skip: 0, take: 10 }],
      [2, 10, { skip: 10, take: 10 }],
      [3, 20, { skip: 40, take: 20 }],
    ];

    for (const [page, limit, expected] of skipTakeCases) {
      it(`calculates skip/take for page=${page}, limit=${limit}`, () => {
        expect(QueryMapper.toSkipTake(page, limit)).toEqual(expected);
      });
    }
  });
});
