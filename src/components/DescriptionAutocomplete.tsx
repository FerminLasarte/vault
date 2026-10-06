import type { ComponentProps } from "react";
import { AiNote } from "@/components/AiMark";
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@/components/ui/autocomplete";
import type { DescriptionOption } from "@/hooks/useTransactionFields";
import { RECENT_MONTHS } from "@/lib/ai/merchantHistory";
import { formatCurrency } from "@/lib/format";

interface DescriptionAutocompleteProps extends Omit<
  ComponentProps<"input">,
  "value" | "defaultValue"
> {
  // What the form holds, which the field always shows.
  value: string;
  options: DescriptionOption[];
  onPick: (option: DescriptionOption) => void;
}

const REASON = `Lo que ya cargaste con un nombre parecido, con su categoría, la cuenta que más usás y el monto habitual de los últimos ${RECENT_MONTHS} meses.`;

// The description field of a new movement, offering the merchants the user
// has already written down as they type: "rap" brings up Rappi with its
// category, its usual account and what it usually costs. The arrows move
// through them and Enter picks one; typing on ignores them.
export function DescriptionAutocomplete({
  value,
  options,
  onPick,
  ...input
}: DescriptionAutocompleteProps) {
  return (
    <Autocomplete
      items={options}
      value={value}
      // Filtered already, by descriptionSuggestions.
      mode="none"
      itemToStringValue={(option: DescriptionOption) => option.entry.label}
    >
      <AutocompleteInput {...input} />
      {options.length > 0 && (
        <AutocompleteContent>
          <div className="px-1.5 pt-0.5 pb-1">
            <AiNote reason={REASON}>De tus movimientos</AiNote>
          </div>
          <AutocompleteList>
            {(option: DescriptionOption) => (
              <AutocompleteItem
                key={option.entry.id}
                value={option}
                onClick={() => onPick(option)}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{option.entry.label}</span>
                  {(option.category !== null || option.account !== null) && (
                    <span className="truncate text-xs text-muted-foreground">
                      {[option.category?.name, option.account?.name]
                        .filter((part) => part !== undefined)
                        .join(" · ")}
                    </span>
                  )}
                </span>
                {option.entry.typicalAmount !== null && (
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatCurrency(option.entry.typicalAmount, option.entry.currency)}
                  </span>
                )}
              </AutocompleteItem>
            )}
          </AutocompleteList>
        </AutocompleteContent>
      )}
    </Autocomplete>
  );
}
