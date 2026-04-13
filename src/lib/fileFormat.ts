import { marked } from "marked";
import TurndownService from "turndown";
// @ts-ignore — type yok
import { gfm } from "turndown-plugin-gfm";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function txtToHtml(txt: string): string {
  const norm = txt.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const paragraphs = norm.split(/\n{2,}/);
  return paragraphs
    .map((p) => {
      if (!p.trim()) return "<p></p>";
      const lines = p.split("\n").map(escapeHtml).join("<br>");
      return `<p>${lines}</p>`;
    })
    .join("");
}

export function htmlToTxt(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  const out: string[] = [];
  const walk = (node: Node, prefix = "") => {
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) {
        out.push((n.textContent || "").replace(/\s+/g, " "));
      } else if (n.nodeType === 1) {
        const el = n as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (tag === "br") {
          out.push("\n");
        } else if (["p", "h1", "h2", "h3", "h4", "li", "blockquote", "pre"].includes(tag)) {
          if (tag === "li") {
            const isTask = el.getAttribute("data-type") === "taskItem";
            const checked = el.getAttribute("data-checked") === "true";
            out.push(isTask ? (checked ? "[x] " : "[ ] ") : "- ");
          }
          walk(el, prefix);
          out.push("\n\n");
        } else {
          walk(el, prefix);
        }
      }
    });
  };
  walk(div);
  return out
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Markdown → HTML: GFM task listelerini TipTap formatına çevir
export async function mdToHtml(md: string): Promise<string> {
  marked.setOptions({ gfm: true, breaks: false });
  let html = (await marked.parse(md)) as string;
  // Marked `<li><input ... disabled checked? type="checkbox">` üretir
  html = html.replace(
    /<ul>([\s\S]*?)<\/ul>/g,
    (match, inner: string) => {
      if (!/type="checkbox"/.test(inner)) return match;
      const items = inner.replace(
        /<li[^>]*>\s*<input[^>]*?(checked)?[^>]*type="checkbox"[^>]*>\s*([\s\S]*?)<\/li>/g,
        (_m, checked, content) =>
          `<li data-type="taskItem" data-checked="${checked ? "true" : "false"}"><p>${content.trim()}</p></li>`,
      );
      return `<ul data-type="taskList">${items}</ul>`;
    },
  );
  return html;
}

let _td: TurndownService | null = null;
function getTurndown(): TurndownService {
  if (_td) return _td;
  const td = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  });
  td.use(gfm);
  // TipTap task list
  td.addRule("taskList", {
    filter: (node: any) =>
      node.nodeName === "UL" && node.getAttribute("data-type") === "taskList",
    replacement: (_content: string, node: any) => {
      const items: string[] = [];
      node.childNodes.forEach((li: HTMLElement) => {
        if (li.nodeName !== "LI") return;
        const checked = li.getAttribute("data-checked") === "true";
        const text = (li.textContent || "").trim();
        items.push(`- [${checked ? "x" : " "}] ${text}`);
      });
      return "\n" + items.join("\n") + "\n";
    },
  });
  _td = td;
  return td;
}

export function htmlToMd(html: string): string {
  return getTurndown().turndown(html).trim() + "\n";
}
