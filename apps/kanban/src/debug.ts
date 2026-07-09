export function debugLog(message: string, details?: Record<string, unknown>): void {
  if (localStorage.getItem("exact.kanban.debug") !== "1") return;
  console.log(`[kanban] ${message}`, details ?? {});
}
