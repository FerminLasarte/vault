import { useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { ListCard } from "@/components/ListCard";
import { SectionIntro } from "@/components/SectionIntro";
import { ActionButton } from "@/components/ActionButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { CategoryDialog } from "@/components/CategoryDialog";
import { CategoryRulesCard } from "@/components/CategoryRulesCard";
import { BudgetsSection } from "@/components/BudgetsSection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRequestedTab } from "@/hooks/useRequestedTab";
import { CATEGORY_TABS, DEFAULT_CATEGORY_TAB } from "@/lib/navigation";
import type { CategoryTab } from "@/lib/navigation";
import type { ViewProps } from "@/lib/menu";
import { useAppActions, useAppData, useAppStatus } from "@/hooks/useAppData";
import { CATEGORY_TYPE_LABELS } from "@/lib/labels";
import { categoryDeletionNotice } from "@/lib/deletionNotice";
import type { Category, CategoryType, NewCategory } from "@/db";

const GROUPS: { type: CategoryType; title: string }[] = [
  { type: "income", title: "Categorías de ingreso" },
  { type: "expense", title: "Categorías de gasto" },
];

export function CategoriesView({ tab }: ViewProps) {
  const [current, setCurrent] = useRequestedTab<CategoryTab>(
    tab,
    CATEGORY_TABS,
    DEFAULT_CATEGORY_TAB,
  );

  const { categories, budgets, categoryRules, isLoading } = useAppData();

  const { isMutating } = useAppStatus();

  const { addCategory, editCategory, removeCategory } = useAppActions();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<Category | null>(null);

  const grouped = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        items: categories.filter((category) => category.type === group.type),
      })),
    [categories],
  );

  // Budgets and rules exist only for their category and are deleted with it by
  // cascade, so the confirmation has to say so before, not after.
  const cascadeNotice = useMemo(() => {
    if (pendingDeletion === null) return null;
    return categoryDeletionNotice(
      budgets.filter((budget) => budget.category_id === pendingDeletion.id).length,
      categoryRules.filter((rule) => rule.category_id === pendingDeletion.id).length,
    );
  }, [pendingDeletion, budgets, categoryRules]);

  function openCreateDialog() {
    setEditing(null);
    setIsFormOpen(true);
  }

  function openEditDialog(category: Category) {
    setEditing(category);
    setIsFormOpen(true);
  }

  async function handleSubmitCategory(values: NewCategory) {
    if (editing) {
      await editCategory(editing.id, values);
    } else {
      await addCategory(values);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDeletion) return;
    await removeCategory(pendingDeletion.id);
    setPendingDeletion(null);
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <PageHeader
        title="Categorías"
        description="Cómo se clasifican tus movimientos, y cuánto querés gastar en cada cosa."
      />

      <Tabs
        value={current}
        onValueChange={(next) => setCurrent(String(next) as CategoryTab)}
      >
        <TabsList>
          <TabsTrigger value="categories">Categorías</TabsTrigger>
          <TabsTrigger value="budgets">Presupuestos</TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="flex flex-col gap-6 pt-6">
          <SectionIntro
            description="Organizá tus ingresos y gastos."
            actionLabel="Nueva categoría"
            onAction={openCreateDialog}
          />

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : categories.length === 0 ? (
            <ListCard
              isEmpty
              empty={{
                message: "Todavía no tenés categorías.",
                actionLabel: "Agregar la primera",
                onAction: openCreateDialog,
              }}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {grouped.map(({ type, title, items }) => (
                <Card key={type}>
                  <CardHeader>
                    <CardTitle>{title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {items.length === 0 ? (
                      <p className="py-2 text-sm text-muted-foreground">
                        Sin categorías de este tipo.
                      </p>
                    ) : (
                      <ul className="flex flex-col">
                        {items.map((category) => (
                          <li
                            key={category.id}
                            className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="text-lg leading-none">
                                {category.icon}
                              </span>
                              <span className="truncate text-sm font-medium">
                                {category.name}
                              </span>
                            </div>

                            <div className="flex shrink-0 items-center gap-1">
                              <ActionButton
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                label="Editar"
                                onClick={() => openEditDialog(category)}
                              >
                                <Pencil />
                                <span className="sr-only">Editar {category.name}</span>
                              </ActionButton>
                              <ActionButton
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                label="Eliminar"
                                onClick={() => setPendingDeletion(category)}
                              >
                                <Trash2 />
                                <span className="sr-only">Eliminar {category.name}</span>
                              </ActionButton>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <CategoryRulesCard />
        </TabsContent>

        <TabsContent value="budgets" className="pt-6">
          <BudgetsSection />
        </TabsContent>
      </Tabs>

      <CategoryDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        editing={editing}
        categories={categories}
        onSubmitCategory={handleSubmitCategory}
      />

      <ConfirmDeleteDialog
        open={pendingDeletion !== null}
        onClose={() => setPendingDeletion(null)}
        title="¿Eliminar esta categoría?"
        description={
          <>
            Se eliminará «{pendingDeletion?.name}» (
            {pendingDeletion ? CATEGORY_TYPE_LABELS[pendingDeletion.type] : ""}).{" "}
            {cascadeNotice !== null && `${cascadeNotice} `}Las transacciones ya
            registradas se conservan, pero quedarán sin categoría asociada.
          </>
        }
        onConfirm={handleConfirmDelete}
        isMutating={isMutating}
      />
    </div>
  );
}
