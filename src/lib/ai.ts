import type { AiProvider, Settings } from './types';

const PROVIDER_ENDPOINTS: Record<AiProvider, { chat: string; models: string; transcribe?: string }> = {
  openrouter: {
    chat: 'https://openrouter.ai/api/v1/chat/completions',
    models: 'https://openrouter.ai/api/v1/models',
    transcribe: 'https://openrouter.ai/api/v1/audio/transcriptions',
  },
  nvidia: {
    chat: 'https://integrate.api.nvidia.com/v1/chat/completions',
    models: 'https://integrate.api.nvidia.com/v1/models',
  },
  groq: {
    chat: 'https://api.groq.com/openai/v1/chat/completions',
    models: 'https://api.groq.com/openai/v1/models',
    transcribe: 'https://api.groq.com/openai/v1/audio/transcriptions',
  },
};

const OCR_MODEL = 'meta/llama-3.2-11b-vision-instruct';
const GROQ_TRANSCRIPTION_MODEL = 'whisper-large-v3-turbo';

export interface ProviderRunConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
}

function providerHeaders(
  provider: AiProvider,
  apiKey: string,
  contentType: 'json' | 'none' = 'json',
): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey.trim()}`,
  };
  if (contentType === 'json') headers['Content-Type'] = 'application/json';
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/umuti/nodesk';
    headers['X-Title'] = 'nodesk';
  }
  return headers;
}

function parseDataUrl(dataUrl: string): { mime: string; format: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return { mime: 'audio/webm', format: 'webm', base64: dataUrl };
  }
  const mime = match[1];
  const base64 = match[2];
  const format = mime.split('/')[1]?.toLowerCase() || 'webm';
  return { mime, format, base64 };
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = 30000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: init.signal ?? controller.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error('İstek zaman aşımına uğradı. Model yanıt vermedi, farklı model/provider deneyin.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function getProviderApiKey(settings: Settings): string {
  if (settings.provider === 'openrouter') return settings.openrouterApiKey;
  if (settings.provider === 'nvidia') return settings.nvidiaApiKey;
  return settings.groqApiKey;
}

export function getProviderModel(settings: Settings): string {
  if (settings.provider === 'openrouter') return settings.openrouterModel;
  if (settings.provider === 'nvidia') return settings.nvidiaModel;
  return settings.groqModel;
}

export function getProviderConfigs(settings: Settings): ProviderRunConfig[] {
  const all: ProviderRunConfig[] = [
    { provider: settings.provider, apiKey: getProviderApiKey(settings), model: getProviderModel(settings) },
    { provider: 'openrouter', apiKey: settings.openrouterApiKey, model: settings.openrouterModel },
    { provider: 'groq', apiKey: settings.groqApiKey, model: settings.groqModel || 'openai/gpt-oss-20b' },
    { provider: 'nvidia', apiKey: settings.nvidiaApiKey, model: settings.nvidiaModel },
  ];
  const seen = new Set<AiProvider>();
  return all.filter((c) => {
    if (seen.has(c.provider)) return false;
    seen.add(c.provider);
    return !!c.apiKey?.trim() && !!c.model?.trim();
  });
}

function isRetryableError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '').toLowerCase();
  return (
    msg.includes('429')
    || msg.includes('503')
    || msg.includes('502')
    || msg.includes('500')
    || msg.includes('zaman aşımı')
    || msg.includes('timeout')
    || msg.includes('network')
    || msg.includes('failed to fetch')
  );
}

export async function withProviderFallback<T>(
  settings: Settings,
  run: (cfg: ProviderRunConfig) => Promise<T>,
): Promise<T> {
  const configs = getProviderConfigs(settings);
  if (configs.length === 0) throw new Error('API anahtarı/model yapılandırması yok');

  let lastErr: unknown = null;
  for (let i = 0; i < configs.length; i++) {
    const cfg = configs[i];
    try {
      return await run(cfg);
    } catch (e) {
      lastErr = e;
      if (!isRetryableError(e) || i === configs.length - 1) break;
    }
  }
  throw lastErr ?? new Error('AI çağrısı başarısız');
}

function extractAssistantText(data: any): string {
  const msg = data?.choices?.[0]?.message;
  const content = msg?.content;
  if (typeof content === 'string' && content.trim()) return content;
  if (Array.isArray(content)) {
    const merged = content
      .map((p: any) => (typeof p === 'string' ? p : (p?.text ?? p?.content ?? '')))
      .filter(Boolean)
      .join(' ')
      .trim();
    if (merged) return merged;
  }
  if (typeof msg?.reasoning === 'string' && msg.reasoning.trim()) return msg.reasoning.trim();
  return '';
}

/** Extract a human-readable error message from any API error response shape. */
async function extractApiError(res: Response): Promise<string> {
  let detail = res.statusText;
  try {
    const j = await res.json();
    // OpenRouter: { error: { message, code } }  |  plain: { error: "string" }  |  { message: "..." }
    if (j?.error?.message) detail = j.error.message;
    else if (typeof j?.error === 'string') detail = j.error;
    else if (j?.message) detail = j.message;
    else if (j?.raw) detail = 'Beklenmedik yanıt formatı (streaming?). Stream desteklenmiyor.';
  } catch {}
  return detail;
}

export const DEFAULT_AI_PROMPTS = {
  fixText:
    'Lütfen aşağıdaki metni düzelt, yazım ve dilbilgisi hatalarını gider, ancak anlamı ve tonu koru:\n\n{text}',
  translate:
    'Aşağıdaki metni {targetLang} diline çevir. Yalnızca çevrilmiş metni döndür, açıklama veya ek bilgi ekleme. Metnin biçimlendirmesini (paragraflar, satır sonları vb.) koru:\n\n{text}',
  summarize:
    'Aşağıdaki metni 3-5 madde halinde özetle. Yalnızca özeti döndür:\n\n{text}',
  chat:
    'Sen bir not asistanısın. Kullanıcının notu:\n\n{noteContent}\n\nBu nota dayanarak soruları yanıtla.',
  chatAllNotes:
    'Sen bir not asistanısın. Kullanıcının kayıtlı tüm notları aşağıda verilmiştir:\n\n{noteContent}\n\nBu notlara dayanarak soruları yanıtla. Cevaplarında hangi nottan bilgi aldığını belirt.',
};

export function resizeImageForOcr(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1024;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width >= height) { height = Math.round((height * MAX) / width); width = MAX; }
        else                  { width = Math.round((width * MAX) / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export async function ocrImage(
  imageDataUrl: string,
  apiKey: string,
): Promise<string> {
  if (!apiKey) throw new Error('NVIDIA API key required');

  const compressed = await resizeImageForOcr(imageDataUrl);

  const response = await fetchWithTimeout(PROVIDER_ENDPOINTS.nvidia.chat, {
    method: 'POST',
    headers: providerHeaders('nvidia', apiKey),
    body: JSON.stringify({
      model: OCR_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'You are an OCR engine. Extract every word and character from this image exactly as written. Preserve the original layout: keep each line on its own line, preserve paragraph breaks as blank lines, and maintain indentation with spaces. Return ONLY the extracted text — no explanations, no markdown fences, no extra commentary.',
            },
            {
              type: 'image_url',
              image_url: { url: compressed },
            },
          ],
        },
      ],
      max_tokens: 2048,
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const detail = await extractApiError(response);
    throw new Error(`OCR Error (${response.status}): ${detail}`);
  }

  const data = await response.json();
  return extractAssistantText(data).trim();
}

export async function fixText(
  text: string,
  provider: AiProvider,
  apiKey: string,
  model: string,
  customPromptTemplate?: string,
): Promise<string> {
  if (!apiKey) throw new Error('API anahtarı gerekli');
  if (!model) throw new Error('Model seçimi gerekli');

  const template = customPromptTemplate || DEFAULT_AI_PROMPTS.fixText;
  const prompt = template.replace('{text}', text);

  const response = await fetchWithTimeout(PROVIDER_ENDPOINTS[provider].chat, {
    method: 'POST',
    headers: providerHeaders(provider, apiKey),
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
  });

  if (!response.ok) {
    const detail = await extractApiError(response);
    throw new Error(`API Hatası (${response.status}): ${detail}`);
  }

  const data = await response.json();
  return extractAssistantText(data) || text;
}

export async function translateText(
  text: string,
  provider: AiProvider,
  apiKey: string,
  model: string,
  targetLang = 'Türkçe',
  customPromptTemplate?: string,
): Promise<string> {
  if (!apiKey) throw new Error('API anahtarı gerekli');
  if (!model) throw new Error('Model seçimi gerekli');

  const template = customPromptTemplate || DEFAULT_AI_PROMPTS.translate;
  const prompt = template
    .replace('{targetLang}', targetLang)
    .replace('{text}', text);

  const response = await fetchWithTimeout(PROVIDER_ENDPOINTS[provider].chat, {
    method: 'POST',
    headers: providerHeaders(provider, apiKey),
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
  });

  if (!response.ok) {
    const detail = await extractApiError(response);
    throw new Error(`API Hatası (${response.status}): ${detail}`);
  }

  const data = await response.json();
  return extractAssistantText(data) || text;
}

export async function fixWord(
  word: string,
  provider: AiProvider,
  apiKey: string,
  model: string,
): Promise<string> {
  if (!apiKey || !model || !word.trim() || word.length < 2) return word;

  const prompt =
    `Aşağıdaki Türkçe kelimedeki yazım hatasını düzelt. Sadece düzeltilmiş kelimeyi döndür, başka hiçbir şey ekleme:\n\n${word}`;

  try {
    const response = await fetchWithTimeout(PROVIDER_ENDPOINTS[provider].chat, {
      method: 'POST',
      headers: providerHeaders(provider, apiKey),
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 20,
        temperature: 0,
      }),
    });
    if (!response.ok) return word;
    const data = await response.json();
    const result = (extractAssistantText(data) || '').trim();
    if (result && !result.includes('\n') && result.length <= word.length * 3) {
      return result.split(/\s+/)[0] || word;
    }
  } catch {}
  return word;
}

export async function fetchModels(
  provider: AiProvider,
  apiKey: string
): Promise<{ id: string; name: string }[]> {
  if (!apiKey) throw new Error('API anahtarı gerekli');

  const response = await fetchWithTimeout(PROVIDER_ENDPOINTS[provider].models, {
    method: 'GET',
    headers: providerHeaders(provider, apiKey, 'none'),
  });

  if (!response.ok) {
    const detail = await extractApiError(response);
    throw new Error(`Model listesi alınamadı (${response.status}): ${detail}`);
  }

  const data = await response.json();

  if (provider === 'openrouter' || provider === 'groq') {
    return (data.data || []).map((m: any) => ({ id: m.id, name: m.name || m.id }));
  } else {
    return (data.data || []).map((m: any) => ({ id: m.id, name: m.id }));
  }
}

export async function summarizeText(
  text: string,
  provider: AiProvider,
  apiKey: string,
  model: string,
  lang: 'tr' | 'en' = 'tr',
  customPromptTemplate?: string,
): Promise<string> {
  if (!apiKey) throw new Error('API anahtarı gerekli');
  if (!model) throw new Error('Model seçimi gerekli');

  const defaultTemplate = lang === 'tr'
    ? DEFAULT_AI_PROMPTS.summarize
    : 'Summarize the following text in 3-5 bullet points. Return only the summary:\n\n{text}';
  const template = customPromptTemplate || defaultTemplate;
  const prompt = template.replace('{text}', text);

  const response = await fetchWithTimeout(PROVIDER_ENDPOINTS[provider].chat, {
    method: 'POST',
    headers: providerHeaders(provider, apiKey),
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
  });

  if (!response.ok) {
    const detail = await extractApiError(response);
    throw new Error(`API Hatası (${response.status}): ${detail}`);
  }

  const data = await response.json();
  return extractAssistantText(data) || '';
}

export async function suggestTags(
  text: string,
  provider: AiProvider,
  apiKey: string,
  model: string,
  lang: 'tr' | 'en' = 'tr'
): Promise<string[]> {
  if (!apiKey) throw new Error('API anahtarı gerekli');
  if (!model) throw new Error('Model seçimi gerekli');

  const prompt = lang === 'tr'
    ? `Aşağıdaki nota uygun 3-5 adet etiket öner. Etiketler tek kelime veya kısa ifade olmalı. Sadece etiketleri virgülle ayrılmış şekilde döndür, başka hiçbir şey yazma:\n\n${text}`
    : `Suggest 3-5 tags for the following note. Tags should be single words or short phrases. Return only the tags, comma-separated, nothing else:\n\n${text}`;

  const response = await fetchWithTimeout(PROVIDER_ENDPOINTS[provider].chat, {
    method: 'POST',
    headers: providerHeaders(provider, apiKey),
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 100,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const detail = await extractApiError(response);
    throw new Error(`API Hatası (${response.status}): ${detail}`);
  }

  const data = await response.json();
  const raw = (extractAssistantText(data) || '').trim();
  return raw.split(',').map((t: string) => t.trim().toLowerCase()).filter((t: string) => t.length > 0);
}

/**
 * Transcribe an audio recording using OpenRouter's Whisper endpoint.
 * audioDataUrl can be a data-url or raw base64 string.
 */
export async function transcribeAudio(
  audioDataUrl: string,
  provider: AiProvider,
  apiKey: string,
): Promise<string> {
  if (!apiKey) throw new Error('API anahtarı gerekli');
  if (provider === 'nvidia') {
    throw new Error('Ses transkripsiyonu NVIDIA NIM için henüz desteklenmiyor. OpenRouter veya Groq seçin.');
  }

  let response: Response;
  const { mime, format, base64 } = parseDataUrl(audioDataUrl);
  if (provider === 'openrouter') {
    response = await fetchWithTimeout(PROVIDER_ENDPOINTS.openrouter.transcribe!, {
      method: 'POST',
      headers: providerHeaders('openrouter', apiKey),
      body: JSON.stringify({
        input_audio: { data: base64, format },
        model: 'openai/whisper-large-v3',
        language: 'tr',
      }),
    });
  } else {
    const blob = await fetch(audioDataUrl).then(r => r.blob());
    const ext = format || 'webm';
    const form = new FormData();
    form.append('file', blob, `audio.${ext}`);
    form.append('model', GROQ_TRANSCRIPTION_MODEL);
    form.append('language', 'tr');
    response = await fetchWithTimeout(PROVIDER_ENDPOINTS.groq.transcribe!, {
      method: 'POST',
      headers: providerHeaders('groq', apiKey, 'none'),
      body: form,
    });
  }

  if (!response.ok) {
    const detail = await extractApiError(response);
    throw new Error(`Transkripsiyon Hatası (${response.status}): ${detail}`);
  }

  const data = await response.json();
  return (data.text || '').trim();
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function chatWithNoteStream(
  messages: ChatMessage[],
  noteContent: string,
  provider: AiProvider,
  apiKey: string,
  model: string,
  onChunk: (deltaText: string, fullText: string) => void,
  lang: 'tr' | 'en' = 'tr',
  customSystemPrompt?: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!apiKey) throw new Error('API anahtarı gerekli');
  const trimmedModel = model.trim();
  if (!trimmedModel) throw new Error('Model seçimi gerekli');

  const defaultTemplate = lang === 'tr'
    ? DEFAULT_AI_PROMPTS.chat
    : 'You are a note assistant. The user\'s note is:\n\n{noteContent}\n\nAnswer questions based on this note.';
  const template = customSystemPrompt || defaultTemplate;
  const systemPrompt = template.replace('{noteContent}', noteContent);

  const controller = signal ? null : new AbortController();
  const timeout = controller ? setTimeout(() => controller.abort(), 35000) : null;

  const response = await fetchWithTimeout(PROVIDER_ENDPOINTS[provider].chat, {
    method: 'POST',
    headers: {
      ...providerHeaders(provider, apiKey.trim()),
      Accept: 'text/event-stream, application/json',
    },
    signal: signal ?? controller?.signal,
    body: JSON.stringify({
      model: trimmedModel,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    }),
  });
  if (timeout) clearTimeout(timeout);

  if (!response.ok) {
    const detail = await extractApiError(response);
    throw new Error(`API Hatası (${response.status}): ${detail} [model: ${trimmedModel}]`);
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => ({}));
    const fullJson = extractAssistantText(data) || '';
    if (fullJson) onChunk(fullJson, fullJson);
    return fullJson;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    // No stream body — fall back to JSON read
    const data = await response.json().catch(() => ({}));
    const full = extractAssistantText(data) || '';
    if (full) onChunk(full, full);
    return full;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE: split by lines, emit on blank-line boundaries
    let idx: number;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trimEnd();
      buffer = buffer.slice(idx + 1);
      if (!line || !line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return full;
      try {
        const j = JSON.parse(payload);
        const delta = j?.choices?.[0]?.delta?.content
          ?? j?.choices?.[0]?.message?.content
          ?? '';
        if (delta) {
          full += delta;
          onChunk(delta, full);
        }
      } catch {
        // ignore non-JSON keepalive comments etc.
      }
    }
  }
  if (!full && buffer.trim()) {
    try {
      const j = JSON.parse(buffer.trim());
      const fallback = extractAssistantText(j) || '';
      if (fallback) {
        onChunk(fallback, fallback);
        return fallback;
      }
    } catch {
      // non-JSON trailing payload
    }
  }
  return full;
}

export async function chatWithNote(
  messages: ChatMessage[],
  noteContent: string,
  provider: AiProvider,
  apiKey: string,
  model: string,
  lang: 'tr' | 'en' = 'tr',
  customSystemPrompt?: string,
): Promise<string> {
  if (!apiKey) throw new Error('API anahtarı gerekli');
  const trimmedModel = model.trim();
  if (!trimmedModel) throw new Error('Model seçimi gerekli');

  const defaultTemplate = lang === 'tr'
    ? DEFAULT_AI_PROMPTS.chat
    : 'You are a note assistant. The user\'s note is:\n\n{noteContent}\n\nAnswer questions based on this note.';
  const template = customSystemPrompt || defaultTemplate;
  const systemPrompt = template.replace('{noteContent}', noteContent);

  const response = await fetchWithTimeout(PROVIDER_ENDPOINTS[provider].chat, {
    method: 'POST',
    headers: providerHeaders(provider, apiKey.trim()),
    body: JSON.stringify({
      model: trimmedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    }),
  });

  if (!response.ok) {
    const detail = await extractApiError(response);
    throw new Error(`API Hatası (${response.status}): ${detail} [model: ${trimmedModel}]`);
  }

  const data = await response.json();
  return extractAssistantText(data) || '';
}
