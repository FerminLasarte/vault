import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SectionIntroProps {
  // One line on what this section is for. The sections that live in a tab have
  // no page header of their own, so this is where they say what they are.
  description: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
}

// The opening line of a section, with its one creating action on the right.
//
// The shape a tab uses instead of a PageHeader: same job, one level quieter,
// because the page it sits in already has a title.
export function SectionIntro({
  description,
  actionLabel,
  onAction,
  disabled = false,
}: SectionIntroProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{description}</p>
      <Button type="button" disabled={disabled} onClick={onAction}>
        <Plus />
        {actionLabel}
      </Button>
    </div>
  );
}
