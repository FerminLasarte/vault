// Summaries of a handful of amounts that one unusual figure cannot drag
// around: a single big purchase moves an average, not a median.

// The middle value, or the mean of the two middle ones. Null for no values,
// since there is nothing typical about an empty list.
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
