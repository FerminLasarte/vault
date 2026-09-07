<!--
The notes for the release being prepared. Rewrite this file before bumping the
version: `release.yml` reads it at build time and the action copies it into
`latest.json`, which is what an installed copy shows in Ajustes. Notes added to
the release page afterwards never reach anyone who already has the app.
-->

## Arreglos

- **Las cifras de «Ya comprometido» y «Previsto» ya no quedan pegadas al borde.**
  Los meses arrancaban al ras de la tarjeta, desalineados del título que tenían
  justo arriba.

- **En tema oscuro, las cifras del gráfico de ingresos vs. gastos ya se leen.**
  Al pasar el cursor por un mes, el globo mostraba los importes en negro sobre
  fondo oscuro: estaban ahí, pero no se veían. Los puntos de la leyenda tenían el
  mismo problema y ahora salen en su color.

- **El puntero ya no se convierte en un signo de pregunta sobre los textos con
  explicación.** El globo aparecía igual, pero el cambio de forma prometía algo
  para clickear que no existía.

## Instalación

Bajá el `.dmg` si estás en macOS, o el `.msi` o el `.exe` si estás en Windows.

La app no está firmada con certificado de Apple ni de Microsoft, así que la
primera vez el sistema la va a bloquear. En macOS: Ajustes del Sistema →
Privacidad y seguridad → «Abrir igualmente». En Windows: Más información →
Ejecutar de todas formas.
