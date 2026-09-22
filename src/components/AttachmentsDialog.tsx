import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eye, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ActionButton";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getAttachmentContent, listAttachments } from "@/db";
import { useAppActions, useAppStatus } from "@/hooks/useAppData";
import { fileErrorMessage } from "@/lib/fileErrors";
import { pickAttachment, saveAttachmentCopy } from "@/lib/files";
import { fileNameFromPath } from "@/lib/paths";
import { isReported } from "@/lib/reportedError";
import { formatDate } from "@/lib/format";
import type { AttachmentMeta, TransactionWithCategory } from "@/db";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AttachmentsDialogProps {
  // `null` closes the dialog; anything else opens it for that transaction.
  transaction: TransactionWithCategory | null;
  onOpenChange: (open: boolean) => void;
}

export function AttachmentsDialog({ transaction, onOpenChange }: AttachmentsDialogProps) {
  const { isMutating } = useAppStatus();
  const { addAttachment, removeAttachment } = useAppActions();

  // Held together with the transaction they belong to, so a list is only ever
  // shown under its own transaction. A bare list kept the previous one on screen
  // — "Eliminar" buttons included — until the next query came back.
  const [loaded, setLoaded] = useState<{
    transactionId: number;
    attachments: AttachmentMeta[];
  } | null>(null);
  const [preview, setPreview] = useState<{ meta: AttachmentMeta; url: string } | null>(
    null,
  );
  const [isBusy, setIsBusy] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<AttachmentMeta | null>(null);

  const transactionId = transaction?.id ?? null;

  // Null while this transaction's list is still on its way.
  const attachments =
    loaded !== null && loaded.transactionId === transactionId ? loaded.attachments : null;

  // Only the latest query may land. Answers can come back out of order, and an
  // older one would otherwise replace the list of the transaction on screen.
  const latestRequest = useRef(0);

  const refresh = useCallback(async () => {
    if (transactionId === null) return;
    const request = ++latestRequest.current;
    const rows = await listAttachments(transactionId);
    if (request === latestRequest.current)
      setLoaded({ transactionId, attachments: rows });
  }, [transactionId]);

  // Clearing the preview belongs in the render pass, not in an effect: an
  // effect would let the previous transaction's receipt stay on screen for a
  // frame after the dialog has already switched to another one.
  const [lastTransactionId, setLastTransactionId] = useState(transactionId);
  if (transactionId !== lastTransactionId) {
    setLastTransactionId(transactionId);
    setPreview(null);
    setPendingDeletion(null);
  }

  // Fetching, on the other hand, genuinely is a side effect: it talks to the
  // database and the state lands only once the query has come back.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleAttach() {
    if (transactionId === null) return;
    setIsBusy(true);
    try {
      const picked = await pickAttachment();
      if (picked === null) return;

      await addAttachment({ transactionId, ...picked });
      await refresh();
    } catch (error) {
      console.error("Failed to attach the file:", error);
      // A failed save has already said so (see ReportedError). Otherwise it
      // came from reading the file, and Rust's message is shown when it says
      // why (the size limit, a missing file) — never the OS's own wording.
      if (!isReported(error)) {
        toast.error(fileErrorMessage(error, "No se pudo leer el archivo"));
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function handlePreview(meta: AttachmentMeta) {
    if (preview?.meta.id === meta.id) {
      setPreview(null);
      return;
    }
    const content = await getAttachmentContent(meta.id);
    if (content === null) return;
    setPreview({ meta, url: `data:${meta.mime_type};base64,${content}` });
  }

  async function handleSaveCopy(meta: AttachmentMeta) {
    setIsBusy(true);
    try {
      const content = await getAttachmentContent(meta.id);
      if (content === null) return;
      const saved = await saveAttachmentCopy(meta.file_name, content);
      if (saved) toast.success("Copia guardada");
    } catch (error) {
      console.error("Failed to save a copy of the attachment:", error);
      toast.error(fileErrorMessage(error, "No se pudo guardar la copia"));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDeletion) return;
    await removeAttachment(pendingDeletion.id);
    if (preview?.meta.id === pendingDeletion.id) setPreview(null);
    setPendingDeletion(null);
    await refresh();
  }

  return (
    <Dialog open={transaction !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Comprobantes</DialogTitle>
          <DialogDescription>
            {transaction?.description} · se guardan dentro de la base, así que la copia de
            seguridad los incluye.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {attachments === null ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay comprobantes para este movimiento.
            </p>
          ) : (
            <ul className="flex flex-col">
              {attachments.map((meta) => (
                <li
                  key={meta.id}
                  className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">
                      {fileNameFromPath(meta.file_name)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatSize(meta.byte_size)} ·{" "}
                      {formatDate(meta.created_at.slice(0, 10))}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {meta.mime_type.startsWith("image/") && (
                      <ActionButton
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        label="Ver"
                        onClick={() => void handlePreview(meta)}
                      >
                        <Eye />
                        <span className="sr-only">
                          Ver {fileNameFromPath(meta.file_name)}
                        </span>
                      </ActionButton>
                    )}
                    <ActionButton
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      label="Guardar una copia"
                      disabled={isBusy}
                      onClick={() => void handleSaveCopy(meta)}
                    >
                      <Download data-motion="nudge-down" />
                      <span className="sr-only">
                        Guardar {fileNameFromPath(meta.file_name)}
                      </span>
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      label="Eliminar"
                      onClick={() => setPendingDeletion(meta)}
                    >
                      <Trash2 />
                      <span className="sr-only">
                        Eliminar {fileNameFromPath(meta.file_name)}
                      </span>
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {preview && (
            <img
              src={preview.url}
              alt={fileNameFromPath(preview.meta.file_name)}
              className="max-h-72 w-full rounded-lg border border-border object-contain"
            />
          )}

          <div>
            <Button
              type="button"
              variant="outline"
              disabled={isBusy || isMutating}
              onClick={() => void handleAttach()}
            >
              <Paperclip />
              Adjuntar archivo
            </Button>
          </div>
        </div>

        {/* Inside the content rather than beside it, so it opens as a child of
            this dialog: a sibling would count as a click outside and close it. */}
        <ConfirmDeleteDialog
          open={pendingDeletion !== null}
          onClose={() => setPendingDeletion(null)}
          title="¿Eliminar este comprobante?"
          description={
            <>
              Se eliminará «
              {pendingDeletion ? fileNameFromPath(pendingDeletion.file_name) : ""}». La
              única copia está en la base de Vault, así que solo se puede recuperar desde
              una copia de seguridad.
            </>
          }
          onConfirm={handleConfirmDelete}
          isMutating={isMutating}
        />
      </DialogContent>
    </Dialog>
  );
}
