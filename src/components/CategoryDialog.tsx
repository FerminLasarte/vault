import { Controller } from "react-hook-form";
import { z } from "zod";
import { FormDialog } from "@/components/FormDialog";
import { Hint } from "@/components/Hint";
import { useDialogForm } from "@/hooks/useDialogForm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_TYPE_LABELS } from "@/lib/labels";
import { DEFAULT_CATEGORY_EMOJI, EMOJI_SUGGESTIONS, isSingleEmoji } from "@/lib/emoji";
import {
  CATEGORY_COLORS,
  CATEGORY_PALETTE,
  nextCategoryColor,
} from "@/lib/categoryColors";
import { cn } from "@/lib/utils";
import type { Category, NewCategory } from "@/db";

const categorySchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  type: z.enum(["income", "expense"]),
  icon: z
    .string()
    .trim()
    .min(1, "Elegí un emoji")
    .refine(isSingleEmoji, { message: "Debe ser un único emoji" }),
  color: z.string().min(1),
});

type CategoryFormValues = z.output<typeof categorySchema>;

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // `null` puts the dialog in create mode.
  editing: Category | null;
  // The categories that already exist, so a new one starts out in a colour
  // none of them has.
  categories: Category[];
  onSubmitCategory: (category: NewCategory) => Promise<void>;
}

export function CategoryDialog({
  open,
  onOpenChange,
  editing,
  categories,
  onSubmitCategory,
}: CategoryDialogProps) {
  const freeColor = nextCategoryColor(categories.map((category) => category.color));

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useDialogForm<CategoryFormValues, CategoryFormValues>({
    schema: categorySchema,
    open,
    defaultValues: {
      name: "",
      type: "expense",
      icon: DEFAULT_CATEGORY_EMOJI,
      color: CATEGORY_PALETTE[0],
    },
    values: editing
      ? {
          name: editing.name,
          type: editing.type,
          icon: editing.icon || DEFAULT_CATEGORY_EMOJI,
          color: editing.color || freeColor,
        }
      : {
          name: "",
          type: "expense",
          icon: DEFAULT_CATEGORY_EMOJI,
          color: freeColor,
        },
  });

  const selectedIcon = watch("icon");
  const selectedColor = watch("color")?.toLowerCase();

  async function onSubmit(values: CategoryFormValues) {
    await onSubmitCategory({ ...values, icon: values.icon.trim() });
    onOpenChange(false);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Editar categoría" : "Nueva categoría"}
      description="Las categorías agrupan tus transacciones en los informes."
      onSubmit={handleSubmit(onSubmit)}
      isSubmitting={isSubmitting}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-name">Nombre</Label>
        <Input id="category-name" placeholder="Ej. Supermercado" {...register("name")} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-type">Tipo</Label>
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <Select
              items={CATEGORY_TYPE_LABELS}
              value={field.value}
              onValueChange={(value) => field.onChange(value)}
            >
              <SelectTrigger id="category-type" className="w-full">
                <SelectValue placeholder="Seleccioná un tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">{CATEGORY_TYPE_LABELS.expense}</SelectItem>
                <SelectItem value="income">{CATEGORY_TYPE_LABELS.income}</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-icon">Emoji</Label>
        <Input
          id="category-icon"
          className="w-20 text-center text-lg"
          maxLength={8}
          {...register("icon")}
        />
        <div className="flex flex-wrap gap-1 pt-1">
          {EMOJI_SUGGESTIONS.map((emoji) => (
            <Hint
              key={emoji}
              label="Usar este icono"
              anchor="element"
              render={
                <button
                  type="button"
                  onClick={() => setValue("icon", emoji, { shouldValidate: true })}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md text-base transition-colors hover:bg-muted",
                    selectedIcon === emoji && "bg-muted ring-1 ring-foreground/10",
                  )}
                />
              }
            >
              {emoji}
            </Hint>
          ))}
        </div>
        {errors.icon && <p className="text-xs text-destructive">{errors.icon.message}</p>}
      </div>

      {/* How the category shows up in the charts. A new one already starts in
          a colour no other category has, so this is only for changing it. */}
      <div className="flex flex-col gap-1.5">
        <Label id="category-color">Color</Label>
        <div
          role="group"
          aria-labelledby="category-color"
          className="flex flex-wrap gap-1"
        >
          {CATEGORY_COLORS.map(({ color, name }) => (
            <Hint
              key={color}
              label={name}
              anchor="element"
              render={
                <button
                  type="button"
                  aria-label={name}
                  aria-pressed={selectedColor === color}
                  onClick={() => setValue("color", color, { shouldValidate: true })}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md transition-colors hover:bg-muted",
                    selectedColor === color && "bg-muted ring-1 ring-foreground/10",
                  )}
                />
              }
            >
              <span
                aria-hidden
                className="size-4 rounded-full"
                style={{ backgroundColor: color }}
              />
            </Hint>
          ))}
        </div>
      </div>
    </FormDialog>
  );
}
