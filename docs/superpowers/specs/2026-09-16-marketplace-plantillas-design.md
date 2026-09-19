# Marketplace de plantillas — diseño

Fecha: 2026-09-16
Estado: aprobado (3 decisiones confirmadas por el usuario)

## Objetivo

Un catálogo de ~250 plantillas de flujo, agrupadas por categorías, con buscador y
sección de «más usadas», donde **cada plantilla es ejecutable de verdad** — no solo
estructuralmente plausible. Lo crítico no es el número: es que el sembrado de cada
nodo respete el contrato que su runner de Rust exige.

## Contexto medido en el repositorio

Antes de diseñar se verificó el estado real (no el supuesto):

- Las plantillas son 5, en `src/features/flowchart/addCategories.tsx`, con forma
  `{ id, label, desc, icon, chain: FlowNodeType[] }`.
- El sembrado lo hace `buildAddedEvents(type, …)` en
  `src/features/flowchart/utils/eventModifiers.ts`: **una config fija por tipo de
  nodo**. `computeAddStepChainEvents` lo llama *sin* extras, así que dos plantillas
  que usen `excel_local` obtienen datos idénticos.
- Consecuencia: sin poder sobrescribir por paso, 250 plantillas distintas y
  ejecutables es imposible.
- `n8n_node` / `n8n_trigger` no sirven: el registro de descriptores carga **0 de
  565** entradas en este build (es la causa de 6 de los 8 fallos preexistentes de
  `cargo test --lib`) y el runner exige una URL base que el descriptor no trae.
- `postgres` y `end` no se pueden usar: no tienen rama en `eventModifiers.ts` ni en
  `buildNodes.ts`, así que el nodo nunca llega a crearse.
- `sub_workflow` exige `workflow_id` no vacío (imposible en tiempo de siembra).
  `stop_error` siempre aborta. `email_trigger` nunca se arma (no hay cliente IMAP).
- **Trampa de puertos**: `computeAddStepChainEvents` conecta siempre
  `outputs[0]`. Para `condition` ese puerto es `true` y para `switch` es `case0`.
  El sembrado por defecto de `condition` (`{{ variable }} == "valor"`) evalúa
  **falso**, así que una cadena con un `condition` en medio se corta en silencio.
- **Trampa de items**: `CURRENT_ITEMS` arranca vacío. `{{ $json.x }}` resuelve a
  `null` → `""`. Los seeds por defecto de `slack_webhook`, `discord_webhook`,
  `send_email`, `xml_parse`, `html_extract`, `compare_datasets`, `llm_chain`,
  `classifier` leen `{{ $json.… }}`, así que chocan contra su guard de
  «requerido no vacío». El único productor de items fiable y sin red es el nodo
  `code` con stdout JSON (`executors.rs` hace `set_items`).
- `whatsapp` nace con `message: ""` → su runner lo rechaza.
- `read_file` **sí** produce items: con la lista vacía sintetiza `vec![Null]` y
  envuelve el resultado con `target_field` (por defecto `data`).

## Decisiones aprobadas

1. **Parche de datos por paso.** Cada paso declara `{ type, data? }` y ese `data`
   se fusiona sobre el sembrado por defecto del tipo. Se extiende `AddStepExtra`
   con `data?: Record<string, unknown>` y `computeAddStepChainEvents` pasa los
   extras (hoy no los pasa). Las ramas de `eventModifiers.ts` no se reescriben, así
   que el test anti-deriva de Rust (`template_seeds_are_coherent_with_the_engine`,
   que hace `include_str!` del TS y grepea el cuerpo de cada rama) sigue pasando.
2. **Añadir `postgres` y `end`.** Rama de sembrado para ambos en
   `eventModifiers.ts` y rama de nodo para `end` en `buildNodes.ts`. Sin tocar
   `src-tauri/`.
3. **E2E real de todas las locales verificables.** El validador emite
   `src/data/template-seeds.json` con el evento sembrado **efectivo** de las 250
   (sembrado por defecto + parche del catálogo). Un test de Rust lo lee con
   `include_str!` y ejecuta los runners reales en un directorio temporal para cada
   plantilla sin credenciales, sin red y sin ratón/teclado.

## Arquitectura

### Datos

```
src/features/templates/
  types.ts              FlowTemplate, TemplateStep, TemplateCategory, Requirement
  categories.ts         id → { label, icon, blurb, order }
  catalog/index.ts      carga y fusiona los *.json, valida forma, deriva featured
  catalog/<categoria>.json   ~20 plantillas por archivo (límite de 300 líneas)
```

Forma de una plantilla:

```ts
interface FlowTemplate {
  id: string;                 // único, kebab-case
  title: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  popularity: number;         // 0-100; «más usadas» se DERIVA de aquí
  requires: Requirement[];    // credenciales/servicios externos
  steps: TemplateStep[];      // [{ type, data? }]
}
```

`featured` **no** se declara a mano: se deriva de `popularity`. Un booleano escrito
a mano puede desincronizarse del orden real; un umbral no.

`FLOW_TEMPLATES` se sigue exportando (derivado del catálogo) para no romper
importaciones existentes.

### Sembrado

`eventModifiers.ts`:

```ts
export function buildAddedEvents(type, baseTime, evs, insertAt, extra?) {
  return applySeedPatch(seedDefaultEvents(type, baseTime, evs, insertAt, extra), extra?.data);
}
```

`seedDefaultEvents` es el cuerpo actual, intacto. `applySeedPatch` fusiona
`extra.data` sobre el `data` de cada evento devuelto. Los tipos que emiten varios
eventos (`type`, `click`) reciben el parche en todos, que es lo correcto: el
parche describe el nodo, no un evento suelto.

### Contrato de coherencia (lo que el validador impone)

El validador recorre cada plantilla y reconstruye, paso a paso, qué sabe el flujo
en ese punto (`vars` conocidas, si hay items). Falla si:

- **C1 metadatos**: `id` duplicado o mal formado, título/descripción vacíos,
  categoría desconocida, `popularity` fuera de rango, `requires` con un valor
  desconocido.
- **C2 tipos**: algún tipo no tiene rama de sembrado, o está en la lista prohibida
  (`n8n_node`, `n8n_trigger`, `sub_workflow`, `stop_error`, `email_trigger`,
  `wait_image`), o `end` no está en última posición.
- **C3 sembrado**: `buildAddedEvents` no devuelve ningún evento para un paso.
- **C4 requeridos**: un campo que el runner exige no vacío queda vacío tras
  interpolar, **descontando** los campos de credencial cuando la plantilla declara
  el `requires` correspondiente. Una referencia `{{ var }}` exige que `var` esté en
  `vars`; `{{ $json.x }}` exige que haya items.
- **C5 puertos**: si un `condition`/`switch` no es el último paso, la rama que
  tomará tiene que ser la que la cadena continúa (`true` / `case0`). Se comprueba
  de forma conservadora: la condición debe ser demostrablemente verdadera con lo
  que se conoce en ese punto.
- **C6 coherencia de `requires`**: si la cadena usa `telegram`, `requires` tiene
  que incluir el requisito de Telegram (y así con cada integración).

### Verificación de ejecución

- **Validador** (`npm run verify:templates`): cubre las 250, sin red, en Node.
- **Rust** (`template_e2e.rs`): consume el artefacto y ejecuta de verdad los
  runners para las plantillas cuya cadena solo usa nodos locales. Los nodos que
  actúan sobre el escritorio real o que salen a la red quedan fuera del e2e por
  seguridad y determinismo, y se cuentan aparte.

## Riesgos asumidos

- El e2e de Rust no cubre plantillas con `click`/`type`/`run_cmd`/`open_app`
  (moverían el ratón y lanzarían procesos reales) ni con red. Se declara el
  recuento exacto en vez de afirmar cobertura total.
- `code` depende de que `node` esté en PATH. Está (v22.22.0); el e2e lo asume y
  falla ruidosamente si no.
- Las plantillas con credenciales quedan como «estructura válida, requiere
  credenciales»: el validador comprueba todo menos la validez del secreto.

## Lo que apareció al implementar

Nada de esto estaba en el plan. Cada punto lo destapó una comprobación, no una
lectura, y por eso van con la evidencia que los encontró.

### Defectos del lienzo que las plantillas destaparon

Las 5 plantillas originales nunca repetían un tipo de nodo ni usaban un
disparador de la paridad con n8n, así que tres defectos preexistentes llevaban
tiempo invisibles. Los encontró `verify-template-ui.mjs`, que monta cada
plantilla por la tubería real del editor y vuelve a leer el resultado:

1. **Identificadores de nodo duplicados.** `buildNodes` acuñaba
   `n${Date.now()}${seq}` con `seq` reiniciándose en cada llamada. El insertador
   de cadenas llama a `buildNodes` una vez por paso, varios pasos caen en el
   mismo milisegundo, y dos nodos distintos recibían el **mismo id**. Como los
   ids indexan conexiones y posiciones, la cadena se colapsaba: `[sqlite_execute,
   sqlite_execute, sqlite_query]` se insertaba como `[sqlite_execute,
   sqlite_query, sqlite_execute]` y perdía una conexión. Corregido con un
   contador monótono de módulo.
2. **Cuatro disparadores sin nodo.** `buildNodes` no tenía rama para
   `rss_trigger`, `telegram_trigger`, `whatsapp_trigger` ni `email_trigger`: el
   disparador se guardaba, el demonio lo armaba, y en el lienzo no aparecía
   nada. Añadidas las cuatro ramas.
3. **Un paso «Escribir» se dibujaba como un nodo por carácter.** El
   agrupamiento de `key_press` se detenía en el primer `key_release`, así que
   una sola pulsación iniciaba su propio nodo: «texto» producía 5 nodos. El
   resto del editor (`updateEventFromState`, `deleteEventFromList`) ya trataba el
   rango completo como un solo nodo, así que el agrupamiento era lo que estaba
   mal. Corregido, y `formatKeyPreview` ahora cuenta solo las pulsaciones para no
   repetir cada letra.

### Reglas que añadió el validador

Dos clases de plantilla que «funcionaban» en el e2e pero corrompían datos:

- **Sumideros que reemplazan, alimentados de uno en uno.** `write_file` (con
  `append: false`) y `excel_local` (con `overwrite: true`) se ejecutan una vez
  por item, así que cada fila reescribía el archivo y solo sobrevivía la última.
  Lo destapó la salida real del e2e: `top-ventas.txt` tenía tres veces la misma
  línea y `pedidos-por-estado.json` un solo grupo de tres.
- **Un CSV con encabezado en modo añadir** repite el encabezado en cada añadido
  (el escritor xlsx sí lo deduplica; el csv no).

### Plantillas que no funcionaban sin que se viera

`whatsapp` nacía con el mensaje vacío, `slack_webhook`/`discord_webhook`/
`send_email`/`xml_parse`/`html_extract`/`compare_datasets`/`llm_chain`/
`classifier` leían `{{ $json.… }}` sin que nada hubiera producido items, y
`sub_workflow`/`stop_error`/`email_trigger`/`wait_image` no pueden funcionar
desde una plantilla en absoluto. Todas se detectaron con el validador antes de
escribir la plantilla número 250.

### Un fallo de portabilidad del nodo Código

`require('fs')` falla en cualquier equipo donde el script temporal caiga bajo un
`package.json` con `"type": "module"` — en esta máquina pasa, porque
`C:\Users\Administrator\package.json` lo tiene, y `%TEMP%` está debajo. Las
plantillas que leen archivos usan ahora `await import('node:fs')` dentro de un
`(async () => { … })();`, que funciona en ambos sistemas de módulos, y el
validador rechaza `require(`.

Aparte, una ruta de Windows interpolada dentro de una cadena entrecomillada
pierde las barras invertidas antes de que el script se ejecute
(`'C:\Users\a'` → `C:Usersa`). Las plantillas usan `` String.raw`…` `` y el
validador rechaza la interpolación entrecomillada.

