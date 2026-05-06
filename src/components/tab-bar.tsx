import { useState, useRef, useEffect } from 'react';
import { useApp } from '@/lib/app-state';
import { X, Plus } from 'lucide-react';
import { Note } from '@/lib/types';

const TAG_COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e',
  '#06b6d4','#3b82f6','#8b5cf6','#ec4899',
];

function tagColor(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) & 0xffff;
  return TAG_COLORS[h % TAG_COLORS.length];
}

export function TabBar() {
  const { notes, activeNoteId, setActiveNoteId, createNote, deleteNote, updateNote, reorderNotes, activeFolderId } = useApp();
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragSrcIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTabId]);

  const handleDoubleClick = (note: Note) => {
    setEditingTabId(note.id);
    setEditingValue(note.title || 'Untitled');
  };

  const commitRename = () => {
    if (editingTabId) {
      const trimmed = editingValue.trim();
      updateNote(editingTabId, { title: trimmed || 'Untitled' });
      setEditingTabId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') setEditingTabId(null);
  };

  const handleClose = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const idx = notes.findIndex(n => n.id === id);
    if (activeNoteId === id) {
      const next = notes[idx + 1] || notes[idx - 1] || null;
      setActiveNoteId(next ? next.id : null);
    }
    deleteNote(id);
  };

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    dragSrcIdx.current = idx;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(idx);
  };

  const handleDrop = (e: React.DragEvent, toIdx: number) => {
    e.preventDefault();
    if (dragSrcIdx.current !== null && dragSrcIdx.current !== toIdx) {
      reorderNotes(dragSrcIdx.current, toIdx);
    }
    dragSrcIdx.current = null;
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    dragSrcIdx.current = null;
    setDragOverIdx(null);
  };

  return (
    <div className="tab-bar-wrapper">
      <div className="tab-bar-scroll" ref={scrollRef}>
        {notes.map((note, idx) => {
          const isActive = note.id === activeNoteId;
          const isEditing = editingTabId === note.id;
          const isDragOver = dragOverIdx === idx;
          const tags = note.tags ?? [];

          return (
            <div
              key={note.id}
              data-testid={`tab-${note.id}`}
              className={`tab-item ${isActive ? 'tab-active' : 'tab-inactive'} ${isDragOver ? 'tab-drag-over' : ''}`}
              draggable
              onClick={() => setActiveNoteId(note.id)}
              onDoubleClick={() => handleDoubleClick(note)}
              onDragStart={e => handleDragStart(e, idx)}
              onDragOver={e => handleDragOver(e, idx)}
              onDrop={e => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
            >
              {tags.length > 0 && (
                <span className="tab-tag-dots">
                  {tags.slice(0, 3).map(t => (
                    <span key={t} className="tab-tag-dot" style={{ background: tagColor(t) }} title={t} />
                  ))}
                </span>
              )}
              {isEditing ? (
                <input
                  ref={inputRef}
                  className="tab-rename-input"
                  value={editingValue}
                  onChange={e => setEditingValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={handleKeyDown}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="tab-title">
                  {note.title || 'Untitled'}
                </span>
              )}
              <button
                className="tab-close"
                onClick={(e) => handleClose(e, note.id)}
                data-testid={`tab-close-${note.id}`}
                title="Close"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}

        <button
          className="tab-new-btn"
          onClick={() => createNote({ folderId: activeFolderId && activeFolderId !== 'unfiled' ? activeFolderId : undefined })}
          data-testid="button-new-tab"
          title="New note"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
