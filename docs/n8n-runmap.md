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

### Cobertura actual

| Grupo | Capturado | Notas |
|---|---|---|
| Acciones del catálogo | **252** ejecutables (208 con todas sus operaciones) | ~2.900 casos de operación con petición real |
| Disparadores de sondeo | **16 de 16 (100%)** | incluye `SeaTableTrigger`, `GmailTrigger`, `GoogleCalendarTrigger`… |
| Sub-nodos de agente (AI) | — | no son pasos: se cablean a un agente (109 saltados) |
| Core / archivos / brokers | — | n8n los resuelve en proceso; el motor usa su equivalente propio |
| 62 nodos con ruta relativa | badge «requiere URL base» | su raíz vive en la credencial (`{{$credentials.url}}`) o hay que escribirla |

### Lo que falta para el 100% (53 acciones, por familia)

Una petición **sin URL no cuenta** como capturada: n8n firma y dirige en persona
las peticiones de AWS, y una receta sin URL no se puede reenviar. Esa regla vive
en el capturador para que la paleta no prometa nada. Ninguna de estas familias es
«arreglar el arnés»: son capacidades distintas.

| Familia | Cuántos | Qué hace falta |
|---|---|---|
| **Familia AWS** (S3, SES, SQS, DynamoDB, Transcribe) | 5 | El helper de n8n construye **y firma** (SigV4) la URL: hace falta un constructor de peticiones AWS + firma SigV4 en Rust. |
| **SDK de Google** (Docs, Slides, Chat, Books, Perspective, Translate) | 6 | Igual: el cliente `googleapis` construye la URL internamente. |
| **Clientes de protocolo/DB** (MySql, Postgres, MongoDb, Redis, Kafka, Amqp, RabbitMQ, Mqtt, Ldap, Ftp, Snowflake, CrateDb, QuestDb, TimescaleDb, MicrosoftSql) | 15 | No son HTTP: requieren un cliente nativo en Rust. Postgres ya lo tiene. |
| **Almacenes de vectores / LLM por SDK** (Pinecone, Qdrant, Milvus, PGVector, Mistral) | 5 | Igual que los SDK anteriores. |
| **Validación de credencial resuelta** (Mailchimp, Salesforce SOQL) | 0 | Los nodos validan el formato antes de pedir: el simulado responde un valor con esa forma y el capturador lo devuelve a su placeholder. |
| **Carga del cargador** (ICalendar, OracleSql, WhatsApp) | 3 | Su grafo de imports no resuelve: se capturan con un bundle precompilado. |
| **Bucle síncrono con el mock** (Amqp, Mqtt, Snowflake, Phantombuster) | 4 | Requieren aislar `execute()` en un proceso hijo con timeout real. |
| **Nodos no HTTP con equivalente propio** (Function, Git, ExecuteCommand, ReadWriteFile, SpreadsheetFile, Totp…) | ~8 | El motor ya tiene runners equivalentes; falta una tabla que los declare equivalentes (con su adaptador de parámetros) en lugar de una captura HTTP. |

## Disparadores con sondeo

Un disparador de n8n no hace `execute()`: hace `poll()`. Se capturan en su
propia pasada, `--triggers`, que escribe `src/data/n8n-trigger-runmap.json`
(el motor fusiona los dos artefactos al cargarlos):

```
npm run capture:runmap     # acciones + disparadores + resumen
```

Ejemplos capturados:

```
NotionTrigger       POST https://api.notion.com/v1/data_sources/{{$parameter.this}}/query
GmailTrigger        GET  https://www.googleapis.com/gmail/v1/users/me/messages
GoogleCalendar      GET  https://www.googleapis.com/calendar/v3/calendars/{{$parameter.this}}/events
Outlook             GET  {{$credentials.graphApiBaseUrl}}/v1.0/users/{{$credentials.userPrincipalName}}/messages
Salesforce          GET  {{$credentials.oauthTokenData.instance_url}}/services/data/v59.0/query
RssFeedReadTrigger  GET  {{$parameter.feedUrl}}
```

El demonio (`trigger_service`) planifica con `runmap::poll_plan` y sondea **esa**
petición — ruta, query, cabeceras y cuerpo que construye el propio disparador —
en vez del root de la API. Un disparador de sondeo sin captura no se ofrece en
la paleta: armaría un bucle contra una URL que nunca devuelve datos.

## Cómo el arnés se acerca al nodo real

Cada uno de estos huecos produjo peticiones imposibles hasta que se cerró, y
todos siguen cubiertos por el propio capturador:

| El nodo hacía… | Lo que salía antes | Cómo se resuelve |
|---|---|---|
| `credentials.accessToken` en la URL | hueco vacío | proxy de credenciales → `{{$credentials.accessToken}}` |
| `${credentials.url}/api…` | `Cannot convert object to primitive value` | `Symbol.toPrimitive` en el proxy, no en la rama genérica |
| `` `${baseId}` `` con un `resourceLocator` | `%5Bobject%20Object%5D` | el objeto se convierte en `{{$parameter.this}}` |
| `getNodeParameter('x', i, {extractValue})` | el objeto entero | `extractValue` devuelve el ID |
| `additionalFields.associations.companyIds` | `undefined.includes` | sentinel por ruta completa en las colecciones |
| `customFields.customFields.length` | `.length` de `undefined` | el `fixedCollection` responde `{grupo: [...]}` **y** `.values` |
| `param.values.map` / `for…of param` | `map is not a function` | arreglo híbrido con `values` autorreferente |
| `moment(x).set(...)`, `moment.tz.names()` | `is not a function` | stub encadenable de `moment`/`moment-timezone` |
| `this.getNode().type.includes('Trigger')` | `undefined.includes` | el mock expone `type` y `typeVersion` reales |
| validación de email/SOQL/fecha | el nodo aborta antes de pedir | valor sintético válido según `typeOptions.validation` |

## Resultados de la captura (28/09/2026)

Sobre los 565 nodos del catálogo, con el arnés completo:

| Métrica | Valor |
|---|---|
| Ejecutables (≥1 operación capturada) | **252** |
| Completos (todas sus operaciones) | **208** |
| Parciales | 44 |
| Con ruta relativa (falta raíz de la API) | 62 |
| Disparadores de sondeo capturados | **16 de 16 (100%)** |
| Sub-nodos de agente (no son pasos) | 109 |

Casos de ejecución capturados en total: ~2.800. Los arreglos de arnés que más
nodos desbloquearon (simbólicos de proxy, `getNode().type`, subcampos de
colección desconocidos, `fixedCollection` por grupo, parámetros con punto,
credenciales anidadas, métodos de string sobre centinelas, `moment-timezone` y
nodos versionados con `poll()`) están documentados en el código de
`scripts/n8n-runmap-capture.mjs`.

Los errores que quedan son **validaciones propias del nodo** (correo, SOQL,
fechas, URLs de Notion): ocurren *antes* de la petición y el arnés no puede
adivinar qué valor pasaría la validación, así que esa operación queda parcial y
el usuario la completa en el editor.

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
- Unas 60 operaciones quedan sin capturar porque el nodo **valida antes de
  pedir** (email de Gmail, SOQL de Salesforce, fechas): la paleta las anuncia con
  el badge «N de M operaciones» y el usuario las completa desde el editor.
- `SeaTableTrigger` no se captura: su helper aborta con
  `uri.endsWith is not a function` sobre el proxy de credenciales.
- Seis nodos entran en bucle con respuestas simuladas y quedan documentados en
  `SKIP` dentro del capturador (`AwsElb`, `AwsSes`, `AwsS3`, `EditImage`,
  `GoogleGemini`, `Splunk` son además los que agotan el timeout de carga).
