import { describe, expect, it } from 'vitest';
import { insertCutIdsIntoGroupOrder, removeCutIdsFromGroups } from '../cutGroupOps';

describe('cutGroupOps', () => {
  it('removes cut ids from groups and drops empty groups', () => {
    const groups = [
      { id: 'g1', name: 'G1', cutIds: ['c1', 'c2'], isCollapsed: true },
      { id: 'g2', name: 'G2', cutIds: ['c3'], isCollapsed: false },
    ];

    const next = removeCutIdsFromGroups(groups, ['c2', 'c3']);

    expect(next).toEqual([
      { id: 'g1', name: 'G1', cutIds: ['c1'], isCollapsed: true },
    ]);
  });

  it('inserts non-duplicate cut ids at a bounded index', () => {
    const next = insertCutIdsIntoGroupOrder(['c1', 'c2'], ['c2', 'c3', 'c4'], 1);
    expect(next).toEqual(['c1', 'c3', 'c4', 'c2']);
  });
});
