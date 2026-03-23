export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function titleCase(key: string): string {
  return key.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
