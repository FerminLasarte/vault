<!--
The notes for the release being prepared. Rewrite this file before bumping the
version: `release.yml` reads it at build time and the action copies it into
`latest.json`, which is what an installed copy shows in Ajustes. Notes added to
the release page afterwards never reach anyone who already has the app.
-->

## Novedades

- **Las cuotas mensuales dejan de parecer gastos raros.** La IA ya no marca
  como gasto inusual la cuota de siempre solo porque en esa categoría también
  hay muchos gastos chicos. Una categoría que mezcla cuotas con gastos chicos
  ahora pide bastante más antes de marcar algo como inusual.

- **Tus etiquetas ayudan a la IA.** Si anotás «Mensual» con la etiqueta Tenis y
  «Mensual» con la etiqueta Gimnasio, ahora son dos cosas distintas: «Mensual
  Tenis» y «Mensual Gimnasio». El mes que ponés en la descripción, como
  «Mensual (julio)», ya no las separa mes a mes. Por eso, la primera vez que
  abras esta versión pueden aparecer sugerencias nuevas del estilo «Parece que
  pagás Mensual Gimnasio todos los meses».

- **Fin de mes más preciso.** Una cuota mensual que ya pagaste este mes no se
  vuelve a contar en «Fin de mes estimado».

- **Autocompletado.** Al escribir la descripción, las sugerencias ahora usan
  esos mismos nombres, como «Mensual Tenis» o «Turno Padel».

## Instalación

Bajá el `.dmg` si estás en macOS, o el `.msi` o el `.exe` si estás en Windows.

La app no está firmada con certificado de Apple ni de Microsoft, así que la
primera vez el sistema la va a bloquear. En macOS: Ajustes del Sistema →
Privacidad y seguridad → «Abrir igualmente». En Windows: Más información →
Ejecutar de todas formas.
