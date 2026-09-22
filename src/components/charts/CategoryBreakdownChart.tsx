import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { tooltipContentStyle } from "@/components/charts/chartTooltip";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { CategoryBreakdownEntry } from "@/lib/finance";
import { Loading } from "@/components/Loading";
import { Skeleton } from "@/components/ui/skeleton";

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
          <span className="font-heading text-xl font-semibold tabular-nums">
            {isLoading || !hasData ? "—" : formatCurrency(total, currency)}
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Loading when={isLoading} placeholder={<Skeleton className="h-[220px]" />}>
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
        </Loading>
      </CardContent>
    </Card>
  );
}
