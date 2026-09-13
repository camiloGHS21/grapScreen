export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(total / 60).toString().padStart(2, "0");
  const sec = (total % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}
