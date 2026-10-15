import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { GripVertical, MoreVertical, Star, MessageSquareText, Trash2, ImageIcon, EyeOff, Eye } from 'lucide-react';
import { Badge } from './ui/Badge';
import { StatusPill } from './ui/StatusPill';
import type { GalleryPhoto } from '../lib/galleries';

interface GalleryPhotoGridProps {
  photos: GalleryPhoto[];
  thumbUrls: Record<string, string>;
  coverId: string | null;
  canEdit: boolean;
  isPublic: boolean;
  onOpen: (index: number) => void;
  onReorder: (ordered: GalleryPhoto[]) => void;
  onSetCover: (photo: GalleryPhoto) => void;
  onToggleHidden: (photo: GalleryPhoto) => void;
  onEditCaption: (photo: GalleryPhoto) => void;
  onDelete: (photo: GalleryPhoto) => void;
}

const menuItemClass =
  'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-[var(--bg-sidebar)]';

export default function GalleryPhotoGrid({
  photos, thumbUrls, coverId, canEdit, isPublic, onOpen, onReorder, onSetCover, onToggleHidden, onEditCaption, onDelete,
}: GalleryPhotoGridProps) {
  const [order, setOrder] = useState(photos);
  const [dragId, setDragId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const changed = useRef(false);

  useEffect(() => {
    if (!dragId) setOrder(photos);
  }, [photos, dragId]);

  const startDrag = (e: PointerEvent<HTMLButtonElement>, id: string) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    changed.current = false;
    setMenuId(null);
    setDragId(id);
  };

  const moveDrag = (e: PointerEvent<HTMLButtonElement>) => {
    if (!dragId) return;
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-photo-id]');
    const targetId = target?.dataset.photoId;
    if (!targetId || targetId === dragId) return;
    setOrder((prev) => {
      const from = prev.findIndex((p) => p.id === dragId);
      const to = prev.findIndex((p) => p.id === targetId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      changed.current = true;
      return next;
    });
  };

  const endDrag = () => {
    if (!dragId) return;
    setDragId(null);
    if (changed.current) onReorder(order);
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {order.map((photo, index) => {
        const url = thumbUrls[photo.thumb_path];
        const dragging = dragId === photo.id;
        return (
          <div
            key={photo.id}
            data-photo-id={photo.id}
            className="relative rounded-lg"
            style={{
              opacity: dragging ? 0.5 : 1,
              outline: dragging ? '2px solid var(--accent)' : 'none',
              transition: 'opacity 0.15s',
            }}
          >
            <button
              type="button"
              onClick={() => onOpen(index)}
              aria-label={photo.caption ? `Agrandir : ${photo.caption}` : 'Agrandir la photo'}
              className="block w-full aspect-square rounded-lg overflow-hidden"
              style={{ background: 'var(--bg-hover)', cursor: 'zoom-in', border: '1px solid var(--border-color)' }}
            >
              {url ? (
                <img src={url} alt={photo.caption ?? ''} className="w-full h-full object-cover" loading="lazy" draggable={false} />
              ) : (
                <span className="w-full h-full flex items-center justify-center">
                  <ImageIcon size={24} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
                </span>
              )}
            </button>

            {(coverId === photo.id || photo.hidden_from_public) && (
              <span className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1 pointer-events-none">
                {coverId === photo.id && <Badge variant="yellow" icon={<Star size={11} />}>Couverture</Badge>}
                {photo.hidden_from_public && (
                  <StatusPill variant="neutral">{isPublic ? 'Masquée' : 'Masquée du site'}</StatusPill>
                )}
              </span>
            )}

            {canEdit && (
              <>
                <button
                  type="button"
                  aria-label="Déplacer la photo"
                  title="Glisser pour réordonner"
                  onPointerDown={(e) => startDrag(e, photo.id)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  className="absolute top-1.5 left-1.5 p-1.5 rounded-md"
                  style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
                >
                  <GripVertical size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Actions sur la photo"
                  aria-haspopup="menu"
                  aria-expanded={menuId === photo.id}
                  onClick={() => setMenuId(menuId === photo.id ? null : photo.id)}
                  className="absolute top-1.5 right-1.5 p-1.5 rounded-md"
                  style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', cursor: 'pointer' }}
                >
                  <MoreVertical size={16} />
                </button>
              </>
            )}

            {menuId === photo.id && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMenuId(null)} aria-hidden="true" />
                <div
                  role="menu"
                  className="absolute z-30 top-10 right-1.5 min-w-[200px] rounded-lg border py-1 shadow-lg"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
                >
                  {coverId !== photo.id && (
                    <button type="button" role="menuitem" className={menuItemClass} style={{ color: 'var(--text-primary)' }}
                      onClick={() => { setMenuId(null); onSetCover(photo); }}>
                      <Star size={16} /> Définir comme couverture
                    </button>
                  )}
                  <button type="button" role="menuitem" className={menuItemClass} style={{ color: 'var(--text-primary)' }}
                    onClick={() => { setMenuId(null); onToggleHidden(photo); }}>
                    {photo.hidden_from_public
                      ? <><Eye size={16} /> Afficher sur le site</>
                      : <><EyeOff size={16} /> Masquer du site</>}
                  </button>
                  <button type="button" role="menuitem" className={menuItemClass} style={{ color: 'var(--text-primary)' }}
                    onClick={() => { setMenuId(null); onEditCaption(photo); }}>
                    <MessageSquareText size={16} /> Légende
                  </button>
                  <button type="button" role="menuitem" className={menuItemClass} style={{ color: 'var(--danger)' }}
                    onClick={() => { setMenuId(null); onDelete(photo); }}>
                    <Trash2 size={16} /> Supprimer
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
