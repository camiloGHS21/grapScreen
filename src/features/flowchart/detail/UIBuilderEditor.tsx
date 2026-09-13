import React, { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Trash2, Copy, X, Save, Plus, LayoutTemplate, Palette, ArrowUp, ArrowDown, Sparkles
} from "lucide-react";
import type { UIElement, UIElementType, UIScreen } from "../../../types";
import {
  COLOR_PRESETS, GRADIENT_PRESETS, TEMPLATES,
  createElement, createScreen, findEl, updEl, delEl, moveEl, addInside,
  addAfter, dupInTree, countEls, parsePromptToUI
} from "./UIBuilderTemplates";
import { UIBuilderAiModal } from "./UIBuilderAiModal";
import { UIBuilderPalette } from "./UIBuilderPalette";
import { PropsPanel, CanvasEl } from "./UIBuilderComponents";

interface Props { initialScreen: UIScreen; onSave: (s: UIScreen) => void; onClose: () => void; }
export function UIBuilderEditor({ initialScreen, onSave, onClose }: Props) {
  const [screen, setScreen] = useState<UIScreen>(() => JSON.parse(JSON.stringify(initialScreen)));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ type: UIElementType; x: number; y: number; label: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [genText, setGenText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const dragTypeRef = React.useRef<UIElementType | null>(null);
  const dragPresetRef = React.useRef<string | undefined>(undefined);

  const active: UIScreen = activeId ? (screen.screens?.find(s => s.id === activeId) ?? screen) : screen;
  const setActive = (fn: (s: UIScreen) => UIScreen) =>
    setScreen(prev => activeId
      ? { ...prev, screens: (prev.screens || []).map(s => s.id === activeId ? fn(s) : s) }
      : fn(prev));
  const sel = selId ? findEl(active.elements, selId) : null;

  const upd = useCallback((id: string, fn: (e: UIElement) => UIElement) => {
    setActive(s => ({ ...s, elements: updEl(s.elements, id, fn) }));
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      setDrag(d => d ? { ...d, x: e.clientX, y: e.clientY } : null);
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const dz = el?.closest("[data-drop]");
      setDropTarget(dz ? dz.getAttribute("data-drop") : null);
    };
    const onUp = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const dz = el?.closest("[data-drop]");
      const type = dragTypeRef.current;
      if (type && dz) {
        const tid = dz.getAttribute("data-drop")!;
        const newEl = createElement(type, dragPresetRef.current);
        if (tid === "root") {
          setActive(s => ({ ...s, elements: [...s.elements, newEl] }));
        } else {
          const target = findEl(active.elements, tid);
          if (target?.type === "container") setActive(s => ({ ...s, elements: addInside(s.elements, tid, newEl) }));
          else setActive(s => ({ ...s, elements: addAfter(s.elements, tid, newEl) }));
        }
        setSelId(newEl.id);
      }
      setDrag(null); setDropTarget(null); dragTypeRef.current = null; dragPresetRef.current = undefined;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [drag, active.elements, activeId]);

  const startDrag = (e: React.MouseEvent, type: UIElementType, label: string, preset?: string) => {
    e.preventDefault();
    dragTypeRef.current = type;
    dragPresetRef.current = preset;
    setDrag({ type, x: e.clientX, y: e.clientY, label });
  };

  const addRoot = (t: UIElementType, preset?: string) => {
    const el = createElement(t, preset);
    if (selId) {
      const selectedEl = findEl(active.elements, selId);
      if (selectedEl?.type === "container") {
        setActive(s => ({ ...s, elements: addInside(s.elements, selId, el) }));
        setSelId(el.id);
        return;
      } else if (selectedEl) {
        setActive(s => ({ ...s, elements: addAfter(s.elements, selId, el) }));
        setSelId(el.id);
        return;
      }
    }
    setActive(s => ({ ...s, elements: [...s.elements, el] }));
    setSelId(el.id);
  };
  const doAddInside = (cid: string, t: UIElementType) => { const el = createElement(t); setActive(s => ({ ...s, elements: addInside(s.elements, cid, el) })); setSelId(el.id); };
  const doAddAfter = (aid: string, t: UIElementType) => { const el = createElement(t); setActive(s => ({ ...s, elements: addAfter(s.elements, aid, el) })); setSelId(el.id); };
  const del = useCallback(() => { if (!selId) return; setActive(s => ({ ...s, elements: delEl(s.elements, selId) })); setSelId(null); }, [selId, setActiveId]);
  const dup = useCallback(() => { if (!selId) return; setActive(s => ({ ...s, elements: dupInTree(s.elements, selId) })); }, [selId, setActiveId]);
  const moveUp = useCallback(() => { if (!selId) return; setActive(s => ({ ...s, elements: moveEl(s.elements, selId, -1) })); }, [selId, setActiveId]);
  const moveDown = useCallback(() => { if (!selId) return; setActive(s => ({ ...s, elements: moveEl(s.elements, selId, 1) })); }, [selId, setActiveId]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.tagName === "SELECT" ||
        (activeEl as HTMLElement).isContentEditable
      );
      if (isInput) return;

      if ((e.key === "Delete" || e.key === "Backspace") && selId) {
        e.preventDefault();
        e.stopPropagation();
        del();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && selId) {
        e.preventDefault();
        e.stopPropagation();
        dup();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selId, del, dup]);

  const applyTemplate = (tpl: typeof TEMPLATES[number]) => {
    const built = tpl.build();
    const isRoot = activeId === null;
    setActive(s => ({ ...s, elements: built, ...(isRoot && tpl.sub ? { screens: tpl.sub } : {}) }));
    setSelId(null);
  };
  const addScreen = () => {
    const n = (screen.screens?.length || 0) + 1;
    const ns = createScreen(`Subpantalla ${n}`);
    setScreen(prev => ({ ...prev, screens: [...(prev.screens || []), ns] }));
    setActiveId(ns.id!);
    setSelId(null);
  };
  const delScreen = (id: string) => {
    setScreen(prev => ({ ...prev, screens: (prev.screens || []).filter(s => s.id !== id) }));
    if (activeId === id) setActiveId(null);
  };
  const setBg = (v: string) => setActive(s => ({ ...s, bgColor: v, bgGradient: undefined }));
  const setGrad = (g: string | undefined) => setActive(s => ({ ...s, bgGradient: g }));
  const applyGen = (overridePrompt?: string) => {
    const textToUse = (typeof overridePrompt === "string" ? overridePrompt : genText);
    if (!textToUse.trim()) return;
    setIsGenerating(true);
    setTimeout(() => {
      const generatedEls = parsePromptToUI(textToUse);
      setActive(s => ({ ...s, elements: [...s.elements, ...generatedEls] }));
      setGenOpen(false);
      setGenText("");
      setSelId(null);
      setIsGenerating(false);
    }, 450);
  };

  return createPortal(
    <div className="ub-overlay" onClick={onClose}>
      <div className="ub" onClick={e => e.stopPropagation()}>
        <div className="ub-header">
          <div className="ub-header-left">
            <span className="ub-header-title">🎨 UI Builder</span>
            <input type="text" className="ub-title-input" value={active.title} onChange={e => setActive(s => ({ ...s, title: e.target.value }))} placeholder="Título" />
            <span className="ub-count">{countEls(active.elements)} elementos</span>
          </div>
          <div className="ub-header-right">
            <div className="ub-bg-wrap">
              <button type="button" className="ub-btn ub-btn-quiet" onClick={() => setBgOpen(o => !o)}><Palette size={14} /> Fondo</button>
              {bgOpen && (
                <div className="ub-bg-pop" onClick={e => e.stopPropagation()}>
                  <div className="ub-bg-pop-title">Color de fondo</div>
                  <div className="ub-color-presets">{COLOR_PRESETS.map(c => <button key={c} type="button" className="ub-color-swatch" style={{ background: c === "transparent" ? "repeating-conic-gradient(#444 0% 25%, #222 0% 50%) 50% / 8px 8px" : c }} onClick={() => setBg(c)} title={c} />)}</div>
                  <div className="ub-bg-pop-title">Degradados</div>
                  <div className="ub-grad-presets">
                    {GRADIENT_PRESETS.map((g, i) => <button key={i} type="button" className="ub-grad-swatch" style={{ background: g }} onClick={() => setGrad(g)} title="Degradado" />)}
                    <button type="button" className="ub-grad-swatch ub-grad-clear" onClick={() => setGrad(undefined)} title="Sin degradado">✕</button>
                  </div>
                </div>
              )}
            </div>
            <button type="button" className="ub-btn ub-btn-quiet" onClick={onClose}><X size={14} /> Cerrar</button>
            <button type="button" className="ub-btn ub-btn-save" onClick={() => onSave(screen)}><Save size={14} /> Guardar UI</button>
          </div>
        </div>

        <div className="ub-templates">
          <span className="ub-templates-label"><LayoutTemplate size={13} /> Plantillas:</span>
          <div className="ub-templates-scroll">
            {TEMPLATES.map(t => (
              <button key={t.id} type="button" className="ub-tpl-chip" title={t.desc} onClick={() => applyTemplate(t)}>
                <span className="ub-tpl-icon">{t.icon}</span>
                <span className="ub-tpl-label">{t.label}</span>
              </button>
            ))}
          </div>
          <button type="button" className="ub-tpl-chip ub-tpl-gen" onClick={() => setGenOpen(true)} title="Generar formulario con Inteligencia Artificial"><Sparkles size={13} style={{ color: "#a855f7" }} /> Generar con IA</button>
        </div>

        <div className="ub-screen-bar">
          <button type="button" className={`ub-screen-tab${activeId === null ? " active" : ""}`} onClick={() => setActiveId(null)}>{screen.title || "Principal"}</button>
          {(screen.screens || []).map(s => (
            <span key={s.id} className={`ub-screen-tab${activeId === s.id ? " active" : ""}`}>
              <button type="button" onClick={() => setActiveId(s.id!)}>{s.title}</button>
              <button type="button" className="ub-screen-del" title="Eliminar subpantalla" onClick={() => delScreen(s.id!)}>×</button>
            </span>
          ))}
          <button type="button" className="ub-screen-add" title="Añadir subpantalla (submenú)" onClick={addScreen}><Plus size={13} /> Sub</button>
        </div>
        <div className="ub-main">
          <UIBuilderPalette startDrag={startDrag} addRoot={addRoot} />
          <div className="ub-canvas-area">
            <div className="ub-canvas-toolbar">
              <span className="ub-canvas-label">Vista previa{activeId ? " · subpantalla" : ""}</span>
              <div className="ub-canvas-actions">
                <button type="button" className="ub-tb-btn" onClick={moveUp} disabled={!sel} title="Subir campo (Mover arriba)"><ArrowUp size={13} /></button>
                <button type="button" className="ub-tb-btn" onClick={moveDown} disabled={!sel} title="Bajar campo (Mover abajo)"><ArrowDown size={13} /></button>
                <button type="button" className="ub-tb-btn" onClick={dup} disabled={!sel} title="Duplicar (Ctrl+D)"><Copy size={13} /></button>
                <button type="button" className="ub-tb-btn ub-tb-danger" onClick={del} disabled={!sel} title="Eliminar (Supr)"><Trash2 size={13} /></button>
              </div>
            </div>
            <div className="ub-canvas-scroll">
              <div className={`ub-canvas-screen${dropTarget === "root" ? " ub-drop-active" : ""}`} data-drop="root" style={{ background: active.bgGradient || (active.bgColor && active.bgColor !== "#1a1a2e" ? active.bgColor : "var(--s1)"), width: active.width, maxWidth: "100%", minHeight: 320 }} onClick={() => setSelId(null)}>
                {active.elements.length === 0 ? (
                  <div className="ub-canvas-empty" data-drop="root">
                    <Plus size={32} />
                    <p style={{ fontWeight: 600, marginTop: 8 }}>Primero agrega un Contenedor / Fila de Layout</p>
                    <p style={{ fontSize: 12, opacity: 0.7 }}>o arrastra componentes desde la paleta izquierda</p>
                  </div>
                ) : (
                  active.elements.map((el: UIElement) => (
                    <div key={el.id} className={`ub-drop-zone${dropTarget === el.id ? " ub-drop-active" : ""}`} data-drop={el.id}>
                      <CanvasEl el={el} sel={selId} onSel={setSelId} depth={0} onAddInside={doAddInside} onAddAfter={doAddAfter} onUpdate={upd} onDelete={() => del()} onDuplicate={() => dup()} onMoveUp={() => moveUp()} onMoveDown={() => moveDown()} />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <PropsPanel el={sel} onUpdate={upd} onDelete={del} onDuplicate={dup} onMoveUp={moveUp} onMoveDown={moveDown} />
        </div>
      </div>

      <UIBuilderAiModal
        isOpen={genOpen}
        isGenerating={isGenerating}
        genText={genText}
        setGenText={setGenText}
        onClose={() => setGenOpen(false)}
        onApply={applyGen}
      />

      {drag && <div className="ub-drag-ghost" style={{ left: drag.x + 12, top: drag.y + 8 }}>{drag.label}</div>}
    </div>,
    document.body
  );
}
export default UIBuilderEditor;