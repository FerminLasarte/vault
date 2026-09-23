import { useCallback, useMemo, useRef, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { useAppData } from "@/hooks/useAppData";
import { useRememberedScroll } from "@/hooks/useRememberedScroll";
import { pendingBadges } from "@/lib/pendingBadges";
import { StatisticsView } from "@/components/views/StatisticsView";
import { TransactionsView } from "@/components/views/TransactionsView";
import { CategoriesView } from "@/components/views/CategoriesView";
import { AccountsView } from "@/components/views/AccountsView";
import { CommitmentsView } from "@/components/views/CommitmentsView";
import { SavingsView } from "@/components/views/SavingsView";
import { ClosesView } from "@/components/views/ClosesView";
import { SettingsView } from "@/components/views/SettingsView";
import { Toaster } from "@/components/ui/sonner";
import { AppDataProvider } from "@/context/AppDataContext";
import { ViewStateProvider } from "@/context/ViewStateContext";
import { UpdaterProvider } from "@/context/UpdaterContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { DonationPrompt } from "@/components/DonationPrompt";
import { AppErrorFallback, ViewErrorFallback } from "@/components/ErrorFallback";
import { useMenuEvents } from "@/hooks/useMenuEvents";
import { usePendingMenuRequest } from "@/hooks/useMenuRequest";
import { MENU_ACTION_VIEW } from "@/lib/menu";
import type { MenuAction, ViewProps } from "@/lib/menu";
import type { Destination, TabRequest, View } from "@/lib/navigation";

// Views take the pending menu request and the tab it asked for, and a component
// that declares no props is still assignable here — so only the views that
// answer a menu entry or hold tabs have to know any of this exists.
const VIEWS: Record<View, (props: ViewProps) => React.JSX.Element> = {
  statistics: StatisticsView,
  transactions: TransactionsView,
  commitments: CommitmentsView,
  categories: CategoriesView,
  accounts: AccountsView,
  savings: SavingsView,
  closes: ClosesView,
  settings: SettingsView,
};

// The sidebar is a child of the data provider while App itself renders it, so
// App cannot read the data. This wrapper sits on the inside and does, which
// keeps Sidebar a presentational component that simply takes counts.
function SidebarWithBadges({
  currentView,
  onNavigate,
}: {
  currentView: View;
  onNavigate: (view: View) => void;
}) {
  const { pending, budgets, transactions, today } = useAppData();

  const badges = useMemo(
    () => pendingBadges({ pending, budgets, transactions }, today),
    [pending, budgets, transactions, today],
  );

  return <Sidebar currentView={currentView} badges={badges} onNavigate={onNavigate} />;
}

function App() {
  const [view, setView] = useState<View>("statistics");
  // The one thing that scrolls in the window, and the only place a view's
  // position can be kept: the views themselves are swapped in and out of it.
  const column = useRef<HTMLElement>(null);
  const { request, issue, markHandled } = usePendingMenuRequest();
  // The tab a menu entry asked for, if it asked for one. Held here rather than
  // inside each view because the request arrives from outside the view — often
  // while a different one is on screen.
  const [tab, setTab] = useState<TabRequest | null>(null);
  const CurrentView = VIEWS[view];

  useRememberedScroll(column, view);

  // An action is answered by the view that owns it, which may not be the one on
  // screen, so navigating there is part of handling the click.
  const handleAction = useCallback(
    (action: MenuAction) => {
      setView(MENU_ACTION_VIEW[action]);
      issue(action);
    },
    [issue],
  );

  // Three of the menu's nine entries now name a tab rather than a view of their
  // own. A view that receives a tab it does not recognise ignores it, which is
  // what keeps a stale request from a previous navigation harmless.
  const handleNavigate = useCallback((destination: Destination) => {
    setView(destination.view);
    if (destination.tab !== undefined) {
      const requested = destination.tab;
      setTab((previous) => ({ value: requested, seq: (previous?.seq ?? 0) + 1 }));
    }
  }, []);

  useMenuEvents({ onNavigate: handleNavigate, onAction: handleAction });

  return (
    // Two boundaries, deliberately. The outer one catches the providers, where
    // a failure leaves no interface to fall back to. The inner one wraps only
    // the current view, so one broken screen costs the screen rather than the
    // whole window — the sidebar stays usable and the user can navigate away.
    <ErrorBoundary
      fallback={(error) => <AppErrorFallback error={error} retry={() => {}} />}
    >
      <ThemeProvider>
        {/* A short delay keeps the tooltips from flashing as the pointer merely
            crosses a row of icon buttons on its way somewhere else. */}
        <TooltipProvider delay={350}>
          <UpdaterProvider>
            <AppDataProvider>
              {/* Outside the view's error boundary, whose fallback unmounts
                  the view: what each view was showing has to outlive that, as
                  it outlives moving between them. */}
              <ViewStateProvider>
                <div className="flex h-screen bg-background text-foreground">
                  <SidebarWithBadges currentView={view} onNavigate={setView} />
                  <main ref={column} className="min-w-0 flex-1 overflow-auto p-4 sm:p-8">
                    {/* Fills this column's top padding, which is the strip along
                    the window's top edge that the sidebar header and the page
                    header between them leave uncovered — and the first place a
                    hand reaches to move a window. The negative margin cancels
                    its own height, so it takes up the space that was already
                    empty and pushes nothing down.

                    It scrolls away with the content instead of floating above
                    it, which is the point: a fixed strip would keep taking
                    clicks meant for whatever had scrolled underneath it. */}
                    <div
                      aria-hidden
                      data-tauri-drag-region
                      className="-mt-4 h-4 sm:-mt-8 sm:h-8"
                    />
                    <ErrorBoundary
                      resetKey={view}
                      fallback={(error, retry) => (
                        <ViewErrorFallback error={error} retry={retry} />
                      )}
                    >
                      <CurrentView
                        request={request}
                        tab={tab}
                        onRequestHandled={markHandled}
                      />
                    </ErrorBoundary>
                  </main>
                </div>
              </ViewStateProvider>
              <UpdatePrompt />
              <DonationPrompt />
              <Toaster position="bottom-right" />
            </AppDataProvider>
          </UpdaterProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
