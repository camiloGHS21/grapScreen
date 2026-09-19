import React from "react";
import { Info } from "lucide-react";

/**
 * grapScreen's own note under the agent's fields.
 *
 * It explains something n8n does not have to: n8n reads the model from the
 * wired chat-model node through the workflow graph, and this app additionally
 * reads the key from its own credential store. The information stays; the
 * presentation is a `notice` like every other one in the panel, so it reads as
 * part of the form instead of an appended box.
 */
export function AgentModelNote() {
  return (
    <div className="ndv-n8n-notice">
      <span className="ndv-notice-icon" aria-hidden="true">
        <Info size={13} />
      </span>
      <span>
        El modelo y el proveedor se toman del nodo de chat model conectado al
        puerto <strong>Chat Model</strong>. La clave de API se lee del almacén de
        credenciales de la aplicación, igual que en el resto del flujo.
      </span>
    </div>
  );
}

export default AgentModelNote;
