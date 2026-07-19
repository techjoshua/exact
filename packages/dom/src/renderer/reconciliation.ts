/**
 * Finds positions belonging to one longest increasing subsequence.
 *
 * Negative values represent new children and are excluded. Keyed
 * reconciliation retains the returned positions and moves only the remaining
 * DOM ranges. The implementation is O(n log n).
 */
export function longestIncreasingSubsequencePositions(values: readonly number[]): Set<number> {
  const tails: number[] = [];
  const predecessors = new Array<number>(values.length).fill(-1);
  for (let index = 0; index < values.length; index++) {
    const value = values[index]!;
    if (value < 0) continue;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (values[tails[middle]!]! < value) low = middle + 1;
      else high = middle;
    }
    if (low > 0) predecessors[index] = tails[low - 1]!;
    tails[low] = index;
  }

  const positions = new Set<number>();
  let cursor = tails[tails.length - 1] ?? -1;
  while (cursor >= 0) {
    positions.add(cursor);
    cursor = predecessors[cursor]!;
  }
  return positions;
}
