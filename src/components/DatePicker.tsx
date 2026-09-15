import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatDate, parseIsoDate, toIsoDate } from "@/lib/format";

interface DatePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  max?: Date;
  placeholder?: string;
  className?: string;
}

export function DatePicker({
  id,
  value,
  onChange,
  max,
  placeholder = "Seleccioná una fecha",
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseIsoDate(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn("w-full justify-start gap-2 font-normal", className)}
          />
        }
      >
        <CalendarIcon className="size-4 text-muted-foreground" />
        {selected ? (
          formatDate(value)
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (!date) return;
            onChange(toIsoDate(date));
            setOpen(false);
          }}
          disabled={max ? { after: max } : undefined}
          locale={es}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
