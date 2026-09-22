import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorDetailsProps {
  error: Error;
}

// Folded away by default: the message matters to the user, the stack only
// matters when something has to be reported or debugged.
function ErrorDetails({ error }: ErrorDetailsProps) {
  return (
    <details className="w-full">
      <summary className="cursor-pointer text-xs text-muted-foreground select-none hover:text-foreground">
        Ver detalle técnico
      </summary>
      <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-muted p-3 text-left text-xs whitespace-pre-wrap text-muted-foreground">
        {error.stack ?? error.message}
      </pre>
    </details>
  );
}

interface FallbackProps {
  error: Error;
  retry: () => void;
}

// Shown when the failure is above the views — the data provider or the theme —
// so there is no interface left to return to and reloading is the only way out.
export function AppErrorFallback({ error }: FallbackProps) {
  return (
    <div className="flex h-screen items-center justify-center bg-background p-8 text-foreground">
      <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
        <TriangleAlert className="size-6 text-destructive" />
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-lg font-semibold tracking-tight">
            Algo se rompió
          </h1>
          <p className="text-sm text-muted-foreground">
            La aplicación no pudo arrancar. Tus datos están intactos en este equipo: nada
            se perdió.
          </p>
        </div>
        <Button type="button" onClick={() => window.location.reload()}>
          <RotateCcw />
          Reiniciar la aplicación
        </Button>
        <ErrorDetails error={error} />
      </div>
    </div>
  );
}

// Shown when a single view throws. The sidebar survives, so the user can simply
// go somewhere else — which is the whole point of the second boundary.
export function ViewErrorFallback({ error, retry }: FallbackProps) {
  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          No se pudo mostrar esta sección
        </h1>
        <p className="text-sm text-muted-foreground">
          Podés reintentar, o ir a otra sección desde el menú lateral.
        </p>
      </div>
      <Button type="button" variant="outline" onClick={retry}>
        <RotateCcw />
        Reintentar
      </Button>
      <ErrorDetails error={error} />
    </div>
  );
}
