import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Project } from "../types";
import { safeName } from "../utils/text";

export function useRecording(
  selectedProject: Project | null,
  notify: (msg: string) => void,
  setBusy: (busy: boolean) => void
) {
  const [recording, setRecording] = useState(false);
  const [recordingNameOpen, setRecordingNameOpen] = useState(false);
  const [recordingName, setRecordingName] = useState("");
  const [emptyAutNameOpen, setEmptyAutNameOpen] = useState(false);
  const [mp4, setMp4] = useState(true);

  // Recording always keeps its visible controls. Foreground/background is a
  // playback choice owned by useExecution, not a way to hide the recorder.
  const startRecording = async () => {
    if (!selectedProject) return;
    const clean = safeName(recordingName);
    if (!clean) return;
    setBusy(true);
    setRecordingNameOpen(false);
    const prevName = recordingName;
    setRecordingName("");
    try {
      await invoke("start_recording", {
        projectName: selectedProject.name,
        automationName: clean,
        generateMp4: mp4
      });
      setRecording(true);
    } catch (e) {
      setRecordingNameOpen(true);
      setRecordingName(prevName);
      notify(String(e));
    } finally {
      setBusy(false);
    }
  };

  return {
    recording, setRecording,
    recordingNameOpen, setRecordingNameOpen,
    recordingName, setRecordingName,
    emptyAutNameOpen, setEmptyAutNameOpen,
    mp4, setMp4,
    startRecording
  };
}
