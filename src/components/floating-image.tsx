import { useState } from 'react';
import { Rnd } from 'react-rnd';
import { FloatingImage as FloatingImageType } from '@/lib/types';
import { X, GripHorizontal, Lock, Unlock } from 'lucide-react';

interface Props {
  image: FloatingImageType;
  onChange: (id: string, updates: Partial<FloatingImageType>) => void;
  onDelete: (id: string) => void;
  isActive: boolean;
  onFocus: () => void;
}

const HANDLE = {
  width: 10,
  height: 10,
  background: '#fff',
  border: '2px solid #3b82f6',
  borderRadius: 2,
  zIndex: 30,
};

const CORNER_OFFSET = -5;

const resizeHandleStyles = {
  topLeft:     { ...HANDLE, top: CORNER_OFFSET, left: CORNER_OFFSET, cursor: 'nw-resize' },
  topRight:    { ...HANDLE, top: CORNER_OFFSET, right: CORNER_OFFSET, cursor: 'ne-resize' },
  bottomLeft:  { ...HANDLE, bottom: CORNER_OFFSET, left: CORNER_OFFSET, cursor: 'sw-resize' },
  bottomRight: { ...HANDLE, bottom: CORNER_OFFSET, right: CORNER_OFFSET, cursor: 'se-resize' },
  top:         { ...HANDLE, top: CORNER_OFFSET, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' },
  bottom:      { ...HANDLE, bottom: CORNER_OFFSET, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' },
  left:        { ...HANDLE, left: CORNER_OFFSET, top: '50%', transform: 'translateY(-50%)', cursor: 'w-resize' },
  right:       { ...HANDLE, right: CORNER_OFFSET, top: '50%', transform: 'translateY(-50%)', cursor: 'e-resize' },
};

const hiddenHandleStyles = Object.fromEntries(
  Object.keys(resizeHandleStyles).map(k => [k, { display: 'none' }])
) as unknown as typeof resizeHandleStyles;

export function FloatingImage({ image, onChange, onDelete, isActive, onFocus }: Props) {
  const [aspectLocked, setAspectLocked] = useState(true);

  return (
    <Rnd
      size={{ width: image.width, height: image.height }}
      position={{ x: image.x, y: image.y }}
      onDragStop={(_e, d) => onChange(image.id, { x: d.x, y: d.y })}
      onResizeStop={(_e, _dir, ref, _delta, pos) => {
        onChange(image.id, {
          width: parseInt(ref.style.width, 10),
          height: parseInt(ref.style.height, 10),
          ...pos,
        });
      }}
      lockAspectRatio={aspectLocked}
      bounds="parent"
      dragHandleClassName="img-drag-handle"
      enableResizing={isActive}
      resizeHandleStyles={isActive ? resizeHandleStyles : hiddenHandleStyles}
      className="absolute z-20 group select-none"
      style={{ overflow: 'visible' }}
      onClick={(e: React.MouseEvent) => { e.stopPropagation(); onFocus(); }}
    >
      {/* Image + overlay wrapper — must NOT clip overflow so handles stick out */}
      <div
        className="w-full h-full relative"
        style={{ overflow: 'hidden', borderRadius: 2 }}
      >
        <div
          className={`absolute inset-0 rounded-sm pointer-events-none transition-shadow ${
            isActive
              ? 'ring-2 ring-blue-500 ring-offset-0'
              : 'ring-0 group-hover:ring-1 group-hover:ring-blue-400/60'
          }`}
          style={{ zIndex: 2 }}
        />

        <img
          src={image.src}
          alt={image.alt || ''}
          className="w-full h-full object-contain block pointer-events-none"
          draggable={false}
        />

        {/* Top toolbar — drag handle + controls */}
        <div
          className={`absolute inset-x-0 top-0 h-7 flex items-center justify-between px-1.5 transition-opacity
            ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
            bg-gradient-to-b from-black/50 to-transparent`}
          style={{ zIndex: 3 }}
        >
          <div
            className="img-drag-handle flex items-center flex-1 cursor-move h-full gap-1"
          >
            <GripHorizontal size={12} className="text-white/90" />
          </div>

          <button
            className="w-5 h-5 flex items-center justify-center rounded text-white/80 hover:text-white hover:bg-white/20 transition-colors"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); setAspectLocked(l => !l); }}
            title={aspectLocked ? 'En-boy kilitli — kilidi aç' : 'Serbest boyutlandır — kilitle'}
          >
            {aspectLocked
              ? <Lock size={10} className="text-white" />
              : <Unlock size={10} className="text-white/50" />}
          </button>

          <button
            className="w-5 h-5 flex items-center justify-center rounded text-white/80 hover:text-white hover:bg-red-500/70 transition-colors ml-0.5"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onDelete(image.id); }}
            title="Resmi sil"
          >
            <X size={10} />
          </button>
        </div>

        {/* Bottom-right size hint when active */}
        {isActive && (
          <div
            className="absolute bottom-1 right-1 text-[10px] text-white/60 leading-none pointer-events-none select-none"
            style={{ zIndex: 3 }}
          >
            {Math.round(image.width)}×{Math.round(image.height)}
          </div>
        )}
      </div>
    </Rnd>
  );
}
