import type { UIElement } from "../../../types";
import { createElement } from "./UIBuilderTemplates";

export function parsePromptToUI(promptText: string): UIElement[] {
  const q = promptText.toLowerCase().trim();

  if (q.includes("registro") || q.includes("register") || q.includes("crear cuenta")) {
    const cont = createElement("container", "flex");
    cont.props.flexDirection = "column";
    cont.props.padding = 16;
    cont.props.borderRadius = 12;
    cont.props.bgColor = "var(--s2)";
    cont.children = [
      { ...createElement("header"), props: { text: "Crear una Cuenta", fontSize: 22, fontWeight: 700, align: "center", color: "var(--text)", width: "100%" } },
      { ...createElement("label"), props: { text: "Nombre Completo", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("input"), props: { placeholder: "Ej. Juan Pérez", width: "100%", borderRadius: 6, padding: 8, outputVar: "nombre_completo" } },
      { ...createElement("label"), props: { text: "Correo Electrónico", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("input"), props: { placeholder: "correo@ejemplo.com", width: "100%", borderRadius: 6, padding: 8, outputVar: "email" } },
      { ...createElement("label"), props: { text: "Contraseña", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("input"), props: { placeholder: "••••••••", width: "100%", borderRadius: 6, padding: 8, outputVar: "password" } },
      { ...createElement("checkbox"), props: { text: "Acepto los Términos y Condiciones", color: "var(--text)", fontSize: 13, outputVar: "terms" } },
      { ...createElement("button"), props: { text: "Registrarme", bgColor: "var(--red)", color: "#ffffff", fontSize: 14, fontWeight: 600, borderRadius: 8, padding: 12, width: "100%", outputVar: "btn_register" } }
    ];
    return [cont];
  }

  if (q.includes("login") || q.includes("inicio de sesion") || q.includes("iniciar sesion") || q.includes("acceder")) {
    const cont = createElement("container", "flex");
    cont.props.flexDirection = "column";
    cont.props.padding = 16;
    cont.props.borderRadius = 12;
    cont.props.bgColor = "var(--s2)";
    cont.children = [
      { ...createElement("header"), props: { text: "Iniciar Sesión", fontSize: 22, fontWeight: 700, align: "center", color: "var(--text)", width: "100%" } },
      { ...createElement("label"), props: { text: "Usuario o Email", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("input"), props: { placeholder: "usuario@dominio.com", width: "100%", borderRadius: 6, padding: 8, outputVar: "user_email" } },
      { ...createElement("label"), props: { text: "Contraseña", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("input"), props: { placeholder: "••••••••", width: "100%", borderRadius: 6, padding: 8, outputVar: "password" } },
      { ...createElement("checkbox"), props: { text: "Recordar mi sesión", color: "var(--text)", fontSize: 13, outputVar: "remember" } },
      { ...createElement("button"), props: { text: "Ingresar", bgColor: "var(--red)", color: "#ffffff", fontSize: 14, fontWeight: 600, borderRadius: 8, padding: 12, width: "100%", outputVar: "btn_login" } }
    ];
    return [cont];
  }

  if (q.includes("contacto") || q.includes("contact") || q.includes("mensaje")) {
    const cont = createElement("container", "flex");
    cont.props.flexDirection = "column";
    cont.props.padding = 16;
    cont.props.borderRadius = 12;
    cont.props.bgColor = "var(--s2)";
    cont.children = [
      { ...createElement("header"), props: { text: "Contáctanos", fontSize: 22, fontWeight: 700, align: "left", color: "var(--text)", width: "100%" } },
      { ...createElement("label"), props: { text: "Nombre Completo", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("input"), props: { placeholder: "Tu nombre", width: "100%", borderRadius: 6, padding: 8, outputVar: "contacto_nombre" } },
      { ...createElement("label"), props: { text: "Correo Electrónico", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("input"), props: { placeholder: "tu@email.com", width: "100%", borderRadius: 6, padding: 8, outputVar: "contacto_email" } },
      { ...createElement("label"), props: { text: "Asunto", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("select"), props: { options: "Soporte Técnico, Ventas, Información General, Reclamaciones", width: "100%", borderRadius: 6, padding: 8, outputVar: "contacto_asunto" } },
      { ...createElement("label"), props: { text: "Mensaje", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("textarea"), props: { placeholder: "Escribe tu mensaje aquí...", width: "100%", borderRadius: 6, padding: 8, outputVar: "contacto_mensaje" } },
      { ...createElement("button"), props: { text: "Enviar Mensaje", bgColor: "var(--red)", color: "#ffffff", fontSize: 14, fontWeight: 600, borderRadius: 8, padding: 12, width: "100%", outputVar: "btn_contacto" } }
    ];
    return [cont];
  }

  if (q.includes("reserva") || q.includes("cita") || q.includes("booking") || q.includes("hotel")) {
    const cont = createElement("container", "flex");
    cont.props.flexDirection = "column";
    cont.props.padding = 16;
    cont.props.borderRadius = 12;
    cont.props.bgColor = "var(--s2)";
    cont.children = [
      { ...createElement("header"), props: { text: "Solicitud de Reserva / Cita", fontSize: 20, fontWeight: 700, align: "left", color: "var(--text)", width: "100%" } },
      { ...createElement("label"), props: { text: "Nombre Completo", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("input"), props: { placeholder: "Nombre del cliente", width: "100%", borderRadius: 6, padding: 8, outputVar: "reserva_nombre" } },
      { ...createElement("label"), props: { text: "Teléfono de Contacto", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("input"), props: { placeholder: "+57 300 000 0000", width: "100%", borderRadius: 6, padding: 8, outputVar: "reserva_tel" } },
      { ...createElement("label"), props: { text: "Fecha Deseada", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("input"), props: { placeholder: "DD/MM/AAAA", width: "100%", borderRadius: 6, padding: 8, outputVar: "reserva_fecha" } },
      { ...createElement("label"), props: { text: "Tipo de Servicio", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("select"), props: { options: "Consulta General, Especialidad, Asesoría VIP", width: "100%", borderRadius: 6, padding: 8, outputVar: "reserva_tipo" } },
      { ...createElement("button"), props: { text: "Confirmar Cita", bgColor: "var(--red)", color: "#ffffff", fontSize: 14, fontWeight: 600, borderRadius: 8, padding: 12, width: "100%", outputVar: "btn_reserva" } }
    ];
    return [cont];
  }

  if (q.includes("encuesta") || q.includes("feedback") || q.includes("satisfaccion") || q.includes("opinion")) {
    const cont = createElement("container", "flex");
    cont.props.flexDirection = "column";
    cont.props.padding = 16;
    cont.props.borderRadius = 12;
    cont.props.bgColor = "var(--s2)";
    cont.children = [
      { ...createElement("header"), props: { text: "Encuesta de Satisfacción", fontSize: 20, fontWeight: 700, align: "left", color: "var(--text)", width: "100%" } },
      { ...createElement("label"), props: { text: "Nivel de satisfacción general (1 al 100)", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("slider"), props: { defaultValue: "85", width: "100%", outputVar: "encuesta_score" } },
      { ...createElement("label"), props: { text: "¿Qué podemos mejorar?", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("textarea"), props: { placeholder: "Tus comentarios...", width: "100%", borderRadius: 6, padding: 8, outputVar: "encuesta_opinion" } },
      { ...createElement("checkbox"), props: { text: "¿Recomendarías nuestros servicios?", color: "var(--text)", fontSize: 13, outputVar: "encuesta_recomienda" } },
      { ...createElement("button"), props: { text: "Enviar Opinión", bgColor: "var(--red)", color: "#ffffff", fontSize: 14, fontWeight: 600, borderRadius: 8, padding: 12, width: "100%", outputVar: "btn_encuesta" } }
    ];
    return [cont];
  }

  const lines = promptText.split(/\n|,/).map(s => s.trim()).filter(Boolean);
  const cont = createElement("container", "flex");
  cont.props.flexDirection = "column";
  cont.props.padding = 14;
  cont.props.borderRadius = 10;
  cont.props.bgColor = "var(--s2)";

  const childEls: UIElement[] = [];
  childEls.push({ ...createElement("header"), props: { text: "Formulario IA", fontSize: 20, fontWeight: 700, align: "left", color: "var(--text)", width: "100%" } });

  for (const line of lines) {
    if (line.toLowerCase().startsWith("formulario") || line.toLowerCase().startsWith("crea")) continue;
    const [rawLabel, rawType] = line.split(":").map(s => s.trim());
    const label = rawLabel || line;
    const slug = "f_" + label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);
    
    childEls.push({ ...createElement("label"), props: { text: label, fontSize: 12, color: "var(--dim)", width: "100%" } });
    
    const ltype = (rawType || "").toLowerCase();
    if (ltype === "email" || label.toLowerCase().includes("email") || label.toLowerCase().includes("correo")) {
      childEls.push({ ...createElement("input"), props: { placeholder: "correo@ejemplo.com", width: "100%", borderRadius: 6, padding: 8, outputVar: slug } });
    } else if (ltype === "select" || label.toLowerCase().includes("select") || label.toLowerCase().includes("opciones") || label.toLowerCase().includes("tipo")) {
      childEls.push({ ...createElement("select"), props: { options: "Opción A, Opción B, Opción C", width: "100%", borderRadius: 6, padding: 8, outputVar: slug } });
    } else if (ltype === "area" || label.toLowerCase().includes("area") || label.toLowerCase().includes("mensaje") || label.toLowerCase().includes("comentario")) {
      childEls.push({ ...createElement("textarea"), props: { placeholder: "Escribe detalles...", width: "100%", borderRadius: 6, padding: 8, outputVar: slug } });
    } else if (ltype === "check" || label.toLowerCase().includes("check") || label.toLowerCase().includes("términos")) {
      childEls.push({ ...createElement("checkbox"), props: { text: label, color: "var(--text)", fontSize: 13, outputVar: slug } });
    } else {
      childEls.push({ ...createElement("input"), props: { placeholder: "Ingresa " + label.toLowerCase(), width: "100%", borderRadius: 6, padding: 8, outputVar: slug } });
    }
  }

  childEls.push({ ...createElement("button"), props: { text: "Guardar / Enviar", bgColor: "var(--red)", color: "#ffffff", fontSize: 14, fontWeight: 600, borderRadius: 8, padding: 12, width: "100%", outputVar: "btn_submit" } });
  cont.children = childEls;
  return [cont];
}
