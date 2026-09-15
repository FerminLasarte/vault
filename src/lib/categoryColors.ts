// The colours a category can take: distinct hues at one weight, so the slices
// of the category chart can be told apart. The five the default categories are
// seeded with are among them. None is the slate grey of "Otros" and of
// uncategorised movements, which every new category used to be saved with.
export const CATEGORY_COLORS = [
  { color: "#3b82f6", name: "Azul" },
  { color: "#f97316", name: "Naranja" },
  { color: "#10b981", name: "Verde" },
  { color: "#a855f7", name: "Violeta" },
  { color: "#ef4444", name: "Rojo" },
  { color: "#eab308", name: "Amarillo" },
  { color: "#06b6d4", name: "Cian" },
  { color: "#ec4899", name: "Rosa" },
  { color: "#84cc16", name: "Lima" },
  { color: "#6366f1", name: "Índigo" },
  { color: "#14b8a6", name: "Turquesa" },
  { color: "#a16207", name: "Marrón" },
] as const;

export const CATEGORY_PALETTE: string[] = CATEGORY_COLORS.map((entry) => entry.color);

// The colour for a new category, so it is distinct without anyone choosing:
// the first one no category uses yet, or, once every one is taken, the one
// used least.
export function nextCategoryColor(usedColors: string[]): string {
  const uses = new Map(CATEGORY_PALETTE.map((color) => [color, 0]));
  for (const used of usedColors) {
    const color = used.toLowerCase();
    const count = uses.get(color);
    if (count !== undefined) uses.set(color, count + 1);
  }

  let best = CATEGORY_PALETTE[0];
  for (const color of CATEGORY_PALETTE) {
    if (uses.get(color)! < uses.get(best)!) best = color;
  }
  return best;
}
