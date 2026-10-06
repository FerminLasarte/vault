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

// The median distance from the median: how far the values typically sit from
// their middle. Like the median, one charge far from the rest leaves it where it
// was, so a price rise does not make a steady series look erratic.
export function mad(values: readonly number[]): number | null {
  const middle = median(values);
  if (middle === null) return null;
  return median(values.map((value) => Math.abs(value - middle)));
}
