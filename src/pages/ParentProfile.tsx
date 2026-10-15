import { useState, useEffect } from 'react';
import { reportLoadError } from '../utils/reportLoadError';
import { LoadError } from '../components/LoadError';
import { supabase } from '../lib/supabase';
import { invokeFunction } from '../lib/invokeFunction';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import { StandardModal } from '../components/StandardModal';
import { User, Phone, MapPin, Users, Lock, Plus, Camera, X } from 'lucide-react';
import { ChangePasswordSection } from '../components/ChangePasswordSection';
import { TermsAcceptanceSection } from '../components/TermsAcceptanceSection';
import { DeleteAccountSection } from '../components/DeleteAccountSection';
import { MesValidations } from '../components/MesValidations';
import { CalendarSubscription } from '../components/CalendarSubscription';
import { MyInvoicesBlock } from '../components/MyInvoicesBlock';
import { useFinanceModuleEnabled } from '../hooks/useFinanceModuleEnabled';
import { useWebsiteModuleEnabled } from '../hooks/useWebsiteModuleEnabled';
import {
  ProfileCard, ProfileHeader, ProfileSection, ProfileField,
  ProfileNotFound, ProfileLoading,
} from '../components/ProfileLayout';
import ProfilePhotoUpload from '../components/profile/ProfilePhotoUpload';
import ProfileTabsBar, { useProfileTab } from '../components/ProfileTabsBar';
import NotificationsPanel from '../components/NotificationsPanel';
import { formatPhone } from '../utils/phoneHelpers';
import { formatAVS, validateAVS } from '../utils/formatHelpers';
import PhoneInput from '../components/PhoneInput';
import Button from '../components/ui/Button';
import { availabilityLabel, formatReturnDate } from '../utils/availabilityHelpers';
import { useMemberPhotos } from '../hooks/useMemberPhotos';
import { getMemberPhotoUrl } from '../utils/memberPhotoUrl';
import { resizeAndCropImage } from '../lib/imageProcessing';
import { useConfrerieBadge } from '../hooks/useConfrerieBadge';
import { ZoomablePhoto } from '../components/PhotoViewer';

interface ChildInfo {
  id: string;
  first_name: string;
  last_name: string;
  team_name: string;
  category_name: string;
  photo_path: string | null;
  photo_url: string | null;
  asf_licence_number: string | null;
  availability: string | null;
  availability_until: string | null;
  availability_note: string | null;
}

interface ParentData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  street_number: string;
  postal_code: string;
  city: string;
  canton: string;
}

export default function ParentProfile() {
  const { user } = useAuth();
  const { tab, setTab } = useProfileTab();
  const { clubId } = useTenant();
  const { enabled: financeEnabled } = useFinanceModuleEnabled();
  const { enabled: websiteEnabled } = useWebsiteModuleEnabled()
  const confrerieBadge = useConfrerieBadge();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parentInfo, setParentInfo] = useState<ParentData | null>(null);
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [memberId, setMemberId] = useState<string>('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [showAddChild, setShowAddChild] = useState(false);
  const [addChildAvs, setAddChildAvs] = useState('');
  const [dismissedPhotoNudges, setDismissedPhotoNudges] = useState<Set<string>>(new Set());
  const [childUploading, setChildUploading] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const { toast, showToast } = useToast();

  useEffect(() => {
    fetchParentProfile();
  }, [user]);

  const fetchParentProfile = async () => {
    if (!user?.id) return;
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data: profileRow, error: profileErr } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', authUser.id)
        .maybeSingle();
      if (profileErr) throw profileErr;
      setPhotoUrl(profileRow?.avatar_url || null);

      const { data: parentLinks, error } = await supabase
        .from('parent_members')
        .select(`
          member_id,
          members (
            id, first_name, last_name, photo_path, photo_url, asf_licence_number,
            availability, availability_until, availability_note, hide_from_site, photo_consent,
            legal_rep1_firstname, legal_rep1_lastname, legal_rep1_email, legal_rep1_phone,
            address, street_number, postal_code, city, canton, team_id,
            teams ( name, category:team_categories (name) )
          )
        `)
        .eq('parent_user_id', authUser.id);

      if (error) throw error;

      if (parentLinks && parentLinks.length > 0) {
        const firstChild = parentLinks[0].members as any;

        setParentInfo({
          first_name: firstChild.legal_rep1_firstname || '',
          last_name: firstChild.legal_rep1_lastname || '',
          email: firstChild.legal_rep1_email || authUser.email || '',
          phone: firstChild.legal_rep1_phone || '',
          address: firstChild.address || '',
          street_number: firstChild.street_number || '',
          postal_code: firstChild.postal_code || '',
          city: firstChild.city || '',
          canton: firstChild.canton || '',
        });
        setMemberId(firstChild.id);

        // Resolve teams: first try embedded join (team_id FK), then fallback to team_members junction
        const needsFallback: string[] = [];
        const embeddedTeams = new Map<string, { team_name: string; category_name: string }>();

        for (const pm of parentLinks) {
          const m = pm.members as any;
          if (!m) continue;
          const t = m.teams;
          if (t?.name) {
            embeddedTeams.set(m.id, { team_name: t.name, category_name: t.category?.name || '—' });
          } else {
            needsFallback.push(m.id);
          }
        }

        // For members whose embedded team join didn't resolve, query team_members
        if (needsFallback.length > 0) {
          const { data: tmRows, error: tmErr } = await supabase
            .from('team_members')
            .select('member_id, team_id, joined_at')
            .in('member_id', needsFallback)
            .order('joined_at', { ascending: false });
          if (tmErr) reportLoadError('ParentProfile', tmErr);

          if (tmRows && tmRows.length > 0) {
            // Pick the most recent team_members row per member
            const bestTeamId = new Map<string, string>();
            for (const row of tmRows) {
              if (!bestTeamId.has(row.member_id)) {
                bestTeamId.set(row.member_id, row.team_id);
              }
            }
            const teamIds = [...new Set(bestTeamId.values())];
            const { data: teamRows, error: teamErr } = await supabase
              .from('teams')
              .select('id, name, category:team_categories (name)')
              .in('id', teamIds);
            if (teamErr) reportLoadError('ParentProfile', teamErr);

            const teamMap = new Map((teamRows || []).map((t: any) => [t.id, t]));
            for (const [mid, tid] of bestTeamId) {
              const team = teamMap.get(tid) as any;
              if (team?.name) {
                embeddedTeams.set(mid, { team_name: team.name, category_name: team.category?.name || '—' });
              }
            }
          }
        }

        // Also resolve teams for members that have team_id set but the embedded join returned null
        // (can happen when the FK relationship differs from the column name)
        const membersWithTeamIdButNoTeam = parentLinks
          .map((pm: any) => pm.members)
          .filter((m: any) => m && m.team_id && !embeddedTeams.has(m.id));

        if (membersWithTeamIdButNoTeam.length > 0) {
          const teamIds = [...new Set(membersWithTeamIdButNoTeam.map((m: any) => m.team_id))] as string[];
          const { data: teamRows, error: teamErr } = await supabase
            .from('teams')
            .select('id, name, category:team_categories (name)')
            .in('id', teamIds);
          if (teamErr) reportLoadError('ParentProfile', teamErr);

          const teamMap = new Map((teamRows || []).map((t: any) => [t.id, t]));
          for (const m of membersWithTeamIdButNoTeam) {
            const team = teamMap.get(m.team_id) as any;
            if (team?.name) {
              embeddedTeams.set(m.id, { team_name: team.name, category_name: team.category?.name || '—' });
            }
          }
        }

        setChildren(parentLinks.map((pm: any) => {
          const m = pm.members;
          const resolved = embeddedTeams.get(m.id);
          return {
            id: m.id,
            first_name: m.first_name,
            last_name: m.last_name,
            team_name: resolved?.team_name || 'Sans équipe',
            category_name: resolved?.category_name || '—',
            photo_path: m.photo_path || null,
            photo_url: m.photo_url || null,
            asf_licence_number: m.asf_licence_number || null,
            availability: m.availability || null,
            availability_until: m.availability_until || null,
            availability_note: m.availability_note || null,
          };
        }));
      }
    } catch (err) {
      reportLoadError('ParentProfile', err);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const handleEditToggle = () => {
    if (isEditing) {
      doSave();
    } else {
      setIsEditing(true);
    }
  };

  const doSave = async () => {
    if (!parentInfo || !memberId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('members').update({
        phone: parentInfo.phone,
        address: parentInfo.address,
        street_number: parentInfo.street_number,
        postal_code: parentInfo.postal_code,
        city: parentInfo.city,
        canton: parentInfo.canton,
      }).eq('id', memberId);
      if (error) throw error;
      setIsEditing(false);
    } catch (err) {
      console.error(err);
      showToast('Erreur lors de la sauvegarde', 'error');
    } finally {
      setSaving(false);
    }
  };

  async function confirmAddChild() {
    if (!addChildAvs.trim() || !clubId) return;
    if (!validateAVS(addChildAvs.trim())) return;
    setAddingChild(true);
    try {
      const { data, error } = await invokeFunction('link-parent-children', {
        body: { clubId, children: [{ avsInput: addChildAvs.trim() }] },
      });
      if (error) {
        showToast(error || 'Une erreur est survenue lors du rattachement.', 'error');
        setAddingChild(false);
        return;
      }
      const results = Array.isArray(data?.results) ? data.results : [];
      const r = results[0];
      if (r?.status === 'linked') {
        showToast(`${r.childName || 'Enfant'} a été rattaché à votre compte.`, 'success');
      } else if (r?.status === 'pending') {
        showToast(`Demande envoyée à l'administration du club pour validation.`, 'success');
      } else if (r?.status === 'avs_not_found') {
        showToast(`Aucun joueur trouvé pour ce numéro AVS. Vérifiez le numéro ou contactez le club.`, 'error');
      } else {
        showToast('Traitement effectué.', 'success');
      }
      setShowAddChild(false);
      setAddChildAvs('');
      await fetchParentProfile();
    } catch (err: any) {
      showToast('Erreur: ' + (err?.message || ''), 'error');
    } finally {
      setAddingChild(false);
    }
  }

  const getInitials = (first: string, last: string) =>
    `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();

  const childPhotoUrls = useMemberPhotos(children.map((c) => c.photo_path));

  if (loading) return <ProfileLoading />;
  if (loadFailed) return <LoadError onRetry={fetchParentProfile} />;
  if (!parentInfo) return <ProfileNotFound />;

  return (
    <div className="space-y-5">
      <ProfileTabsBar value={tab} onChange={setTab} />

      {tab === 'notifications' ? (
        <NotificationsPanel />
      ) : (
        <>
      <ProfileCard>
        <ProfileHeader
          initials={getInitials(parentInfo.first_name, parentInfo.last_name)}
          avatarUrl={photoUrl}
          fullName={`${parentInfo.first_name} ${parentInfo.last_name}`}
          role="parent"
          extraBadges={children.map((c) => `${c.first_name} ${c.last_name}`)}
          confrerieBadge={confrerieBadge}
          isEditing={isEditing}
          saving={saving}
          onEditToggle={handleEditToggle}
          photoSlot={user?.id ? (
            <ProfilePhotoUpload
              variant="badge"
              memberId={user.id}
              userId={user.id}
              currentPhotoUrl={photoUrl}
              onPhotoUpdated={(url) => setPhotoUrl(url)}
            />
          ) : undefined}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProfileSection icon={<User size={16} />} title="Identité">
            <ProfileField label="Prénom" value={parentInfo.first_name} />
            <ProfileField label="Nom" value={parentInfo.last_name} />
          </ProfileSection>

          <ProfileSection icon={<Phone size={16} />} title="Coordonnées">
            <ProfileField
              label={
                <span className="flex items-center gap-1">
                  Email
                  <Lock size={10} style={{ color: 'var(--text-muted)' }} />
                </span>
              }
              value={parentInfo.email}
            />
            <ProfileField
              label="Téléphone"
              value={formatPhone(parentInfo.phone || '')}
              isEditing={isEditing}
            >
              {isEditing ? (
                <PhoneInput
                  value={parentInfo.phone || ''}
                  onChange={(v) => setParentInfo({ ...parentInfo, phone: v })}
                />
              ) : undefined}
            </ProfileField>
          </ProfileSection>

          <ProfileSection icon={<MapPin size={16} />} title="Adresse">
            <div className="grid grid-cols-2 gap-3">
              <ProfileField
                label="Rue"
                value={parentInfo.address}
                isEditing={isEditing}
                onChange={(v) => setParentInfo({ ...parentInfo, address: v })}
              />
              <ProfileField
                label="Numéro"
                value={parentInfo.street_number}
                isEditing={isEditing}
                onChange={(v) => setParentInfo({ ...parentInfo, street_number: v })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ProfileField
                label="Code postal"
                value={parentInfo.postal_code}
                isEditing={isEditing}
                onChange={(v) => setParentInfo({ ...parentInfo, postal_code: v })}
              />
              <ProfileField
                label="Ville"
                value={parentInfo.city}
                isEditing={isEditing}
                onChange={(v) => setParentInfo({ ...parentInfo, city: v })}
              />
            </div>
            <ProfileField
              label="Canton"
              value={parentInfo.canton}
              isEditing={isEditing}
              onChange={(v) => setParentInfo({ ...parentInfo, canton: v })}
            />
          </ProfileSection>
        </div>
      </ProfileCard>

      {children.length > 0 && (
        <ProfileCard>
          <div
            className="flex items-center justify-between gap-2 mb-4 pb-2"
            style={{ borderBottom: '1px solid var(--border-color)' }}
          >
            <h2
              className="text-base font-semibold flex items-center gap-2"
              style={{ color: 'var(--text-primary)' }}
            >
              <span style={{ color: 'var(--accent)' }}><Users size={16} /></span>
              Mes Enfants
            </h2>
            <button
              type="button"
              onClick={() => { setShowAddChild(true); setAddChildAvs(''); }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 transition-colors"
              style={{
                background: 'var(--accent-soft)',
                color: 'var(--accent-text)',
                border: '1px solid var(--accent)',
              }}
            >
              <Plus size={14} />
              Ajouter un enfant
            </button>
          </div>
          <div className="space-y-3">
            {children.map((child) => (
              <div key={child.id} className="space-y-2">
              <div
                className="flex items-center gap-4 p-4 rounded-lg"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)' }}
              >
                {getMemberPhotoUrl(child.photo_path, childPhotoUrls, child.photo_url) ? (
                  <ZoomablePhoto
                    src={getMemberPhotoUrl(child.photo_path, childPhotoUrls, child.photo_url)!}
                    caption={`${child.first_name} ${child.last_name}`}
                    alt=""
                    className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ background: 'var(--accent)', color: 'var(--text-inverse)' }}
                  >
                    {getInitials(child.first_name, child.last_name)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                    {child.first_name} {child.last_name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {child.team_name} — {child.category_name}
                  </p>
                  {child.asf_licence_number && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      Licence ASF : {child.asf_licence_number}
                    </p>
                  )}
                  {websiteEnabled && (child as any).hide_from_site && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Ne figure pas sur le site du club
                    </p>
                  )}
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Autorisation photo : {(child as any).photo_consent === true ? 'Oui' : (child as any).photo_consent === false ? 'Non' : 'Pas de réponse'}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Pour modifier, contactez le club.</p>
                  {child.availability && child.availability !== 'disponible' && (
                    <div
                      className="flex items-center gap-2 rounded-md px-2.5 py-1.5 mt-1.5"
                      style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning)' }}
                    >
                      <span className="text-xs font-medium" style={{ color: 'var(--warning-text)' }}>
                        {availabilityLabel(child.availability)}
                        {child.availability_until
                          ? ` jusqu'au ${formatReturnDate(child.availability_until)}`
                          : ' — durée non précisée'}
                      </span>
                    </div>
                  )}
                  {child.availability && child.availability !== 'disponible' && child.availability_note && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Remarque du club : {child.availability_note}
                    </p>
                  )}
                </div>
              </div>
              {!child.photo_path && !child.photo_url && !dismissedPhotoNudges.has(child.id) && (
                <div
                  className="flex items-center gap-3 rounded-lg px-3 py-2 -mt-1"
                  style={{
                    background: 'var(--info-soft, var(--accent-soft))',
                    border: '1px solid var(--info, var(--accent))',
                  }}
                >
                  <Camera size={14} style={{ color: 'var(--info-text, var(--accent-text))', flexShrink: 0 }} />
                  <p className="text-xs flex-1" style={{ color: 'var(--info-text, var(--accent-text))' }}>
                    Ajoutez une photo pour compl&eacute;ter la fiche de {child.first_name}
                  </p>
                  <label
                    className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-1 cursor-pointer transition-colors"
                    style={{
                      background: 'var(--accent)',
                      color: 'var(--text-inverse)',
                      opacity: childUploading === child.id ? 0.6 : 1,
                      pointerEvents: childUploading === child.id ? 'none' : 'auto',
                    }}
                  >
                    {childUploading === child.id ? 'Envoi...' : 'Ajouter'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !user?.id) return;
                        e.target.value = '';
                        setChildUploading(child.id);
                        try {
                          const blob = await resizeAndCropImage(file, 200, 0.85);
                          const path = `${child.id}/photo.webp`;
                          const { error: upErr } = await supabase.storage
                            .from('member-photos')
                            .upload(path, blob, { contentType: 'image/webp', upsert: true, cacheControl: '3600' });
                          if (upErr) throw upErr;
                          const { data: pub } = supabase.storage.from('member-photos').getPublicUrl(path);
                          const url = `${pub.publicUrl}?v=${Date.now()}`;
                          await supabase.from('members').update({ photo_path: path, photo_url: url }).eq('id', child.id);
                          setChildren((prev) =>
                            prev.map((c) => c.id === child.id ? { ...c, photo_path: path, photo_url: url } : c)
                          );
                        } catch (err: any) {
                          showToast(err?.message || "Erreur lors de l'envoi", 'error');
                        } finally {
                          setChildUploading(null);
                        }
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setDismissedPhotoNudges((prev) => new Set(prev).add(child.id))}
                    className="p-0.5 rounded-full transition-colors"
                    style={{ color: 'var(--info-text, var(--accent-text))' }}
                    aria-label="Masquer"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              </div>
            ))}
          </div>
        </ProfileCard>
      )}

      {financeEnabled && (
        <MyInvoicesBlock
          memberIds={children.map((c) => c.id)}
          showMemberColumn={true}
          profileId={user?.id}
        />
      )}

      <MesValidations />

      <CalendarSubscription />

      <ChangePasswordSection />

      <TermsAcceptanceSection />

      <DeleteAccountSection />
        </>
      )}
      <Toast toast={toast} />

      <StandardModal
        isOpen={showAddChild}
        onClose={() => { if (!addingChild) { setShowAddChild(false); setAddChildAvs(''); } }}
        title="Ajouter un enfant"
      >
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Rattachez un enfant déjà inscrit au club à votre compte. Saisissez son numéro AVS : s'il est licencié au club et que vous êtes son représentant légal, il sera rattaché immédiatement. Sinon, une demande sera envoyée à l'administration. (Pour inscrire un nouvel enfant qui n'est pas encore au club, utilisez le formulaire d'inscription du club.)
          </p>
          <div>
            <label
              className="block text-xs font-semibold mb-1.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              Numéro AVS de l'enfant
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={addChildAvs}
              onChange={(e) => setAddChildAvs(formatAVS(e.target.value))}
              placeholder="756.XXXX.XXXX.XX"
              autoFocus
              disabled={addingChild}
              maxLength={16}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--bg-input)',
                border: `1px solid ${addChildAvs && !validateAVS(addChildAvs) ? 'var(--danger)' : 'var(--border-color)'}`,
                color: 'var(--text-primary)',
              }}
            />
            <p
              className="text-xs mt-1.5"
              style={{
                color: addChildAvs && !validateAVS(addChildAvs) ? 'var(--danger-text)' : 'var(--text-secondary)',
              }}
            >
              Format attendu : 756.XXXX.XXXX.XX
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              size="sm"
              type="button"
              disabled={addingChild}
              onClick={() => { setShowAddChild(false); setAddChildAvs(''); }}
            >
              Annuler
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="button"
              loading={addingChild}
              disabled={!validateAVS(addChildAvs) || addingChild}
              onClick={confirmAddChild}
            >
              {addingChild ? 'Ajout...' : 'Ajouter'}
            </Button>
          </div>
        </div>
      </StandardModal>
      <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', marginTop: '24px', paddingBottom: '8px' }}>Version {__APP_VERSION__}</p>
    </div>
  );
}
