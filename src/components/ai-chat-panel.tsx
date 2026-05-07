import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useApp } from '@/lib/app-state';
import { useT } from '@/lib/use-t';
import { Note } from '@/lib/types';
import { ChatMessage, chatWithNote, chatWithNoteStream, DEFAULT_AI_PROMPTS, getProviderApiKey, getProviderModel } from '@/lib/ai';
import { Bot, Send, Trash2, X, User, BookOpen, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function extractText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

/** Build a combined context string from all notes with per-note and total character limits. */
function buildAllNotesContext(notes: Note[]): string {
  const MAX_PER_NOTE = 800;
  const MAX_TOTAL = 10_000;
  const lines: string[] = [];

  for (const n of notes) {
    const body = extractText(n.content).trim();
    if (!body) continue;
    const truncated = body.length > MAX_PER_NOTE ? body.slice(0, MAX_PER_NOTE) + '…' : body;
    lines.push(`=== ${n.title || 'Başlıksız'} ===\n${truncated}`);
    if (lines.join('\n\n').length >= MAX_TOTAL) break;
  }

  return lines.join('\n\n');
}

interface Props {
  note: Note;
  notes: Note[];
  onClose: () => void;
}

type Scope = 'current' | 'all';

export function AiChatPanel({ note, notes, onClose }: Props) {
  const { settings } = useApp();
  const t = useT();
  const { toast } = useToast();
  const [scope, setScope] = useState<Scope>('current');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Clear conversation when switching scope or active note
  useEffect(() => { setMessages([]); }, [note.id, scope]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const apiKey = getProviderApiKey(settings);
    const model = getProviderModel(settings)?.trim();
    if (!apiKey?.trim() || !model) {
      toast({ title: t('ai.not.configured'), description: t('ai.not.configured.desc'), variant: 'destructive' });
      return;
    }

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      let noteContent: string;
      let customSystemPrompt: string | undefined;

      if (scope === 'all') {
        noteContent = buildAllNotesContext(notes);
        const lang = settings.language ?? 'tr';
        customSystemPrompt = lang === 'tr'
          ? DEFAULT_AI_PROMPTS.chatAllNotes
          : 'You are a note assistant. All the user\'s saved notes are provided below:\n\n{noteContent}\n\nAnswer questions based on these notes. Mention which note your answer comes from.';
      } else {
        noteContent = extractText(note.content);
        customSystemPrompt = settings.aiPrompts?.chat;
      }

      // Append empty assistant message that will be filled progressively
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      const streamed = await chatWithNoteStream(
        newMessages,
        noteContent,
        settings.provider,
        apiKey,
        model,
        (_delta, full) => {
          setMessages(prev => {
            const next = prev.slice();
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { ...last, content: full };
            }
            return next;
          });
        },
        settings.language ?? 'tr',
        customSystemPrompt,
      );

      // Bazı provider/model kombinasyonları stream yerine boş gövde dönebiliyor.
      if (!streamed?.trim()) {
        const fallback = await chatWithNote(
          newMessages,
          noteContent,
          settings.provider,
          apiKey,
          model,
          settings.language ?? 'tr',
          customSystemPrompt,
        );
        setMessages(prev => {
          const next = prev.slice();
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') {
            next[next.length - 1] = { ...last, content: fallback || t('ai.error') };
          }
          return next;
        });
      }
    } catch (err: unknown) {
      const msg = (err as Error).message ?? '';
      const is400 = msg.includes('(400)');
      toast({
        title: t('ai.error'),
        description: is400
          ? `${msg} — Ayarlardan model adını kontrol edin.`
          : msg,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const currentSuggestions = [t('ai.chat.q1'), t('ai.chat.q2'), t('ai.chat.q3')];
  const allSuggestions = [t('ai.chat.q4'), t('ai.chat.q5'), t('ai.chat.q6')];
  const suggestions = scope === 'all' ? allSuggestions : currentSuggestions;

  const placeholder = scope === 'all' ? t('ai.chat.placeholder.all') : t('ai.chat.placeholder');
  const emptyMsg = scope === 'all' ? t('ai.chat.empty.all') : t('ai.chat.empty');

  const notesWithContent = notes.filter(n => extractText(n.content).trim().length > 0);

  return (
    <div className="flex flex-col h-full border-l border-border bg-background" style={{ width: 300 }}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-border shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">{t('ai.chat.title')}</span>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <Button
                variant="ghost" size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={() => setMessages([])}
                title={t('ai.chat.clear')}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
            <Button
              variant="ghost" size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={onClose}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Scope toggle */}
        <div className="flex rounded-md overflow-hidden border border-border text-xs">
          <button
            className={`flex-1 flex items-center justify-center gap-1 py-1 transition-colors ${
              scope === 'current'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent/50 text-muted-foreground'
            }`}
            onClick={() => setScope('current')}
          >
            <FileText className="h-3 w-3" />
            {t('ai.chat.scope.current')}
          </button>
          <button
            className={`flex-1 flex items-center justify-center gap-1 py-1 transition-colors ${
              scope === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent/50 text-muted-foreground'
            }`}
            onClick={() => setScope('all')}
          >
            <BookOpen className="h-3 w-3" />
            {t('ai.chat.scope.all')}
            {scope === 'all' && notesWithContent.length > 0 && (
              <span className="opacity-70 ml-0.5">({notesWithContent.length})</span>
            )}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-xs text-muted-foreground mt-6 space-y-2">
            {scope === 'all'
              ? <BookOpen className="h-8 w-8 mx-auto opacity-30" />
              : <Bot className="h-8 w-8 mx-auto opacity-30" />
            }
            <p>{emptyMsg}</p>
            {scope === 'all' && notesWithContent.length > 0 && (
              <p className="text-[10px] opacity-60">{notesWithContent.length} not içeriği yüklendi</p>
            )}
            <div className="space-y-1 text-left mt-4">
              {suggestions.map(s => (
                <button
                  key={s}
                  className="w-full text-left px-2 py-1.5 text-xs rounded-md border border-border hover:bg-accent/50 transition-colors"
                  onClick={() => setInput(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-3 w-3 text-primary" />
              </div>
            )}
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-accent text-accent-foreground'
            }`}>
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <User className="h-3 w-3" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2 justify-start">
            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-3 w-3 text-primary" />
            </div>
            <div className="bg-accent rounded-lg px-3 py-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border shrink-0">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            className="flex-1 resize-none text-xs bg-accent/30 border border-border rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground min-h-[60px] max-h-[120px]"
            placeholder={placeholder}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
          />
          <Button
            size="icon"
            className="h-8 w-8 self-end shrink-0"
            onClick={handleSend}
            disabled={!input.trim() || loading}
            title={t('ai.chat.send')}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="text-[10px] text-muted-foreground/50 mt-1">{t('ai.chat.hint')}</div>
      </div>
    </div>
  );
}
