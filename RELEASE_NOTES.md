<!--
The notes for the release being prepared. Rewrite this file before bumping the
version: `release.yml` reads it at build time and the action copies it into
`latest.json`, which is what an installed copy shows in Ajustes. Notes added to
the release page afterwards never reach anyone who already has the app.
-->

## Novedades

- **Importá tu planilla de Excel.** Además del resumen del banco, ahora podés
  traer la planilla donde anotás tus gastos a mano: en Ajustes › Tus datos,
  tocá «Importar resumen bancario» y elegí el archivo. Ves qué va a entrar
  antes de confirmar.

- **Columna de tipo.** Si tu planilla anota todos los montos en positivo y
  dice en otra columna si cada fila es «Gasto» o «Ingreso», elegí «Importe y
  tipo» y cada fila entra como corresponde. La IA lo reconoce sola.

- **Columnas de ingresos y gastos.** Una planilla con una columna «Ingreso» y
  otra «Gasto» ahora se reconoce sola, como ya pasaba con «Débito» y
  «Crédito».

- **Una hoja por mes.** Si tu archivo tiene varias hojas, elegís cuál importar.
  Si todas tienen las mismas columnas, «Todas las hojas» trae el año entero de
  una vez, y una fila que no se pudo leer te dice en qué hoja está.

## Instalación

Bajá el `.dmg` si estás en macOS, o el `.msi` o el `.exe` si estás en Windows.

La app no está firmada con certificado de Apple ni de Microsoft, así que la
primera vez el sistema la va a bloquear. En macOS: Ajustes del Sistema →
Privacidad y seguridad → «Abrir igualmente». En Windows: Más información →
Ejecutar de todas formas.
