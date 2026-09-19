/**
 * Builds `public/n8n-credential-types.json`-style data for the credential editor.
 *
 * `extract-credentials.mjs` already loads every n8n credential class and keeps
 * its `properties` (the field list), but the result is keyed by position in an
 * array. The credential editor needs to answer one question fast: "given the
 * credential type named on this node's descriptor, which fields do I show?".
 *
 * So this script re-reads that file and turns it into a lookup keyed by the
 * credential *name* (`whatsAppTriggerApi` -> the two fields WhatsApp declares),
 * which is exactly the string the descriptors carry. The field list is copied
 * verbatim, including `typeOptions.password`, so a secret field renders as a
 * password input without a hand-maintained table of "which fields are secret".
 *
 * Reproducibility: the input is already a deterministic array, and the only
 * operations here are a sort and a map — no concurrency, no shared mutable
 * state, so two runs are byte-identical.
 */

import fs from 'node:fs';
import path from 'node:path';

const IN = './src/data/n8n-credentials.json';
const OUT = './src/data/n8n-credential-types.json';

/** Property types that need a control. Everything else degrades to a text field. */
const KEEP_TYPES = new Set([
  'string', 'number', 'boolean', 'options', 'multiOptions', 'json',
  'dateTime', 'color', 'notice', 'hidden',
]);

/**
 * A credential field reduced to what the editor needs.
 *
 * `displayOptions` is kept because n8n uses it inside credentials too (an OAuth2
 * credential only shows the secret fields once the flow is chosen), and dropping
 * it would show fields the user cannot actually fill.
 */
function slimProperty(p) {
  if (!p || typeof p.name !== 'string') return null;
  const type = typeof p.type === 'string' ? p.type : 'string';
  if (!KEEP_TYPES.has(type)) return null;
  const out = {
    name: p.name,
    displayName: typeof p.displayName === 'string' ? p.displayName : p.name,
    type,
    default: p.default === undefined ? '' : p.default,
  };
  if (p.required) out.required = true;
  if (typeof p.description === 'string' && p.description) out.description = p.description;
  if (typeof p.placeholder === 'string' && p.placeholder) out.placeholder = p.placeholder;
  if (p.typeOptions && typeof p.typeOptions === 'object') {
    const to = {};
    if (p.typeOptions.password) to.password = true;
    if (typeof p.typeOptions.rows === 'number') to.rows = p.typeOptions.rows;
    if (Object.keys(to).length) out.typeOptions = to;
  }
  if (Array.isArray(p.options)) {
    out.options = p.options
      .filter((o) => o && typeof o === 'object')
      .map((o) => ({
        name: typeof o.name === 'string' ? o.name : String(o.value ?? ''),
        value: o.value ?? o.name ?? '',
        ...(typeof o.description === 'string' && o.description ? { description: o.description } : {}),
      }));
  }
  return out;
}

function main() {
  if (!fs.existsSync(IN)) {
    console.error(`No existe ${IN}. Ejecuta antes scripts/extract-credentials.mjs`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(IN, 'utf8'));
  if (!Array.isArray(raw)) {
    console.error(`${IN} no es una lista de credenciales`);
    process.exit(1);
  }

  /** @type {Record<string, {name:string, displayName:string, documentationUrl?:string, fields:object[], hasSecret:boolean}>} */
  const byName = {};
  for (const cred of raw) {
    if (!cred || typeof cred.name !== 'string' || !cred.name.trim()) continue;
    const fields = (cred.properties || []).map(slimProperty).filter(Boolean);
    const entry = {
      name: cred.name,
      displayName: typeof cred.displayName === 'string' ? cred.displayName : cred.name,
      fields,
      hasSecret: fields.some((f) => f.typeOptions?.password),
    };
    if (typeof cred.documentationUrl === 'string' && cred.documentationUrl) {
      entry.documentationUrl = cred.documentationUrl;
    }
    // A credential name is unique in n8n. If a duplicate ever appears, the
    // FIRST wins in file order — deterministic, unlike "whichever loaded last".
    if (!(cred.name in byName)) byName[cred.name] = entry;
  }

  const sorted = {};
  for (const key of Object.keys(byName).sort()) sorted[key] = byName[key];

  fs.writeFileSync(OUT, JSON.stringify(sorted));
  const withFields = Object.values(sorted).filter((c) => c.fields.length).length;
  console.log(
    `Escritas ${Object.keys(sorted).length} credenciales (${withFields} con campos) en ${OUT}`,
  );
}

main();
