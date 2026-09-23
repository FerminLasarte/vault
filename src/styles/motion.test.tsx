// @vitest-environment jsdom
import { globSync, readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import * as lucide from "lucide-react";

// Both paths are from the project root, which is where vitest runs.
const MOTION_CSS = readFileSync("src/styles/motion.css", "utf8");

// Every icon `motion.css` has a rule for, by the class lucide puts on its svg.
const RULED = [...new Set(MOTION_CSS.match(/\.lucide-[a-z0-9-]+/g) ?? [])]
  .map((selector) => selector.slice(".lucide-".length))
  .sort();

// `lucide-hard-drive-download` is exported as `HardDriveDownload`. A class that
// does not convert back to a real export is a typo in the stylesheet, and the
// lookup below is what says so.
function componentFor(icon: string): ComponentType<Record<string, unknown>> {
  const exported = icon
    .split("-")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join("");

  const components = lucide as unknown as Record<
    string,
    ComponentType<Record<string, unknown>> | undefined
  >;
  const component = components[exported];

  if (!component) throw new Error(`No lucide icon exports as ${exported}`);

  return component;
}

function renderIcon(icon: string): SVGSVGElement {
  const Icon = componentFor(icon);
  const { container } = render(<Icon />);
  const svg = container.querySelector("svg");

  if (!svg) throw new Error(`${icon} rendered nothing`);

  return svg;
}

describe("icon motion", () => {
  // The rules reach into an icon by the position of its parts — the fourth and
  // fifth path of a bin are its lid, the second circle of a target is its
  // middle ring — and those parts belong to lucide, not to us. An upgrade that
  // reorders or replaces one would leave a rule animating the wrong half of an
  // icon, and nothing else in the suite would notice, because no test looks at
  // a hover.
  //
  // So the shape of every icon with a rule is pinned here. The snapshot is
  // generated rather than written by hand, which is the point: it cannot drift
  // out of step with the stylesheet, and when it does change, the diff says
  // exactly which part of which icon moved and the rules that point at it can
  // be re-read.
  it("pins the shape of every icon a rule reaches into", () => {
    const shapes = Object.fromEntries(
      RULED.map((icon) => {
        const svg = renderIcon(icon);

        return [
          icon,
          [...svg.children].map(
            (part, index) =>
              `${index + 1}. ${part.tagName}: ${
                part.getAttribute("d")?.slice(0, 24) ??
                [...part.attributes].map((a) => `${a.name}=${a.value}`).join(" ")
              }`,
          ),
        ];
      }),
    );

    expect(shapes).toMatchSnapshot();
  });

  // A browser clips an inline svg to its view box, and lucide leaves a single
  // unit of margin inside it — exactly half a stroke. A part that moves any
  // further than that is cut off at the edge: measured in Chromium, the handle
  // of the bin, the roof of the bank and the hooks of both calendars all lose
  // their outer edge on hover. The movement is the design, so the clipping goes.
  it("does not clip a part that moves past the edge of its icon", () => {
    const iconRule = MOTION_CSS.match(/@utility icon-motion \{\s*& svg \{([^}]*)\}/);

    expect(iconRule?.[1]).toMatch(/overflow:\s*visible/);
  });

  it("names every icon by a class lucide actually renders", () => {
    for (const icon of RULED) {
      expect([...renderIcon(icon).classList]).toContain(`lucide-${icon}`);
    }
  });

  // The whole point of keying the rules to the icon is that a screen cannot
  // forget to ask for movement. That only holds while every icon in the app has
  // a rule, so a new one has to be given a signature — or added to the group it
  // shares a movement with — before it can ship.
  it("gives every icon the app uses a rule of its own", () => {
    const imported = new Set<string>();

    for (const path of globSync("src/**/*.tsx")) {
      const source = readFileSync(path, "utf8");

      for (const block of source.matchAll(
        /import\s*\{([^}]*)\}\s*from\s*"lucide-react"/gs,
      )) {
        for (const name of block[1].split(",")) {
          const exported = name.trim();

          if (exported && exported !== "type LucideIcon") imported.add(exported);
        }
      }
    }

    // Read off the rendered svg rather than from a table of our own: lucide
    // exports several names for the same icon — `AlertTriangle`, `TriangleAlert`
    // and `TriangleAlertIcon` are one drawing — and only the icon itself knows
    // which class it ends up with.
    const components = lucide as unknown as Record<
      string,
      ComponentType<Record<string, unknown>>
    >;
    const missing = [...imported]
      .map((exported) => {
        const Icon = components[exported];
        const { container } = render(<Icon />);
        const rendered = [...(container.querySelector("svg")?.classList ?? [])];
        const icon = rendered
          .find((name) => name.startsWith("lucide-"))
          ?.slice("lucide-".length);

        return { exported, icon };
      })
      .filter(({ icon }) => !icon || !RULED.includes(icon));

    expect(missing).toEqual([]);
  });
});
