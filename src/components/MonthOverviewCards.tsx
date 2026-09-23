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
import { LoadingSlot } from "@/components/Loading";
import { useLoadingGate, type LoadingGate } from "@/hooks/useLoadingGate";
import { cn } from "@/lib/utils";
import { ProgressBar } from "@/components/ui/progress-bar";
import { formatCurrency, formatMonthLabel, formatPercent } from "@/lib/format";
import type { MonthOverview } from "@/lib/monthOverview";

interface MonthOverviewCardsProps {
  overview: MonthOverview;
  currency: string;
  isLoading: boolean;
}

// What each card is given: the month, and the one gate the three share, so
// they are drawn and land together rather than a frame apart.
interface MonthCardProps {
  overview: MonthOverview;
  currency: string;
  gate: LoadingGate;
}

// A figure the app worked out and found nothing to show — not one that has yet
// to arrive. That one is a skeleton, so the two are never confused.
const PLACEHOLDER = "—";

// The height of the heading it stands in for, so the card does not resize when
// the number lands.
function FigureSkeleton() {
  return <Skeleton className="my-1.5 h-5 w-32" />;
}

// The one line of small print under a figure.
function CaptionSkeleton() {
  return <Skeleton className="h-4 w-40" />;
}

// A bar and the line that reads it. The same height as the two-line invitation
// a card shows when there is nothing to track yet, so either way the card lands
// at the size it was held at.
function ProgressSkeleton() {
  return (
    <>
      <Skeleton className="h-2 rounded-full" />
      <CaptionSkeleton />
    </>
  );
}

function MonthExpensesCard({ overview, currency, gate }: MonthCardProps) {
  const { total, previousTotal, previousMonthKey, changeRatio } = overview.expenses;
  const isUp = changeRatio !== null && changeRatio > 0;

  return (
    <Card>
      <CardHeader>
        <CardDescription>Gastos de este mes</CardDescription>
        {/* Left in the default colour on purpose. The comparison below carries
            the judgement — a red headline every month says nothing. */}
        <CardTitle className="text-2xl">
          <LoadingSlot gate={gate} placeholder={<FigureSkeleton />}>
            {formatCurrency(total, currency)}
          </LoadingSlot>
        </CardTitle>
        <CardAction>
          <Wallet className="size-4 text-muted-foreground" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <LoadingSlot gate={gate} placeholder={<CaptionSkeleton />}>
          {changeRatio === null ? (
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
        </LoadingSlot>
      </CardContent>
    </Card>
  );
}

function BudgetCard({ overview, currency, gate }: MonthCardProps) {
  const { budget } = overview;
  const isExceeded = budget !== null && budget.remaining < 0;

  return (
    <Card>
      <CardHeader>
        <CardDescription>
          {isExceeded ? "Presupuesto excedido" : "Presupuesto disponible"}
        </CardDescription>
        <CardTitle className={cn("text-2xl", isExceeded && "text-negative")}>
          <LoadingSlot gate={gate} placeholder={<FigureSkeleton />}>
            {budget === null
              ? PLACEHOLDER
              : formatCurrency(Math.abs(budget.remaining), currency)}
          </LoadingSlot>
        </CardTitle>
        <CardAction>
          <Target className="size-4 text-muted-foreground" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <LoadingSlot
          gate={gate}
          placeholder={<ProgressSkeleton />}
          className="flex flex-col gap-2"
        >
          {budget === null ? (
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
        </LoadingSlot>
      </CardContent>
    </Card>
  );
}

function SavingsCard({ overview, currency, gate }: MonthCardProps) {
  const { savings } = overview;
  const isReached = savings !== null && savings.remaining === 0;

  return (
    <Card>
      <CardHeader>
        <CardDescription>Ahorro</CardDescription>
        <CardTitle className="text-2xl">
          <LoadingSlot gate={gate} placeholder={<FigureSkeleton />}>
            {savings === null ? PLACEHOLDER : formatCurrency(savings.saved, currency)}
          </LoadingSlot>
        </CardTitle>
        <CardAction>
          <PiggyBank className="size-4 text-muted-foreground" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <LoadingSlot
          gate={gate}
          placeholder={<ProgressSkeleton />}
          className="flex flex-col gap-2"
        >
          {savings === null ? (
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
        </LoadingSlot>
      </CardContent>
    </Card>
  );
}

// The month at a glance, above the filters and deliberately outside them: these
// three answer "how is this month going" before the user configures anything.
// Only the currency applies, and the heading names the month so the fixed scope
// is stated rather than implied.
export function MonthOverviewCards({
  overview,
  currency,
  isLoading,
}: MonthOverviewCardsProps) {
  const gate = useLoadingGate(isLoading);
  const card = { overview, currency, gate };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">
        Este mes · {formatMonthLabel(overview.monthKey)}
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MonthExpensesCard {...card} />
        <BudgetCard {...card} />
        <SavingsCard {...card} />
      </div>
    </section>
  );
}
