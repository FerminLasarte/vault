import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { chartAnimation } from "@/components/charts/chartMotion";
import { tooltipContentStyle } from "@/components/charts/chartTooltip";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { CategoryBreakdownEntry } from "@/lib/finance";
import { LoadingSlot } from "@/components/Loading";
import { Skeleton } from "@/components/ui/skeleton";
import { useLoadingGate } from "@/hooks/useLoadingGate";

interface CategoryBreakdownChartProps {
  data: CategoryBreakdownEntry[];
  currency: string;
  isLoading: boolean;
}

export function CategoryBreakdownChart({
  data,
  currency,
  isLoading,
}: CategoryBreakdownChartProps) {
  const hasData = data.length > 0;
  const total = data.reduce((sum, entry) => sum + entry.total, 0);
  // The total and the chart wait on the same load, so they are drawn and land
  // together.
  const gate = useLoadingGate(isLoading);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gastos por categoría</CardTitle>
        <CardDescription>
          {isLoading || !hasData
            ? "Total del período"
            : `${data.length} ${data.length === 1 ? "categoría" : "categorías"}`}
        </CardDescription>
        {/* The total belongs beside the title rather than buried under the
            chart: it is the figure the breakdown is a breakdown *of*. */}
        <CardAction>
          {/* A dash only for a period with nothing to add up. One that is
              still arriving is a placeholder, like every late figure. */}
          <LoadingSlot gate={gate} placeholder={<Skeleton className="my-1 h-5 w-28" />}>
            <span className="font-heading text-xl font-semibold tabular-nums">
              {hasData ? formatCurrency(total, currency) : "—"}
            </span>
          </LoadingSlot>
        </CardAction>
      </CardHeader>
      <CardContent>
        <LoadingSlot
          gate={gate}
          placeholder={<Skeleton className="h-[220px]" />}
          className="flex flex-col gap-4"
        >
          {!hasData ? (
            <p className="text-sm text-muted-foreground">
              No hay gastos registrados en este período.
            </p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="total"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={2}
                    stroke="var(--card)"
                    strokeWidth={2}
                    {...chartAnimation}
                  >
                    {data.map((entry) => (
                      <Cell key={entry.categoryId ?? entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [
                      formatCurrency(Number(value), currency),
                      String(name),
                    ]}
                    contentStyle={tooltipContentStyle}
                    {...chartAnimation}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* This list replaces recharts' own legend, which named the
                categories but never said how much each one cost — the whole
                point of the breakdown. Reading a figure should not require
                hovering over a slice.

                It scrolls past a handful of rows so that a user with twenty
                categories does not stretch the card away from the chart
                sitting beside it. */}
              <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
                {data.map((entry) => (
                  <li
                    key={entry.categoryId ?? entry.name}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {formatCurrency(entry.total, currency)}
                    </span>
                    <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                      {total > 0 ? formatPercent(entry.total / total) : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </LoadingSlot>
      </CardContent>
    </Card>
  );
}
