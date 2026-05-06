import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useApp } from '@/lib/app-state';
import { useT } from '@/lib/use-t';
import { Note, AudioClip } from '@/lib/types';
import { Mic, Square, Play, Pause, Trash2, MicOff, Wand2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Editor } from '@tiptap/react';
import { transcribeAudio, fixText, getProviderApiKey, getProviderModel } from '@/lib/ai';

interface Props {
  note: Note;
  open: boolean;
  onClose: () => void;
  editor?: Editor | null;
}

type TranscribeState = 'idle' | 'transcribing' | 'fixing' | 'done' | 'error';

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function AudioPlayer({ clip }: { clip: AudioClip }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(clip.dataUrl);
    audioRef.current = audio;
    audio.addEventListener('ended', () => { setPlaying(false); setProgress(0); });
    audio.addEventListener('timeupdate', () => {
      if (audio.duration) setProgress(audio.currentTime / audio.duration);
    });
    return () => { audio.pause(); audio.remove(); };
  }, [clip.dataUrl]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play(); setPlaying(true); }
  };

  return (
    <div className="flex items-center gap-2">
      <button onClick={toggle} className="text-primary hover:text-primary/70 shrink-0">
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress * 100}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0">{formatDuration(clip.duration)}</span>
    </div>
  );
}

function insertAfterLastEmptyLine(editor: Editor, text: string) {
  const doc = editor.state.doc;
  let lastEmptyPos = -1;

  doc.forEach((node, pos) => {
    if (node.type.name === 'paragraph' && node.content.size === 0) {
      lastEmptyPos = pos + node.nodeSize;
    }
  });

  if (lastEmptyPos !== -1) {
    editor.chain().focus().setTextSelection(lastEmptyPos).insertContent(`<p>${text}</p>`).run();
  } else {
    const endPos = doc.content.size;
    editor.chain().focus().setTextSelection(endPos - 1).insertContent(`<p></p><p>${text}</p>`).run();
  }
}

export function VoiceRecorderDialog({ note, open, onClose, editor }: Props) {
  const { updateNote, settings } = useApp();
  const t = useT();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [supported, setSupported] = useState(true);
  const [transcribeStates, setTranscribeStates] = useState<Record<string, TranscribeState>>({});
  const [transcribeErrors, setTranscribeErrors] = useState<Record<string, string>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) setSupported(false);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          const clip: AudioClip = {
            id: crypto.randomUUID(),
            name: `${t('voice.record')} ${format(new Date(), 'dd.MM.yyyy HH:mm')}`,
            dataUrl: reader.result as string,
            duration: elapsed,
            createdAt: new Date().toISOString(),
          };
          const clips = [...(note.audioClips ?? []), clip];
          updateNote(note.id, { audioClips: clips });
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(tr => tr.stop());
      };

      mr.start();
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } catch {
      setSupported(false);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
  };

  const deleteClip = (clipId: string) => {
    updateNote(note.id, { audioClips: (note.audioClips ?? []).filter(c => c.id !== clipId) });
    setTranscribeStates(prev => { const s = { ...prev }; delete s[clipId]; return s; });
    setTranscribeErrors(prev => { const s = { ...prev }; delete s[clipId]; return s; });
  };

  const handleTranscribe = async (clip: AudioClip) => {
    const provider = settings.provider ?? 'openrouter';
    const apiKey = getProviderApiKey(settings);
    const model = getProviderModel(settings);

    if (!apiKey) {
      setTranscribeStates(prev => ({ ...prev, [clip.id]: 'error' }));
      setTranscribeErrors(prev => ({ ...prev, [clip.id]: t('voice.no.api.key') }));
      return;
    }
    if (provider === 'nvidia') {
      setTranscribeStates(prev => ({ ...prev, [clip.id]: 'error' }));
      setTranscribeErrors(prev => ({ ...prev, [clip.id]: t('voice.openrouter.only') }));
      return;
    }

    try {
      setTranscribeStates(prev => ({ ...prev, [clip.id]: 'transcribing' }));
      setTranscribeErrors(prev => { const s = { ...prev }; delete s[clip.id]; return s; });

      const rawText = await transcribeAudio(clip.dataUrl, provider, apiKey);

      setTranscribeStates(prev => ({ ...prev, [clip.id]: 'fixing' }));

      const fixedText = model
        ? await fixText(rawText, provider, apiKey, model)
        : rawText;

      if (editor) {
        insertAfterLastEmptyLine(editor, fixedText);
      }

      setTranscribeStates(prev => ({ ...prev, [clip.id]: 'done' }));
      setTimeout(() => setTranscribeStates(prev => ({ ...prev, [clip.id]: 'idle' })), 3000);
    } catch (err: any) {
      setTranscribeStates(prev => ({ ...prev, [clip.id]: 'error' }));
      setTranscribeErrors(prev => ({ ...prev, [clip.id]: err.message || t('voice.transcribe.error') }));
    }
  };

  const clips = note.audioClips ?? [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-primary" />
            {t('voice.clips')}
          </DialogTitle>
        </DialogHeader>

        {!supported ? (
          <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
            <MicOff className="h-8 w-8 opacity-30" />
            <p>{t('voice.unsupported')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-4">
              {recording ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-sm font-mono text-red-500">{formatDuration(elapsed)}</span>
                  </div>
                  <Button variant="destructive" size="sm" onClick={stopRecording} className="gap-2">
                    <Square className="h-3.5 w-3.5" />
                    {t('voice.stop')}
                  </Button>
                </>
              ) : (
                <Button onClick={startRecording} className="gap-2">
                  <Mic className="h-4 w-4" />
                  {t('voice.record')}
                </Button>
              )}
            </div>

            {clips.length > 0 && (
              <div className="border-t border-border pt-3 space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  {t('voice.recordings')}
                </div>
                {clips.map(clip => {
                  const state: TranscribeState = transcribeStates[clip.id] ?? 'idle';
                  const errMsg = transcribeErrors[clip.id];
                  const busy = state === 'transcribing' || state === 'fixing';
                  return (
                    <div key={clip.id} className="border border-border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium truncate flex-1">{clip.name}</span>
                        <button
                          onClick={() => deleteClip(clip.id)}
                          className="text-muted-foreground hover:text-destructive ml-2 shrink-0"
                          title={t('voice.delete')}
                          disabled={busy}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <AudioPlayer clip={clip} />

                      {/* Transcribe button + status */}
                      {editor && (
                        <div className="pt-1">
                          {state === 'idle' && (
                            <button
                              onClick={() => handleTranscribe(clip)}
                              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs rounded border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
                            >
                              <Wand2 className="h-3 w-3" />
                              {t('voice.transcribe')}
                            </button>
                          )}
                          {busy && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              {state === 'transcribing' ? t('voice.transcribing') : t('voice.ai.fixing')}
                            </div>
                          )}
                          {state === 'done' && (
                            <div className="flex items-center gap-1.5 text-xs text-green-600">
                              <CheckCircle2 className="h-3 w-3" />
                              {t('voice.inserted')}
                            </div>
                          )}
                          {state === 'error' && (
                            <div className="space-y-1">
                              <div className="flex items-start gap-1.5 text-xs text-destructive">
                                <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                                <span>{errMsg || t('voice.transcribe.error')}</span>
                              </div>
                              <button
                                onClick={() => setTranscribeStates(prev => ({ ...prev, [clip.id]: 'idle' }))}
                                className="text-xs text-muted-foreground underline hover:text-foreground"
                              >
                                Tekrar dene
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {clips.length === 0 && !recording && (
              <p className="text-center text-xs text-muted-foreground pb-2">{t('voice.no.clips')}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
