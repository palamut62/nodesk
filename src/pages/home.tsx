import { useRef, useState, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useApp } from '@/lib/app-state';
import { useT } from '@/lib/use-t';
import { PinnableActionId, AppView } from '@/lib/types';
import { TabBar } from '@/components/tab-bar';
import { NoteEditor } from '@/components/editor/note-editor';
import { SettingsDialog } from '@/components/settings-dialog';
import { PrintPreview } from '@/components/print-preview';
import { TagBar } from '@/components/tag-bar';
import { ClipboardHistoryBtn, useClipboardHistory } from '@/components/clipboard-history';
import { KanbanView } from '@/components/kanban-view';
import { CalendarView } from '@/components/calendar-view';
import { TemplatesButton } from '@/components/templates-dialog';
import { Sidebar } from '@/components/sidebar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Download, FileText, Printer, FolderOpen, Eye,
  FileDown, Link, Filter, MoreHorizontal, Check, Pin, PinOff,
  LayoutGrid, Calendar, FileEdit, PanelLeftClose, PanelLeftOpen,
  DatabaseBackup, Upload,
} from 'lucide-react';
import { downloadFile, extractTextFromHtml, convertHtmlToMarkdown, exportDocx, noteToShareUrl, parseShareUrl, exportAllNotesJson, importNotesFromJson } from '@/lib/export';
import mammoth from 'mammoth';

const VIEW_ICONS: Record<AppView, React.ElementType> = {
  editor: FileEdit,
  kanban: LayoutGrid,
  calendar: Calendar,
};


export function Home() {
  const { notes, activeNoteId, createNote, updateNote, settings, updateSettings, currentView, setCurrentView, importNotes, activeFolderId } = useApp();
  const t = useT();
  const activeNote = notes.find(n => n.id === activeNoteId) || null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonImportRef = useRef<HTMLInputElement>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const clipboardHistory = useClipboardHistory();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      if (window.innerWidth < 768) return false;
      return localStorage.getItem('notlar-sidebar-open') !== 'false';
    } catch { return true; }
  });

  const toggleSidebar = () => {
    setSidebarOpen(v => {
      const next = !v;
      if (!isMobile) {
        try { localStorage.setItem('notlar-sidebar-open', String(next)); } catch {}
      }
      return next;
    });
  };

  const prevNoteIdRef = useRef(activeNoteId);
  useEffect(() => {
    if (isMobile && activeNoteId && activeNoteId !== prevNoteIdRef.current) {
      setSidebarOpen(false);
    }
    prevNoteIdRef.current = activeNoteId;
  }, [activeNoteId, isMobile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); toggleSidebar(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const base = t('app.title');
    document.title = activeNote?.title ? `${activeNote.title} — ${base}` : base;
  }, [settings.language, activeNote?.title]);

  const pinnedActions: PinnableActionId[] = settings.pinnedActions ?? [];

  const togglePin = (id: PinnableActionId) => {
    const next = pinnedActions.includes(id)
      ? pinnedActions.filter(a => a !== id)
      : [...pinnedActions, id];
    updateSettings({ pinnedActions: next });
  };

  const allTags = Array.from(new Set(notes.flatMap(n => n.tags ?? [])));
  const visibleNotes = filterTag ? notes.filter(n => (n.tags ?? []).includes(filterTag)) : notes;

  useEffect(() => {
    const shared = parseShareUrl();
    if (shared) {
      const confirmed = window.confirm(t('share.import.confirm', { title: shared.title || t('share.note.title') }));
      if (confirmed) {
        createNote({ title: shared.title, content: shared.content, tags: shared.tags });
      }
      window.location.hash = '';
    }
  }, []);

  const handleSaveTxt = () => {
    if (!activeNote) return;
    downloadFile(`${activeNote.title || 'Untitled'}.txt`, extractTextFromHtml(activeNote.content), 'text/plain');
  };

  const handleSaveMd = () => {
    if (!activeNote) return;
    downloadFile(`${activeNote.title || 'Untitled'}.md`, convertHtmlToMarkdown(activeNote.content), 'text/markdown');
  };

  const handleSaveDocx = async () => {
    if (!activeNote) return;
    await exportDocx(activeNote);
  };

  const handleOpenFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const shortenTitle = (raw: string) => {
      const trimmed = raw.trim().replace(/[_\-]+/g, ' ');
      const words = trimmed.split(/\s+/).filter(Boolean).slice(0, 2);
      let out = words.join(' ');
      const MAX = 24;
      if (out.length > MAX) out = out.slice(0, MAX).trimEnd() + '…';
      return out || 'Not';
    };

    if (file.name.toLowerCase().endsWith('.docx')) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      const title = shortenTitle(file.name.replace(/\.docx$/i, ''));
      createNote({ title, content: result.value, folderId: activeFolderId && activeFolderId !== 'unfiled' ? activeFolderId : undefined });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const raw = reader.result as string;
      const title = shortenTitle(file.name.replace(/\.(txt|md)$/i, ''));
      const content = raw
        .split('\n')
        .map(line => `<p>${line || '<br>'}</p>`)
        .join('');
      createNote({ title, content, folderId: activeFolderId && activeFolderId !== 'unfiled' ? activeFolderId : undefined });
    };
    reader.readAsText(file);
  };

  const handleExportJson = () => {
    exportAllNotesJson(notes);
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const text = await file.text();
    const imported = importNotesFromJson(text);
    if (!imported) {
      alert(t('import.invalid'));
      return;
    }
    const confirmed = window.confirm(t('import.confirm', { n: String(imported.length) }));
    if (confirmed) {
      importNotes(imported);
    }
  };

  const handleShare = async () => {
    if (!activeNote) return;
    const url = noteToShareUrl(activeNote);
    await navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  type ActionDef = {
    id: PinnableActionId;
    Icon: React.ElementType;
    label: string;
    ext?: string;
    requiresNote: boolean;
    handler: () => void;
  };

  const actionDefs: ActionDef[] = [
    { id: 'open-file', Icon: FolderOpen, label: t('menu.open.file'), ext: '.txt .md .docx', requiresNote: false, handler: () => fileInputRef.current?.click() },
    { id: 'save-txt', Icon: FileText, label: t('menu.save.txt'), ext: '.txt', requiresNote: true, handler: handleSaveTxt },
    { id: 'save-md', Icon: Download, label: t('menu.save.md'), ext: '.md', requiresNote: true, handler: handleSaveMd },
    { id: 'save-docx', Icon: FileDown, label: t('menu.save.docx'), ext: '.docx', requiresNote: true, handler: handleSaveDocx },
    { id: 'share', Icon: shareCopied ? Check : Link, label: shareCopied ? t('menu.link.copied') : t('menu.copy.link'), requiresNote: true, handler: handleShare },
    { id: 'print-preview', Icon: Eye, label: t('menu.print.preview'), requiresNote: true, handler: () => setShowPrintPreview(true) },
    { id: 'print-pdf', Icon: Printer, label: t('menu.print.pdf'), requiresNote: true, handler: () => window.print() },
  ];

  const groupedActions = [
    { groupLabel: t('menu.import'),       ids: ['open-file'] },
    { groupLabel: t('menu.export'),       ids: ['save-txt', 'save-md', 'save-docx'] },
    { groupLabel: t('menu.share.section'), ids: ['share', 'print-preview', 'print-pdf'] },
  ] as const;

  const pinnedDefs = actionDefs.filter(a => pinnedActions.includes(a.id));

  const showSidebar = currentView === 'editor';

  return (
    <div className="app-root" style={{ flexDirection: 'column' }}>
      <div className="app-menubar">
        <div className="flex items-center gap-1.5">
          {currentView === 'editor' && (
            <button
              onClick={toggleSidebar}
              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              title={sidebarOpen ? t('menu.sidebar.hide') : t('menu.sidebar.show')}
            >
              {sidebarOpen
                ? <PanelLeftClose className="h-3.5 w-3.5" />
                : <PanelLeftOpen className="h-3.5 w-3.5" />}
            </button>
          )}
          <span className="app-title">{t('app.title')}</span>
        </div>
        <div className="app-actions">
          <input ref={fileInputRef} type="file" accept=".txt,.md,.docx" className="hidden" onChange={handleOpenFile} />
          <input ref={jsonImportRef} type="file" accept=".json" className="hidden" onChange={handleImportJson} />

          {/* View switcher */}
          <div className="flex items-center gap-0.5 mr-1 border border-border rounded-md p-0.5 bg-muted/30">
            {(['editor', 'kanban', 'calendar'] as AppView[]).map(view => {
              const Icon = VIEW_ICONS[view];
              return (
                <button
                  key={view}
                  onClick={() => setCurrentView(view)}
                  className={`h-6 w-6 flex items-center justify-center rounded transition-colors ${
                    currentView === view
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title={view === 'editor' ? t('view.editor') : view === 'kanban' ? t('view.kanban') : t('view.calendar')}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>

          <ClipboardHistoryBtn history={clipboardHistory} />
          <TemplatesButton />

          {pinnedDefs.map(({ id, Icon, label, requiresNote, handler }) => (
            <Button
              key={id}
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title={label}
              disabled={requiresNote && !activeNote}
              onClick={handler}
            >
              <Icon className="h-3.5 w-3.5" />
            </Button>
          ))}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title={t('menu.import')}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {groupedActions.map((group, gi) => (
                <span key={group.groupLabel}>
                  {gi > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal pb-1">
                    {group.groupLabel}
                  </DropdownMenuLabel>
                  {group.ids.map(id => {
                    const def = actionDefs.find(a => a.id === id)!;
                    const pinned = pinnedActions.includes(id);
                    return (
                      <DropdownMenuItem
                        key={id}
                        disabled={def.requiresNote && !activeNote}
                        onSelect={def.handler}
                        className="flex items-center gap-2 pr-1"
                      >
                        <def.Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="flex-1 min-w-0 truncate">{def.label}</span>
                        {def.ext && <span className="text-[10px] text-muted-foreground shrink-0">{def.ext}</span>}
                        <button
                          className={`ml-1 p-1 rounded transition-colors shrink-0 ${pinned ? 'text-primary hover:text-primary/70' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
                          title={pinned ? t('menu.pin.remove') : t('menu.pin.add')}
                          onPointerDown={e => { e.preventDefault(); e.stopPropagation(); }}
                          onClick={e => { e.preventDefault(); e.stopPropagation(); togglePin(id as PinnableActionId); }}
                        >
                          {pinned ? <Pin className="h-3 w-3" /> : <PinOff className="h-3 w-3" />}
                        </button>
                      </DropdownMenuItem>
                    );
                  })}
                </span>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal pb-1">
                {t('menu.backup')}
              </DropdownMenuLabel>
              <DropdownMenuItem onSelect={handleExportJson} className="flex items-center gap-2">
                <DatabaseBackup className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1">{t('menu.export.all')}</span>
                <span className="text-[10px] text-muted-foreground">.json</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => jsonImportRef.current?.click()} className="flex items-center gap-2">
                <Upload className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1">{t('menu.import.notes')}</span>
                <span className="text-[10px] text-muted-foreground">.json</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="w-px h-4 bg-border mx-0.5" />
          <SettingsDialog />
        </div>
      </div>

      {currentView === 'editor' && <TabBar />}

      {currentView === 'editor' && (allTags.length > 0 || activeNote) && (
        <div className="global-tag-bar">
          {allTags.length > 0 && (
            <div className="global-tag-filter">
              <Filter size={11} className="opacity-50" />
              {allTags.map(tag => (
                <button
                  key={tag}
                  className={`gtag-btn ${filterTag === tag ? 'gtag-active' : ''}`}
                  style={filterTag === tag ? { background: tagColor(tag) + '22', color: tagColor(tag), borderColor: tagColor(tag) } : {}}
                  onClick={() => setFilterTag(prev => prev === tag ? null : tag)}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
          {activeNote && (
            <TagBar
              noteId={activeNote.id}
              tags={activeNote.tags ?? []}
              filterTag={filterTag}
              onFilterTag={setFilterTag}
              allTags={allTags}
            />
          )}
        </div>
      )}

      <div className="app-editor-area" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {currentView === 'editor' && sidebarOpen && (
          <>
            {isMobile && (
              <div
                className="mobile-sidebar-backdrop"
                onClick={() => setSidebarOpen(false)}
              />
            )}
            <div className={isMobile ? 'mobile-sidebar-panel' : ''}>
              <Sidebar />
            </div>
          </>
        )}

        {currentView === 'editor' ? (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {activeNote && visibleNotes.some(n => n.id === activeNoteId) ? (
              <NoteEditor note={activeNote} />
            ) : (
              <div className="app-empty-state">
                <p>
                  {filterTag
                    ? t('note.filter.none', { tag: filterTag })
                    : notes.length === 0
                      ? t('note.empty.new')
                      : t('note.select')}
                </p>
              </div>
            )}
          </div>
        ) : currentView === 'kanban' ? (
          <KanbanView />
        ) : (
          <CalendarView />
        )}
      </div>

      {showPrintPreview && activeNote && (
        <PrintPreview
          note={activeNote}
          settings={settings}
          onClose={() => setShowPrintPreview(false)}
        />
      )}
    </div>
  );
}

function tagColor(tag: string): string {
  const TAG_COLORS = [
    '#ef4444','#f97316','#eab308','#22c55e',
    '#06b6d4','#3b82f6','#8b5cf6','#ec4899',
  ];
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) & 0xffff;
  return TAG_COLORS[h % TAG_COLORS.length];
}
