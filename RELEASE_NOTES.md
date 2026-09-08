<!--
The notes for the release being prepared. Rewrite this file before bumping the
version: `release.yml` reads it at build time and the action copies it into
`latest.json`, which is what an installed copy shows in Ajustes. Notes added to
the release page afterwards never reach anyone who already has the app.
-->

## Novedades

- **Las explicaciones al pasar el cursor ahora las dibuja la app.**

  Hasta acá eran las del sistema: tardaban un segundo en aparecer, salían
  siempre en el mismo lugar sin importar dónde estuviera el cursor, se
  desvanecían solas a los pocos segundos y no seguían el tema claro u oscuro.
  Ahora aparecen al instante, siguen al cursor y se quedan mientras estés encima.

  Alcanza al panel lateral, las etiquetas, el diálogo de categorías, la barra de
  resumen y los botones de acción.

## Arreglos

- **Las cifras de «Ya comprometido» y «Previsto» ya no quedan pegadas al borde.**
  Los meses arrancaban al ras de la tarjeta, desalineados del título que tenían
  justo arriba.

- **En tema oscuro, las cifras del gráfico de ingresos vs. gastos ya se leen.**
  Al pasar el cursor por un mes, el globo mostraba los importes en negro sobre
  fondo oscuro: estaban ahí, pero no se veían. Los puntos de la leyenda tenían el
  mismo problema y ahora salen en su color.

- **El gráfico de ingresos vs. gastos ya no agrega meses vacíos al final.** Sin
  cuotas, préstamos ni recurrentes cargados, el eje se estiraba igual tres meses
  hacia adelante y aparecía la aclaración sobre los meses claros, explicando unas
  barras que no estaban.

- **El contador de pendientes y el aviso sobre un mismo presupuesto ya no pueden
  discrepar.** El contador medía el presupuesto contra el reloj de la máquina en
  lugar de la fecha con la que se calcula todo lo demás, así que al cambiar de
  mes podía estar mirando un período distinto al del aviso.

## Instalación

Bajá el `.dmg` si estás en macOS, o el `.msi` o el `.exe` si estás en Windows.

La app no está firmada con certificado de Apple ni de Microsoft, así que la
primera vez el sistema la va a bloquear. En macOS: Ajustes del Sistema →
Privacidad y seguridad → «Abrir igualmente». En Windows: Más información →
Ejecutar de todas formas.
