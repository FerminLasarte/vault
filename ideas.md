# Ideas

Loose ideas for future Vault work. Not a commitment or a plan — just a place to park them.

## Next up

1. **Trips and sections** — a trip as its own entity, with a budget and dates,
   rather than a tag: e.g. everything spent on a trip to Brazil.
2. **A local "AI", with no model and no API** — assistance that feels smart but
   is built from rules, templates and statistics kept as JSON, all of it pure
   logic that never leaves the machine. In this order:
   1. Categorisation learned from the user's own history, and rule proposals
      from the patterns that repeat.
   2. A narrative for the monthly close, written from templates filled with
      computed facts, so it never gets a figure wrong.
   3. CSV column mapping, from header names and what each column holds.
   4. Unusual spending and subscriptions that went up.
   5. Receipt OCR, last: the text read locally (macOS's Vision framework, or
      Tesseract) and the total, date and merchant picked out by rules. Only if
      that falls short is an API worth reconsidering, and only for this.

   Not a chat over the user's finances.

3. **Investments, and Mercado Pago as an account that earns yield** — one
   block: both need daily external data (the exchange rate cache is the
   precedent) and both have to keep market value apart from realised result.

## Done

- **Donation pop-up** — shipped in Vault 1.3.0, with a «Donaciones» card in
  Ajustes since 1.3.1.
- **Fixed-term deposits (plazos fijos)** — already expressible as a loan the
  user lent, with a single instalment.

## Dropped

- **Paid plans** — a local-first app with a public repo has nothing to gate.
  Donations take their place.
- **Mobile app** — pointless without sync, and sync means a server. Revisit
  only if sync is ever decided.
- **AI through an API key** — replaced by the local "AI" above: it was the only
  item that would send the user's data off the machine, and four of its five
  uses work as well or better with local rules and statistics.
