import { PiggyBank, Target, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ProgressBar } from "@/components/ui/progress-bar";
import { formatCurrency, formatMonthLabel, formatPercent } from "@/lib/format";
import type { MonthOverview } from "@/lib/monthOverview";

interface MonthOverviewCardsProps {
  overview: MonthOverview;
  currency: string;
  isLoading: boolean;
}

// A figure the app worked out and found nothing to show — not one that has yet
// to arrive. That one is a skeleton, so the two are never confused.
const PLACEHOLDER = "—";

// The height of the heading it stands in for, so the card does not resize when
// the number lands.
function FigureSkeleton() {
  return <Skeleton className="my-1.5 h-5 w-32" />;
}

function MonthExpensesCard({ overview, currency, isLoading }: MonthOverviewCardsProps) {
  const { total, previousTotal, previousMonthKey, changeRatio } = overview.expenses;
  const isUp = changeRatio !== null && changeRatio > 0;

  return (
    <Card>
      <CardHeader>
        <CardDescription>Gastos de este mes</CardDescription>
        {/* Left in the default colour on purpose. The comparison below carries
            the judgement — a red headline every month says nothing. */}
        <CardTitle className="text-2xl">
          {isLoading ? <FigureSkeleton /> : formatCurrency(total, currency)}
        </CardTitle>
        <CardAction>
          <Wallet className="size-4 text-muted-foreground" />
        </CardAction>
      </CardHeader>
      <CardContent>
        {isLoading ? null : changeRatio === null ? (
          <p className="text-xs text-muted-foreground">
            {previousTotal === 0
              ? `Sin gastos en ${formatMonthLabel(previousMonthKey)}`
              : "Sin comparación disponible"}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {isUp ? (
              <TrendingUp className="size-3.5 shrink-0 text-negative" />
            ) : (
              <TrendingDown className="size-3.5 shrink-0 text-positive" />
            )}
            <span>
              <span
                className={cn("font-medium", isUp ? "text-negative" : "text-positive")}
              >
                {formatPercent(Math.abs(changeRatio))} {isUp ? "más" : "menos"}
              </span>{" "}
              que en {formatMonthLabel(previousMonthKey)}
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function BudgetCard({ overview, currency, isLoading }: MonthOverviewCardsProps) {
  const { budget } = overview;
  const isExceeded = budget !== null && budget.remaining < 0;

  return (
    <Card>
      <CardHeader>
        <CardDescription>
          {isExceeded ? "Presupuesto excedido" : "Presupuesto disponible"}
        </CardDescription>
        <CardTitle className={cn("text-2xl", isExceeded && "text-negative")}>
          {isLoading ? (
            <FigureSkeleton />
          ) : budget === null ? (
            PLACEHOLDER
          ) : (
            formatCurrency(Math.abs(budget.remaining), currency)
          )}
        </CardTitle>
        <CardAction>
          <Target className="size-4 text-muted-foreground" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isLoading ? null : budget === null ? (
          <p className="text-xs text-muted-foreground">
            Definí presupuestos para ver cuánto te queda del mes.
          </p>
        ) : (
          <>
            <ProgressBar
              ratio={budget.ratio}
              tone={isExceeded ? "destructive" : "primary"}
            />
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatCurrency(budget.spent, currency)} de{" "}
              {formatCurrency(budget.cap, currency)} · {formatPercent(budget.ratio)}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SavingsCard({ overview, currency, isLoading }: MonthOverviewCardsProps) {
  const { savings } = overview;
  const isReached = savings !== null && savings.remaining === 0;

  return (
    <Card>
      <CardHeader>
        <CardDescription>Ahorro</CardDescription>
        <CardTitle className="text-2xl">
          {isLoading ? (
            <FigureSkeleton />
          ) : savings === null ? (
            PLACEHOLDER
          ) : (
            formatCurrency(savings.saved, currency)
          )}
        </CardTitle>
        <CardAction>
          <PiggyBank className="size-4 text-muted-foreground" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isLoading ? null : savings === null ? (
          <p className="text-xs text-muted-foreground">
            Creá un objetivo en Ahorros para seguir tu progreso.
          </p>
        ) : (
          <>
            <ProgressBar ratio={savings.ratio} tone="primary" />
            <p className="text-xs text-muted-foreground tabular-nums">
              {isReached
                ? `Objetivo alcanzado · ${formatCurrency(savings.target, currency)}`
                : `${formatPercent(savings.ratio)} de ${formatCurrency(
                    savings.target,
                    currency,
                  )} · faltan ${formatCurrency(savings.remaining, currency)}`}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// The month at a glance, above the filters and deliberately outside them: these
// three answer "how is this month going" before the user configures anything.
// Only the currency applies, and the heading names the month so the fixed scope
// is stated rather than implied.
export function MonthOverviewCards(props: MonthOverviewCardsProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">
        Este mes · {formatMonthLabel(props.overview.monthKey)}
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MonthExpensesCard {...props} />
        <BudgetCard {...props} />
        <SavingsCard {...props} />
      </div>
    </section>
  );
}
