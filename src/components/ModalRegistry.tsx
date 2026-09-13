import React from "react";
import { CreateProjectModal } from "./../features/modals/CreateProjectModal";
import { CreateAutomationModal } from "./../features/modals/CreateAutomationModal";
import { StartRecordingModal } from "./../features/modals/StartRecordingModal";
import { CreateEmptyAutomationModal } from "./../features/modals/CreateEmptyAutomationModal";
import { CredentialsModal } from "./../features/modals/CredentialsModal";

interface ModalRegistryProps {
  busy: boolean;
  createOpen: boolean;
  setCreateOpen: (open: boolean) => void;
  createAutTypeOpen: boolean;
  setCreateAutTypeOpen: (open: boolean) => void;
  aiSettingsOpen: boolean;
  setAiSettingsOpen: (open: boolean) => void;
  aiProvider: string;
  setAiProvider: (provider: string) => void;
  projs: {
    selectedProject: any;
    createProject: (name: string, onSuccess: (folder: string) => void) => Promise<any>;
  };
  rec: {
    recordingNameOpen: boolean;
    recordingName: string;
    setRecordingName: (name: string) => void;
    mp4: boolean;
    setMp4: (mp4: boolean) => void;
    startRecording: () => Promise<void>;
    setRecordingNameOpen: (open: boolean) => void;
    emptyAutNameOpen: boolean;
    setEmptyAutNameOpen: (open: boolean) => void;
  };
  creds: {
    openaiKey: string;
    setOpenaiKey: (k: string) => void;
    deepseekKey: string;
    setDeepseekKey: (k: string) => void;
    geminiKey?: string;
    setGeminiKey?: (k: string) => void;
    openrouterKey?: string;
    setOpenrouterKey?: (k: string) => void;
    customAiUrl?: string;
    setCustomAiUrl?: (u: string) => void;
    customAiKey?: string;
    setCustomAiKey?: (k: string) => void;
    customAiModel?: string;
    setCustomAiModel?: (m: string) => void;
    googleJson: string;
    setGoogleJson: (j: string) => void;
    whatsappToken: string;
    setWhatsappToken: (t: string) => void;
    whatsappPhoneId: string;
    setWhatsappPhoneId: (id: string) => void;
    telegramToken: string;
    setTelegramToken: (t: string) => void;
    telegramChatId: string;
    setTelegramChatId: (id: string) => void;
    handleSaveCredentials: (onSuccess: () => void) => Promise<void>;
  };
  createEmptyAut: (name: string, onSuccess: () => void) => Promise<void>;
}

export function ModalRegistry({
  busy,
  createOpen,
  setCreateOpen,
  createAutTypeOpen,
  setCreateAutTypeOpen,
  aiSettingsOpen,
  setAiSettingsOpen,
  aiProvider,
  setAiProvider,
  projs,
  rec,
  creds,
  createEmptyAut,
}: ModalRegistryProps) {
  return (
    <>
      {createOpen && (
        <CreateProjectModal
          createProject={projs.createProject}
          setCreateOpen={setCreateOpen}
          busy={busy}
        />
      )}

      {createAutTypeOpen && (
        <CreateAutomationModal
          setCreateAutTypeOpen={setCreateAutTypeOpen}
          setRecordingNameOpen={rec.setRecordingNameOpen}
          setEmptyAutNameOpen={rec.setEmptyAutNameOpen}
        />
      )}

      {rec.recordingNameOpen && projs.selectedProject && (
        <StartRecordingModal
          selectedProject={projs.selectedProject}
          recordingName={rec.recordingName}
          setRecordingName={rec.setRecordingName}
          mp4={rec.mp4}
          setMp4={rec.setMp4}
          startRecording={rec.startRecording}
          setRecordingNameOpen={rec.setRecordingNameOpen}
          busy={busy}
        />
      )}

      {rec.emptyAutNameOpen && (
        <CreateEmptyAutomationModal
          emptyAutNameOpen={rec.emptyAutNameOpen}
          setEmptyAutNameOpen={rec.setEmptyAutNameOpen}
          busy={busy}
          createEmptyAut={createEmptyAut}
        />
      )}

      <CredentialsModal
        aiSettingsOpen={aiSettingsOpen}
        setAiSettingsOpen={setAiSettingsOpen}
        aiProvider={aiProvider}
        setAiProvider={setAiProvider}
        openaiKey={creds.openaiKey}
        setOpenaiKey={creds.setOpenaiKey}
        deepseekKey={creds.deepseekKey}
        setDeepseekKey={creds.setDeepseekKey}
        geminiKey={creds.geminiKey}
        setGeminiKey={creds.setGeminiKey}
        openrouterKey={creds.openrouterKey}
        setOpenrouterKey={creds.setOpenrouterKey}
        customAiUrl={creds.customAiUrl}
        setCustomAiUrl={creds.setCustomAiUrl}
        customAiKey={creds.customAiKey}
        setCustomAiKey={creds.setCustomAiKey}
        customAiModel={creds.customAiModel}
        setCustomAiModel={creds.setCustomAiModel}
        googleJson={creds.googleJson}
        setGoogleJson={creds.setGoogleJson}
        whatsappToken={creds.whatsappToken}
        setWhatsappToken={creds.setWhatsappToken}
        whatsappPhoneId={creds.whatsappPhoneId}
        setWhatsappPhoneId={creds.setWhatsappPhoneId}
        telegramToken={creds.telegramToken}
        setTelegramToken={creds.setTelegramToken}
        telegramChatId={creds.telegramChatId}
        setTelegramChatId={creds.setTelegramChatId}
        handleSaveCredentials={creds.handleSaveCredentials}
      />
    </>
  );
}
