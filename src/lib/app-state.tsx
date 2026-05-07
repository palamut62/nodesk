// @refresh reset
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Note, Settings, Folder, VersionSnapshot, AppView, SortBy, SortDir } from './types';
import { tr } from './i18n';

const MAX_VERSIONS = 20;

interface AppContextType {
  notes: Note[];
  folders: Folder[];
  activeNoteId: string | null;
  settings: Settings;
  currentView: AppView;
  searchQuery: string;
  sortBy: SortBy;
  sortDir: SortDir;
  activeFolderId: string | null;
  setActiveNoteId: (id: string | null) => void;
  setCurrentView: (view: AppView) => void;
  setSearchQuery: (q: string) => void;
  setSortBy: (s: SortBy) => void;
  setSortDir: (d: SortDir) => void;
  setActiveFolderId: (id: string | null) => void;
  createNote: (initial?: { title?: string; content?: string; tags?: string[]; folderId?: string }) => string;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  updateSettings: (updates: Partial<Settings>) => void;
  reorderNotes: (fromIndex: number, toIndex: number) => void;
  createFolder: (name: string, color?: string) => Folder;
  deleteFolder: (id: string) => void;
  renameFolder: (id: string, name: string) => void;
  moveNoteToFolder: (noteId: string, folderId: string | undefined) => void;
  saveVersion: (noteId: string, label?: string) => void;
  restoreVersion: (noteId: string, versionId: string) => void;
  deleteVersion: (noteId: string, versionId: string) => void;
  togglePinNote: (noteId: string) => void;
  importNotes: (importedNotes: Note[]) => void;
}

const defaultSettings: Settings = {
  provider: 'openrouter',
  openrouterApiKey: '',
  openrouterModel: '',
  nvidiaApiKey: '',
  nvidiaModel: 'openai/gpt-oss-20b',
  groqApiKey: '',
  groqModel: 'openai/gpt-oss-20b',
  backgroundPattern: 'none',
  theme: 'apple-yellow',
  marginTop: 80,
  marginBottom: 120,
  marginLeft: 80,
  marginRight: 80,
  autoCorrect: false,
  language: 'tr',
  pinnedActions: [],
  sortBy: 'updatedAt',
  sortDir: 'desc',
  currentView: 'editor',
  translateTarget: 'Türkçe',
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<Note[]>(() => {
    try {
      const saved = localStorage.getItem('notlar-notes');
      if (!saved) return [];
      const parsed: Note[] = JSON.parse(saved);
      return parsed.map(n => ({ ...n, tags: n.tags ?? [], drawOps: n.drawOps ?? [] }));
    } catch {
      return [];
    }
  });

  const [folders, setFolders] = useState<Folder[]>(() => {
    try {
      const saved = localStorage.getItem('notlar-folders');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<AppView>('editor');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const saved = localStorage.getItem('notes-settings');
      return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });

  useEffect(() => {
    localStorage.setItem('notlar-notes', JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    localStorage.setItem('notlar-folders', JSON.stringify(folders));
  }, [folders]);

  useEffect(() => {
    localStorage.setItem('notes-settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', settings.theme ?? 'light');
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.theme]);

  const createNote = useCallback((initial?: { title?: string; content?: string; tags?: string[]; folderId?: string }) => {
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: initial?.title || tr(settings.language ?? 'tr', 'note.untitled'),
      content: initial?.content || '',
      textboxes: [],
      images: [],
      drawOps: [],
      tags: initial?.tags ?? [],
      header: { left: { text: '' }, center: { text: '' }, right: { text: '' }, visible: false },
      footer: { left: { text: '' }, center: { text: '{sayfa}' }, right: { text: '' }, visible: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      folderId: initial?.folderId ?? undefined,
      status: 'todo',
      versionHistory: [],
      audioClips: [],
      isPinned: false,
    };
    setNotes(prev => [newNote, ...prev]);
    setActiveNoteId(newNote.id);
    return newNote.id;
  }, []);

  const updateNote = useCallback((id: string, updates: Partial<Note>) => {
    setNotes(prev => prev.map(note =>
      note.id === id
        ? { ...note, ...updates, updatedAt: new Date().toISOString() }
        : note
    ));
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    if (activeNoteId === id) {
      setActiveNoteId(null);
    }
  }, [activeNoteId]);

  const updateSettings = useCallback((updates: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  const reorderNotes = useCallback((fromIndex: number, toIndex: number) => {
    setNotes(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, moved);
      return arr;
    });
  }, []);

  const createFolder = useCallback((name: string, color = '#3b82f6'): Folder => {
    const folder: Folder = {
      id: crypto.randomUUID(),
      name,
      color,
      createdAt: new Date().toISOString(),
    };
    setFolders(prev => [...prev, folder]);
    return folder;
  }, []);

  const deleteFolder = useCallback((id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id));
    setNotes(prev => prev.map(n => n.folderId === id ? { ...n, folderId: undefined } : n));
  }, []);

  const renameFolder = useCallback((id: string, name: string) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f));
  }, []);

  const moveNoteToFolder = useCallback((noteId: string, folderId: string | undefined) => {
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, folderId, updatedAt: new Date().toISOString() } : n));
  }, []);

  const saveVersion = useCallback((noteId: string, label?: string) => {
    setNotes(prev => prev.map(note => {
      if (note.id !== noteId) return note;
      const snap: VersionSnapshot = {
        id: crypto.randomUUID(),
        content: note.content,
        title: note.title,
        savedAt: new Date().toISOString(),
        label,
      };
      const history = [...(note.versionHistory ?? []), snap].slice(-MAX_VERSIONS);
      return { ...note, versionHistory: history };
    }));
  }, []);

  const restoreVersion = useCallback((noteId: string, versionId: string) => {
    setNotes(prev => prev.map(note => {
      if (note.id !== noteId) return note;
      const snap = (note.versionHistory ?? []).find(v => v.id === versionId);
      if (!snap) return note;
      return { ...note, content: snap.content, title: snap.title, updatedAt: new Date().toISOString() };
    }));
  }, []);

  const deleteVersion = useCallback((noteId: string, versionId: string) => {
    setNotes(prev => prev.map(note => {
      if (note.id !== noteId) return note;
      return { ...note, versionHistory: (note.versionHistory ?? []).filter(v => v.id !== versionId) };
    }));
  }, []);

  const togglePinNote = useCallback((noteId: string) => {
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, isPinned: !n.isPinned } : n));
  }, []);

  const importNotes = useCallback((importedNotes: Note[]) => {
    const now = new Date().toISOString();
    const normalized = importedNotes.map(n => ({
      ...n,
      id: crypto.randomUUID(),
      tags: n.tags ?? [],
      drawOps: n.drawOps ?? [],
      textboxes: n.textboxes ?? [],
      images: n.images ?? [],
      versionHistory: n.versionHistory ?? [],
      audioClips: n.audioClips ?? [],
      createdAt: n.createdAt ?? now,
      updatedAt: now,
    }));
    setNotes(prev => [...normalized, ...prev]);
  }, []);

  return (
    <AppContext.Provider
      value={{
        notes,
        folders,
        activeNoteId,
        settings,
        currentView,
        searchQuery,
        sortBy,
        sortDir,
        activeFolderId,
        setActiveNoteId,
        setCurrentView,
        setSearchQuery,
        setSortBy,
        setSortDir,
        setActiveFolderId,
        createNote,
        updateNote,
        deleteNote,
        updateSettings,
        reorderNotes,
        createFolder,
        deleteFolder,
        renameFolder,
        moveNoteToFolder,
        saveVersion,
        restoreVersion,
        deleteVersion,
        togglePinNote,
        importNotes,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
