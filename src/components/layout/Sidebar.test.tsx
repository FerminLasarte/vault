// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";
import type { PendingBadges } from "@/lib/pendingBadges";

vi.mock("@/lib/platform", () => ({ isMacOS: () => true }));

const NO_BADGES = {} as PendingBadges;

// What each signature in the `icon-motion` vocabulary (`src/index.css`) reaches
// into, written out as the CSS sees it: how many children the icon has, and
// which one moves.
//
// The signatures animate a part of an icon by its position among the svg's
// children, and those paths belong to lucide, not to us. An upgrade that
// reorders or replaces one would leave the CSS pointing at the wrong part —
// the gear would turn by its hub, the pie would separate the wrong half — and
// nothing would fail, because a hover is not something the rest of the suite
// looks at. This is the tripwire for that.
//
// `starts` is a distinctive opening fragment of the moving child's geometry
// rather than the whole of it: enough to prove it is still the same part of the
// drawing, without failing over a rounding change in a path lucide redrew.
const SIGNATURES = [
  {
    section: "Estadísticas",
    motion: "chart",
    children: 2,
    moves: [{ index: 0, tag: "path", starts: "M21 12c" }],
  },
  {
    section: "Transacciones",
    motion: "flow",
    children: 4,
    moves: [
      { index: 0, tag: "path", starts: "M8 3 4 7l4 4" },
      { index: 1, tag: "path", starts: "M4 7h16" },
      { index: 2, tag: "path", starts: "m16 21 4-4-4-4" },
      { index: 3, tag: "path", starts: "M20 17H4" },
    ],
  },
  {
    section: "Compromisos",
    motion: "clock",
    children: 6,
    moves: [{ index: 0, tag: "path", starts: "M16 14v2.2" }],
  },
  {
    section: "Categorías",
    motion: "fan",
    children: 3,
    moves: [{ index: 0, tag: "path", starts: "M13.172 2a2 2 0 0 1" }],
  },
  {
    section: "Cuentas",
    motion: "bank",
    children: 6,
    moves: [{ index: 1, tag: "path", starts: "M11.119 2.205" }],
  },
  {
    section: "Ahorros",
    motion: "piggy",
    children: 3,
    moves: [],
  },
  {
    section: "Cierres",
    motion: "pages",
    children: 5,
    moves: [
      { index: 2, tag: "path", starts: "M10 9H8" },
      { index: 3, tag: "path", starts: "M16 13H8" },
      { index: 4, tag: "path", starts: "M16 17H8" },
    ],
  },
  {
    section: "Ajustes",
    motion: "gear",
    children: 2,
    moves: [{ index: 0, tag: "path", starts: "M9.671 4.136" }],
  },
] as const;

function iconOf(section: string): SVGSVGElement {
  // The label is inside the button, and the icon beside it.
  const button = screen.getByText(section).closest("button");
  const icon = button?.querySelector("svg");

  if (!icon) throw new Error(`No icon found for ${section}`);

  return icon;
}

describe("Sidebar", () => {
  it("gives every section its own signature, and none of them twice", () => {
    render(<Sidebar currentView="statistics" badges={NO_BADGES} onNavigate={vi.fn()} />);

    const motions = SIGNATURES.map(({ section }) =>
      iconOf(section).getAttribute("data-motion"),
    );

    expect(motions).toEqual(SIGNATURES.map(({ motion }) => motion));
    expect(new Set(motions).size).toBe(SIGNATURES.length);
  });

  it.each(SIGNATURES)(
    "$section keeps the icon its $motion signature animates",
    ({ section, children, moves }) => {
      render(
        <Sidebar currentView="statistics" badges={NO_BADGES} onNavigate={vi.fn()} />,
      );

      const icon = iconOf(section);

      expect(icon.children).toHaveLength(children);

      for (const { index, tag, starts } of moves) {
        const part = icon.children[index];

        expect(part.tagName).toBe(tag);
        expect(part.getAttribute("d")).toMatch(new RegExp(`^${escape(starts)}`));
      }
    },
  );
});

// A path's geometry is full of characters a regular expression reads as syntax.
function escape(fragment: string): string {
  return fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
