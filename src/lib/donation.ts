// Where a donation goes.
//
// Vault has no server and its repository is public, so there is no checkout of
// its own and no access token to call Mercado Pago with. A donation is a
// payment link opened in the user's browser, or a transfer to the alias from
// whichever app they bank with. Nothing about it is sent from here.
//
// The link is also listed, exactly, in src-tauri/capabilities/default.json:
// Tauri refuses to open any URL the capability does not name.
export const DONATION_LINK = "https://mpago.la/PENDIENTE";
export const DONATION_ALIAS = "fermin.lasarte.mp";
