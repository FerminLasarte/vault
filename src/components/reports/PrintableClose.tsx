import {
  CELL,
  NUMBER,
  PrintableDocument,
  Section,
  Table,
} from "@/components/reports/primitives";
import { AiMark } from "@/components/AiMark";
import { formatCurrency, formatMonthLabel, formatPercent } from "@/lib/format";
import { CURRENCY_LABELS } from "@/lib/currency";
import type {
  CategoryChange,
  CurrencyClose,
  MonthComparison,
  MonthlyClose,
} from "@/lib/monthlyClose";

interface PrintableCloseProps {
  close: MonthlyClose;
  generatedAt: string;
  // The local AI's sentences for each currency (see narrateMonth); absent with
  // it switched off.
  narrative?: ReadonlyMap<string, string[]>;
}

// A signed figure, so a rise and a fall are told apart without colour — which
// is the whole problem with printing: half of these come out of a black and
// white printer, and a red minus sign that is not red any more says nothing.
function signed(value: number, currency: string): string {
  const formatted = formatCurrency(Math.abs(value), currency);
  if (value === 0) return "—";
  return `${value > 0 ? "+" : "−"}${formatted}`;
}

function changeText(change: CategoryChange): string {
  // A rise from nothing has no meaningful percentage, so it says what happened
  // instead of showing an infinity.
  if (change.changeRatio === null) return "nuevo";
  return formatPercent(change.changeRatio);
}

function ComparisonSection({
  title,
  comparison,
  changes,
  currency,
}: {
  title: string;
  comparison: MonthComparison;
  changes: CategoryChange[];
  currency: string;
}) {
  if (changes.length === 0) return null;

  return (
    <Section title={`${title} · ${formatMonthLabel(comparison.monthKey)}`}>
      <Table>
        <thead>
          <tr>
            <th className={CELL}>Categoría</th>
            <th className={NUMBER}>Este mes</th>
            <th className={NUMBER}>{formatMonthLabel(comparison.monthKey)}</th>
            <th className={NUMBER}>Diferencia</th>
            <th className={`${NUMBER} w-16`}>Var.</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => (
            <tr key={change.categoryId ?? "none"}>
              <td className={CELL}>{change.name}</td>
              <td className={NUMBER}>{formatCurrency(change.current, currency)}</td>
              <td className={NUMBER}>{formatCurrency(change.previous, currency)}</td>
              <td className={NUMBER}>{signed(change.delta, currency)}</td>
              <td className={NUMBER}>{changeText(change)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Section>
  );
}

function BreakdownSection({
  title,
  entries,
  total,
  currency,
}: {
  title: string;
  entries: { categoryId: number | null; name: string; total: number }[];
  total: number;
  currency: string;
}) {
  if (entries.length === 0) return null;

  return (
    <Section title={title}>
      <Table>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.categoryId ?? "none"}>
              <td className={CELL}>{entry.name}</td>
              <td className={NUMBER}>{formatCurrency(entry.total, currency)}</td>
              <td className={`${NUMBER} w-16`}>
                {total > 0 ? formatPercent(entry.total / total) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Section>
  );
}

// One currency's half of the month. Rendered under a heading only when there is
// another one beside it: a document about a single currency has already said so
// in its own subtitle, and repeating it above every table is noise.
function CurrencyBlock({
  block,
  showHeading,
  sentences,
}: {
  block: CurrencyClose;
  showHeading: boolean;
  sentences?: string[];
}) {
  const { currency, summary } = block;

  return (
    <>
      {showHeading && (
        <h2 className="mt-8 break-after-avoid border-b border-black/20 pb-1 text-sm font-semibold tracking-tight">
          {CURRENCY_LABELS[currency] ?? currency} · {block.transactionCount}{" "}
          {block.transactionCount === 1 ? "movimiento" : "movimientos"}
        </h2>
      )}

      {/* What happened, before the tables that prove it. */}
      {sentences !== undefined && sentences.length > 0 && (
        <Section title="En pocas palabras">
          <p className="text-xs leading-relaxed">
            <AiMark className="mr-1.5 align-[-2px]" />
            {sentences.join(" ")}
          </p>
        </Section>
      )}

      <Section title="Resumen del mes">
        <Table>
          <thead>
            <tr>
              <th className={CELL} />
              <th className={NUMBER}>Este mes</th>
              {block.previousMonth && (
                <th className={NUMBER}>
                  {formatMonthLabel(block.previousMonth.monthKey)}
                </th>
              )}
              {block.lastYear && (
                <th className={NUMBER}>{formatMonthLabel(block.lastYear.monthKey)}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Ingresos", "income"],
                ["Gastos", "expenses"],
                ["Balance", "balance"],
              ] as const
            ).map(([label, key]) => (
              <tr key={key}>
                <td className={`${CELL}${key === "balance" ? " font-semibold" : ""}`}>
                  {label}
                </td>
                <td className={`${NUMBER}${key === "balance" ? " font-semibold" : ""}`}>
                  {formatCurrency(summary[key], currency)}
                </td>
                {block.previousMonth && (
                  <td className={NUMBER}>
                    {formatCurrency(block.previousMonth.summary[key], currency)}
                  </td>
                )}
                {block.lastYear && (
                  <td className={NUMBER}>
                    {formatCurrency(block.lastYear.summary[key], currency)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>

        {/* Said outright rather than left as a missing column: a comparison that
            is absent because there is no history reads the same as one that was
            forgotten. */}
        {block.lastYear === null && (
          <p className="mt-2 text-[10px]">
            Sin movimientos del mismo mes del año pasado para comparar.
          </p>
        )}
      </Section>

      <BreakdownSection
        title="Gastos por categoría"
        entries={block.expensesByCategory}
        total={summary.expenses}
        currency={currency}
      />

      <BreakdownSection
        title="Ingresos por categoría"
        entries={block.incomeByCategory}
        total={summary.income}
        currency={currency}
      />

      {block.previousMonth && (
        <>
          <ComparisonSection
            title="Gastos contra"
            comparison={block.previousMonth}
            changes={block.previousMonth.expenses}
            currency={currency}
          />
          <ComparisonSection
            title="Ingresos contra"
            comparison={block.previousMonth}
            changes={block.previousMonth.income}
            currency={currency}
          />
        </>
      )}

      {block.lastYear && (
        <>
          <ComparisonSection
            title="Gastos contra"
            comparison={block.lastYear}
            changes={block.lastYear.expenses}
            currency={currency}
          />
          <ComparisonSection
            title="Ingresos contra"
            comparison={block.lastYear}
            changes={block.lastYear.income}
            currency={currency}
          />
        </>
      )}
    </>
  );
}

// How a month ended, on one sheet.
//
// A different document from the filtered report, not a variant of it: this one
// answers "how did August go" and always covers exactly one whole month, while
// that one answers "what happened over the period I selected". They share the
// frame and the tables and nothing else — and only one of them is ever visible
// to the print engine at a time, because it takes the whole window.
//
// Every currency the month actually moved gets a block, and only those: one
// document per month rather than one per currency, because the alternative
// silently hands the reader a partial month unless they think to go and fetch
// the other half.
//
// Every section that has nothing to say is left out rather than printed empty.
// A month with no income should not cost a sheet of paper saying so.
export function PrintableClose({ close, generatedAt, narrative }: PrintableCloseProps) {
  const several = close.currencies.length > 1;
  const only = close.currencies[0];

  return (
    <PrintableDocument
      title={`Vault · Cierre de ${formatMonthLabel(close.monthKey)}`}
      generatedAt={generatedAt}
      meta={
        <p className="mt-1 text-xs">
          {/* With one currency the subtitle names it, which is why the blocks
              below carry no heading in that case. */}
          {!several && only && `${CURRENCY_LABELS[only.currency] ?? only.currency} · `}
          {close.transactionCount}{" "}
          {close.transactionCount === 1 ? "movimiento" : "movimientos"}
        </p>
      }
    >
      {close.currencies.map((block) => (
        <CurrencyBlock
          key={block.currency}
          block={block}
          showHeading={several}
          sentences={narrative?.get(block.currency)}
        />
      ))}
    </PrintableDocument>
  );
}
