import {
  ChartPie,
  Landmark,
  Tags,
  ArrowLeftRight,
  FileText,
  Settings,
  CalendarClock,
  PiggyBank,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/Hint";
import { VaultLogo } from "@/components/VaultLogo";
import { isMacOS } from "@/lib/platform";
import type { PendingBadges } from "@/lib/pendingBadges";
import type { View } from "@/lib/navigation";

interface NavItem {
  view: View;
  label: string;
  icon: LucideIcon;
  // What the section is for, shown on hover.
  //
  // Never a restatement of the label: expanded, the label is already on screen
  // an inch away, and a tooltip that repeats it is a tooltip that taught the
  // user nothing and trained them to stop reading the next one. Collapsed, the
  // icon alone is a guess — this is what turns it back into a name.
  description: string;
}

// The places the user actually works in, in the order the work tends to happen.
const MAIN_ITEMS = [
  {
    view: "statistics",
    label: "Estadísticas",
    icon: ChartPie,
    description: "Tu balance, cómo venís este mes y los gráficos por período",
  },
  {
    view: "transactions",
    label: "Transacciones",
    icon: ArrowLeftRight,
    description: "Todos tus movimientos, con búsqueda y filtros",
  },
  // Everything the user owes or has promised: what repeats, what is being paid
  // in instalments, and what was lent or borrowed. All three are confirmed the
  // same way and were three separate stops in the sidebar before.
  {
    view: "commitments",
    label: "Compromisos",
    icon: CalendarClock,
    description: "Recurrentes, cuotas y préstamos esperando que los confirmes",
  },
  // Budgets live here too: a budget is a cap on a category, so the two were
  // always describing the same thing from opposite ends.
  {
    view: "categories",
    label: "Categorías",
    icon: Tags,
    description: "Cómo se clasifican tus movimientos y cuánto podés gastar en cada uno",
  },
  {
    view: "accounts",
    label: "Cuentas",
    icon: Landmark,
    description: "Saldos de tus cuentas y métodos de pago",
  },
  {
    view: "savings",
    label: "Ahorros",
    icon: PiggyBank,
    description: "Tus objetivos, el ritmo que llevás y cuándo llegarías",
  },
] as const satisfies ReadonlyArray<NavItem>;

// Somewhere to look something up rather than somewhere work happens, so it sits
// under a rule instead of at the end of the list: nothing here is ever waiting
// on the user, and reading it as a seventh stop would suggest it might be.
const ARCHIVE_ITEMS = [
  {
    view: "closes",
    label: "Cierres",
    icon: FileText,
    description: "El resumen de cada mes terminado, listo para guardar en PDF",
  },
] as const satisfies ReadonlyArray<NavItem>;

// Configuration rather than a destination, so it sits apart at the bottom
// instead of competing with the six views above it.
const FOOTER_ITEMS = [
  {
    view: "settings",
    label: "Ajustes",
    icon: Settings,
    description: "Apariencia, copias de seguridad, cotizaciones y tus datos",
  },
] as const satisfies ReadonlyArray<NavItem>;

interface NavButtonProps {
  item: NavItem;
  isCurrent: boolean;
  // How many things this section is waiting on, or undefined for none.
  pending?: number;
  onNavigate: (view: View) => void;
}

function NavButton({ item, isCurrent, pending, onNavigate }: NavButtonProps) {
  const { view, label, description, icon: Icon } = item;

  // Anchored to the right because the sidebar is the left edge of the window
  // and there is nowhere else for the explanation to go.
  return (
    <Hint
      anchor="element"
      side="right"
      // Collapsed, the label is the only thing naming the icon, so it leads.
      label={
        <>
          <span className="sm:hidden">{label}: </span>
          {description}
        </>
      }
      render={
        <button
          type="button"
          aria-current={isCurrent ? "page" : undefined}
          onClick={() => onNavigate(view)}
          className={cn(
            "icon-motion relative flex items-center justify-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors sm:justify-start sm:px-3",
            isCurrent
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
          )}
        />
      }
    >
      <Icon className="size-4 shrink-0" />
      <span className="hidden sm:inline">{label}</span>

      {pending !== undefined && (
        <>
          {/* Collapsed, there is no room for a number, so the dot rides on the
              icon. Expanded, the count is worth showing: "3 cuotas vencidas" is
              a different situation from one. */}
          <span
            aria-hidden
            className="absolute top-1.5 left-1/2 size-2 translate-x-2 rounded-full bg-primary sm:hidden"
          />
          <span className="ml-auto hidden min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-xs font-medium text-primary-foreground tabular-nums sm:inline">
            {pending}
          </span>
          <span className="sr-only">
            {pending} {pending === 1 ? "pendiente" : "pendientes"}
          </span>
        </>
      )}
    </Hint>
  );
}

interface SidebarProps {
  currentView: View;
  badges: PendingBadges;
  onNavigate: (view: View) => void;
}

export function Sidebar({ currentView, badges, onNavigate }: SidebarProps) {
  return (
    <aside className="flex h-screen w-16 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground sm:w-60">
      {/* On macOS the title bar is an overlay, so the traffic lights float over
          this corner and the header has to start below them. Every other
          platform draws its own title bar above the content and needs no room.

          That same overlay is why this block is a drag region: the webview
          covers the entire title bar strip, so without one there is nothing
          left to grab and the window cannot be moved at all. Tauri only starts
          a drag when the element directly under the cursor carries the
          attribute, so the logo below stays an ordinary child. It also needs
          `core:window:allow-start-dragging` in the capabilities file, which is
          not part of `core:default` and fails silently when missing. */}
      <div
        data-tauri-drag-region
        className={cn(
          "flex items-center justify-center gap-2 px-2 pb-6 sm:justify-start sm:px-6",
          isMacOS() ? "pt-10" : "pt-6",
        )}
      >
        {/* The cut-outs take the sidebar's own surface colour, so the mark
            reads correctly against it in either theme. */}
        <VaultLogo className="size-5 shrink-0 [--logo-cutout:var(--sidebar)]" />
        <span className="hidden font-heading text-lg font-semibold tracking-tight sm:inline">
          Vault
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2 sm:px-3">
        {MAIN_ITEMS.map((item) => (
          <NavButton
            key={item.view}
            item={item}
            isCurrent={currentView === item.view}
            pending={badges[item.view]}
            onNavigate={onNavigate}
          />
        ))}

        {/* Inset rather than full-bleed: the rule separates two groups of
            buttons, so it lines up with them instead of cutting the whole
            column in half. */}
        <div className="my-2 border-t border-sidebar-border" />

        {ARCHIVE_ITEMS.map((item) => (
          <NavButton
            key={item.view}
            item={item}
            isCurrent={currentView === item.view}
            pending={badges[item.view]}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="flex flex-col gap-1 px-2 pb-4 sm:px-3">
        {FOOTER_ITEMS.map((item) => (
          <NavButton
            key={item.view}
            item={item}
            isCurrent={currentView === item.view}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </aside>
  );
}
