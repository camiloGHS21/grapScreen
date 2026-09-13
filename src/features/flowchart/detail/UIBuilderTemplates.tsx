import React from "react";
import {
  Type, Square, MousePointerClick, AlignLeft, List, CheckSquare,
  Image, Minus, MoveVertical, Heading, Palette, SlidersHorizontal,
  Box, Menu, LayoutGrid, Columns, CreditCard, Rows
} from "lucide-react";
import type { UIElement, UIElementType, UIScreen } from "../../../types";

export interface PaletteCategory {
  id: string;
  title: string;
  items: { type: UIElementType; preset?: string; label: string; icon: React.ReactNode; desc: string }[];
}

export const PALETTE_CATEGORIES: PaletteCategory[] = [
  {
    id: "layout",
    title: "📦 Layout & Estructura",
    items: [
      { type: "container", preset: "flex", label: "Flex Container", icon: <Box size={16} />, desc: "Contenedor Flexbox inteligente (auto-detecta dirección y ajuste)" },
      { type: "container", preset: "grid", label: "Grid Container", icon: <LayoutGrid size={16} />, desc: "Cuadrícula CSS (configura de 1 a 12 columnas)" },
      { type: "container", preset: "card", label: "Tarjeta (Card)", icon: <CreditCard size={16} />, desc: "Caja contenedora con fondo y esquinas suaves" },
      { type: "divider", label: "Separador", icon: <Minus size={16} />, desc: "Línea divisoria horizontal" },
      { type: "spacer", label: "Espacio", icon: <MoveVertical size={16} />, desc: "Espacio vertical en blanco" },
    ]
  },
  {
    id: "fields",
    title: "📝 Campos de Texto y Datos",
    items: [
      { type: "input", label: "Campo texto", icon: <Square size={16} />, desc: "Input de una línea" },
      { type: "textarea", label: "Área texto", icon: <AlignLeft size={16} />, desc: "Texto largo multilínea" },
      { type: "select", label: "Selector", icon: <List size={16} />, desc: "Lista desplegable de opciones" },
      { type: "checkbox", label: "Casilla", icon: <CheckSquare size={16} />, desc: "Interruptor on/off" },
      { type: "colorPicker", label: "Color", icon: <Palette size={16} />, desc: "Paleta para elegir color" },
      { type: "slider", label: "Deslizador", icon: <SlidersHorizontal size={16} />, desc: "Control deslizante de rango" },
    ]
  },
  {
    id: "basic",
    title: "📌 Elementos Básicos",
    items: [
      { type: "header", label: "Título", icon: <Heading size={16} />, desc: "Encabezado del formulario" },
      { type: "label", label: "Etiqueta", icon: <Type size={16} />, desc: "Texto descriptivo estático" },
      { type: "button", label: "Botón", icon: <MousePointerClick size={16} />, desc: "Botón de envío o acción" },
      { type: "image", label: "Logo / Icono", icon: <Image size={16} />, desc: "Emoji o imagen corporativa" },
    ]
  },
  {
    id: "advanced",
    title: "⚡ Navegación y Avanzados",
    items: [
      { type: "menu", label: "Menú / Submenú", icon: <Menu size={16} />, desc: "Navegación entre subpantallas" },
      { type: "progressBar", label: "Barra de Progreso", icon: <MoveVertical size={16} />, desc: "Indicador de progreso" },
    ]
  }
];

export const PALETTE = PALETTE_CATEGORIES.flatMap(c => c.items);

export const COLOR_PRESETS = ["var(--text)", "#0f172a", "#ef4444", "#22c55e", "#3b82f6", "#f59e0b", "#ec4899", "#14b8a6", "#a855f7", "#ffffff", "transparent"];

export const GRADIENT_PRESETS = [
  "linear-gradient(135deg,var(--red),#22c55e)",
  "linear-gradient(135deg,var(--s1),var(--s2))",
  "linear-gradient(160deg,#0f2027,#203a43,#2c5364)",
  "linear-gradient(135deg,#2b5876,#4e4376)",
  "linear-gradient(135deg,#42275a,#734b6d)",
  "linear-gradient(135deg,#1a1a2e,#16213e)",
];

let elCounter = 0;

export function createElement(type: UIElementType, preset?: string): UIElement {
  elCounter++;
  const id = `el-${Date.now()}-${elCounter}`;
  const base: UIElement = { id, type, name: type, props: {} };
  switch (type) {
    case "container": {
      if (preset === "grid" || preset === "grid2" || preset === "grid3") return { ...base, name: "Grid", children: [], direction: "grid", gap: 12, props: { gridColumns: 2, width: "100%", padding: 10, borderRadius: 8, bgColor: "transparent" } };
      if (preset === "card") return { ...base, name: "Tarjeta", children: [], direction: "vertical", gap: 10, props: { width: "100%", padding: 14, borderRadius: 12, bgColor: "var(--s2)" } };
      return { ...base, name: "Flex Container", children: [], direction: "vertical", gap: 10, props: { flexWrap: "wrap", justifyContent: "flex-start", alignItems: "stretch", width: "100%", padding: 10, borderRadius: 8, bgColor: "transparent" } };
    }
    case "header": return { ...base, name: "Título", props: { text: "Mi Título", fontSize: 20, fontWeight: 700, align: "left", color: "var(--text)", width: "100%" } };
    case "label": return { ...base, name: "Etiqueta", props: { text: "Etiqueta:", fontSize: 13, fontWeight: 500, align: "left", color: "var(--text)", width: "100%" } };
    case "button": return { ...base, name: "Botón", props: { text: "Aceptar", bgColor: "var(--red)", color: "#ffffff", fontSize: 14, fontWeight: 600, borderRadius: 8, padding: 10, width: "auto", outputVar: "btn_result" } };
    case "input": return { ...base, name: "Campo texto", props: { placeholder: "Escribe aquí...", width: "100%", borderRadius: 6, padding: 8, outputVar: "input_val" } };
    case "textarea": return { ...base, name: "Área texto", props: { placeholder: "Texto largo...", width: "100%", borderRadius: 6, padding: 8, outputVar: "textarea_val" } };
    case "select": return { ...base, name: "Selector", props: { options: "Opción 1, Opción 2, Opción 3", width: "100%", borderRadius: 6, padding: 8, outputVar: "select_val" } };
    case "checkbox": return { ...base, name: "Casilla", props: { text: "Acepto términos", color: "var(--text)", fontSize: 13, outputVar: "checkbox_val" } };
    case "image": return { ...base, name: "Logo", props: { src: "🏢", width: "auto", height: "auto" } };
    case "colorPicker": return { ...base, name: "Color", props: { color: "var(--red)", outputVar: "color_val" } };
    case "slider": return { ...base, name: "Deslizador", props: { defaultValue: "50", width: "100%", outputVar: "slider_val" } };
    case "progressBar": return { ...base, name: "Progreso", props: { defaultValue: "60", width: "100%", bgColor: "var(--red)" } };
    case "menu": return { ...base, name: "Menú", props: { menuItems: "Opción 1, Opción 2, Opción 3", width: "100%" } };
    case "divider": return { ...base, name: "Separador", props: { width: "100%", bgColor: "var(--line)", height: "1px" } };
    case "spacer": return { ...base, name: "Espacio", props: { width: "100%", height: "20px" } };
    default: return base;
  }
}

export function createScreen(title: string, elements: UIElement[] = [], bgColor = "var(--s1)"): UIScreen {
  return { id: `scr-${Date.now()}-${Math.floor(Math.random() * 1e4)}`, title, width: 420, height: 400, bgColor, elements };
}

export const TEMPLATES: { id: string; label: string; icon: string; desc: string; build: () => UIElement[]; sub?: UIScreen[] }[] = [
  {
    id: "form-basic", label: "Formulario básico", icon: "📋", desc: "Título + 2 campos + botón",
    build: () => [
      { ...createElement("header"), props: { text: "Formulario de Registro", fontSize: 20, fontWeight: 700, align: "left", color: "var(--text)", width: "100%" } },
      { ...createElement("label"), props: { text: "Campo 1", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("input"), props: { placeholder: "Escribe aquí...", width: "100%", borderRadius: 6, padding: 8, outputVar: "campo_1" } },
      { ...createElement("label"), props: { text: "Campo 2", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("input"), props: { placeholder: "Escribe aquí...", width: "100%", borderRadius: 6, padding: 8, outputVar: "campo_2" } },
      { ...createElement("button"), props: { text: "Enviar Datos", bgColor: "var(--red)", color: "#ffffff", fontSize: 14, fontWeight: 600, borderRadius: 8, padding: 10, width: "100%", outputVar: "submit_btn" } },
    ]
  },
  {
    id: "form-login", label: "Login", icon: "🔐", desc: "Usuario + contraseña + entrar",
    build: () => [
      { ...createElement("header"), props: { text: "Iniciar Sesión", fontSize: 22, fontWeight: 700, align: "center", color: "var(--text)", width: "100%" } },
      { ...createElement("label"), props: { text: "Usuario / Email", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("input"), props: { placeholder: "tu@email.com", width: "100%", borderRadius: 6, padding: 8, outputVar: "username" } },
      { ...createElement("label"), props: { text: "Contraseña", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("input"), props: { placeholder: "••••••••", width: "100%", borderRadius: 6, padding: 8, outputVar: "password" } },
      { ...createElement("button"), props: { text: "Entrar", bgColor: "var(--red)", color: "#ffffff", fontSize: 14, fontWeight: 600, borderRadius: 8, padding: 10, width: "100%", outputVar: "login_btn" } },
    ]
  },
  {
    id: "form-menu", label: "Menú", icon: "☰", desc: "Título + 4 botones de menú",
    build: () => [
      { ...createElement("header"), props: { text: "Menú Principal", fontSize: 20, fontWeight: 700, align: "center", color: "var(--text)", width: "100%" } },
      { ...createElement("divider"), props: { width: "100%", bgColor: "var(--line)", height: "1px" } },
      ...["Opción 1","Opción 2","Opción 3","Opción 4"].map((t, i) => ({
        ...createElement("button"),
        props: { text: t, bgColor: "var(--s2)", color: "var(--text)", fontSize: 13, fontWeight: 500, borderRadius: 8, padding: 12, width: "100%", outputVar: `menu_${i}` }
      })),
    ]
  },
  {
    id: "form-submenu", label: "Menú con submenús", icon: "🧭", desc: "Menú que abre 2 subpantallas",
    build: () => [
      { ...createElement("header"), props: { text: "Mi App", fontSize: 22, fontWeight: 700, align: "center", color: "var(--text)", width: "100%" } },
      { ...createElement("menu"), props: { menuItems: "Perfil, Ajustes", width: "100%" } },
    ],
    sub: [
      createScreen("Perfil", [
        { ...createElement("header"), props: { text: "Perfil de Usuario", fontSize: 20, fontWeight: 700, color: "var(--text)", width: "100%" } },
        { ...createElement("label"), props: { text: "Nombre", fontSize: 12, color: "var(--dim)", width: "100%" } },
        { ...createElement("input"), props: { placeholder: "Tu nombre", width: "100%", borderRadius: 6, padding: 8, outputVar: "nombre" } },
        { ...createElement("label"), props: { text: "Email", fontSize: 12, color: "var(--dim)", width: "100%" } },
        { ...createElement("input"), props: { placeholder: "email@ej.com", width: "100%", borderRadius: 6, padding: 8, outputVar: "email" } },
      ], "var(--s1)"),
      createScreen("Ajustes", [
        { ...createElement("header"), props: { text: "Ajustes del Sistema", fontSize: 20, fontWeight: 700, color: "var(--text)", width: "100%" } },
        { ...createElement("checkbox"), props: { text: "Activar notificaciones", color: "var(--text)", fontSize: 13, outputVar: "notif" } },
        { ...createElement("slider"), props: { defaultValue: "50", width: "100%", outputVar: "volumen" } },
      ], "var(--s1)"),
    ],
  },
  {
    id: "form-excel", label: "Datos Excel", icon: "📊", desc: "Formulario para introducir datos a Excel",
    build: () => [
      { ...createElement("header"), props: { text: "Captura de Registro", fontSize: 18, fontWeight: 700, align: "left", color: "var(--text)", width: "100%" } },
      { ...createElement("label"), props: { text: "Nombre del producto", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("input"), props: { placeholder: "Ej. Laptop HP", width: "100%", borderRadius: 6, padding: 8, outputVar: "producto" } },
      { ...createElement("label"), props: { text: "Cantidad", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("input"), props: { placeholder: "Ej. 10", width: "100%", borderRadius: 6, padding: 8, outputVar: "cantidad" } },
      { ...createElement("label"), props: { text: "Precio unitario", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("input"), props: { placeholder: "Ej. 599.99", width: "100%", borderRadius: 6, padding: 8, outputVar: "precio" } },
      { ...createElement("label"), props: { text: "Categoría", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("select"), props: { options: "Electrónica, Hogar, Oficina, Otros", width: "100%", borderRadius: 6, padding: 8, outputVar: "categoria" } },
      { ...createElement("button"), props: { text: "Guardar Registro", bgColor: "var(--red)", color: "#ffffff", fontSize: 14, fontWeight: 600, borderRadius: 8, padding: 10, width: "100%", outputVar: "guardar_btn" } },
    ]
  },
  {
    id: "form-wizard", label: "Wizard Multi-paso", icon: "🚀", desc: "Formulario de 3 pasos con navegación",
    build: () => [
      { ...createElement("header"), props: { text: "Paso 1: Datos Iniciales", fontSize: 20, fontWeight: 700, align: "center", color: "var(--text)", width: "100%" } },
      { ...createElement("progressBar"), props: { defaultValue: "33", width: "100%", bgColor: "var(--red)" } },
      { ...createElement("label"), props: { text: "Nombre completo", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("input"), props: { placeholder: "Ej. Ana Pérez", width: "100%", borderRadius: 6, padding: 8, outputVar: "nombre_paso1" } },
      { ...createElement("menu"), props: { menuItems: "Paso 1 (Actual), Paso 2 (Opciones), Paso 3 (Confirmar)", width: "100%" } },
    ],
    sub: [
      createScreen("Paso 2 (Opciones)", [
        { ...createElement("header"), props: { text: "Paso 2: Selección de Opciones", fontSize: 20, fontWeight: 700, color: "var(--text)", width: "100%" } },
        { ...createElement("progressBar"), props: { defaultValue: "66", width: "100%", bgColor: "var(--red)" } },
        { ...createElement("label"), props: { text: "Tipo de Servicio", fontSize: 12, color: "var(--dim)", width: "100%" } },
        { ...createElement("select"), props: { options: "Estándar, Premium, Empresarial", width: "100%", borderRadius: 6, padding: 8, outputVar: "servicio" } },
      ], "var(--s1)"),
      createScreen("Paso 3 (Confirmar)", [
        { ...createElement("header"), props: { text: "Paso 3: Confirmación Final", fontSize: 20, fontWeight: 700, color: "var(--text)", width: "100%" } },
        { ...createElement("progressBar"), props: { defaultValue: "100", width: "100%", bgColor: "var(--red)" } },
        { ...createElement("checkbox"), props: { text: "Confirmo que los datos son correctos", color: "var(--text)", fontSize: 13, outputVar: "confirmado" } },
        { ...createElement("button"), props: { text: "Finalizar Registro", bgColor: "var(--red)", color: "#ffffff", fontSize: 14, fontWeight: 600, borderRadius: 8, padding: 10, width: "100%", outputVar: "final_btn" } },
      ], "var(--s1)"),
    ],
  },
  {
    id: "form-dashboard", label: "Dashboard", icon: "📈", desc: "Logo + título + progreso + botón",
    build: () => [
      { ...createElement("container"), direction: "horizontal", gap: 10, children: [
        { ...createElement("image"), props: { src: "📊", width: "auto", height: "auto" } },
        { ...createElement("header"), props: { text: "Panel Dashboard", fontSize: 20, fontWeight: 700, align: "left", color: "var(--text)", width: "100%" } },
      ] },
      { ...createElement("divider"), props: { width: "100%", bgColor: "var(--line)", height: "1px" } },
      { ...createElement("label"), props: { text: "Progreso del proceso", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("progressBar"), props: { defaultValue: "65", width: "100%", bgColor: "var(--red)" } },
      { ...createElement("label"), props: { text: "Velocidad de ejecución", fontSize: 12, color: "var(--dim)", width: "100%" } },
      { ...createElement("slider"), props: { defaultValue: "75", width: "100%", outputVar: "velocidad" } },
      { ...createElement("button"), props: { text: "Ejecutar Automatización", bgColor: "var(--red)", color: "#ffffff", fontSize: 14, fontWeight: 600, borderRadius: 8, padding: 10, width: "100%", outputVar: "ejecutar_btn" } },
    ]
  },
];

export function findEl(els: UIElement[], id: string): UIElement | null {
  for (const el of els) { if (el.id === id) return el; if (el.children) { const f = findEl(el.children, id); if (f) return f; } }
  return null;
}
export function updEl(els: UIElement[], id: string, fn: (e: UIElement) => UIElement): UIElement[] {
  return els.map(el => { if (el.id === id) return fn(el); if (el.children) return { ...el, children: updEl(el.children, id, fn) }; return el; });
}
export function delEl(els: UIElement[], id: string): UIElement[] {
  return els.filter(el => el.id !== id).map(el => el.children ? { ...el, children: delEl(el.children, id) } : el);
}
export function moveEl(els: UIElement[], id: string, dir: -1 | 1): UIElement[] {
  const idx = els.findIndex(e => e.id === id);
  if (idx >= 0) {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= els.length) return els;
    const next = [...els];
    const [moved] = next.splice(idx, 1);
    next.splice(targetIdx, 0, moved);
    return next;
  }
  return els.map(el => el.children ? { ...el, children: moveEl(el.children, id, dir) } : el);
}
export function addInside(els: UIElement[], cid: string, ne: UIElement): UIElement[] {
  return els.map(el => { if (el.id === cid) return { ...el, children: [...(el.children || []), ne] }; if (el.children) return { ...el, children: addInside(el.children, cid, ne) }; return el; });
}
export function addAfter(els: UIElement[], aid: string, ne: UIElement): UIElement[] {
  const r: UIElement[] = [];
  for (const el of els) { let c = el; if (el.children) c = { ...el, children: addAfter(el.children, aid, ne) }; r.push(c); if (el.id === aid) r.push(ne); }
  return r;
}
export function dupEl(el: UIElement): UIElement { elCounter++; return { ...el, id: `el-${Date.now()}-${elCounter}`, name: el.name + " (copia)", children: el.children?.map(dupEl) }; }
export function dupInTree(els: UIElement[], id: string): UIElement[] {
  const r: UIElement[] = [];
  for (const el of els) { let c = el; if (el.children) c = { ...el, children: dupInTree(el.children, id) }; r.push(c); if (el.id === id) r.push(dupEl(el)); }
  return r;
}
export function countEls(els: UIElement[]): number { return els.reduce((s, el) => s + 1 + (el.children ? countEls(el.children) : 0), 0); }

export const TYPE_ICONS: Record<string, string> = {
  container: "📦", header: "📌", label: "🏷️", button: "🔘", input: "📝", textarea: "📄",
  select: "📋", checkbox: "☑️", image: "🖼️", colorPicker: "🎨", slider: "🎚️",
  progressBar: "📊", divider: "➖", spacer: "⬜", menu: "📑",
};

export { parsePromptToUI } from "./UIBuilderAiParser";
