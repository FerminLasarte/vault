<!--
The notes for the release being prepared. Rewrite this file before bumping the
version: `release.yml` reads it at build time and the action copies it into
`latest.json`, which is what an installed copy shows in Ajustes. Notes added to
the release page afterwards never reach anyone who already has the app.
-->

## Novedades

- **Una invitación a donar, cada tanto.**

  Vault es gratis y sin publicidad, y lo va a seguir siendo. De vez en cuando, al
  abrirla, aparece un aviso chico en la esquina para donar por Mercado Pago, con
  el link o copiando el alias. Donar es totalmente opcional.

  Nunca aparece en las primeras dos semanas, como mucho una vez cada dos meses, y
  no tapa nada: se cierra con Esc o con la X. «No mostrar más» lo apaga para
  siempre. Nada de esto sale de tu equipo.

- **El patrimonio neto cuenta los préstamos.** Resta el capital que todavía
  debés y suma el que te deben, sin contar intereses que todavía no corrieron.

- **Cada cierre se guarda con el nombre de su mes.** En macOS, el PDF se ofrece
  como «Vault - Cierre de agosto de 2026» en vez de «Vault».

- **Borrar una cuenta avisa qué más se mueve.** Sus movimientos y también sus
  recurrentes, cuotas, préstamos y previstos pasan a «Sin asignar», y el diálogo
  dice cuántos antes de confirmar.

## Arreglos

- **Tus datos, más protegidos.** Guardar la copia de seguridad encima del
  archivo de la base en uso ya no la borra, y la copia incluye siempre lo último
  que cargaste. Guardar dos veces seguidas ya no duplica un movimiento.

- **Compromisos.** Registrar una recurrente atrasada que no es la más vieja ya no
  hace desaparecer las anteriores. Un compromiso sin cuenta registra sus
  movimientos en «Sin asignar» en vez de dejarlos fuera de todo saldo.
  «Descartar» ahora se puede deshacer.

- **Cotizaciones.** Una cotización corregida a mano ya no se pisa al volver a
  abrir la app, a la noche ya no queda con fecha de mañana, y cambiar el tipo de
  dólar trae la cotización una sola vez.

- **Importar.** Los movimientos repetidos de verdad ya no se descartan como
  duplicados, el CSV de Vault se puede volver a importar después de abrirlo con
  Excel, y el resumen bancario aplica solo reglas del tipo que corresponde.

- **Categorías y reglas.** Al editar un movimiento, una regla ya no le cambia la
  categoría que tenía guardada. Cada categoría nueva recibe un color distinto.

- **Cierres e informes.** Un mes que solo tuvo transferencias ya no rompe
  Cierres, y el informe impreso ya no se corta en los últimos 12 meses.

- **Pantallas.** Una transferencia entre pesos y dólares muestra su importe en
  dos líneas, así las acciones de cada fila entran en la ventana. El menú de la
  app funciona desde cualquier pantalla. Borrar siempre pide confirmación.

- **Textos.** Todo en castellano rioplatense, con los montos en formato
  argentino y los errores del sistema traducidos. «1 transacción importada» ya no
  sale en plural.

- **Más rápida.** Guardar ya no vuelve a leer todos tus datos, y «hoy» se
  actualiza si dejás la app abierta de un día para otro.

## Instalación

Bajá el `.dmg` si estás en macOS, o el `.msi` o el `.exe` si estás en Windows.

La app no está firmada con certificado de Apple ni de Microsoft, así que la
primera vez el sistema la va a bloquear. En macOS: Ajustes del Sistema →
Privacidad y seguridad → «Abrir igualmente». En Windows: Más información →
Ejecutar de todas formas.
