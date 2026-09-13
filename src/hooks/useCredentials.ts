import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export function useCredentials(notify: (msg: string) => void, setBusy: (busy: boolean) => void) {
  const [openaiKey, setOpenaiKey] = useState("");
  const [deepseekKey, setDeepseekKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [customAiUrl, setCustomAiUrl] = useState("http://localhost:11434/v1");
  const [customAiKey, setCustomAiKey] = useState("");
  const [customAiModel, setCustomAiModel] = useState("llama3");

  const [googleJson, setGoogleJson] = useState("");
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [whatsappToken, setWhatsappToken] = useState("");
  const [whatsappPhoneId, setWhatsappPhoneId] = useState("");

  useEffect(() => {
    invoke<any>("get_credentials")
      .then((creds) => {
        if (creds) {
          setOpenaiKey(creds.openai_key || "");
          setDeepseekKey(creds.deepseek_key || "");
          setGeminiKey(creds.gemini_key || "");
          setOpenrouterKey(creds.openrouter_key || "");
          setCustomAiUrl(creds.custom_ai_url || "http://localhost:11434/v1");
          setCustomAiKey(creds.custom_ai_key || "");
          setCustomAiModel(creds.custom_ai_model || "llama3");

          setGoogleJson(creds.google_service_account_json || "");
          setTelegramToken(creds.telegram_token || "");
          setTelegramChatId(creds.telegram_chat_id || "");
          setWhatsappToken(creds.whatsapp_token || "");
          setWhatsappPhoneId(creds.whatsapp_phone_id || "");
        }
      })
      .catch(console.error);
  }, []);

  const handleSaveCredentials = async (onSuccess: () => void) => {
    setBusy(true);
    try {
      const creds = {
        openai_key: openaiKey,
        deepseek_key: deepseekKey,
        gemini_key: geminiKey,
        openrouter_key: openrouterKey,
        custom_ai_url: customAiUrl,
        custom_ai_key: customAiKey,
        custom_ai_model: customAiModel,

        google_service_account_json: googleJson,
        telegram_token: telegramToken,
        telegram_chat_id: telegramChatId,
        whatsapp_token: whatsappToken,
        whatsapp_phone_id: whatsappPhoneId,
        google_token: "",
        ollama_url: customAiUrl
      };
      await invoke("save_credentials", { creds });
      notify("Credenciales e integraciones de IA guardadas");
      onSuccess();
    } catch (e) {
      notify("Error guardando credenciales: " + String(e));
    } finally {
      setBusy(false);
    }
  };

  return {
    openaiKey, setOpenaiKey,
    deepseekKey, setDeepseekKey,
    geminiKey, setGeminiKey,
    openrouterKey, setOpenrouterKey,
    customAiUrl, setCustomAiUrl,
    customAiKey, setCustomAiKey,
    customAiModel, setCustomAiModel,
    googleJson, setGoogleJson,
    telegramToken, setTelegramToken,
    telegramChatId, setTelegramChatId,
    whatsappToken, setWhatsappToken,
    whatsappPhoneId, setWhatsappPhoneId,
    handleSaveCredentials
  };
}
