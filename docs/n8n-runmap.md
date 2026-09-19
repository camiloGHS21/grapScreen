# Mapa de ejecución n8n (`n8n-runmap.json`)

Cómo se ejecutan los nodos del catálogo n8n en grapScreen y por qué solo se
muestran en la paleta los que funcionan.

## El problema

n8n implementa sus nodos de aplicación como **código**: la ruta, la query, las
cabeceras y el cuerpo de cada petición se construyen dentro de `execute()`.
Reimplementar 297 integraciones a mano en Rust no es mantenible, y la vía
ingenua («URL base + parámetros como cuerpo») produce 400/404 en cualquier API
real — el caso Notion: sin ruta se llamaba al root de la API, sin `Notion-Version`
respondía `missing_version`.

## La solución: capturar, no adivinar

`scripts/n8n-runmap-capture.mjs` carga cada nodo con el mismo cargador que usa el
formulario de parámetros (`scripts/n8n-node-loader.mjs`), llama a su `execute()`
real con un `IExecuteFunctions` simulado cuyos parámetros llevan **centinelas**
únicos, y graba cada llamada a los helpers HTTP de n8n. Los centinelas se
reescriben como plantillas:

| Centinela | Plantilla | De dónde sale el valor en ejecución |
|---|---|---|
| `__gs_databaseId__` | `{{$parameter.databaseId}}` | `n8n_config` del nodo |
| `__gs_c_accessToken__` | `{{$credentials.accessToken}}` | credencial de la bóveda |

El resultado, por cada `resource`/`operation` que declara el nodo: `method`,
`path`, `qs`, `headers` (incluidas las que fija el código del nodo, como
`Notion-Version`) y `body`. Ejemplo real capturado:

```
Notion · dataSource/get
GET https://api.notion.com/v1/data_sources/{{$parameter.dataSourceId}}
Notion-Version: 2026-03-11
```

`scripts/n8n-runmap-report.mjs` resume ese artefacto para el editor
(`src/data/n8n-executable.json`): qué nodos tienen operaciones capturadas y
cuáles tienen **todas**.

## Ejecución en Rust

`src-tauri/src/application/graph_executor/runmap.rs` evalúa ese mapa: elige el
caso por `resource`/`operation`, resuelve los placeholders (tipos JSON
preservados en los valores completos, percent-encoding en la ruta, credencial
desde la bóveda), añade la autenticación del tipo de credencial declarado y
envía con el cliente HTTP propio. Todo nativo: un binario para Windows, Linux y
macOS, sin JavaScript en ejecución.

## Qué se muestra y qué no

La paleta (`n8nParity.ts` + `nodeCatalog.ts`) solo muestra un nodo n8n si su
petición fue capturada:

- **completo** (todas sus operaciones) → sustituye al nodo propio equivalente.
- **parcial** (algunas operaciones) → se muestra con el aviso «N de M
  operaciones»; una operación no capturada falla en ejecución con el listado de
  las disponibles.
- **sin captura** → no aparece. Los nodos propios nativos (Notion, Google
  Sheets, HTTP, código, condicionales, escritorio…) siguen ahí: el motor los
  ejecuta directamente.

Un nodo sin mapa solo puede ejecutarse si el usuario escribió URL base y ruta
en las opciones avanzadas (escotilla de escape deliberada).

## Regenerar el mapa

```powershell
npm run capture:runmap    # captura + resumen (necesita .n8n-cache/src)
```

Estados del artefacto: `ok` (todas las operaciones), `partial`, `none` (el nodo
no hace HTTP: los Core, archivos, brokers…), `timeout` / `skipped` (con motivo),
`load-failed`, `no-execute` (disparadores con `poll()`/`webhook()`, que se arman
por su propia vía en `trigger_service`).

## Límites conocidos

- Cuerpos que n8n construye a partir de la **respuesta** de una llamada previa
  (mapeador de propiedades de Notion) quedan como caso `partial`: la forma
  depende de datos que solo existen en ejecución.
- Los disparadores por sondeo se arman por su vía propia; capturar su `poll()`
  es el paso siguiente natural del mismo arnés.
- Seis nodos entran en bucle con respuestas simuladas y quedan documentados en
  `SKIP` dentro del capturador.
