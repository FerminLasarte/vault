import { Copy, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDonation } from "@/hooks/useDonation";
import { DONATION_ALIAS } from "@/lib/donation";

// The same invitation as at launch, but always there for whoever goes looking
// for it, instead of waiting for the next time it is due.
export function DonationCard() {
  const { donate, copyAlias } = useDonation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Donaciones</CardTitle>
        <CardDescription>
          Vault es gratis y sin publicidad. Si te sirve y querés darle una mano, podés
          donar lo que quieras por Mercado Pago. Es totalmente opcional.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void donate()}>
            <Heart />
            Donar con Mercado Pago
          </Button>
          <Button type="button" variant="outline" onClick={() => void copyAlias()}>
            <Copy />
            Copiar alias
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Alias: {DONATION_ALIAS}</p>
      </CardContent>
    </Card>
  );
}
