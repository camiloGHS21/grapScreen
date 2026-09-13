import { invoke } from "@tauri-apps/api/core";

export type VisualMatch = {
  found: boolean; template_id: string; confidence: number;
  x: number | null; y: number | null; width: number | null; height: number | null;
  scale: number | null; moved_px: number | null; clicked: boolean;
  elapsed_ms: number; strategy: string;
};

export const vision = {
  captureTemplate: (templateId: string, x: number, y: number, width: number, height: number) =>
    invoke("save_visual_template", { templateId, x, y, width, height }),
  importTemplate: (templateId: string, sourcePath: string) =>
    invoke("import_visual_template", { templateId, sourcePath }),
  listTemplates: () => invoke("list_visual_templates"),
  deleteTemplate: (templateId: string) => invoke("delete_visual_template", { templateId }),
  find: (templateId: string, expectedX?: number, expectedY?: number, click = false) =>
    invoke<VisualMatch>("find_visual_template", {
      templateId, threshold: 0.86, expectedX, expectedY,
      scales: [0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15], click
    })
};

// Recommended self-healing order:
// 1. original coordinates
// 2. vision.find(templateId, oldX, oldY, true)
// 3. ocr_recover_step for readable controls
// 4. pause and request human review