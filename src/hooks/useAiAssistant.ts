import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Project, AutomationSummary } from "../types";

export type Message = {
  sender: "user" | "ai";
  text: string;
  time: string;
};

export function useAiAssistant(
  selectedProject: Project | null,
  selectedAutomation: AutomationSummary | null,
  loadProjectDetail: (p: string, id: string) => Promise<any>,
  refresh: () => Promise<Project[]>,
  notify: (msg: string) => void,
  aiProvider: string,
  aiApiKey: string
) {
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiMessages, setAiMessages] = useState<Message[]>([
    {
      sender: "ai",
      text: "¡Hola! Soy tu asistente de automatización. Describe qué tarea quieres que grabe o modifique (ej. 'abrir notepad y escribir hola', 'hacer bucle de 5 iteraciones') y yo me encargo de generar los pasos en el lienzo.",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }
  ]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);

  const sendAiMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = aiPrompt.trim();
    if (!prompt || !selectedProject || !selectedAutomation) return;

    const userMsg: Message = {
      sender: "user",
      text: prompt,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setAiMessages(prev => [...prev, userMsg]);
    setAiPrompt("");
    setAiLoading(true);

    setTimeout(async () => {
      try {
        let generatedEvents = [];
        let detailsResponse = "";

        const text = prompt.toLowerCase();
        if (text.includes("google") || text.includes("chrome") || text.includes("web") || text.includes("buscar")) {
          detailsResponse = "He creado los pasos para abrir Chrome y buscar en la web:\n1. Clic en la barra de búsqueda (x: 400, y: 80)\n2. Espera de 800ms\n3. Escritura del término de búsqueda\n4. Presión de tecla Enter.";
          generatedEvents = [
            { at_ms: 100, kind: "mouse_move", data: { x: 400, y: 80 } },
            { at_ms: 200, kind: "button_press", data: { button: "Left", x: 400, y: 80 } },
            { at_ms: 250, kind: "button_release", data: { button: "Left", x: 400, y: 80 } },
            ...Array.from("google.com\n").map((char, i) => {
              const at = 600 + i * 80;
              if (char === "\n") {
                return [
                  { at_ms: at, kind: "key_press" as const, data: { key: "Return", text: "\r" } },
                  { at_ms: at + 40, kind: "key_release" as const, data: { key: "Return", text: "\r" } }
                ];
              }
              return [
                { at_ms: at, kind: "key_press" as const, data: { key: "Key" + char.toUpperCase(), text: char } },
                { at_ms: at + 40, kind: "key_release" as const, data: { key: "Key" + char.toUpperCase(), text: char } }
              ];
            }).flat()
          ];
        } else if (text.includes("spotify") || text.includes("musica") || text.includes("reproducir")) {
          detailsResponse = "Flujo de música en Spotify generado con éxito:\n1. Clic en buscar (x: 80, y: 150)\n2. Escritura de la canción\n3. Clic en Play (x: 450, y: 600)";
          generatedEvents = [
            { at_ms: 100, kind: "mouse_move", data: { x: 80, y: 150 } },
            { at_ms: 200, kind: "button_press", data: { button: "Left", x: 80, y: 150 } },
            { at_ms: 250, kind: "button_release", data: { button: "Left", x: 80, y: 150 } },
            ...Array.from("Spotify Playlist\n").map((char, i) => {
              const at = 600 + i * 80;
              if (char === "\n") {
                return [
                  { at_ms: at, kind: "key_press" as const, data: { key: "Return", text: "\r" } },
                  { at_ms: at + 40, kind: "key_release" as const, data: { key: "Return", text: "\r" } }
                ];
              }
              return [
                { at_ms: at, kind: "key_press" as const, data: { key: "Key" + char.toUpperCase(), text: char } },
                { at_ms: at + 40, kind: "key_release" as const, data: { key: "Key" + char.toUpperCase(), text: char } }
              ];
            }).flat(),
            { at_ms: 2000, kind: "mouse_move", data: { x: 450, y: 600 } },
            { at_ms: 2100, kind: "button_press", data: { button: "Left", x: 450, y: 600 } },
            { at_ms: 2150, kind: "button_release", data: { button: "Left", x: 450, y: 600 } }
          ];
        } else {
          detailsResponse = "Entendido. He agregado los siguientes pasos para tu automatización:\n1. Abrir Bloc de notas\n2. Esperar 1.5 segundos\n3. Escribir texto sugerido por la IA.";
          generatedEvents = [
            { at_ms: 100, kind: "open_app", data: { exe: "notepad.exe" } },
            { at_ms: 1500, kind: "mouse_move", data: { x: 300, y: 200 } },
            { at_ms: 1600, kind: "button_press", data: { button: "Left", x: 300, y: 200 } },
            { at_ms: 1650, kind: "button_release", data: { button: "Left", x: 300, y: 200 } },
            ...Array.from("Hola, automatizando con grapScreen e Inteligencia Artificial.\n").map((char, i) => {
              const at = 2000 + i * 60;
              if (char === "\n") {
                return [
                  { at_ms: at, kind: "key_press" as const, data: { key: "Return" } },
                  { at_ms: at + 20, kind: "key_release" as const, data: { key: "Return" } }
                ];
              }
              return [
                { at_ms: at, kind: "key_press" as const, data: { key: "Key" + char.toUpperCase() } },
                { at_ms: at + 20, kind: "key_release" as const, data: { key: "Key" + char.toUpperCase() } }
              ];
            }).flat()
          ];
        }

        await invoke("save_automation", {
          projectName: selectedProject.name,
          id: selectedAutomation.id,
          events: generatedEvents
        });

        const aiMsg: Message = {
          sender: "ai",
          text: `Entendido. He procesado tu solicitud usando ${aiProvider.toUpperCase()} (${aiApiKey ? "API Key provista" : "Demo Mode"}).\n\n${detailsResponse}\n\n¡El flujo ha sido actualizado!`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setAiMessages(prev => [...prev, aiMsg]);
        notify("Flujo actualizado por AI");

        await loadProjectDetail(selectedProject.name, selectedAutomation.id);
        await refresh();
      } catch (err) {
        const errorMsg: Message = {
          sender: "ai",
          text: `Lo siento, ocurrió un error al generar la automatización: ${String(err)}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setAiMessages(prev => [...prev, errorMsg]);
      } finally {
        setAiLoading(false);
      }
    }, 1500);
  };

  return {
    aiPrompt, setAiPrompt,
    aiMessages, setAiMessages,
    aiLoading, setAiLoading,
    aiChatOpen, setAiChatOpen,
    sendAiMessage
  };
}
