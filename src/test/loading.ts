// The placeholders a render has actually drawn.
//
// A section that is still loading holds its placeholder's space from the first
// moment, but only draws it once the wait is worth reading. The ones inside an
// `invisible` region are that held space, and are not on screen for anyone.
export function drawnSkeletons(container: HTMLElement): Element[] {
  return [...container.querySelectorAll('[data-slot="skeleton"]')].filter(
    (skeleton) => skeleton.closest(".invisible") === null,
  );
}

// Every placeholder in the render, drawn or only holding its space.
export function allSkeletons(container: HTMLElement): Element[] {
  return [...container.querySelectorAll('[data-slot="skeleton"]')];
}
