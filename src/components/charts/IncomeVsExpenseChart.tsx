import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { tooltipContentStyle } from "@/components/charts/chartTooltip";
import { formatCompactAmount, formatCurrency, formatMonthLabel } from "@/lib/format";
import type { MonthlyTrendEntry } from "@/lib/finance";

// A month of the trend, plus whether it has happened yet.
export interface TrendEntry extends MonthlyTrendEntry {
  // True for months that have not arrived: their figures are commitments read
  // off a schedule, not movements that were recorded.
  isProjected?: boolean;
}

interface IncomeVsExpenseChartProps {
  data: TrendEntry[];
  currency: string;
  isLoading: boolean;
}

// The same tokens as every signed figure on screen, so a bar and the amount it
// stands for are one colour, and both follow the theme.
const INCOME_COLOR = "var(--positive)";
const EXPENSE_COLOR = "var(--negative)";

const axisTick = { fontSize: 12, fill: "var(--muted-foreground)" };

export function IncomeVsExpenseChart({
  data,
  currency,
  isLoading,
}: IncomeVsExpenseChartProps) {
  const hasData = data.some((entry) => entry.income > 0 || entry.expenses > 0);

  const chartData = data.map((entry) => ({
    month: formatMonthLabel(entry.monthKey, "short"),
    Ingresos: entry.income,
    Gastos: entry.expenses,
    isProjected: entry.isProjected === true,
  }));

  const hasProjection = chartData.some((entry) => entry.isProjected);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ingresos vs. gastos</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : !hasData ? (
          <p className="text-sm text-muted-foreground">
            No hay movimientos en los últimos meses.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} barGap={4}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={axisTick} />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={axisTick}
                width={64}
                tickFormatter={formatCompactAmount}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                formatter={(value) => formatCurrency(Number(value), currency)}
                contentStyle={tooltipContentStyle}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: "0.75rem" }}
                // Recharts colours each label with its series, which the wrapper
                // cannot override from the outside. The swatch is what carries
                // the colour here; the names beside it stay as quiet as every
                // other caption on the screen.
                formatter={(value: string) => (
                  <span className="text-muted-foreground">{value}</span>
                )}
              />
              {/* The colour belongs on the Bar, not only on its Cells: it is
                  what recharts reads to colour the legend swatch and the
                  tooltip figure, and a series without one falls back to a
                  hardcoded black that vanishes on a dark background.

                  Same colours, faded: a month that has not happened is the
                  same kind of thing as one that has, only not yet true. A
                  different hue would read as a different measure. */}
              <Bar dataKey="Ingresos" fill={INCOME_COLOR} radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.month} fillOpacity={entry.isProjected ? 0.35 : 1} />
                ))}
              </Bar>
              <Bar dataKey="Gastos" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.month} fillOpacity={entry.isProjected ? 0.35 : 1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {hasProjection && !isLoading && (
          <p className="pt-2 text-xs text-muted-foreground">
            Los meses claros son lo que ya está comprometido: cuotas, préstamos y
            recurrentes.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
