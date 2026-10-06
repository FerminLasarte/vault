import { AiNote } from "@/components/AiMark";
import { CURRENCY_SHORT_LABELS } from "@/lib/currency";

interface CloseNarrativeProps {
  // The sentences of each currency the month moved (see narrateMonth).
  narrative: ReadonlyMap<string, string[]>;
}

const REASON =
  "Escrito con las cifras de este cierre y tus movimientos hasta el último día del mes.";

// A closed month in a few sentences, under its row in Cierres. Drops in rather
// than appearing whole, like the loan schedule, and is unmounted on close, so
// only the month being read is ever narrated.
export function CloseNarrative({ narrative }: CloseNarrativeProps) {
  const several = narrative.size > 1;

  return (
    <div className="flex animate-in flex-col gap-2 pt-3 duration-(--duration-base) fade-in slide-in-from-top-1">
      {[...narrative].map(([currency, sentences]) => (
        <AiNote key={currency} reason={REASON} className="text-sm leading-relaxed">
          <span>
            {/* With two currencies each paragraph says which one it is about;
                with one, the row already did. */}
            {several && (
              <span className="font-medium text-foreground">
                {CURRENCY_SHORT_LABELS[currency] ?? currency}.{" "}
              </span>
            )}
            {sentences.join(" ")}
          </span>
        </AiNote>
      ))}
    </div>
  );
}
