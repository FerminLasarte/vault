import { useMemo, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Hint } from "@/components/Hint";
import { Input } from "@/components/ui/input";
import { isValidTagName, normalizeForSearch } from "@/lib/text";
import type { Tag } from "@/db";

interface TagInputProps {
  id?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  // Tags already used elsewhere, offered as one-click suggestions so the same
  // idea does not end up spelled three different ways.
  suggestions: Tag[];
}

export function TagInput({ id, value, onChange, suggestions }: TagInputProps) {
  const [draft, setDraft] = useState("");

  const selected = useMemo(
    () => new Set(value.map((tag) => normalizeForSearch(tag))),
    [value],
  );

  const available = useMemo(
    () => suggestions.filter((tag) => !selected.has(normalizeForSearch(tag.name))),
    [suggestions, selected],
  );

  function add(name: string) {
    const trimmed = name.trim();
    if (!isValidTagName(trimmed)) return;
    if (selected.has(normalizeForSearch(trimmed))) return;
    onChange([...value, trimmed]);
    setDraft("");
  }

  function remove(name: string) {
    onChange(value.filter((tag) => tag !== name));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      // Enter would otherwise submit the surrounding form before the tag lands.
      event.preventDefault();
      add(draft);
      return;
    }
    if (event.key === "Backspace" && draft === "" && value.length > 0) {
      remove(value[value.length - 1]);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <Hint
                label="Quitar"
                anchor="element"
                render={
                  <button
                    type="button"
                    onClick={() => remove(tag)}
                    className="rounded-sm opacity-60 transition-opacity hover:opacity-100"
                  />
                }
              >
                <X className="size-3" />
                <span className="sr-only">Quitar {tag}</span>
              </Hint>
            </Badge>
          ))}
        </div>
      )}

      <Input
        id={id}
        value={draft}
        placeholder="Escribí y presioná Enter"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        // Losing focus with text still typed would silently discard it.
        onBlur={() => add(draft)}
      />

      {available.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {available.slice(0, 12).map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => add(tag.name)}
              className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
