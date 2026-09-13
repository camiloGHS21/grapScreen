export function safeName(value: string): string {
  return value.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/[. ]+$/g, "").slice(0, 80);
}
