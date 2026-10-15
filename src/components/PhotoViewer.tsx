import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type TouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const SWIPE_CLOSE_DISTANCE = 110;
const SWIPE_NAV_DISTANCE = 60;

interface PhotoViewerProps {
  src: string;
  caption?: string | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  action?: ReactNode;
}

type Gesture =
  | { kind: 'pinch'; startDist: number; startScale: number }
  | { kind: 'pan'; startX: number; startY: number; originX: number; originY: number }
  | { kind: 'swipe'; startX: number; startY: number }
  | null;

function touchDistance(t: React.TouchList) {
  return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
}

export function PhotoViewer({ src, caption, onClose, onPrev, onNext, action }: PhotoViewerProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragY, setDragY] = useState(0);
  const [animating, setAnimating] = useState(true);
  const gesture = useRef<Gesture>(null);
  const lastTap = useRef(0);
  const moved = useRef(false);
  const swipeDx = useRef(0);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setDragY(0);
  }, [src]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && onPrev) {
        e.stopPropagation();
        onPrev();
        return;
      }
      if (e.key === 'ArrowRight' && onNext) {
        e.stopPropagation();
        onNext();
        return;
      }
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', handleKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, onPrev, onNext]);

  const reset = () => {
    setAnimating(true);
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const toggleZoom = () => {
    if (scale > 1) reset();
    else {
      setAnimating(true);
      setScale(DOUBLE_TAP_SCALE);
    }
  };

  const handleTouchStart = (e: TouchEvent) => {
    e.stopPropagation();
    setAnimating(false);
    moved.current = false;
    if (e.touches.length === 2) {
      gesture.current = { kind: 'pinch', startDist: touchDistance(e.touches), startScale: scale };
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      gesture.current = scale > 1
        ? { kind: 'pan', startX: t.clientX, startY: t.clientY, originX: offset.x, originY: offset.y }
        : { kind: 'swipe', startX: t.clientX, startY: t.clientY };
      swipeDx.current = 0;
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    e.stopPropagation();
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pinch' && e.touches.length === 2) {
      moved.current = true;
      const next = Math.min(MAX_SCALE, Math.max(1, g.startScale * (touchDistance(e.touches) / g.startDist)));
      setScale(next);
      if (next === 1) setOffset({ x: 0, y: 0 });
    } else if (g.kind === 'pan' && e.touches.length === 1) {
      const t = e.touches[0];
      const dx = t.clientX - g.startX;
      const dy = t.clientY - g.startY;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved.current = true;
      setOffset({ x: g.originX + dx / scale, y: g.originY + dy / scale });
    } else if (g.kind === 'swipe' && e.touches.length === 1) {
      const dy = e.touches[0].clientY - g.startY;
      const dx = e.touches[0].clientX - g.startX;
      swipeDx.current = dx;
      if (Math.abs(dy) > 6 || Math.abs(dx) > 6) moved.current = true;
      if (Math.abs(dx) > Math.abs(dy) && (onPrev || onNext)) setDragY(0);
      else setDragY(Math.max(0, dy));
    }
  };

  const handleTouchEnd = (e: TouchEvent) => {
    e.stopPropagation();
    const g = gesture.current;
    if (e.touches.length > 0) {
      if (e.touches.length === 1 && scale > 1) {
        const t = e.touches[0];
        gesture.current = { kind: 'pan', startX: t.clientX, startY: t.clientY, originX: offset.x, originY: offset.y };
      }
      return;
    }
    gesture.current = null;
    setAnimating(true);

    if (g?.kind === 'swipe') {
      const dx = swipeDx.current;
      if (Math.abs(dx) > SWIPE_NAV_DISTANCE && dragY < SWIPE_CLOSE_DISTANCE) {
        if (dx < 0 && onNext) { onNext(); return; }
        if (dx > 0 && onPrev) { onPrev(); return; }
      }
      if (dragY > SWIPE_CLOSE_DISTANCE) {
        onClose();
        return;
      }
      setDragY(0);
    }
    if (scale <= 1.02) reset();

    if (!moved.current && e.target instanceof HTMLImageElement) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        lastTap.current = 0;
        toggleZoom();
      } else {
        lastTap.current = now;
      }
    }
  };

  const handleBackdropClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (e.target === e.currentTarget && !moved.current) onClose();
  };

  const backdropOpacity = Math.max(0.35, 0.92 - dragY / 400);

  const imageStyle: CSSProperties = {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    userSelect: 'none',
    transform: `translateY(${dragY}px) scale(${scale}) translate(${offset.x}px, ${offset.y}px)`,
    transition: animating ? 'transform 0.22s ease' : 'none',
    cursor: scale > 1 ? 'zoom-out' : 'zoom-in',
    borderRadius: scale > 1 ? 0 : 4,
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={caption || 'Photo'}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: `rgba(0,0,0,${backdropOpacity})`,
        backdropFilter: 'blur(4px)',
        touchAction: 'none',
        animation: 'photo-viewer-in 0.18s ease',
      }}
    >
      <div
        onClick={handleBackdropClick}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '56px 12px 72px',
          overflow: 'hidden',
        }}
      >
        <img
          src={src}
          alt={caption || ''}
          draggable={false}
          onDoubleClick={(e) => {
            e.stopPropagation();
            toggleZoom();
          }}
          onClick={(e) => e.stopPropagation()}
          style={imageStyle}
        />
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Fermer"
        className="photo-viewer-close"
        style={{
          position: 'absolute',
          top: 'calc(12px + env(safe-area-inset-top, 0px))',
          right: 12,
          width: 40,
          height: 40,
          borderRadius: 999,
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,255,255,0.14)',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        <X size={22} />
      </button>

      {onPrev && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          aria-label="Photo précédente"
          className="photo-viewer-close"
          style={{ ...navButtonStyle, left: 12 }}
        >
          <ChevronLeft size={24} />
        </button>
      )}
      {onNext && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          aria-label="Photo suivante"
          className="photo-viewer-close"
          style={{ ...navButtonStyle, right: 12 }}
        >
          <ChevronRight size={24} />
        </button>
      )}

      {caption && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: '16px 24px calc(20px + env(safe-area-inset-bottom, 0px))',
            textAlign: 'center',
            color: '#fff',
            fontSize: 15,
            fontWeight: 600,
            lineHeight: 1.5,
            background: 'linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0))',
            pointerEvents: 'none',
            opacity: dragY > 0 ? 0.5 : 1,
          }}
        >
          {caption}
        </div>
      )}

      {action && (
        <div
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            right: 12,
            bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
            borderRadius: 999,
            background: 'var(--bg-card)',
          }}
        >
          {action}
        </div>
      )}
    </div>,
    document.body
  );
}

const navButtonStyle: CSSProperties = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  width: 44,
  height: 44,
  borderRadius: 999,
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(255,255,255,0.14)',
  color: '#fff',
  cursor: 'pointer',
};

type ZoomablePhotoProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  caption?: string | null;
};

export function ZoomablePhoto({ caption, style, onClick, ...imgProps }: ZoomablePhotoProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <img
        {...imgProps}
        role="button"
        tabIndex={0}
        aria-label={caption ? `Agrandir la photo de ${caption}` : 'Agrandir la photo'}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick?.(e);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }
        }}
        style={{ cursor: 'zoom-in', ...style }}
      />
      {open && <PhotoViewer src={imgProps.src} caption={caption} onClose={() => setOpen(false)} />}
    </>
  );
}
