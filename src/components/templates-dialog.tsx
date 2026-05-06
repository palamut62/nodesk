import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useApp } from '@/lib/app-state';
import { useT } from '@/lib/use-t';
import { LayoutTemplate } from 'lucide-react';
import type { Language } from '@/lib/types';

interface Template {
  id: string;
  titleKey: string;
  emoji: string;
  descKey: string;
  tags: string[];
  getContent: (lang: Language) => string;
}

const TEMPLATES: Template[] = [
  {
    id: 'meeting',
    titleKey: 'template.meeting',
    emoji: '🗓️',
    descKey: 'template.meeting.desc',
    tags: ['toplantı', 'meeting'],
    getContent: lang => lang === 'en'
      ? `<h1>Meeting Notes</h1>
<p><strong>Date:</strong> </p>
<p><strong>Attendees:</strong> </p>
<p><strong>Topic:</strong> </p>
<h2>Agenda</h2><ul><li><p></p></li></ul>
<h2>Discussion</h2><p></p>
<h2>Decisions</h2><ul><li><p></p></li></ul>
<h2>Action Items</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p> </p></li></ul>
<h2>Next Meeting</h2><p></p>`
      : `<h1>Toplantı Notu</h1>
<p><strong>Tarih:</strong> </p>
<p><strong>Katılımcılar:</strong> </p>
<p><strong>Konu:</strong> </p>
<h2>Gündem</h2><ul><li><p></p></li></ul>
<h2>Görüşülenler</h2><p></p>
<h2>Alınan Kararlar</h2><ul><li><p></p></li></ul>
<h2>Aksiyon Maddeleri</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p> </p></li></ul>
<h2>Sonraki Toplantı</h2><p></p>`,
  },
  {
    id: 'daily',
    titleKey: 'template.daily',
    emoji: '📔',
    descKey: 'template.daily.desc',
    tags: ['günlük', 'journal'],
    getContent: lang => lang === 'en'
      ? `<h1>Daily Journal</h1>
<p><em>Date: </em></p>
<h2>How am I feeling today?</h2><p></p>
<h2>What did I do today?</h2><ul><li><p></p></li></ul>
<h2>Gratitude</h2><ul><li><p></p></li><li><p></p></li><li><p></p></li></ul>
<h2>Goals for tomorrow</h2><ul><li><p></p></li></ul>
<h2>Notes</h2><p></p>`
      : `<h1>Günlük</h1>
<p><em>Tarih: </em></p>
<h2>Bugün nasıl hissediyorum?</h2><p></p>
<h2>Bugün neler yaptım?</h2><ul><li><p></p></li></ul>
<h2>Minnettarlıklar</h2><ul><li><p></p></li><li><p></p></li><li><p></p></li></ul>
<h2>Yarın için hedefler</h2><ul><li><p></p></li></ul>
<h2>Notlar</h2><p></p>`,
  },
  {
    id: 'todo',
    titleKey: 'template.todo',
    emoji: '✅',
    descKey: 'template.todo.desc',
    tags: ['yapılacak', 'todo', 'görev'],
    getContent: lang => lang === 'en'
      ? `<h1>To-Do List</h1>
<h2>🔴 Urgent</h2>
<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p> </p></li></ul>
<h2>🟡 Important</h2>
<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p> </p></li></ul>
<h2>🟢 Normal</h2>
<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p> </p></li></ul>
<h2>📋 Backlog</h2>
<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p> </p></li></ul>`
      : `<h1>Yapılacaklar</h1>
<h2>🔴 Acil</h2>
<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p> </p></li></ul>
<h2>🟡 Önemli</h2>
<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p> </p></li></ul>
<h2>🟢 Normal</h2>
<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p> </p></li></ul>
<h2>📋 Bekleyen</h2>
<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p> </p></li></ul>`,
  },
  {
    id: 'project',
    titleKey: 'template.project',
    emoji: '🚀',
    descKey: 'template.project.desc',
    tags: ['proje', 'project'],
    getContent: lang => lang === 'en'
      ? `<h1>Project Plan</h1>
<p><strong>Project Name:</strong> </p>
<p><strong>Start:</strong> &nbsp;&nbsp;<strong>End:</strong> </p>
<p><strong>Owner:</strong> </p>
<h2>Summary</h2><p></p>
<h2>Goals</h2><ul><li><p></p></li></ul>
<h2>Scope</h2><p></p>
<h2>Phases</h2>
<table><tbody>
  <tr><th>Phase</th><th>Start</th><th>End</th><th>Status</th></tr>
  <tr><td>1. Research</td><td></td><td></td><td></td></tr>
  <tr><td>2. Development</td><td></td><td></td><td></td></tr>
  <tr><td>3. Testing</td><td></td><td></td><td></td></tr>
  <tr><td>4. Release</td><td></td><td></td><td></td></tr>
</tbody></table>
<h2>Risks</h2><ul><li><p></p></li></ul>
<h2>Notes</h2><p></p>`
      : `<h1>Proje Planı</h1>
<p><strong>Proje Adı:</strong> </p>
<p><strong>Başlangıç:</strong> &nbsp;&nbsp;<strong>Bitiş:</strong> </p>
<p><strong>Sorumlu:</strong> </p>
<h2>Proje Özeti</h2><p></p>
<h2>Hedefler</h2><ul><li><p></p></li></ul>
<h2>Kapsam</h2><p></p>
<h2>Aşamalar</h2>
<table><tbody>
  <tr><th>Aşama</th><th>Başlangıç</th><th>Bitiş</th><th>Durum</th></tr>
  <tr><td>1. Araştırma</td><td></td><td></td><td></td></tr>
  <tr><td>2. Geliştirme</td><td></td><td></td><td></td></tr>
  <tr><td>3. Test</td><td></td><td></td><td></td></tr>
  <tr><td>4. Yayın</td><td></td><td></td><td></td></tr>
</tbody></table>
<h2>Riskler</h2><ul><li><p></p></li></ul>
<h2>Notlar</h2><p></p>`,
  },
  {
    id: 'brainstorm',
    titleKey: 'template.brainstorm',
    emoji: '💡',
    descKey: 'template.brainstorm.desc',
    tags: ['fikir', 'idea'],
    getContent: lang => lang === 'en'
      ? `<h1>Brainstorm: </h1>
<p><em>Topic: </em></p>
<h2>Main Idea</h2><blockquote><p></p></blockquote>
<h2>Ideas</h2><ul><li><p></p></li><li><p></p></li><li><p></p></li></ul>
<h2>Pros &amp; Cons</h2>
<table><tbody>
  <tr><th>Pros ✅</th><th>Cons ❌</th></tr>
  <tr><td></td><td></td></tr>
  <tr><td></td><td></td></tr>
</tbody></table>
<h2>Conclusion</h2><p></p>`
      : `<h1>Beyin Fırtınası: </h1>
<p><em>Konu: </em></p>
<h2>Ana Fikir</h2><blockquote><p></p></blockquote>
<h2>Fikirler</h2><ul><li><p></p></li><li><p></p></li><li><p></p></li></ul>
<h2>Artılar &amp; Eksiler</h2>
<table><tbody>
  <tr><th>Artılar ✅</th><th>Eksiler ❌</th></tr>
  <tr><td></td><td></td></tr>
  <tr><td></td><td></td></tr>
</tbody></table>
<h2>Sonuç &amp; Karar</h2><p></p>`,
  },
  {
    id: 'weekly',
    titleKey: 'template.weekly',
    emoji: '📊',
    descKey: 'template.weekly.desc',
    tags: ['haftalık', 'weekly', 'özet'],
    getContent: lang => lang === 'en'
      ? `<h1>Weekly Summary</h1>
<p><strong>Week:</strong> </p>
<h2>Completed This Week</h2>
<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p> </p></li></ul>
<h2>Not Completed</h2><ul><li><p></p></li></ul>
<h2>What I Learned</h2><ul><li><p></p></li></ul>
<h2>Challenges</h2><p></p>
<h2>Goals for Next Week</h2>
<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p> </p></li></ul>
<h2>Metrics</h2>
<table><tbody>
  <tr><th>Metric</th><th>Target</th><th>Actual</th></tr>
  <tr><td></td><td></td><td></td></tr>
</tbody></table>`
      : `<h1>Haftalık Özet</h1>
<p><strong>Hafta:</strong> </p>
<h2>Bu Hafta Tamamlananlar</h2>
<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p> </p></li></ul>
<h2>Bu Hafta Tamamlanamadı</h2><ul><li><p></p></li></ul>
<h2>Öğrendiklerim</h2><ul><li><p></p></li></ul>
<h2>Zorluklar</h2><p></p>
<h2>Gelecek Hafta Hedefleri</h2>
<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p> </p></li></ul>
<h2>Metrikler</h2>
<table><tbody>
  <tr><th>Metrik</th><th>Hedef</th><th>Gerçekleşen</th></tr>
  <tr><td></td><td></td><td></td></tr>
</tbody></table>`,
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function TemplatesDialog({ open, onClose }: Props) {
  const { createNote, settings, activeFolderId } = useApp();
  const t = useT();
  const lang = settings.language ?? 'tr';
  const [selected, setSelected] = useState<string | null>(null);

  const handleUse = (template: Template) => {
    const title = t(template.titleKey as Parameters<typeof t>[0]);
    createNote({ title, content: template.getContent(lang), tags: template.tags, folderId: activeFolderId && activeFolderId !== 'unfiled' ? activeFolderId : undefined });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5" />
            {t('template.title')}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 mt-2">
          {TEMPLATES.map(tmpl => (
            <div
              key={tmpl.id}
              className={`border rounded-lg p-4 cursor-pointer transition-all hover:border-primary/50 hover:bg-accent/30 ${
                selected === tmpl.id ? 'border-primary bg-accent/50' : 'border-border'
              }`}
              onClick={() => setSelected(tmpl.id)}
            >
              <div className="text-2xl mb-2">{tmpl.emoji}</div>
              <div className="font-semibold text-sm mb-1">{t(tmpl.titleKey as Parameters<typeof t>[0])}</div>
              <div className="text-xs text-muted-foreground mb-3 line-clamp-2">{t(tmpl.descKey as Parameters<typeof t>[0])}</div>
              <Button
                size="sm"
                className="w-full h-7 text-xs"
                variant={selected === tmpl.id ? 'default' : 'outline'}
                onClick={e => { e.stopPropagation(); handleUse(tmpl); }}
              >
                {t('template.use')}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TemplatesButton() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        title={t('template.button.title')}
        onClick={() => setOpen(true)}
      >
        <LayoutTemplate className="h-3.5 w-3.5" />
      </Button>
      <TemplatesDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
