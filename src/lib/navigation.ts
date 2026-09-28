// Where the user can be, and how the native menu asks to get there.
//
// The sidebar lists seven destinations; three of the sections it used to list
// separately now live as tabs inside two of them. The menu still offers all
// nine, because a menu is a list to search rather than a surface competing for
// space — so a menu entry has to be able to name a tab, not just a view.

export type View =
  | "overview"
  | "transactions"
  | "commitments"
  | "categories"
  | "accounts"
  | "savings"
  // Sits apart in the sidebar, under a rule: it is somewhere to look something
  // up rather than somewhere work happens, which is what the six above it are.
  | "closes"
  | "settings";

// The tabs of the two views that hold more than one section. Kept here rather
// than inside each view so the menu can be checked against them at build time:
// a destination naming a tab that does not exist is a type error.
export const COMMITMENT_TABS = [
  "recurring",
  "installments",
  "loans",
  "expected",
] as const;
export type CommitmentTab = (typeof COMMITMENT_TABS)[number];

export const CATEGORY_TABS = ["categories", "budgets"] as const;
export type CategoryTab = (typeof CATEGORY_TABS)[number];

// The general tab answers "how am I doing"; the analysis answers "what happened
// over this period". They were one screen and it read as a wall.
//
// The section is labelled Resumen, so the first tab cannot be: it is General.
// The id is `overview` rather than `summary` because a summary already means
// something else in this code — the income and expenses of a period
// (`calculateSummary`, `SummaryBar`), which is what the analysis tab shows.
export const OVERVIEW_TABS = ["general", "analysis"] as const;
export type OverviewTab = (typeof OVERVIEW_TABS)[number];

// What the sidebar opens when the section itself is picked: the tab the user
// is most likely to have come for.
export const DEFAULT_COMMITMENT_TAB: CommitmentTab = "recurring";
export const DEFAULT_CATEGORY_TAB: CategoryTab = "categories";
export const DEFAULT_OVERVIEW_TAB: OverviewTab = "general";

export interface Destination {
  view: View;
  // Absent when the view has no tabs, or when whichever tab is showing is fine.
  tab?: CommitmentTab | CategoryTab | OverviewTab;
}

// The ids the native menu emits, mirrored from src-tauri/src/menu.rs: the seven
// sections first, in sidebar order, then the three places that are a tab inside
// one of them.
//
// A section entry names no tab on purpose. Asking for Compromisos should behave
// like clicking it in the sidebar and leave whichever tab is open alone; it is
// the tab entries that are specific, because being specific is the only reason
// they exist.
export const MENU_VIEW_IDS = [
  "overview",
  "transactions",
  "commitments",
  "categories",
  "accounts",
  "savings",
  "closes",
  "settings",
  "budgets",
  "installments",
  "loans",
  "analysis",
  "expected",
] as const;

export type MenuViewId = (typeof MENU_VIEW_IDS)[number];

export const MENU_DESTINATIONS: Record<MenuViewId, Destination> = {
  overview: { view: "overview" },
  transactions: { view: "transactions" },
  commitments: { view: "commitments" },
  categories: { view: "categories" },
  accounts: { view: "accounts" },
  savings: { view: "savings" },
  closes: { view: "closes" },
  settings: { view: "settings" },
  budgets: { view: "categories", tab: "budgets" },
  installments: { view: "commitments", tab: "installments" },
  loans: { view: "commitments", tab: "loans" },
  analysis: { view: "overview", tab: "analysis" },
  expected: { view: "commitments", tab: "expected" },
};

export function isMenuViewId(value: unknown): value is MenuViewId {
  return (
    typeof value === "string" && (MENU_VIEW_IDS as readonly string[]).includes(value)
  );
}

// A tab asked for from outside the view that owns it.
//
// Carries a sequence number for the same reason a menu action does: picking
// "Presupuestos" twice has to count as two requests, and without it the second
// one would look identical to the first and be ignored — leaving the user on
// whatever tab they had switched to in between.
export interface TabRequest {
  value: string;
  seq: number;
}
