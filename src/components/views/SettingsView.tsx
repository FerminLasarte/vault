import { useEffect, useState } from "react";
import {
  Bell,
  CalendarClock,
  Download,
  HardDriveDownload,
  Landmark,
  MessageSquarePlus,
  RefreshCw,
  Upload,
} from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { toast } from "sonner";
import { SuggestionDialog } from "@/components/SuggestionDialog";
import { DonationCard } from "@/components/DonationCard";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAppActions, useAppData, useAppStatus } from "@/hooks/useAppData";
import { useMenuRequest } from "@/hooks/useMenuRequest";
import { isReported } from "@/lib/reportedError";
import { useTheme } from "@/hooks/useTheme";
import { useUpdater } from "@/hooks/useUpdater";
import { buildImportPlan, detectDelimiter, parseCsv, transactionsToCsv } from "@/lib/csv";
import { CURRENCY_CODES } from "@/lib/currency";
import {
  getDatabasePath,
  openCsvFile,
  openStatementFile,
  saveCsvFile,
  saveDatabaseCopy,
} from "@/lib/files";
import { fileErrorMessage } from "@/lib/fileErrors";
import { duplicatesSkipped, transactionCount } from "@/lib/transactionCounts";
import { ImportMappingDialog } from "@/components/ImportMappingDialog";
import { EMPTY_MAPPING } from "@/lib/importMapping";
import {
  findProfile,
  parseProfiles,
  rememberProfile,
  statementSignature,
} from "@/lib/importProfiles";
import { getSetting, setSetting, IMPORT_PROFILES } from "@/db";
import { formatDate, todayIsoDate } from "@/lib/format";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import {
  isRateType,
  RATE_TYPE_DESCRIPTIONS,
  RATE_TYPE_LABELS,
  RATE_TYPES,
} from "@/lib/exchangeRate";
import { backupStatus } from "@/lib/backupReminder";
import { cn } from "@/lib/utils";
import type { ThemePreference } from "@/context/ThemeContext";
import type { ImportSkip, ImportPlan } from "@/lib/csv";
import type { ColumnMapping } from "@/lib/importMapping";
import type { PickedStatement } from "@/lib/files";
import type { ViewProps } from "@/lib/menu";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "system", label: "Sistema" },
];

interface ImportOutcome {
  imported: number;
  duplicates: number;
  skipped: ImportSkip[];
}

export function SettingsView({ request, onRequestHandled }: ViewProps) {
  const {
    transactions,
    categories,
    categoryRules,
    paymentMethods,
    exchangeRateHistory,
    lastBackupAt,
    rateType,
    notificationsEnabled,
  } = useAppData();
  const { isMutating, isRefreshingRate } = useAppStatus();
  const {
    importTransactions,
    backfillExchangeRates,
    recordBackup,
    setRateType,
    setNotificationsEnabled,
  } = useAppActions();
  const { preference, setPreference } = useTheme();
  const updater = useUpdater();

  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  const [databasePath, setDatabasePath] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  // null while unknown; the app cannot notify at all if macOS says no, and
  // saying so is the difference between a setting that looks broken and one
  // that explains itself.
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [statement, setStatement] = useState<PickedStatement | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>(EMPTY_MAPPING);

  useEffect(() => {
    // Asked of Rust, which knows where the SQL plugin opened the file; working
    // it out here with appDataDir() showed the wrong folder on Linux.
    getDatabasePath()
      .then(setDatabasePath)
      .catch(() => setDatabasePath(null));
  }, []);

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion(null));
  }, []);

  useEffect(() => {
    isPermissionGranted()
      .then(setPermissionGranted)
      .catch(() => setPermissionGranted(null));
  }, [notificationsEnabled]);

  async function handleEnableNotifications(enabled: boolean) {
    await setNotificationsEnabled(enabled);
    if (!enabled) return;
    // Asking here rather than waiting for the next scheduled check, so the
    // system prompt arrives while the user is looking at the setting they just
    // turned on.
    const granted = await requestPermission();
    setPermissionGranted(granted === "granted");
  }

  async function handleExportCsv() {
    setIsWorking(true);
    try {
      const saved = await saveCsvFile(
        `vault-${todayIsoDate()}.csv`,
        transactionsToCsv(transactions),
      );
      if (saved) toast.success(transactionCount(transactions.length, "exportada"));
    } catch (error) {
      console.error("Failed to export the transactions:", error);
      toast.error(fileErrorMessage(error, "No se pudo exportar el archivo"));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleBackup() {
    setIsWorking(true);
    try {
      const saved = await saveDatabaseCopy(`vault-${todayIsoDate()}.db`);
      if (saved) {
        await recordBackup();
        toast.success("Copia de seguridad guardada");
      }
    } catch (error) {
      console.error("Failed to back up the database:", error);
      toast.error(fileErrorMessage(error, "No se pudo guardar la copia"));
    } finally {
      setIsWorking(false);
    }
  }

  // Bank statements: the columns are whatever the bank chose, so the mapping is
  // asked for rather than assumed.
  async function handleImportStatement() {
    setIsWorking(true);
    setOutcome(null);
    try {
      const picked = await openStatementFile();
      if (picked === null) return;

      // A mapping already worked out for this bank's format is offered back, so
      // the second import of the same export is one click. The header row is
      // searched for rather than assumed: statements put a title and an account
      // summary above the table.
      const profiles = parseProfiles(await getSetting(IMPORT_PROFILES));
      const found = findProfile(profiles, picked.rows);

      setMapping(
        found === null
          ? { ...EMPTY_MAPPING, currency: CURRENCY_CODES[0] }
          : { ...found.mapping, headerRow: found.headerRow },
      );
      setStatement(picked);
    } catch (error) {
      console.error("Failed to read the statement:", error);
      toast.error(fileErrorMessage(error, "No se pudo leer el archivo"));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleConfirmStatement(plan: ImportPlan) {
    if (plan.ready.length > 0) {
      await importTransactions(plan.ready);
    }

    if (statement !== null) {
      const profiles = parseProfiles(await getSetting(IMPORT_PROFILES));
      await setSetting(
        IMPORT_PROFILES,
        JSON.stringify(
          rememberProfile(
            profiles,
            statementSignature(statement.rows[mapping.headerRow] ?? []),
            mapping,
          ),
        ),
      );
    }

    setOutcome({
      imported: plan.ready.length,
      duplicates: plan.duplicates,
      skipped: plan.skipped,
    });
  }

  async function handleImportCsv() {
    setIsWorking(true);
    setOutcome(null);
    try {
      const contents = await openCsvFile();
      if (contents === null) return;

      // Detected rather than assumed: the app writes commas, but a file saved
      // again by Excel in an Argentine locale comes back with semicolons.
      const plan = buildImportPlan(parseCsv(contents, detectDelimiter(contents)), {
        categories,
        categoryRules,
        accounts: paymentMethods,
        existing: transactions,
        supportedCurrencies: CURRENCY_CODES,
      });

      if (plan.ready.length > 0) {
        await importTransactions(plan.ready);
      }

      setOutcome({
        imported: plan.ready.length,
        duplicates: plan.duplicates,
        skipped: plan.skipped,
      });

      if (plan.ready.length === 0) {
        toast.warning("No se importó ninguna transacción");
      }
    } catch (error) {
      console.error("Failed to import the file:", error);
      // A failed import already said so in its own words; this message is only
      // for the file itself failing to open or parse.
      if (!isReported(error)) {
        toast.error(fileErrorMessage(error, "No se pudo leer el archivo"));
      }
    } finally {
      setIsWorking(false);
    }
  }

  // The data entries in the Archivo menu. Each opens a native file dialog and
  // then reads or writes a file, so unlike opening a dialog these genuinely
  // belong in an effect, which `useMenuRequest` provides.
  useMenuRequest(request, onRequestHandled, (action) => {
    const run =
      action === "backup"
        ? handleBackup
        : action === "export-csv"
          ? handleExportCsv
          : action === "import-csv"
            ? handleImportCsv
            : action === "check-updates"
              ? updater.check
              : null;

    // The handler marks itself busy and then awaits a file dialog, so nothing
    // cascades from running it here.
    if (run !== null) void run();
  });

  const busy = isWorking || isMutating;

  const backup = backupStatus(lastBackupAt, transactions.length);

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <PageHeader
        title="Ajustes"
        description="Apariencia, copias de seguridad e intercambio de datos."
      />

      <Card>
        <CardHeader>
          <CardTitle>Apariencia</CardTitle>
          <CardDescription>
            «Sistema» sigue la preferencia de tu equipo automáticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={preference}
            onValueChange={(next) => setPreference(String(next) as ThemePreference)}
          >
            <TabsList>
              {THEME_OPTIONS.map((option) => (
                <TabsTrigger key={option.value} value={option.value}>
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notificaciones</CardTitle>
          <CardDescription>
            Avisos de cuotas vencidas, recurrentes pendientes y presupuestos cerca del
            límite. Solo mientras Vault esté abierta.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Tabs
            value={notificationsEnabled ? "on" : "off"}
            onValueChange={(next) => void handleEnableNotifications(next === "on")}
          >
            <TabsList>
              <TabsTrigger value="on">Activadas</TabsTrigger>
              <TabsTrigger value="off">Desactivadas</TabsTrigger>
            </TabsList>
          </Tabs>

          {notificationsEnabled && permissionGranted === false && (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <Bell className="size-4 shrink-0" />
              macOS tiene los avisos bloqueados para Vault. Activalos en Ajustes del
              sistema → Notificaciones.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tus datos</CardTitle>
          <CardDescription>
            Todo vive únicamente en este equipo. Si se pierde el disco, se pierde todo: no
            hay copia en ningún servidor.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p
            className={cn(
              "text-sm",
              backup.isOverdue ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {backup.daysAgo === null
              ? "Nunca guardaste una copia."
              : backup.daysAgo === 0
                ? "Última copia: hoy."
                : backup.daysAgo === 1
                  ? "Última copia: ayer."
                  : `Última copia: hace ${backup.daysAgo} días.`}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={handleBackup}
            >
              <HardDriveDownload data-motion="nudge-down" />
              Guardar copia de seguridad
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || transactions.length === 0}
              onClick={handleExportCsv}
            >
              <Download data-motion="nudge-down" />
              Exportar a CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={handleImportCsv}
            >
              <Upload data-motion="nudge-up" />
              Importar desde CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void handleImportStatement()}
            >
              <Landmark />
              Importar resumen bancario
            </Button>
          </div>

          {outcome && (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
              <p className="text-sm font-medium">
                {transactionCount(outcome.imported, "importada")}
              </p>
              {outcome.duplicates > 0 && (
                <p className="text-xs text-muted-foreground">
                  {duplicatesSkipped(outcome.duplicates)}
                </p>
              )}
              {outcome.skipped.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground">
                    {outcome.skipped.length}{" "}
                    {outcome.skipped.length === 1
                      ? "fila descartada"
                      : "filas descartadas"}
                    :
                  </p>
                  <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                    {outcome.skipped.map((entry) => (
                      <li key={entry.line} className="text-xs text-muted-foreground">
                        Línea {entry.line}: {entry.reason}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cotizaciones</CardTitle>
          <CardDescription>
            Con el histórico, cada movimiento se valúa a la cotización del día en que
            ocurrió, en vez de a la de hoy. Sin él, un gasto viejo parece más barato de lo
            que fue.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="rate-type">Qué dólar usar</Label>
            <Select
              items={RATE_TYPE_LABELS}
              value={rateType}
              onValueChange={(value) => {
                if (isRateType(value)) void setRateType(value);
              }}
            >
              <SelectTrigger id="rate-type" className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RATE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {RATE_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {RATE_TYPE_DESCRIPTIONS[rateType]}
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            {exchangeRateHistory.length === 0
              ? `Todavía no descargaste el histórico de ${RATE_TYPE_LABELS[rateType].toLowerCase()}.`
              : exchangeRateHistory.length === 1
                ? "1 cotización guardada. Traé el histórico para valuar el pasado."
                : `${exchangeRateHistory.length} cotizaciones guardadas, desde ${formatDate(
                    exchangeRateHistory[0].date,
                  )}.`}
          </p>
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={isRefreshingRate}
              onClick={() => void backfillExchangeRates()}
            >
              <CalendarClock />
              {isRefreshingRate ? "Descargando..." : "Traer histórico de cotizaciones"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ImportMappingDialog
        statement={statement}
        onOpenChange={(open) => {
          if (!open) setStatement(null);
        }}
        mapping={mapping}
        onMappingChange={setMapping}
        paymentMethods={paymentMethods}
        context={{
          categories,
          categoryRules,
          accounts: paymentMethods,
          existing: transactions,
          supportedCurrencies: CURRENCY_CODES,
        }}
        onConfirm={handleConfirmStatement}
      />

      <Card>
        <CardHeader>
          <CardTitle>Actualizaciones</CardTitle>
          <CardDescription>
            Vault busca una versión nueva cada vez que la abrís. La descarga viene
            firmada: si la firma no coincide con la de esta app, no se instala.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Versión instalada: {appVersion ?? "desconocida"}
          </p>

          {updater.status === "current" && (
            <p className="text-sm text-muted-foreground">Estás en la última versión.</p>
          )}

          {updater.status === "available" && updater.update !== null && (
            <div className="flex flex-col gap-1">
              <p className="text-sm">
                Vault {updater.update.version} ya está disponible.
              </p>
              {updater.update.notes !== undefined && (
                <p className="text-xs whitespace-pre-line text-muted-foreground">
                  {updater.update.notes}
                </p>
              )}
            </div>
          )}

          {updater.status === "downloading" && (
            <p className="text-sm text-muted-foreground">
              {updater.progress === null
                ? "Descargando..."
                : `Descargando... ${Math.round(updater.progress * 100)}%`}
            </p>
          )}

          {updater.error !== null && (
            <p className="text-sm text-destructive">{updater.error}</p>
          )}

          <div>
            {updater.status === "available" ? (
              <Button type="button" onClick={() => void updater.install()}>
                <HardDriveDownload data-motion="nudge-down" />
                Instalar y reiniciar
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={
                  updater.status === "checking" || updater.status === "downloading"
                }
                onClick={() => void updater.check()}
              >
                <RefreshCw />
                {updater.status === "checking"
                  ? "Comprobando..."
                  : "Buscar actualizaciones"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sugerencias</CardTitle>
          <CardDescription>
            Contame qué te falta o qué no funciona. Escribís acá mismo y se abre tu
            programa de correo con el mensaje listo: nada sale de este equipo sin que vos
            lo mandes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsSuggestionOpen(true)}
          >
            <MessageSquarePlus />
            Escribir una sugerencia
          </Button>
        </CardContent>
      </Card>

      <DonationCard />

      <Card>
        <CardHeader>
          <CardTitle>Base de datos</CardTitle>
          <CardDescription>Ubicación del archivo en este equipo.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs break-all text-muted-foreground">
            {databasePath ?? "No disponible"}
          </p>
        </CardContent>
      </Card>

      <SuggestionDialog
        open={isSuggestionOpen}
        onOpenChange={setIsSuggestionOpen}
        version={appVersion}
      />
    </div>
  );
}
