import { EyeOff, Check, ImageIcon, Flag } from 'lucide-react';
import Button from './ui/Button';
import { Badge } from './ui/Badge';

export interface GalleryReport {
  id: string;
  photo_id: string;
  reason: string | null;
  created_at: string;
  reporter: { full_name: string | null; first_name: string | null; last_name: string | null } | null;
  photo: { gallery_id: string; thumb_path: string } | null;
}

interface GalleryReportsSectionProps {
  reports: GalleryReport[];
  thumbUrls: Record<string, string>;
  busyId: string | null;
  onHide: (report: GalleryReport) => void;
  onResolve: (report: GalleryReport) => void;
}

function reporterName(r: GalleryReport) {
  const p = r.reporter;
  if (!p) return 'Membre';
  const composed = [p.first_name, p.last_name].filter(Boolean).join(' ');
  return composed || p.full_name || 'Membre';
}

export default function GalleryReportsSection({ reports, thumbUrls, busyId, onHide, onResolve }: GalleryReportsSectionProps) {
  return (
    <section className="mt-10" aria-labelledby="gallery-reports-title">
      <h2 id="gallery-reports-title" className="text-lg font-semibold flex items-center gap-2 mb-3" style={{ color: 'var(--text-primary)' }}>
        <Flag size={18} aria-hidden="true" /> Signalements
        {reports.length > 0 && <Badge variant="red">{reports.length}</Badge>}
      </h2>
      {reports.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Aucun signalement en attente.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((r) => {
            const url = r.photo ? thumbUrls[r.photo.thumb_path] : undefined;
            return (
              <li
                key={r.id}
                className="flex gap-3 p-3 rounded-lg flex-wrap sm:flex-nowrap"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
              >
                <div className="w-16 h-16 rounded-md overflow-hidden flex items-center justify-center shrink-0" style={{ background: 'var(--bg-hover)' }}>
                  {url
                    ? <img src={url} alt="" className="w-full h-full object-cover" />
                    : <ImageIcon size={20} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 14 }}>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{reporterName(r)}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {new Date(r.created_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                  <p className="mt-1" style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word' }}>
                    {r.reason?.trim() || 'Aucun motif indiqué.'}
                  </p>
                </div>
                <div className="flex sm:flex-col items-start sm:items-end gap-1 shrink-0">
                  <Button variant="ghost" size="sm" leftIcon={<EyeOff size={14} />}
                    disabled={busyId === r.id} onClick={() => onHide(r)}>
                    Masquer du site
                  </Button>
                  <Button variant="ghost" size="sm" leftIcon={<Check size={14} />}
                    disabled={busyId === r.id} onClick={() => onResolve(r)}>
                    Marquer comme traité
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
