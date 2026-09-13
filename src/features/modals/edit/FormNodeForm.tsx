import React from "react";
import { Plus, Trash } from "lucide-react";
import { FormField } from "../../../hooks/useFlowchartEditState";

interface FormNodeFormProps {
  editFormFields: FormField[];
  setEditFormFields: React.Dispatch<React.SetStateAction<FormField[]>>;
}

export function FormNodeForm({ editFormFields, setEditFormFields }: FormNodeFormProps) {
  const addField = () => {
    const newField: FormField = {
      id: `campo_${editFormFields.length + 1}`,
      label: `Nuevo Campo ${editFormFields.length + 1}`,
      type: "text",
      required: false,
      defaultValue: "",
      options: ""
    };
    setEditFormFields([...editFormFields, newField]);
  };

  const updateField = (index: number, key: keyof FormField, val: any) => {
    setEditFormFields(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [key]: val };
      return copy;
    });
  };

  const removeField = (index: number) => {
    setEditFormFields(prev => prev.filter((_, idx) => idx !== index));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "11px", color: "var(--dim)", textTransform: "uppercase", fontWeight: 700 }}>
          Campos del Formulario
        </span>
        <button
          type="button"
          onClick={addField}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            background: "var(--s2)",
            border: "1px solid var(--line)",
            color: "var(--mint)",
            padding: "4px 10px",
            borderRadius: "6px",
            fontSize: "11px",
            cursor: "pointer",
            fontWeight: 600
          }}
        >
          <Plus size={12} /> Agregar Campo
        </button>
      </div>

      <div style={{ fontSize: "11px", color: "var(--muted)", background: "var(--s2)", border: "1px solid var(--line)", borderRadius: "8px", padding: "8px 10px", lineHeight: 1.4 }}>
        Cada campo guarda una <b>variable</b>. El <b>ID</b> es el nombre que usarás luego en otros nodos escribiendo <code>{"{{ id_del_campo }}"}</code>.
        Ejemplo: un campo con ID <code>nombre</code> se usa como <code>{"{{ nombre }}"}</code> en un nodo de Excel.
      </div>

      <div className="form-editor-container">
        {editFormFields.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: "var(--muted)", border: "1px dashed var(--line)", borderRadius: "12px", fontSize: "12px" }}>
            No hay campos creados. Agrega uno para empezar.
          </div>
        ) : (
          editFormFields.map((field, idx) => (
            <div key={idx} className="form-field-card" style={{ marginBottom: "12px" }}>
              <div className="form-field-card-header">
                <h4>Campo #{idx + 1}</h4>
                <button
                  type="button"
                  onClick={() => removeField(idx)}
                  style={{
                    background: "transparent",
                    border: 0,
                    color: "var(--red)",
                    cursor: "pointer",
                    padding: "2px",
                    display: "flex",
                    alignItems: "center"
                  }}
                >
                  <Trash size={14} />
                </button>
              </div>

              <div className="form-field-row">
                <div>
                  <label>ID Variable (Sin espacios)</label>
                  <input
                    type="text"
                    value={field.id}
                    onChange={(e) => updateField(idx, "id", e.target.value.replace(/\s+/g, "_").toLowerCase())}
                    placeholder="ej. email_usuario"
                  />
                  <span style={{ fontSize: "10px", color: "var(--dim)", display: "block", marginTop: "2px" }}>Se usa como {"{{ "}{field.id}{" }}"}</span>
                </div>
                <div>
                  <label>Etiqueta en Pantalla</label>
                  <input
                    type="text"
                    value={field.label}
                    onChange={(e) => updateField(idx, "label", e.target.value)}
                    placeholder="ej. Correo Electrónico"
                  />
                </div>
              </div>

              <div className="form-field-row" style={{ marginTop: "6px" }}>
                <div>
                  <label>Tipo de Campo</label>
                  <select
                    value={field.type}
                    onChange={(e) => updateField(idx, "type", e.target.value)}
                  >
                    <option value="text">Texto</option>
                    <option value="password">Contraseña</option>
                    <option value="email">Gmail/Email</option>
                    <option value="number">Número</option>
                    <option value="phone">Teléfono</option>
                    <option value="toggle">Interruptor (Toggle)</option>
                    <option value="select">Selector (Dropdown)</option>
                  </select>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingTop: "20px" }}>
                  <input
                    type="checkbox"
                    id={`req-${idx}`}
                    checked={field.required}
                    onChange={(e) => updateField(idx, "required", e.target.checked)}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  <label htmlFor={`req-${idx}`} style={{ margin: 0, cursor: "pointer", fontSize: "11px" }}>Requerido</label>
                </div>
              </div>

              {field.type === "select" && (
                <div style={{ marginTop: "6px" }}>
                  <label>Opciones (Separadas por comas)</label>
                  <input
                    type="text"
                    value={field.options || ""}
                    onChange={(e) => updateField(idx, "options", e.target.value)}
                    placeholder="ej. Premium, Estándar, Básico"
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
