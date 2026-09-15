import { useState } from "react";
import { Pencil, Trash2, Wand2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
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
import { useAppData } from "@/hooks/useAppData";
import type { CategoryRuleWithCategory } from "@/db";
import { toSelectValue } from "@/lib/forms";

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
    isLoading,
    isMutating,
    addCategoryRule,
    editCategoryRule,
    removeCategoryRule,
  } = useAppData();

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
        isEmpty={categoryRules.length === 0}
        empty={{
          message: "Todavía no hay reglas. Por ejemplo, «netflix» → Ocio.",
          actionLabel: "Nueva regla",
          onAction: openCreate,
          disabled: categories.length === 0,
          // The only way to add a rule: this card has no SectionIntro above it.
          persistent: true,
        }}
      >
        <ul className="flex flex-col">
          {categoryRules.map((rule) => (
            <li
              key={rule.id}
              className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Wand2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-medium">{rule.pattern}</span>
                <span className="text-muted-foreground">→</span>
                <Badge variant="secondary">
                  {rule.category_icon} {rule.category_name}
                </Badge>
              </div>

              <div className="flex shrink-0 items-center gap-1">
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
            </li>
          ))}
        </ul>
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
                items={Object.fromEntries(
                  categories.map((category) => [String(category.id), category.name]),
                )}
                value={toSelectValue(field.value)}
                onValueChange={(value) => field.onChange(Number(value))}
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
