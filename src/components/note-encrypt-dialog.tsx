import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useApp } from '@/lib/app-state';
import { useT } from '@/lib/use-t';
import { Note } from '@/lib/types';
import { Lock, Unlock, Eye, EyeOff } from 'lucide-react';
import { encryptText, decryptText } from '@/lib/crypto';
import { useToast } from '@/hooks/use-toast';

interface Props {
  note: Note;
  open: boolean;
  onClose: () => void;
}

export function NoteEncryptDialog({ note, open, onClose }: Props) {
  const { updateNote } = useApp();
  const t = useT();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLock = async () => {
    if (!password) return;
    if (password !== confirm) {
      toast({ title: t('encrypt.error.title'), description: t('encrypt.mismatch'), variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const encrypted = await encryptText(note.content, password);
      updateNote(note.id, { encrypted: true, encryptedContent: encrypted, content: '' });
      toast({ title: t('encrypt.success.lock'), description: t('encrypt.success.lock.desc') });
      setPassword('');
      setConfirm('');
      onClose();
    } catch {
      toast({ title: t('encrypt.error.title'), description: t('encrypt.error.fail'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async () => {
    if (!password) return;
    setLoading(true);
    try {
      const decrypted = await decryptText(note.encryptedContent!, password);
      updateNote(note.id, { encrypted: false, encryptedContent: undefined, content: decrypted });
      toast({ title: t('encrypt.success.unlock'), description: t('encrypt.success.unlock.desc') });
      setPassword('');
      onClose();
    } catch {
      toast({ title: t('encrypt.wrong.pass'), description: t('encrypt.enter.pass'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {note.encrypted ? <Unlock className="h-5 w-5 text-amber-500" /> : <Lock className="h-5 w-5" />}
            {note.encrypted ? t('encrypt.unlock.title') : t('encrypt.lock.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {note.encrypted ? t('encrypt.unlock.desc') : t('encrypt.lock.desc')}
          </p>

          <div className="space-y-3">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="w-full px-3 py-2 pr-9 text-sm border border-border rounded-md bg-background outline-none focus:ring-1 focus:ring-primary"
                placeholder={t('encrypt.password')}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (note.encrypted ? handleUnlock() : confirm ? handleLock() : undefined)}
              />
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword(v => !v)}
                type="button"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {!note.encrypted && (
              <input
                type={showPassword ? 'text' : 'password'}
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background outline-none focus:ring-1 focus:ring-primary"
                placeholder={t('encrypt.confirm.placeholder')}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLock()}
              />
            )}
          </div>

          <Button
            className="w-full"
            onClick={note.encrypted ? handleUnlock : handleLock}
            disabled={!password || loading || (!note.encrypted && !confirm)}
          >
            {loading ? (
              <span className="animate-spin mr-2">⟳</span>
            ) : note.encrypted ? (
              <><Unlock className="h-4 w-4 mr-2" />{t('encrypt.unlock')}</>
            ) : (
              <><Lock className="h-4 w-4 mr-2" />{t('encrypt.lock')}</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
