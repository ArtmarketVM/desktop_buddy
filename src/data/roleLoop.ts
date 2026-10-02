export function loopIndex(index: number, count: number) {
  return ((index % count) + count) % count;
}

// Identical neighboring copies allow rebasing without changing the visible cards.
export function loopScrollShift(left: number, groupWidth: number) {
  if (groupWidth <= 0) return 0;
  if (left < groupWidth * 1.5) return groupWidth * 2;
  if (left >= groupWidth * 3.5) return -groupWidth * 2;
  return 0;
}
