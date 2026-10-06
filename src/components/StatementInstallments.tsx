import { AiMark } from "@/components/AiMark";
import { InlineAction } from "@/components/InlineAction";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  InstallmentDates,
  InstallmentLine,
  InstallmentPlanDraft,
} from "@/lib/ai/statementInstallments";

const DATE_LABELS: Record<InstallmentDates, string> = {
  charge: "La del cobro de cada cuota",
  purchase: "La de la compra, repetida en cada cuota",
};

interface StatementInstallmentsProps {
  lines: InstallmentLine[];
  dates: InstallmentDates | null;
  onDatesChange: (dates: InstallmentDates) => void;
  // Whether the line goes into its plan or is imported on its own.
  onSeparate: (line: number, separate: boolean) => void;
  onCreatePlan: (draft: InstallmentPlanDraft) => void;
}

// The instalments a statement brings, and what the import does with each: the
// part of the preview where a plan and a statement meet, so neither records an
// instalment the other already has.
export function StatementInstallments({
  lines,
  dates,
  onDatesChange,
  onSeparate,
  onCreatePlan,
}: StatementInstallmentsProps) {
  // Only an instalment past the first is dated differently by the two
  // conventions; the first one's purchase and charge are the same month.
  const asksDates = lines.some((line) => line.number > 1);
  const undecided = asksDates && dates === null;

  return (
    <div className="flex flex-col gap-3">
      {asksDates && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="import-installment-dates">Qué fecha traen las cuotas</Label>
          <Select
            items={DATE_LABELS}
            value={dates}
            onValueChange={(next) => next && onDatesChange(next)}
          >
            <SelectTrigger id="import-installment-dates" className="w-full sm:w-80">
              <SelectValue placeholder="Elegí una opción" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DATE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {undecided
              ? "Elegila para poder importar. Se recuerda para los próximos resúmenes de este banco."
              : "Se recuerda para los próximos resúmenes de este banco."}
          </p>
        </div>
      )}

      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {lines.map((line) => (
          <li
            key={line.line}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 text-xs"
          >
            <div className="min-w-0">
              <p className="max-w-64 truncate">{line.description}</p>
              <p className="text-muted-foreground">
                Cuota {line.number} de {line.count}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
              <InstallmentOutcome
                line={line}
                canCreatePlan={!undecided}
                onSeparate={onSeparate}
                onCreatePlan={onCreatePlan}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InstallmentOutcome({
  line,
  canCreatePlan,
  onSeparate,
  onCreatePlan,
}: {
  line: InstallmentLine;
  canCreatePlan: boolean;
  onSeparate: (line: number, separate: boolean) => void;
  onCreatePlan: (draft: InstallmentPlanDraft) => void;
}) {
  switch (line.kind) {
    case "registers":
      return (
        <>
          <AiMark reason={line.reason} />
          <span>Se registra en {line.plan.description}</span>
          <InlineAction onClick={() => onSeparate(line.line, true)}>
            No es de este plan
          </InlineAction>
        </>
      );
    case "registered":
      return (
        <>
          <AiMark reason={line.reason} />
          <span>Ya registrada en {line.plan.description}</span>
        </>
      );
    case "separate":
      return (
        <>
          <span>Se importa aparte</span>
          <InlineAction onClick={() => onSeparate(line.line, false)}>
            {`Registrar en ${line.plan.description}`}
          </InlineAction>
        </>
      );
    case "outOfOrder":
      return (
        <>
          <AiMark reason={line.reason} />
          <span>Se importa aparte</span>
        </>
      );
    case "unplanned":
      return (
        <>
          <span>Sin plan</span>
          {canCreatePlan && (
            <InlineAction onClick={() => onCreatePlan(line.draft)}>
              Crear plan de cuotas
            </InlineAction>
          )}
        </>
      );
  }
}
