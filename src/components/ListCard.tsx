import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface EmptyState {
  // Why the list is empty, in the words of whatever it lists. Worth writing per
  // section: "todavía no hay recurrentes" teaches nothing on its own, while
  // naming an example does.
  message: string;
  // Both absent where the list has nothing to create: a section that fills
  // itself has no button to offer, and inventing one would point nowhere.
  actionLabel?: string;
  onAction?: () => void;
  // Some sections cannot create yet — a budget needs a category to cap.
  disabled?: boolean;
  // Keeps the action in the footer once the list has rows. For a card whose
  // only way to create is this button: the sections that sit under a
  // SectionIntro already have one above them, and two would be one too many.
  persistent?: boolean;
}

interface ListCardProps {
  title?: ReactNode;
  // Shown only when the list has something in it. An explanation of how the
  // figures are read is noise on a section that has no figures yet, and it
  // would sit in the same place as the empty message.
  description?: ReactNode;
  isLoading?: boolean;
  isEmpty: boolean;
  empty: EmptyState;
  children?: ReactNode;
}

// A card that holds a list, in the three states every one of them has: loading,
// empty, and full.
//
// The empty state is built out of the card's own slots rather than dropped into
// the middle of its body. The message belongs under the title, where a card
// says what it is, and the way out belongs in the footer, where a card puts its
// actions — so an empty section reads as a card with nothing in it rather than
// as a paragraph floating in a box.
//
// Six sections were drawing this by hand and drifting apart while they did it.
export function ListCard({
  title,
  description,
  isLoading = false,
  isEmpty,
  empty,
  children,
}: ListCardProps) {
  const showEmpty = isEmpty && !isLoading;

  // The empty message takes the description's place rather than joining it, so
  // a section with a title and nothing in it reads as two lines, not three.
  const subtitle = showEmpty ? empty.message : description;

  return (
    <Card>
      {(title !== undefined || subtitle !== undefined) && (
        <CardHeader>
          {title !== undefined && <CardTitle>{title}</CardTitle>}
          {subtitle !== undefined && <CardDescription>{subtitle}</CardDescription>}
        </CardHeader>
      )}

      {isLoading ? (
        <CardContent>
          <p className="text-sm text-muted-foreground">Cargando...</p>
        </CardContent>
      ) : (
        !showEmpty && <CardContent>{children}</CardContent>
      )}

      {!isLoading &&
        (showEmpty || empty.persistent) &&
        empty.actionLabel !== undefined && (
          <CardFooter>
            <Button
              type="button"
              variant="outline"
              disabled={empty.disabled}
              onClick={empty.onAction}
            >
              <Plus />
              {empty.actionLabel}
            </Button>
          </CardFooter>
        )}
    </Card>
  );
}
