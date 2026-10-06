import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InlineAction } from "@/components/InlineAction";
import { useAppActions, useAppData } from "@/hooks/useAppData";

// Where the local AI is explained and switched off. Off is the app as it was
// before it: no marks, no suggestions, descriptions exactly as written. And
// where whatever was dismissed comes back, since nothing else would bring it.
export function AiCard() {
  const { aiEnabled, aiDismissed } = useAppData();
  const { setAiEnabled, resetAiDismissals } = useAppActions();
  const dismissedCount = Object.keys(aiDismissed).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>IA local</CardTitle>
        <CardDescription>
          Sugerencias que aprenden de tus movimientos, como el nombre de cada comercio en
          lugar del texto del banco. Todo se calcula en este equipo: nada sale de él.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Tabs
          value={aiEnabled ? "on" : "off"}
          onValueChange={(next) => void setAiEnabled(next === "on")}
        >
          <TabsList>
            <TabsTrigger value="on">Activada</TabsTrigger>
            <TabsTrigger value="off">Desactivada</TabsTrigger>
          </TabsList>
        </Tabs>

        {dismissedCount > 0 && (
          <p className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
            {dismissedCount === 1
              ? "Descartaste 1 sugerencia."
              : `Descartaste ${dismissedCount} sugerencias.`}
            <InlineAction onClick={() => void resetAiDismissals()}>
              {dismissedCount === 1 ? "Volver a mostrarla" : "Volver a mostrarlas"}
            </InlineAction>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
