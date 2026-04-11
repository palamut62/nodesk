// AI'dan gelen HTML'i temizler: ```html fence, baş/son boşluk, plain text fallback.
export function sanitizeAiHtml(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();
  // Bazı modeller baş/sonda "```" kalıntısı döndürür
  s = s.replace(/^```+/, "").replace(/```+$/, "").trim();
  if (!s) return "<p></p>";
  // HTML tag yoksa paragraf olarak sar
  if (!/<\w+[^>]*>/.test(s)) {
    return s
      .split(/\n+/)
      .map((l) => `<p>${escapeHtml(l)}</p>`)
      .join("");
  }
  return s;
}

function escapeHtml(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
