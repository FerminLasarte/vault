import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppActions, useAppData } from "@/hooks/useAppData";

// Where the local AI is explained and switched off. Off is the app as it was
// before it: no marks, no suggestions, descriptions exactly as written.
export function AiCard() {
  const { aiEnabled } = useAppData();
  const { setAiEnabled } = useAppActions();

  return (
    <Card>
      <CardHeader>
        <CardTitle>IA local</CardTitle>
        <CardDescription>
          Sugerencias que aprenden de tus movimientos, como el nombre de cada comercio en
          lugar del texto del banco. Todo se calcula en este equipo: nada sale de él.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs
          value={aiEnabled ? "on" : "off"}
          onValueChange={(next) => void setAiEnabled(next === "on")}
        >
          <TabsList>
            <TabsTrigger value="on">Activada</TabsTrigger>
            <TabsTrigger value="off">Desactivada</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardContent>
    </Card>
  );
}
