<!--
The notes for the release being prepared. Rewrite this file before bumping the
version: `release.yml` reads it at build time and the action copies it into
`latest.json`, which is what an installed copy shows in Ajustes. Notes added to
the release page afterwards never reach anyone who already has the app.
-->

## Novedades

- **Después de guardar un movimiento, lo ves.** La tabla va a la página donde
  quedó, lo trae a la vista y lo resalta un momento. Si los filtros activos lo
  ocultan, el aviso te lo dice y «Limpiar filtros» lo muestra.

- **Cada pantalla vuelve como la dejaste.** La pestaña, la página, la búsqueda,
  los filtros y hasta dónde bajaste se mantienen cuando vas a otra sección y
  volvés, mientras la app siga abierta.

- **Atajos en Transacciones.** Apretá / para ir a la búsqueda y Esc para limpiar
  los filtros.

- **Los botones que terminan algo te lo dicen.** Copiar el alias, guardar una
  copia de seguridad y exportar a CSV muestran un tilde y la confirmación en el
  mismo botón durante un momento.

- **Las pantallas no saltan mientras cargan.** En lugar de «Cargando...», cada
  lista y cada cifra guarda su lugar hasta que llegan los datos, que aparecen
  con un fundido suave. Si cargan al instante, no ves nada intermedio.

- **La app responde cuando la tocás.** Los íconos se mueven apenas al pasar el
  mouse o al llegar con el teclado: el tacho inclina la tapa, el engranaje gira,
  la flecha de descarga baja. Si tu sistema tiene activada la opción de reducir
  el movimiento, se respeta.

- **Listas más tranquilas.** Los botones de cada fila quedan atenuados hasta que
  pasás el mouse o llegás con el teclado, para que los montos se lean primero.
  Una cifra que cambia lo hace con un fundido en vez de saltar.

- **Con lector de pantalla,** el botón para cerrar un diálogo se anuncia como
  «Cerrar» y ya no como «Close».

## Instalación

Bajá el `.dmg` si estás en macOS, o el `.msi` o el `.exe` si estás en Windows.

La app no está firmada con certificado de Apple ni de Microsoft, así que la
primera vez el sistema la va a bloquear. En macOS: Ajustes del Sistema →
Privacidad y seguridad → «Abrir igualmente». En Windows: Más información →
Ejecutar de todas formas.
