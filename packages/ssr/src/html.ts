export const voidElements = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"
]);

export function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

export function escapeAttrName(value: string): string {
  return /^[A-Za-z_:][A-Za-z0-9_:.-]*$/.test(value) ? value : "data-exact-invalid-attr";
}
