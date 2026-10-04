import { useCallback } from "react";
import { useAppData } from "@/hooks/useAppData";
import { merchantName } from "@/lib/ai/merchants";

// The merchant name to show for a description, or null when the description
// itself is what should be shown: the local AI is off, or it has no better name
// to give. Callers write `name(description) ?? description`.
export function useMerchantName(): (description: string) => string | null {
  const { aiEnabled } = useAppData();

  return useCallback(
    (description: string) => (aiEnabled ? merchantName(description) : null),
    [aiEnabled],
  );
}
