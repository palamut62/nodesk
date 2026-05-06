import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useApp } from '@/lib/app-state';
import { useT } from '@/lib/use-t';
import { Note } from '@/lib/types';
import { History, RotateCcw, Trash2, Save, Eye } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  note: Note;
  open: boolean;
  onClose: () => void;
}

function extractText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').slice(0, 200);
}

export function VersionHistoryDialog({ note, open, onClose }: Props) {
  const { saveVersion, restoreVersion, deleteVersion } = useApp();
  const t = useT();
  const [label, setLabel] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);

  const versions = [...(note.versionHistory ?? [])].reverse();
  const previewSnap = previewId ? versions.find(v => v.id === previewId) : null;

  const handleSave = () => {
    saveVersion(note.id, label.trim() || undefined);
    setLabel('');
  };

  const handleRestore = (versionId: string) => {
    if (window.confirm(t('version.restore.confirm'))) {
      restoreVersion(note.id, versionId);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {t('version.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-3">
          <input
            className="flex-1 px-3 py-1.5 text-sm border border-border rounded-md bg-background outline-none focus:ring-1 focus:ring-primary"
            placeholder={t('version.label.placeholder')}
            value={label}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
          <Button size="sm" onClick={handleSave} className="gap-1.5 shrink-0">
            <Save className="h-3.5 w-3.5" />
            {t('version.save')}
          </Button>
        </div>

        {previewSnap && (
          <div className="mb-3 p-3 bg-accent/30 border border-border rounded-lg text-sm">
            <div className="font-semibold mb-1 text-xs text-muted-foreground uppercase tracking-wide">
              {t('version.preview.label')}
            </div>
            <div className="font-medium mb-1">{previewSnap.title}</div>
            <div className="text-muted-foreground text-xs line-clamp-4">{extractText(previewSnap.content)}</div>
          </div>
        )}

        <ScrollArea className="flex-1">
          {versions.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              {t('version.empty')}
            </div>
          ) : (
            <div className="space-y-2 pr-2">
              {versions.map((v, i) => (
                <div key={v.id} className={`border rounded-lg p-3 transition-colors ${previewId === v.id ? 'border-primary/50 bg-accent/20' : 'border-border hover:border-border/80'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold">
                          {v.label || t('version.num', { n: versions.length - i })}
                        </span>
                        {i === 0 && (
                          <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                            {t('version.latest.badge')}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(v.savedAt), 'dd MMM yyyy HH:mm')}
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{v.title}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title={t('version.preview.hint')}
                        onClick={() => setPreviewId(previewId === v.id ? null : v.id)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-primary"
                        title={t('version.restore')}
                        onClick={() => handleRestore(v.id)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title={t('version.delete')}
                        onClick={() => deleteVersion(note.id, v.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
