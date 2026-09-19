/**
 * Checks that a template chain is coherent: that the node one step seeds is the
 * node the next step reads.
 *
 * The rules mirror what the Rust runners enforce (see `nodeContract.ts`). They
 * are deliberately conservative: when a value cannot be shown to be known at
 * that point in the chain, the check fails rather than assuming the user will
 * fill it in. A template that only works after the user repairs three nodes is
 * not a template.
 */

const REF_RE = /\{\{([\s\S]*?)\}\}/g;

/** Values the engine defines itself, usable anywhere. */
const ENGINE_VARS = new Set(["loop.index"]);

/** Extracts every `{{ … }}` reference in a string. */
function refsIn(value) {
  if (typeof value !== "string") return [];
  const out = [];
  for (const m of value.matchAll(REF_RE)) out.push(m[1].trim());
  return out;
}

const isBareIdent = (token) => /^[A-Za-z_][\w.]*$/.test(token);

/**
 * True when the string keeps literal text outside its `{{ … }}` references, so
 * interpolating it can never yield the empty string. This is exactly the guard
 * the runners apply (`msg_interp.is_empty()` and friends), which is why a
 * message like `"Alerta: {{ webhook.body }}"` is safe while a bare
 * `"{{ webhook.body }}"` is not: a webhook may arrive with no body.
 */
function hasLiteralText(value) {
  return String(value).replace(REF_RE, "").trim().length > 0;
}
const isQuoted = (token) => /^"(?:[^"\\]|\\.)*"$/.test(token) || /^'(?:[^'\\]|\\.)*'$/.test(token);
const unquote = (token) => token.slice(1, -1);

/**
 * Substitutes every `{{ name }}` a `set_var` pinned to a literal. Returns
 * `ok: false` as soon as one operand is unknowable, so a caller can tell "this
 * is false" from "this cannot be shown".
 */
function substituteRefs(text, state) {
  let ok = true;
  const value = text.replace(REF_RE, (_, raw) => {
    const name = raw.trim();
    if (state.values.has(name)) return String(state.values.get(name));
    ok = false;
    return "";
  });
  return { ok, value };
}

/**
 * Operand resolution for the small expression language templates use.
 * Returns `undefined` when the value is not knowable at authoring time, which is
 * what makes the branch check honest instead of optimistic.
 */
function resolveOperand(token, state) {
  const t = token.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (isQuoted(t)) {
    // `"{{ estado }}"` compares the interpolated value, not the placeholder.
    const sub = substituteRefs(unquote(t), state);
    return sub.ok ? sub.value : undefined;
  }
  if (t.includes("{{")) {
    const sub = substituteRefs(t, state);
    return sub.ok ? sub.value : undefined;
  }
  if (isBareIdent(t) && state.values.has(t)) return state.values.get(t);
  return undefined;
}

/**
 * Proves a condition evaluates to true, or explains why it cannot be proven.
 *
 * Only `==`/`!=`/`&&`/`||` over operands that are literals or `set_var` values
 * are accepted. Anything reaching for the network, an item or a form answer is
 * unprovable, so a template cannot route its whole chain through a branch that
 * might not be taken.
 */
function proveTrue(expression, state) {
  const expr = expression.trim();
  if (!expr) return "la condición está vacía y evalúa a falso";
  if (expr === "true") return null;

  const orParts = expr.split("||").map((s) => s.trim());
  for (const part of orParts) {
    if (part === "true") return null;
    const andParts = part.split("&&").map((s) => s.trim());
    if (andParts.every((p) => proveComparison(p, state) === null)) return null;
  }
  const firstError = proveComparison(orParts[0], state);
  return firstError ?? null;
}

function proveComparison(part, state) {
  const m = part.match(/^(.*?)(==|!=)(.*)$/);
  if (!m) return `no se puede evaluar «${part}»: usa una comparación con valores conocidos`;
  const left = resolveOperand(m[1], state);
  const right = resolveOperand(m[3], state);
  if (left === undefined || right === undefined) {
    return `«${part}» no es demostrablemente verdadera: uno de sus lados no tiene un valor conocido antes de este paso`;
  }
  const equal = String(left) === String(right);
  return (m[2] === "==" ? equal : !equal) ? null : `«${part}» evalúa a falso con los valores sembrados`;
}

/** Whether the seeded `code` step emits JSON, which is what creates items. */
const codeEmitsJson = (data) =>
  typeof data.code === "string" && data.code.includes("JSON.stringify") && /console\.log/.test(data.code);

/**
 * How many items the chain carries at a point, as far as it can be known.
 *
 * Only used to catch the one combination that silently corrupts a user's file:
 * `excel_local` in csv format with a header, appending, once per item. The xlsx
 * writer de-duplicates a repeated header on append (`integration_excel.rs`
 * reads the file back and drops it), but the csv writer concatenates the header
 * into every append, so a per-item run leaves the header repeated between rows.
 */
function itemCountAfter(type, data, previous) {
  const fromCode = (code) => {
    if (typeof code !== "string") return previous;
    const call = code.match(/console\.log\(\s*JSON\.stringify\(\s*(.)/);
    const inline = call ? call[1] : null;
    if (inline === "[") return "many";
    if (inline === "{") return "single";
    // The payload is usually built into a variable first and stringified by
    // name, so fall back to the shape of the literal it was built from.
    if (/=\s*\[/.test(code)) return "many";
    if (/=\s*\{/.test(code)) return "single";
    return previous;
  };
  /** A query that aggregates without grouping answers exactly one row. */
  const queryRows = (sql) => {
    const text = String(sql ?? "").toUpperCase();
    const aggregates = /\b(COUNT|SUM|AVG|MIN|MAX|TOTAL)\s*\(/.test(text);
    return aggregates && !text.includes("GROUP BY") ? "single" : "many";
  };
  switch (type) {
    case "code":
      return fromCode(data.code);
    case "read_file": case "markdown": case "crypto": case "write_file":
    case "sqlite_execute":
      return "single";
    // One item per match, so a selector that hits more than one element fans
    // the chain out.
    case "html_extract":
      return "many";
    // With a `root` the parser emits one item per repeated element; without it
    // the whole document is a single item.
    case "xml_parse":
      return String(data.root ?? "").trim() ? "many" : "single";
    case "sqlite_query":
      return queryRows(data.query);
    case "rss_read": case "split_out": case "split_batches":
      return "many";
    default:
      return previous;
  }
}

/**
 * Validates one template and returns its failures plus the state its chain
 * leaves behind (used when emitting the seeds artifact).
 */
export function checkTemplateChain(tmpl, deps) {
  const { buildAddedEvents, contract, nodeKinds } = deps;
  const errors = [];
  const state = { vars: new Set(ENGINE_VARS), values: new Map(), items: false, guaranteedVars: new Set(), formVars: new Set() };
  let itemCount = "none";

  const steps = tmpl.steps;
  steps.forEach((step, index) => {
    const isLast = index === steps.length - 1;
    const where = `paso ${index + 1} (${step.type})`;

    if (!nodeKinds.has(step.type)) {
      errors.push(`${where}: el tipo no está en la lista de tipos usables`);
      return;
    }
    if (contract.FORBIDDEN_KINDS[step.type]) {
      errors.push(`${where}: prohibido — ${contract.FORBIDDEN_KINDS[step.type]}`);
      return;
    }
    if (contract.ENTRY_KINDS.includes(step.type) && index !== 0) {
      errors.push(`${where}: un disparador solo puede ser el primer paso de la cadena`);
    }
    if (step.type === "end" && !isLast) {
      errors.push(`${where}: «Fin» no tiene puerto de salida, así que debe ser el último paso`);
    }

    const seeded = buildAddedEvents(step.type, 1000 + index * 10, [], 0, step.data ? { data: step.data } : undefined);
    if (seeded.length === 0) {
      errors.push(`${where}: el sembrado no produce ningún evento para este tipo`);
      return;
    }

    // A trigger publishes its payload as variables before the graph runs, so
    // the steps after it can read `{{ webhook.body }}` from the very first one.
    for (const name of contract.TRIGGER_VARS[step.type] ?? []) state.vars.add(name);
    const data = Object.assign({}, ...seeded.map((ev) => ev.data));

    // -- every reference must resolve ----------------------------------------
    // Checked on all string fields, not only the ones a runner rejects when
    // empty. An unresolved `{{ x }}` is never harmless: it either writes the
    // literal placeholder into the user's file or trips a guard, and both look
    // like the template "did not work".
    const exemptFields = new Set();
    for (const req of contract.REQUIRED_FIELDS[step.type] ?? []) {
      if (req.requirement && tmpl.requires.includes(req.requirement)) exemptFields.add(req.field);
    }

    for (const [field, raw] of Object.entries(data)) {
      if (exemptFields.has(field)) continue;
      const values = Array.isArray(raw) ? raw : [raw];
      if (field === "fields" || field === "aggregations" || field === "renames" || field === "cases") continue;
      for (const value of values) {
        for (const ref of refsIn(value)) {
          if (ref.startsWith("$json")) {
            if (!state.items) errors.push(`${where}: «${field}» usa {{ ${ref} }} pero ningún paso anterior produjo items`);
          } else if (ref.startsWith("$")) {
            // $node / $credentials / $now resolve against run-time state this
            // check cannot see; they are allowed but never counted as data.
          } else if (isBareIdent(ref)) {
            const isRequiredField = (contract.REQUIRED_FIELDS[step.type] ?? []).some((r) => r.field === field);
            if (!state.vars.has(ref)) {
              errors.push(`${where}: «${field}» lee {{ ${ref} }} pero ningún paso anterior lo define`);
            } else if (isRequiredField && state.formVars.has(ref) && !state.guaranteedVars.has(ref) && !hasLiteralText(value)) {
              // A form answer is the one value the template can constrain and
              // did not: the field is optional, so the user may leave it blank
              // and the runner will then reject this step. A value produced by a
              // system step (an HTTP body, a file) is left alone on purpose —
              // that can legitimately be empty, and the runner says so at run
              // time rather than the template being wrong.
              errors.push(`${where}: «${field}» es exactamente {{ ${ref} }} y ese campo del formulario es opcional, así que puede llegar vacío y el runner lo rechazará. Márcalo required: true, dale un valor con set_var, o añade texto fijo alrededor.`);
            }
          } else {
            errors.push(`${where}: «${field}» contiene una expresión no verificable: {{ ${ref} }}`);
          }
        }
      }
    }

    // -- fields the runner rejects outright when empty ------------------------
    for (const req of contract.REQUIRED_FIELDS[step.type] ?? []) {
      if (req.when && !req.when(data)) continue;
      if (req.requirement && tmpl.requires.includes(req.requirement)) continue;
      const raw = data[req.field];
      const present = Array.isArray(raw) ? raw.length > 0 : raw !== undefined && raw !== null && String(raw).trim() !== "";
      if (!present) {
        errors.push(`${where}: «${req.field}» está vacío y el runner lo exige${req.requirement ? ` (o falta declarar requires: ${req.requirement})` : ""}`);
      } else if (String(raw).trim() === "") {
        errors.push(`${where}: «${req.field}» queda vacío tras interpolar y el runner lo exige`);
      }
    }

    // -- branch routing: the chain always continues on the first output port --
    if (!isLast && step.type === "condition") {
      const reason = proveTrue(String(data.expression ?? ""), state);
      if (reason) errors.push(`${where}: la cadena continúa por el puerto «Verdadero» y la condición no lo garantiza: ${reason}`);
    }
    if (!isLast && step.type === "switch") {
      const field = String(data.field ?? "").trim();
      const ref = field.match(/^\{\{\s*([^}]*?)\s*\}\}$/);
      const name = ref ? ref[1] : isBareIdent(field) ? field : null;
      const value = name && state.values.has(name) ? state.values.get(name) : undefined;
      const firstCase = Array.isArray(data.cases) ? data.cases[0] : null;
      if (value === undefined || !firstCase || String(firstCase.value) !== String(value)) {
        errors.push(`${where}: la cadena sigue por el puerto «Caso 1», pero «${field}» no tiene un valor conocido igual a cases[0].value`);
      }
    }

    // -- the one combination that corrupts a csv -------------------------------
    if (step.type === "excel_local") {
      const format = String(data.format ?? "").toLowerCase();
      const header = String(data.header ?? "").replace(/[\[\]\s"]/g, "");
      const appending = data.overwrite !== true;
      if (format === "csv" && header !== "" && appending && itemCount === "many") {
        errors.push(
          `${where}: escribe un CSV con encabezado en modo añadir y la cadena llega con varios items; ` +
          `el escritor csv repite el encabezado en cada añadido (a diferencia del xlsx). ` +
          `Emite un único objeto con la lista de filas, o deja header vacío.`,
        );
      }
    }

    // -- a sink that replaces, fed one item at a time -------------------------
    // These two run once per incoming item (they are not item-aware), so a sink
    // that replaces its target keeps whatever the *last* item wrote and discards
    // the rest. The flow looks right on the canvas and quietly loses rows.
    if (itemCount === "many") {
      if (step.type === "write_file" && data.append !== true) {
        errors.push(`${where}: «Escribir archivo» con append en falso tras un paso que produce varios items: cada item reescribe el archivo y solo sobrevive el último. Pon append en true, o resume la lista antes con una agregación.`);
      }
      if (step.type === "excel_local" && data.overwrite === true) {
        errors.push(`${where}: Excel/CSV con overwrite en true tras un paso que produce varios items: cada fila reescribe el archivo y solo queda la última. Pon overwrite en false para que se añadan, o emite un único objeto con la lista de filas.`);
      }
    }

    // -- interpolating into a quoted JS string --------------------------------
    // On Windows a path interpolated into `'…'` loses its backslashes before the
    // script ever runs (`'C:\Users\a'` becomes `C:Usersa`), so a step that reads
    // the file it was handed silently fails. `String.raw` with backticks keeps
    // the value verbatim.
    if (step.type === "code" && typeof data.code === "string") {
      if (/'[^'\n]*\{\{/.test(data.code) || /"[^"\n]*\{\{/.test(data.code)) {
        errors.push(`${where}: interpola un valor dentro de una cadena entrecomillada; en Windows las rutas pierden las barras invertidas. Usa String.raw con acentos graves: String.raw\`{{ … }}\`.`);
      }
      // The script is written next to the OS temp directory, so whether `.js`
      // is CommonJS or ESM depends on the nearest `package.json` above it — a
      // file the user does not control. `require` therefore works on some
      // machines and throws "require is not defined" on others; a dynamic
      // `import()` works under both.
      if (/\brequire\s*\(/.test(data.code)) {
        errors.push(`${where}: usa require(), que falla si el script acaba tratándose como módulo ES. Usa una importación dinámica: const fs = await import('node:fs'); dentro de un (async () => { … })();`);
      }
    }


    // -- state for the steps that follow ------------------------------------
    itemCount = itemCountAfter(step.type, data, itemCount);
    if (step.type === "set_var") {
      const name = String(data.name ?? "").trim();
      if (name) {
        state.vars.add(name);
        const value = data.value;
        if (typeof value === "string" && !value.includes("{{")) {
          state.values.set(name, value);
          state.guaranteedVars.add(name);
        }
      }
    }
    if (step.type === "form" && Array.isArray(data.fields)) {
      for (const f of data.fields) {
        if (!f || !f.id) continue;
        state.vars.add(f.id);
        state.formVars.add(f.id);
        if (f.required === true) state.guaranteedVars.add(f.id);
      }
    }
    if (typeof data.output_var === "string" && data.output_var.trim()) {
      state.vars.add(data.output_var.trim());
      if (step.type === "code") state.guaranteedVars.add(data.output_var.trim());
    }
    if (contract.ITEM_CREATORS.includes(step.type)) state.items = true;
    if (step.type === "code" && codeEmitsJson(data)) state.items = true;

    if (index === 0 && !contract.ENTRY_KINDS.includes(step.type)) {
      // A chain that starts with an action is fine — it is appended to an
      // existing flow — but the first step must not read items that no entry
      // point produced.
      if (String(Object.values(data).join(" ")).includes("$json") && !state.items) {
        errors.push(`${where}: el primer paso lee {{ $json.… }} y todavía no existe ningún item`);
      }
    }
  });

  return { errors, state };
}
