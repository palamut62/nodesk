import { useState, useRef, useEffect } from 'react';
import { useApp } from '@/lib/app-state';
import { useT } from '@/lib/use-t';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Plus, Trash2, Search, SortAsc, SortDesc, FolderPlus,
  Folder as FolderIcon, FolderOpen, ChevronRight, ChevronDown,
  MoreHorizontal, Pin, PinOff, Edit2, Check, X, MoveRight,
  CheckSquare, Tag,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubTrigger, DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { SortBy, SortDir } from '@/lib/types';

function extractText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

function countWords(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

const NOTE_COLORS = [
  '', '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4',
];

export function Sidebar() {
  const {
    notes, folders, activeNoteId, setActiveNoteId, createNote, deleteNote, updateNote,
    settings, searchQuery, setSearchQuery, sortBy, setSortBy, sortDir, setSortDir,
    activeFolderId, setActiveFolderId, createFolder, deleteFolder, renameFolder,
    moveNoteToFolder, togglePinNote,
  } = useApp();

  const t = useT();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showSearch, setShowSearch] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const newFolderRef = useRef<HTMLInputElement>(null);
  const editFolderRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showSearch && searchRef.current) searchRef.current.focus();
  }, [showSearch]);

  useEffect(() => {
    if (showNewFolder && newFolderRef.current) newFolderRef.current.focus();
  }, [showNewFolder]);

  useEffect(() => {
    if (editingFolderId && editFolderRef.current) editFolderRef.current.focus();
  }, [editingFolderId]);

  const folderIdStr = folders.map(f => f.id).join(',');
  useEffect(() => {
    if (folders.length === 0) return;
    setExpandedFolders(prev => {
      const next = new Set(prev);
      folders.forEach(f => next.add(f.id));
      return next.size === prev.size ? prev : next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderIdStr]);

  const SORT_OPTIONS: { key: SortBy; label: string }[] = [
    { key: 'updatedAt', label: t('sort.updated') },
    { key: 'createdAt', label: t('sort.created') },
    { key: 'title', label: t('sort.title') },
    { key: 'wordCount', label: t('sort.words') },
  ];

  const sortNotes = (arr: typeof notes) => {
    const sorted = [...arr].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'updatedAt') cmp = a.updatedAt.localeCompare(b.updatedAt);
      else if (sortBy === 'createdAt') cmp = a.createdAt.localeCompare(b.createdAt);
      else if (sortBy === 'title') cmp = a.title.localeCompare(b.title, 'tr');
      else if (sortBy === 'wordCount') cmp = countWords(extractText(a.content)) - countWords(extractText(b.content));
      return sortDir === 'desc' ? -cmp : cmp;
    });
    const pinned = sorted.filter(n => n.isPinned);
    const unpinned = sorted.filter(n => !n.isPinned);
    return [...pinned, ...unpinned];
  };

  const filteredNotes = notes.filter(n => {
    if (activeFolderId === 'unfiled') {
      if (n.folderId) return false;
    } else if (activeFolderId) {
      if (n.folderId !== activeFolderId) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const title = n.title.toLowerCase();
      const content = extractText(n.content).toLowerCase();
      const tags = (n.tags ?? []).join(' ').toLowerCase();
      if (!title.includes(q) && !content.includes(q) && !tags.includes(q)) return false;
    }
    return true;
  });

  const sortedNotes = [...filteredNotes].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'updatedAt') cmp = a.updatedAt.localeCompare(b.updatedAt);
    else if (sortBy === 'createdAt') cmp = a.createdAt.localeCompare(b.createdAt);
    else if (sortBy === 'title') cmp = a.title.localeCompare(b.title);
    else if (sortBy === 'wordCount') cmp = countWords(extractText(a.content)) - countWords(extractText(b.content));
    return sortDir === 'desc' ? -cmp : cmp;
  });

  const pinnedNotes = sortedNotes.filter(n => n.isPinned);
  const unpinnedNotes = sortedNotes.filter(n => !n.isPinned);
  const displayNotes = [...pinnedNotes, ...unpinnedNotes];

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolder(newFolderName.trim());
      setNewFolderName('');
    }
    setShowNewFolder(false);
  };

  const handleRenameFolder = (id: string) => {
    if (editingFolderName.trim()) renameFolder(id, editingFolderName.trim());
    setEditingFolderId(null);
    setEditingFolderName('');
  };

  const toggleSelectMode = () => {
    setSelectMode(v => !v);
    setSelectedIds(new Set());
  };

  const toggleNoteSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(displayNotes.map(n => n.id)));
  };

  const handleBulkDelete = () => {
    if (!selectedIds.size) return;
    if (!window.confirm(t('note.bulk.delete.confirm', { n: selectedIds.size }))) return;
    selectedIds.forEach(id => deleteNote(id));
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const handleBulkMove = (folderId: string | undefined) => {
    selectedIds.forEach(id => moveNoteToFolder(id, folderId));
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const handleBulkAddTag = () => {
    const tag = window.prompt(t('note.bulk.tag.prompt'));
    if (!tag?.trim()) return;
    const tagName = tag.trim().toLowerCase().replace(/\s+/g, '-');
    selectedIds.forEach(id => {
      const note = notes.find(n => n.id === id);
      if (!note) return;
      const existing = note.tags ?? [];
      if (!existing.includes(tagName)) {
        updateNote(id, { tags: [...existing, tagName] });
      }
    });
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const FOLDER_COLORS = ['#3b82f6','#22c55e','#f97316','#ef4444','#8b5cf6','#ec4899','#eab308','#06b6d4'];
  void FOLDER_COLORS;

  return (
    <div className="w-64 border-r border-border bg-sidebar flex flex-col h-full h-[100dvh]">
      {/* Header */}
      <div className="p-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h1 className="font-serif font-bold text-lg text-sidebar-foreground">Notlar</h1>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={() => { setShowSearch(v => !v); if (showSearch) setSearchQuery(''); }}
              title={t('search.placeholder')}
            >
              <Search className="h-3.5 w-3.5" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost" size="icon"
                  className="h-7 w-7 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  title="Sırala"
                >
                  {sortDir === 'desc' ? <SortDesc className="h-3.5 w-3.5" /> : <SortAsc className="h-3.5 w-3.5" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {SORT_OPTIONS.map(o => (
                  <DropdownMenuItem
                    key={o.key}
                    onClick={() => {
                      if (sortBy === o.key) setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
                      else { setSortBy(o.key); setSortDir('desc'); }
                    }}
                    className="flex items-center justify-between"
                  >
                    <span>{o.label}</span>
                    {sortBy === o.key && (
                      <span className="text-primary text-xs">{sortDir === 'desc' ? '↓' : '↑'}</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={() => setShowNewFolder(true)}
              title={t('folder.new')}
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant="ghost" size="icon"
              className={`h-7 w-7 hover:bg-sidebar-accent ${selectMode ? 'text-primary bg-primary/10' : 'text-sidebar-foreground/60 hover:text-sidebar-foreground'}`}
              onClick={toggleSelectMode}
              title={selectMode ? t('note.select.cancel') : t('note.select.mode')}
            >
              <CheckSquare className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={() => createNote({ folderId: activeFolderId && activeFolderId !== 'unfiled' ? activeFolderId : undefined })}
              title="Yeni Not"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {showSearch && (
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-sidebar-foreground/40" />
            <input
              ref={searchRef}
              className="w-full pl-6 pr-2 py-1 text-xs bg-sidebar-accent/50 border border-border rounded-md outline-none focus:ring-1 focus:ring-primary text-sidebar-foreground placeholder:text-sidebar-foreground/40"
              placeholder={t('search.placeholder')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-sidebar-foreground/40 hover:text-sidebar-foreground"
                onClick={() => setSearchQuery('')}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {showNewFolder && (
          <div className="mt-2 flex items-center gap-1">
            <input
              ref={newFolderRef}
              className="flex-1 px-2 py-1 text-xs bg-sidebar-accent/50 border border-border rounded-md outline-none focus:ring-1 focus:ring-primary text-sidebar-foreground placeholder:text-sidebar-foreground/40"
              placeholder={t('folder.name.placeholder')}
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); }
              }}
            />
            <button onClick={handleCreateFolder} className="text-primary hover:text-primary/70"><Check className="h-3.5 w-3.5" /></button>
            <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} className="text-sidebar-foreground/40 hover:text-sidebar-foreground"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {/* All Notes */}
          <button
            onClick={() => setActiveFolderId(null)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors mb-0.5 ${
              activeFolderId === null
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
            }`}
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 text-left truncate">{t('folder.all')}</span>
            <span className="text-sidebar-foreground/40 text-[10px]">{notes.length}</span>
          </button>

          {/* Unfiled */}
          {(notes.some(n => !n.folderId) || draggingNoteId) && (
            <button
              onClick={() => setActiveFolderId('unfiled')}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
              onDragEnter={e => { e.preventDefault(); setDragOverId('unfiled'); }}
              onDragLeave={() => setDragOverId(null)}
              onDrop={e => {
                e.preventDefault();
                const nid = e.dataTransfer.getData('noteId');
                if (nid) moveNoteToFolder(nid, undefined);
                setDragOverId(null);
                setDraggingNoteId(null);
              }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors mb-0.5 ${
                dragOverId === 'unfiled'
                  ? 'ring-1 ring-primary bg-primary/10 text-sidebar-foreground'
                  : activeFolderId === 'unfiled'
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              }`}
            >
              <FolderIcon className="h-3.5 w-3.5 shrink-0 opacity-50" />
              <span className="flex-1 text-left truncate">{t('folder.unfiled')}</span>
              <span className="text-sidebar-foreground/40 text-[10px]">{notes.filter(n => !n.folderId).length}</span>
            </button>
          )}

          {/* Folders */}
          {folders.map(folder => {
            const folderNotes = sortNotes(notes.filter(n => n.folderId === folder.id));
            const isExpanded = expandedFolders.has(folder.id);
            const isActive = activeFolderId === folder.id;
            return (
              <div
                key={folder.id}
                className="mb-0.5"
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                onDragEnter={e => { e.preventDefault(); setDragOverId(folder.id); }}
                onDragLeave={e => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverId(null);
                }}
                onDrop={e => {
                  e.preventDefault();
                  const nid = e.dataTransfer.getData('noteId');
                  if (nid) { moveNoteToFolder(nid, folder.id); setActiveFolderId(folder.id); }
                  setDragOverId(null);
                  setDraggingNoteId(null);
                }}
              >
                <div className={`group flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  dragOverId === folder.id
                    ? 'ring-1 ring-primary bg-primary/10 text-sidebar-foreground'
                    : isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                }`}>
                  <button
                    className="shrink-0"
                    onClick={() => setExpandedFolders(s => { const n = new Set(s); if (n.has(folder.id)) n.delete(folder.id); else n.add(folder.id); return n; })}
                  >
                    {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </button>
                  <button className="flex-1 flex items-center gap-1.5 min-w-0 text-left" onClick={() => setActiveFolderId(folder.id)}>
                    <FolderIcon className="h-3.5 w-3.5 shrink-0" style={{ color: folder.color }} />
                    {editingFolderId === folder.id ? (
                      <input
                        ref={editFolderRef}
                        className="flex-1 min-w-0 bg-transparent border-b border-primary outline-none text-xs"
                        value={editingFolderName}
                        onChange={e => setEditingFolderName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRenameFolder(folder.id);
                          if (e.key === 'Escape') { setEditingFolderId(null); }
                        }}
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span className="flex-1 truncate">{folder.name}</span>
                    )}
                    <span className="text-sidebar-foreground/40 text-[10px] shrink-0">{folderNotes.length}</span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-sidebar-foreground transition-opacity shrink-0">
                        <MoreHorizontal className="h-3 w-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onClick={() => { setEditingFolderId(folder.id); setEditingFolderName(folder.name); }}>
                        <Edit2 className="h-3.5 w-3.5 mr-2" />{t('folder.rename')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteFolder(folder.id)}>
                        <Trash2 className="h-3.5 w-3.5 mr-2" />{t('folder.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Inline notes under expanded folder */}
                {isExpanded && (
                  <div className="ml-[22px] border-l border-border/40 pl-2 mt-0.5 pb-1 flex flex-col gap-0.5">
                    {folderNotes.length === 0 ? (
                      <div className="py-1 px-2 text-[10px] text-sidebar-foreground/30 italic">{t('folder.empty')}</div>
                    ) : (
                      folderNotes.map(note => (
                        <div
                          key={note.id}
                          draggable={!selectMode}
                          onDragStart={e => {
                            e.dataTransfer.setData('noteId', note.id);
                            e.dataTransfer.effectAllowed = 'move';
                            setDraggingNoteId(note.id);
                          }}
                          onDragEnd={() => { setDraggingNoteId(null); setDragOverId(null); }}
                          onClick={e => { e.stopPropagation(); setActiveNoteId(note.id); setActiveFolderId(folder.id); }}
                          className={`group flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors ${
                            draggingNoteId === note.id
                              ? 'opacity-40'
                              : activeNoteId === note.id
                              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                              : 'hover:bg-sidebar-accent/50 text-sidebar-foreground/70 hover:text-sidebar-foreground'
                          }`}
                          style={note.color ? { borderLeft: `2px solid ${note.color}`, paddingLeft: '6px' } : undefined}
                        >
                          <span className="flex-1 truncate font-medium min-w-0">{note.title || t('note.untitled')}</span>
                          {note.isPinned && <Pin className="h-2.5 w-2.5 text-primary opacity-60 shrink-0" />}
                          {note.encrypted && <span className="text-[9px] text-amber-500 shrink-0">🔒</span>}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="p-1 rounded-md text-sidebar-foreground hover:bg-sidebar-border shrink-0"
                                onClick={e => e.stopPropagation()}
                              >
                                <MoreHorizontal className="h-3 w-3" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48" style={{ zIndex: 9999 }}>
                              <DropdownMenuItem onClick={e => { e.stopPropagation(); togglePinNote(note.id); }}>
                                {note.isPinned ? <><PinOff className="h-3.5 w-3.5 mr-2" />{t('note.unpin')}</> : <><Pin className="h-3.5 w-3.5 mr-2" />{t('note.pin')}</>}
                              </DropdownMenuItem>
                              {folders.length > 0 && (
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger>
                                    <MoveRight className="h-3.5 w-3.5 mr-2" />{t('folder.move')}
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent style={{ zIndex: 9999 }}>
                                    <DropdownMenuItem onClick={() => moveNoteToFolder(note.id, undefined)}>
                                      {t('folder.unfiled')}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    {folders.map(f => (
                                      <DropdownMenuItem key={f.id} onClick={() => moveNoteToFolder(note.id, f.id)}>
                                        <span className="w-2 h-2 rounded-full mr-2 shrink-0" style={{ background: f.color }} />
                                        {f.name}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                              )}
                              <DropdownMenuSeparator />
                              <div className="px-2 py-1.5" onClick={e => e.stopPropagation()}>
                                <div className="text-[10px] text-muted-foreground mb-1.5">{t('note.color')}</div>
                                <div className="flex gap-1 flex-wrap">
                                  {NOTE_COLORS.map(color => (
                                    <button
                                      key={color || 'none'}
                                      className={`w-4 h-4 rounded-full transition-transform ${
                                        (note.color ?? '') === color
                                          ? 'ring-2 ring-primary ring-offset-1 scale-110'
                                          : 'hover:scale-110'
                                      }`}
                                      style={{
                                        background: color || 'transparent',
                                        outline: !color ? '1.5px dashed hsl(var(--border))' : undefined,
                                      }}
                                      onClick={e => {
                                        e.stopPropagation();
                                        updateNote(note.id, { color: color || undefined });
                                      }}
                                      title={color || t('note.color')}
                                    />
                                  ))}
                                </div>
                              </div>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={e => { e.stopPropagation(); deleteNote(note.id); }}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />{t('note.delete')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Flat notes list — only for "all notes" and "unfiled" views */}
          {(!activeFolderId || activeFolderId === 'unfiled') && (
            <>
              {folders.length > 0 && !activeFolderId && <div className="border-t border-border/50 my-2" />}
              {displayNotes.length === 0 ? (
                <div className="px-2 py-4 text-center text-xs text-sidebar-foreground/40">
                  {searchQuery ? t('search.no.results') : t('note.empty')}
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
              {displayNotes.map(note => (
                <div
                  key={note.id}
                  draggable={!selectMode}
                  onDragStart={e => {
                    e.dataTransfer.setData('noteId', note.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDraggingNoteId(note.id);
                  }}
                  onDragEnd={() => { setDraggingNoteId(null); setDragOverId(null); }}
                  onClick={() => {
                    if (selectMode) {
                      toggleNoteSelection(note.id);
                    } else {
                      setActiveNoteId(note.id);
                    }
                  }}
                  className={`group flex items-center gap-1.5 px-2 py-2 rounded-md cursor-pointer transition-colors ${
                    draggingNoteId === note.id
                      ? 'opacity-40'
                      : !selectMode && activeNoteId === note.id
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : selectMode && selectedIds.has(note.id)
                      ? 'bg-primary/10 ring-1 ring-inset ring-primary/30 text-sidebar-foreground'
                      : 'hover:bg-sidebar-accent/50 text-sidebar-foreground'
                  }`}
                  style={{
                    borderLeft: note.color ? `3px solid ${note.color}` : '3px solid transparent',
                    paddingLeft: '9px',
                  }}
                >
                  {selectMode && (
                    <div className="shrink-0">
                      <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${
                        selectedIds.has(note.id) ? 'bg-primary border-primary' : 'border-sidebar-foreground/30'
                      }`}>
                        {selectedIds.has(note.id) && <Check className="h-2 w-2 text-primary-foreground" />}
                      </div>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="font-semibold text-xs truncate flex-1 min-w-0">
                        {note.title || t('note.untitled')}
                      </span>
                      {note.isPinned && <Pin className="h-2.5 w-2.5 shrink-0 text-primary opacity-60" />}
                      {note.encrypted && <span className="text-[9px] text-amber-500 shrink-0">🔒</span>}
                    </div>
                    <div className="text-[10px] opacity-50">
                      {format(new Date(note.updatedAt), 'dd MMM yyyy')}
                      {note.tags?.length ? (
                        <span className="ml-1 opacity-70">{note.tags.slice(0, 2).map(tg => `#${tg}`).join(' ')}</span>
                      ) : null}
                    </div>
                  </div>

                  {!selectMode && (
                    <div className="flex items-center gap-0.5 shrink-0 ml-1 self-start">
                      <button
                        className="p-1.5 rounded-md text-destructive hover:bg-destructive/15 transition-colors"
                        title={t('note.delete')}
                        onClick={e => { e.stopPropagation(); deleteNote(note.id); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="p-1.5 rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                            onClick={e => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52" style={{ zIndex: 9999 }}>
                          <DropdownMenuItem onClick={e => { e.stopPropagation(); togglePinNote(note.id); }}>
                            {note.isPinned ? <><PinOff className="h-3.5 w-3.5 mr-2" />{t('note.unpin')}</> : <><Pin className="h-3.5 w-3.5 mr-2" />{t('note.pin')}</>}
                          </DropdownMenuItem>
                          {folders.length > 0 && (
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <MoveRight className="h-3.5 w-3.5 mr-2" />{t('folder.move')}
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent style={{ zIndex: 9999 }}>
                                <DropdownMenuItem onClick={() => moveNoteToFolder(note.id, undefined)}>
                                  {t('folder.unfiled')}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {folders.map(f => (
                                  <DropdownMenuItem key={f.id} onClick={() => moveNoteToFolder(note.id, f.id)}>
                                    <span className="w-2 h-2 rounded-full mr-2 shrink-0" style={{ background: f.color }} />
                                    {f.name}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          )}
                          <DropdownMenuSeparator />
                          {/* Note Color Picker */}
                          <div className="px-2 py-1.5" onClick={e => e.stopPropagation()}>
                            <div className="text-[10px] text-muted-foreground mb-1.5">{t('note.color')}</div>
                            <div className="flex gap-1 flex-wrap">
                              {NOTE_COLORS.map(color => (
                                <button
                                  key={color || 'none'}
                                  className={`w-4 h-4 rounded-full transition-transform ${
                                    (note.color ?? '') === color
                                      ? 'ring-2 ring-primary ring-offset-1 scale-110'
                                      : 'hover:scale-110'
                                  }`}
                                  style={{
                                    background: color || 'transparent',
                                    outline: !color ? '1.5px dashed hsl(var(--border))' : undefined,
                                  }}
                                  onClick={e => {
                                    e.stopPropagation();
                                    updateNote(note.id, { color: color || undefined });
                                  }}
                                  title={color || 'Renk yok'}
                                />
                              ))}
                            </div>
                          </div>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={e => { e.stopPropagation(); deleteNote(note.id); }}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />{t('note.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
        )}
        </div>
      </ScrollArea>

      {/* Bulk Action Bar */}
      {selectMode && (
        <div className="shrink-0 border-t border-border p-2 bg-sidebar">
          <div className="flex items-center justify-between mb-1.5">
            <button
              className="text-[11px] text-sidebar-foreground/60 hover:text-primary transition-colors"
              onClick={selectedIds.size === displayNotes.length ? () => setSelectedIds(new Set()) : selectAll}
            >
              {selectedIds.size > 0
                ? t('note.selected', { n: selectedIds.size })
                : t('note.select.all')}
            </button>
            <button
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={toggleSelectMode}
            >
              {t('note.bulk.cancel')}
            </button>
          </div>
          {selectedIds.size > 0 && (
            <div className="flex gap-1">
              <Button
                variant="destructive"
                size="sm"
                className="flex-1 h-6 text-[11px] px-1"
                onClick={handleBulkDelete}
              >
                <Trash2 className="h-3 w-3 mr-1" />{t('note.delete')}
              </Button>
              {folders.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="flex-1 h-6 text-[11px] px-1">
                      <MoveRight className="h-3 w-3 mr-1" />{t('note.move')}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="w-44">
                    <DropdownMenuItem onClick={() => handleBulkMove(undefined)}>
                      {t('folder.unfiled')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {folders.map(f => (
                      <DropdownMenuItem key={f.id} onClick={() => handleBulkMove(f.id)}>
                        <span className="w-2 h-2 rounded-full mr-2 shrink-0" style={{ background: f.color }} />
                        {f.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-6 text-[11px] px-1"
                onClick={handleBulkAddTag}
              >
                <Tag className="h-3 w-3 mr-1" />{t('note.bulk.tag')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
