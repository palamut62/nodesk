import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, UnderlineType,
} from 'docx';
import type { Note } from './types';

export function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function extractTextFromHtml(html: string): string {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  return temp.innerText || temp.textContent || '';
}

export function convertHtmlToMarkdown(html: string): string {
  let md = html;
  md = md.replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n');
  md = md.replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n');
  md = md.replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n');
  md = md.replace(/<ul data-type="taskList">/g, '<ul>');
  md = md.replace(/<li data-type="taskItem" data-checked="true">.*?<label>.*?<\/label><div>(.*?)<\/div><\/li>/gi, '- [x] $1\n');
  md = md.replace(/<li data-type="taskItem" data-checked="false">.*?<label>.*?<\/label><div>(.*?)<\/div><\/li>/gi, '- [ ] $1\n');
  md = md.replace(/<ul>/g, '\n');
  md = md.replace(/<\/ul>/g, '\n');
  md = md.replace(/<ol>/g, '\n');
  md = md.replace(/<\/ol>/g, '\n');
  md = md.replace(/<li>(.*?)<\/li>/gi, '- $1\n');
  md = md.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b>(.*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em>(.*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i>(.*?)<\/i>/gi, '*$1*');
  md = md.replace(/<u>(.*?)<\/u>/gi, '<u>$1</u>');
  md = md.replace(/<p>(.*?)<\/p>/gi, '$1\n\n');
  md = md.replace(/<[^>]*>?/gm, '');
  md = md.replace(/\n\s*\n\s*\n/g, '\n\n');
  return md.trim();
}

function htmlNodeToRuns(node: ChildNode): TextRun[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || '';
    if (!text) return [];
    return [new TextRun({ text })];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes).flatMap(htmlNodeToRuns);

  if (tag === 'br') return [new TextRun({ text: '', break: 1 })];

  const bold = ['strong', 'b'].includes(tag);
  const italics = ['em', 'i'].includes(tag);
  const underline = tag === 'u' ? { type: UnderlineType.SINGLE } : undefined;
  const strike = tag === 's' || tag === 'del';

  if (bold || italics || underline || strike) {
    return children.map(run => new TextRun({
      text: (run as { text?: string }).text ?? '',
      bold: bold || undefined,
      italics: italics || undefined,
      underline,
      strike: strike || undefined,
    }));
  }
  return children;
}

function htmlToParagraphs(html: string): Paragraph[] {
  const container = document.createElement('div');
  container.innerHTML = html;
  const paragraphs: Paragraph[] = [];

  const processNode = (node: ChildNode) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    const headingMap: Record<string, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
      h1: HeadingLevel.HEADING_1,
      h2: HeadingLevel.HEADING_2,
      h3: HeadingLevel.HEADING_3,
      h4: HeadingLevel.HEADING_4,
    };

    if (headingMap[tag]) {
      paragraphs.push(new Paragraph({
        heading: headingMap[tag],
        children: Array.from(el.childNodes).flatMap(htmlNodeToRuns),
      }));
    } else if (tag === 'p') {
      const runs = Array.from(el.childNodes).flatMap(htmlNodeToRuns);
      paragraphs.push(new Paragraph({
        children: runs.length ? runs : [new TextRun('')],
      }));
    } else if (tag === 'ul' || tag === 'ol') {
      Array.from(el.children).forEach((li, idx) => {
        const runs = Array.from(li.childNodes).flatMap(htmlNodeToRuns);
        paragraphs.push(new Paragraph({
          children: runs.length ? runs : [new TextRun('')],
          bullet: tag === 'ul' ? { level: 0 } : undefined,
          numbering: tag === 'ol' ? { reference: 'default-numbering', level: 0 } : undefined,
        }));
        void idx;
      });
    } else if (tag === 'blockquote') {
      const runs = Array.from(el.childNodes).flatMap(c =>
        c.nodeType === Node.ELEMENT_NODE ? Array.from((c as HTMLElement).childNodes).flatMap(htmlNodeToRuns) : htmlNodeToRuns(c)
      );
      paragraphs.push(new Paragraph({
        children: runs.length ? runs : [new TextRun('')],
        indent: { left: 720 },
        border: {
          left: { style: BorderStyle.THICK, size: 4, color: '888888', space: 4 },
        },
      }));
    } else {
      Array.from(el.childNodes).forEach(processNode);
    }
  };

  Array.from(container.childNodes).forEach(processNode);
  if (paragraphs.length === 0) {
    paragraphs.push(new Paragraph({ children: [new TextRun(extractTextFromHtml(html))] }));
  }
  return paragraphs;
}

export async function exportDocx(note: Note): Promise<void> {
  const paragraphs = htmlToParagraphs(note.content);
  const doc = new Document({
    numbering: {
      config: [{
        reference: 'default-numbering',
        levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.LEFT }],
      }],
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 1134, bottom: 1701, left: 1134, right: 1134 },
        },
      },
      children: [
        new Paragraph({
          heading: HeadingLevel.TITLE,
          children: [new TextRun({ text: note.title || 'Untitled', bold: true })],
        }),
        new Paragraph({ children: [new TextRun('')] }),
        ...paragraphs,
      ],
    }],
  });
  const blob = await Packer.toBlob(doc);
  downloadBlob(`${note.title || 'Untitled'}.docx`, blob);
}

export function exportAllNotesJson(notes: Note[]): void {
  const data = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), notes }, null, 2);
  downloadFile('nootle-backup.json', data, 'application/json');
}

export function importNotesFromJson(json: string): Note[] | null {
  try {
    const data = JSON.parse(json);
    if (Array.isArray(data)) return data as Note[];
    if (data && Array.isArray(data.notes)) return data.notes as Note[];
    return null;
  } catch {
    return null;
  }
}

export function noteToShareUrl(note: Note): string {
  const data = { title: note.title, content: note.content, tags: note.tags ?? [] };
  const encoded = btoa(encodeURIComponent(JSON.stringify(data)));
  const base = window.location.origin + window.location.pathname;
  return `${base}#share=${encoded}`;
}

export function parseShareUrl(): { title: string; content: string; tags: string[] } | null {
  const hash = window.location.hash;
  if (!hash.startsWith('#share=')) return null;
  try {
    const encoded = hash.slice(7);
    return JSON.parse(decodeURIComponent(atob(encoded)));
  } catch {
    return null;
  }
}
