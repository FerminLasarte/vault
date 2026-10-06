import { useMemo, useState } from "react";
import { Pencil, Trash2, Wand2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { AiMark, AiNote } from "@/components/AiMark";
import { InlineAction } from "@/components/InlineAction";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ActionButton";
import { ListCard } from "@/components/ListCard";
import { FormDialog } from "@/components/FormDialog";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppActions, useAppData, useAppStatus } from "@/hooks/useAppData";
import type { CategoryRuleWithCategory } from "@/db";
import { adviseRules, type RuleNote } from "@/lib/ai/ruleProposals";
import { isDismissed } from "@/lib/ai/state";
import { idSelectProps } from "@/lib/forms";

// Proposals shown at once. The rest wait for these to be created or dismissed,
// so the card stays a list of rules with a few ideas under it.
const SHOWN_PROPOSALS = 5;

const ruleSchema = z.object({
  pattern: z.string().trim().min(2, "Escribí al menos dos caracteres"),
  categoryId: z.coerce.number().int().positive("Seleccioná una categoría"),
});

type RuleFormInput = z.input<typeof ruleSchema>;
type RuleFormValues = z.output<typeof ruleSchema>;

export function CategoryRulesCard() {
  const {
    categories,
    categoryRules,
    transactions,
    categoryModel,
    aiDismissed,
    today,
    isLoading,
  } = useAppData();
  const { isMutating } = useAppStatus();
  const { addCategoryRule, editCategoryRule, removeCategoryRule, dismissAiSuggestions } =
    useAppActions();

  // What the local AI makes of the rules against the history; nothing with it
  // switched off, which is when there is no model.
  const advice = useMemo(
    () =>
      categoryModel === null
        ? null
        : adviseRules({
            model: categoryModel,
            transactions,
            rules: categoryRules,
            categories,
          }),
    [categoryModel, transactions, categoryRules, categories],
  );
  const proposals = (advice?.proposals ?? [])
    .filter((proposal) => !isDismissed(aiDismissed, proposal.id, today))
    .slice(0, SHOWN_PROPOSALS);

  function noteFor(ruleId: number): RuleNote | null {
    const note = advice?.notes.get(ruleId);
    return note === undefined || isDismissed(aiDismissed, note.id, today) ? null : note;
  }

  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRuleWithCategory | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<CategoryRuleWithCategory | null>(
    null,
  );

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RuleFormInput, unknown, RuleFormValues>({
    resolver: zodResolver(ruleSchema),
    defaultValues: { pattern: "", categoryId: undefined },
  });

  function openCreate() {
    setEditing(null);
    reset({ pattern: "", categoryId: categories[0]?.id });
    setIsOpen(true);
  }

  function openEdit(rule: CategoryRuleWithCategory) {
    setEditing(rule);
    reset({ pattern: rule.pattern, categoryId: rule.category_id });
    setIsOpen(true);
  }

  async function onSubmit(values: RuleFormValues) {
    if (editing) {
      await editCategoryRule(editing.id, values);
    } else {
      await addCategoryRule(values);
    }
    setIsOpen(false);
  }

  async function handleConfirmDelete() {
    if (!pendingDeletion) return;
    await removeCategoryRule(pendingDeletion.id);
    setPendingDeletion(null);
  }

  return (
    <>
      <ListCard
        title="Reglas de categorización"
        description="Cuando la descripción contenga el texto de una regla, la categoría se completa sola. Si varias coinciden, gana la más específica."
        isLoading={isLoading}
        isEmpty={categoryRules.length === 0 && proposals.length === 0}
        empty={{
          message: "Todavía no hay reglas. Por ejemplo, «netflix» → Ocio.",
          actionLabel: "Nueva regla",
          onAction: openCreate,
          disabled: categories.length === 0,
          // The only way to add a rule: this card has no SectionIntro above it.
          persistent: true,
        }}
      >
        {categoryRules.length > 0 && (
          <ul className="flex flex-col">
            {categoryRules.map((rule) => {
              const note = noteFor(rule.id);
              return (
                <li
                  key={rule.id}
                  className="flex flex-col gap-1 border-b border-border py-3 last:border-0"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-2">
                      <Wand2 className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm font-medium">{rule.pattern}</span>
                      <span className="text-muted-foreground">→</span>
                      <Badge variant="secondary">
                        {rule.category_icon} {rule.category_name}
                      </Badge>
                    </div>

                    <div className="row-actions flex shrink-0 items-center gap-1">
                      <ActionButton
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        label="Editar"
                        onClick={() => openEdit(rule)}
                      >
                        <Pencil />
                        <span className="sr-only">Editar regla {rule.pattern}</span>
                      </ActionButton>
                      <ActionButton
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        label="Eliminar"
                        onClick={() => setPendingDeletion(rule)}
                      >
                        <Trash2 />
                        <span className="sr-only">Eliminar regla {rule.pattern}</span>
                      </ActionButton>
                    </div>
                  </div>

                  {note !== null && (
                    <AiNote reason={note.reason}>
                      {note.message}
                      {note.kind === "contradicted" && (
                        <InlineAction
                          onClick={() =>
                            void editCategoryRule(rule.id, {
                              pattern: rule.pattern,
                              categoryId: note.categoryId,
                            })
                          }
                        >
                          {`Pasarla a ${note.categoryName}`}
                        </InlineAction>
                      )}
                      <InlineAction onClick={() => void dismissAiSuggestions([note.id])}>
                        Descartar
                      </InlineAction>
                    </AiNote>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Where a word keeps landing in the same category, the rule the user
            would otherwise write by hand. */}
        {proposals.length > 0 && (
          <section
            aria-labelledby="rule-proposals"
            className={categoryRules.length > 0 ? "mt-4" : undefined}
          >
            <h3 id="rule-proposals" className="text-xs font-medium text-muted-foreground">
              Sugeridas por IA
            </h3>
            <ul className="flex flex-col">
              {proposals.map((proposal) => {
                const category = categories.find(
                  (candidate) => candidate.id === proposal.categoryId,
                );
                return (
                  <li
                    key={proposal.id}
                    className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <AiMark reason={proposal.reason} />
                      <span className="truncate text-sm font-medium">
                        {proposal.pattern}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <Badge variant="secondary">
                        {category?.icon} {category?.name}
                      </Badge>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        aria-label={`Descartar la regla ${proposal.pattern}`}
                        onClick={() => void dismissAiSuggestions([proposal.id])}
                      >
                        Descartar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        aria-label={`Crear la regla ${proposal.pattern}`}
                        disabled={isMutating}
                        onClick={() =>
                          void addCategoryRule({
                            pattern: proposal.pattern,
                            categoryId: proposal.categoryId,
                          })
                        }
                      >
                        Crear
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </ListCard>

      <FormDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title={editing ? "Editar regla" : "Nueva regla"}
        description="No distingue mayúsculas ni acentos."
        onSubmit={handleSubmit(onSubmit)}
        isSubmitting={isSubmitting}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-pattern">Si la descripción contiene</Label>
          <Input id="rule-pattern" placeholder="Ej. netflix" {...register("pattern")} />
          {errors.pattern && (
            <p className="text-xs text-destructive">{errors.pattern.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-category">Usar la categoría</Label>
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <Select
                {...idSelectProps(
                  Object.fromEntries(
                    categories.map((category) => [String(category.id), category.name]),
                  ),
                  field.value,
                  field.onChange,
                )}
              >
                <SelectTrigger id="rule-category" className="w-full">
                  <SelectValue placeholder="Seleccioná una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={String(category.id)}>
                      {category.icon} {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.categoryId && (
            <p className="text-xs text-destructive">{errors.categoryId.message}</p>
          )}
        </div>
      </FormDialog>

      <ConfirmDeleteDialog
        open={pendingDeletion !== null}
        onClose={() => setPendingDeletion(null)}
        title="¿Eliminar esta regla?"
        description={
          <>
            Se eliminará la regla «{pendingDeletion?.pattern}» →{" "}
            {pendingDeletion?.category_name}. Los movimientos que ya categorizó no
            cambian.
          </>
        }
        onConfirm={handleConfirmDelete}
        isMutating={isMutating}
      />
    </>
  );
}
