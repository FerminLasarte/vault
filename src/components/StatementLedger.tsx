import { AiMark } from "@/components/AiMark";
import { InlineAction } from "@/components/InlineAction";
import { StatementLine, StatementLines } from "@/components/StatementLines";
import { formatDate } from "@/lib/format";
import type { StatementDuplicate, StatementTransfer } from "@/lib/ai/statementLedger";
import type { PaymentMethod } from "@/db/schema";

interface StatementLedgerProps {
  transfers: StatementTransfer[];
  nearDuplicates: StatementDuplicate[];
  paymentMethods: PaymentMethod[];
  // Whether the row is imported on its own rather than joined to its half.
  onApart: (line: number, apart: boolean) => void;
  // Whether a possible duplicate goes in anyway.
  onAnyway: (line: number, anyway: boolean) => void;
}

// The rows the history already has an answer for: the half of a transfer whose
// other half is there, and a movement that seems to be there already.
export function StatementLedger({
  transfers,
  nearDuplicates,
  paymentMethods,
  onApart,
  onAnyway,
}: StatementLedgerProps) {
  const accountName = (id: number | null) =>
    paymentMethods.find((method) => method.id === id)?.name ?? "otra cuenta";

  return (
    <>
      {transfers.length > 0 && (
        <StatementLines>
          {transfers.map((transfer) => (
            <StatementLine
              key={transfer.line}
              description={transfer.description}
              detail="Mitad de una transferencia"
            >
              {transfer.joined ? (
                <>
                  <AiMark reason={transfer.reason} />
                  <span>
                    Se une con «{transfer.other.description}» de{" "}
                    {accountName(transfer.other.payment_method_id)}
                  </span>
                  <InlineAction onClick={() => onApart(transfer.line, true)}>
                    No es una transferencia
                  </InlineAction>
                </>
              ) : (
                <>
                  <span>Se importa aparte</span>
                  <InlineAction onClick={() => onApart(transfer.line, false)}>
                    Unir
                  </InlineAction>
                </>
              )}
            </StatementLine>
          ))}
        </StatementLines>
      )}

      {nearDuplicates.length > 0 && (
        <StatementLines>
          {nearDuplicates.map((duplicate) => (
            <StatementLine
              key={duplicate.line}
              description={duplicate.description}
              detail="Posible duplicado"
            >
              {duplicate.imported ? (
                <>
                  <span>Se importa igual</span>
                  <InlineAction onClick={() => onAnyway(duplicate.line, false)}>
                    No importar
                  </InlineAction>
                </>
              ) : (
                <>
                  <AiMark reason={duplicate.reason} />
                  <span>
                    Ya está como «{duplicate.other.description}» del{" "}
                    {formatDate(duplicate.other.date)}
                  </span>
                  <InlineAction onClick={() => onAnyway(duplicate.line, true)}>
                    Importar igual
                  </InlineAction>
                </>
              )}
            </StatementLine>
          ))}
        </StatementLines>
      )}
    </>
  );
}
