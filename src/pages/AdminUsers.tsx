import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { invokeFunction } from '../lib/invokeFunction';
import { useTenant } from '../context/TenantContext';
import { Users, Trash2, KeyRound, Mail, Key, CircleAlert as AlertCircle, CircleCheck as CheckCircle, ListFilter as Filter, UserPlus, Award, ChevronUp, ChevronDown, ChevronsUpDown, RotateCw, XCircle, Clock } from 'lucide-react';
import SearchInput from '../components/ui/SearchInput';
import PasswordInput from '../components/PasswordInput';
import { passwordLongEnough, mapPasswordAuthError, PasswordLengthHint, PasswordMismatchHint } from '../components/PasswordChecklist';
import { Alert } from '../components/ui/Alert';
import { ConfirmModal } from '../components/ConfirmModal';
import { EmailChangeModal } from '../components/EmailChangeModal';
import { updateUserEmail } from '../lib/updateEmail';
import CreateUserModal from '../components/CreateUserModal';
import { useModuleAccess } from '../hooks/useModuleAccess';
import useEscapeKey from '../hooks/useEscapeKey';
import Button from '../components/ui/Button';
import PageTitleCount from '../components/PageTitleCount';
import { translateAuthError } from '../utils/authErrorMessages';

interface UserData {
  id: string;
  full_name: string;
  email: string;
  role: string;
  last_sign_in_at: string | null;
  created_at: string;
  is_active: boolean;
  team_name?: string;
}

export default function AdminUsers() {
  const { clubId } = useTenant();
  const [users, setUsers] = useState<UserData[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [confrerieMembers, setConfrerieMembers] = useState<{profile_id: string | null; email: string | null}[]>([]);
  const [confrerieLabel, setConfrerieLabel] = useState('Confrérie');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleteUserName, setDeleteUserName] = useState<string>('');
  const [deleting, setDeleting] = useState(false);
  const [deletedUserId, setDeletedUserId] = useState<string | null>(null);
  const [resetEmail, setResetEmail] = useState<string | null>(null);
  const [resetUserName, setResetUserName] = useState<string>('');
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Auto-dismiss du bandeau : 4 s pour un succès, 8 s pour une erreur (le temps de lire)
  useEffect(() => { document.title = 'Utilisateurs - ClubSphere' }, [])

  useEffect(() => {
    if (!message) return;
    const delay = message.type === 'success' ? 4000 : 8000;
    const timer = setTimeout(() => setMessage(null), delay);
    return () => clearTimeout(timer);
  }, [message]);
  const [emailChangeUser, setEmailChangeUser] = useState<UserData | null>(null);
  const [setPasswordUser, setSetPasswordUser] = useState<UserData | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [settingPassword, setSettingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordErrors, setPasswordErrors] = useState<string[] | null>(null);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [invites, setInvites] = useState<any[]>([]);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const [revokeInvite, setRevokeInvite] = useState<{ id: string; email: string } | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [sortField, setSortField] = useState<keyof UserData | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const { canEdit: canEditUsers } = useModuleAccess('utilisateurs');

  const handleCloseCreateModal = useCallback(() => setShowCreateUserModal(false), []);
  const handleClosePasswordModal = useCallback(() => { setSetPasswordUser(null); setNewPassword(''); setConfirmPassword(''); setPasswordErrors(null); setPasswordError(null); }, []);

  useEscapeKey(handleCloseCreateModal);
  useEscapeKey(handleClosePasswordModal);

  useEffect(() => {
    fetchUsers();
    fetchTeams();
    fetchConfrerieData();
    fetchInvites();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [searchTerm, roleFilter, teamFilter, users]);

  const fetchTeams = async () => {
    const { data } = await supabase
      .from('teams')
      .select('id, name')
      .order('name');

    if (data) {
      setTeams(data);
    }
  };

  const fetchConfrerieData = async () => {
    const [{ data: members }, { data: settings }] = await Promise.all([
      supabase.from('confrerie_members').select('profile_id, email').eq('active', true),
      supabase.from('club_settings').select('confrerie_label').limit(1).maybeSingle(),
    ]);
    if (members) setConfrerieMembers(members);
    if (settings?.confrerie_label) setConfrerieLabel(settings.confrerie_label);
  };

  const isConfrerieMatch = (user: UserData) => {
    return confrerieMembers.some(m =>
      (m.profile_id && m.profile_id === user.id) ||
      (m.email && user.email && m.email.toLowerCase() === user.email.toLowerCase())
    );
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase.rpc('get_all_users_admin');

      if (error) throw error;

      const userData: UserData[] = (data || []).map((user: any) => ({
        id: user.id,
        full_name: user.full_name || user.email,
        email: user.email,
        role: user.role,
        last_sign_in_at: user.last_sign_in_at,
        created_at: user.created_at,
        is_active: true,
        team_name: user.team_name || ''
      }));

      setUsers(userData);
      setFilteredUsers(userData);
    } catch (error) {
      console.error('Error fetching users:', error);
      setMessage({ type: 'error', text: 'Erreur lors du chargement des utilisateurs' });
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...users];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(user =>
        user.full_name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term)
      );
    }

    if (roleFilter === 'confrerie') {
      filtered = filtered.filter(user => isConfrerieMatch(user));
    } else if (roleFilter !== 'all') {
      filtered = filtered.filter(user => user.role === roleFilter);
    }

    if (teamFilter !== 'all') {
      filtered = filtered.filter(user => user.team_name === teamFilter);
    }

    setFilteredUsers(filtered);
  };

  const handleDeleteClick = (user: UserData) => {
    setDeleteUserId(user.id);
    setDeleteUserName(user.full_name);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteUserId) return;

    try {
      setDeleting(true);

      const { data: fnData, error: functionError } = await invokeFunction('delete-user', {
        body: { user_id: deleteUserId },
      });

      if (functionError) throw new Error(functionError);
      if (fnData?.error) throw new Error(fnData.error);

      const removedId = deleteUserId;
      setDeleteUserId(null);
      setDeleteUserName('');
      setDeletedUserId(removedId);
      setTimeout(() => {
        setUsers(prev => prev.filter(u => u.id !== removedId));
        setDeletedUserId(null);
        setMessage({ type: 'success', text: 'Compte supprimé avec succès' });
      }, 800);
    } catch (error) {
      console.error('Error deleting user:', error);
      setMessage({ type: 'error', text: 'Erreur lors de la suppression du compte' });
    } finally {
      setDeleting(false);
    }
  };

  const handleResetPasswordClick = (user: UserData) => {
    setResetEmail(user.email);
    setResetUserName(user.full_name);
  };

  const handleResetPasswordConfirm = async () => {
    if (!resetEmail) return;
    try {
      setResetting(true);
      const { error } = await invokeFunction('send-password-reset', {
        body: { email: resetEmail, club_id: clubId }
      });
      if (error) throw new Error(error);
      setResetEmail(null);
      setResetUserName('');
      setMessage({ type: 'success', text: `Email de réinitialisation envoyé à ${resetEmail}` });
    } catch {
      setMessage({ type: 'error', text: 'Erreur lors de l\'envoi de l\'email de réinitialisation' });
    } finally {
      setResetting(false);
    }
  };

  const handleAdminEmailChangeConfirm = async (newEmail: string) => {
    if (!emailChangeUser) return;
    await updateUserEmail(emailChangeUser.id, newEmail, emailChangeUser.email);
    setEmailChangeUser(null);
    setMessage({ type: 'success', text: `Email modifié avec succès pour ${emailChangeUser.full_name}` });
    fetchUsers();
  };

  const openSetPassword = (user: UserData) => {
    setSetPasswordUser(user);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    setPasswordErrors(null);
  };

  const closeSetPassword = () => {
    if (settingPassword) return;
    setSetPasswordUser(null);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError(null);
    setPasswordErrors(null);
  };

  const canSetPassword = passwordLongEnough(newPassword) && newPassword === confirmPassword;

  const handleSetPasswordConfirm = async () => {
    if (!setPasswordUser || !canSetPassword) return;
    setSettingPassword(true);
    setPasswordError(null);
    setPasswordErrors(null);
    try {
      const { data, error } = await supabase.functions.invoke('update-user-password', {
        body: { user_id: setPasswordUser.id, new_password: newPassword },
      });
      if (error) {
        let serverMsg: string | null = null;
        try {
          const ctx = (error as any).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            serverMsg = body?.error || null;
          }
        } catch { /* unreadable */ }
        const mapped = mapPasswordAuthError(serverMsg);
        if (mapped) setPasswordErrors(mapped);
        else setPasswordError(serverMsg || 'Une erreur est survenue. Veuillez réessayer.');
        return;
      }
      if (data?.error) {
        const mapped = mapPasswordAuthError(data.error);
        if (mapped) setPasswordErrors(mapped);
        else setPasswordError(data.error);
        return;
      }
      setSetPasswordUser(null);
      setMessage({ type: 'success', text: `Mot de passe mis à jour pour ${setPasswordUser.full_name}` });
    } catch (err: any) {
      setPasswordError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setSettingPassword(false);
    }
  };

  const fetchInvites = async () => {
    const { data } = await supabase
      .from('user_invites')
      .select('id, email, first_name, last_name, role, status, sent_at, expires_at')
      .in('status', ['pending', 'expired'])
      .order('sent_at', { ascending: false });
    setInvites(data || []);
  };

  const handleResendInvite = async (invite: any) => {
    setInviteActionId(invite.id);
    try {
      const { data, error } = await invokeFunction('send-user-invite', {
        body: { action: 'resend', invite_id: invite.id },
      });
      if (error || data?.error) throw new Error(data?.error || error);
      setMessage({ type: 'success', text: `Invitation renvoyée à ${invite.email}` });
      fetchInvites();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || "Erreur lors du renvoi de l'invitation" });
    } finally {
      setInviteActionId(null);
    }
  };

  const handleRevokeConfirm = async () => {
    if (!revokeInvite) return;
    setRevoking(true);
    try {
      const { data, error } = await invokeFunction('send-user-invite', {
        body: { action: 'revoke', invite_id: revokeInvite.id },
      });
      if (error || data?.error) throw new Error(data?.error || error);
      setRevokeInvite(null);
      fetchInvites();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || "Erreur lors de la révocation" });
    } finally {
      setRevoking(false);
    }
  };

  const formatInviteDate = (dateString: string | null) => {
    if (!dateString) return '—';
    const d = new Date(dateString);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} · ${hours}h${minutes}`;
  };

  const formatInviteExpiry = (dateString: string | null) => {
    if (!dateString) return '—';
    const d = new Date(dateString);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}.${month}.${d.getFullYear()}`;
  };

  const isExpired = (invite: any) => invite.status === 'expired' || (invite.expires_at && new Date(invite.expires_at) < new Date());

  const getRoleLabel = (role: string) => {
    const roles: Record<string, string> = {
      parent: 'Parent',
      player: 'Joueur',
      coach: 'Entraîneur',
      committee: 'Comité',
      member: 'Membre',
      admin: 'Admin',
      president: 'Président',
      vice_president: 'Vice-Président',
      responsable_technique: 'Resp. Technique',
      responsable_competitions: 'Resp. Compétitions',
    };
    return roles[role] || role;
  };

  const getRoleStyle = (role: string): { background: string; color: string } => {
    const styles: Record<string, { background: string; color: string }> = {
      admin: { background: 'var(--danger-soft)', color: 'var(--danger-text)' },
      committee: { background: 'var(--purple-soft)', color: 'var(--purple-text)' },
      president: { background: 'var(--purple-soft)', color: 'var(--purple-text)' },
      vice_president: { background: 'var(--purple-soft)', color: 'var(--purple-text)' },
      responsable_technique: { background: 'var(--purple-soft)', color: 'var(--purple-text)' },
      responsable_competitions: { background: 'var(--purple-soft)', color: 'var(--purple-text)' },
      coach: { background: 'var(--info-soft)', color: 'var(--info-text)' },
      parent: { background: 'var(--success-soft)', color: 'var(--success-text)' },
      player: { background: 'var(--accent-soft)', color: 'var(--accent-text)' },
      member: { background: 'var(--accent-soft)', color: 'var(--accent-text)' },
      supporter: { background: 'var(--warning-soft)', color: 'var(--warning-text)' },
    };
    return styles[role] || { background: 'var(--bg-hover)', color: 'var(--text-muted)' };
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('fr-CH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return '-';
    const d = new Date(dateString);
    const day = d.getDate();
    const month = d.toLocaleDateString('fr-CH', { month: 'short' }).replace('.', '');
    const year = d.getFullYear();
    const hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${day} ${month} ${year} · ${hours}h${minutes}`;
  };

  const handleSort = (field: keyof UserData) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortedUsers = useMemo(() => {
    if (!sortField) return filteredUsers;
    return [...filteredUsers].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      let cmp: number;
      if (sortField === 'last_sign_in_at' || sortField === 'created_at') {
        cmp = new Date(aVal as string).getTime() - new Date(bVal as string).getTime();
      } else if (typeof aVal === 'string' && typeof bVal === 'string') {
        cmp = aVal.localeCompare(bVal, 'fr', { sensitivity: 'base' });
      } else {
        cmp = String(aVal).localeCompare(String(bVal));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredUsers, sortField, sortDir]);

  const SortIcon = ({ field }: { field: keyof UserData }) => {
    if (sortField !== field) return <ChevronsUpDown size={14} style={{ opacity: 0.4 }} />;
    return sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--accent)' }}></div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
              <Users className="w-5 h-5" />
              Utilisateurs
              <PageTitleCount total={users.length} filtered={filteredUsers.length} isFiltered={searchTerm !== '' || roleFilter !== 'all' || teamFilter !== 'all'} />
            </h1>
            <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Gestion des comptes utilisateurs</p>
          </div>
          {canEditUsers && (
            <Button
              variant="primary"
              onClick={() => setShowCreateUserModal(true)}
              leftIcon={<UserPlus size={16} />}
            >
              Créer un accès
            </Button>
          )}
        </div>

        {message && (
          <div className="p-4 rounded-lg flex items-center gap-3 border" style={
            message.type === 'success'
              ? { background: 'var(--success-soft)', color: 'var(--success-text)', borderColor: 'var(--success)' }
              : { background: 'var(--danger-soft)', color: 'var(--danger-text)', borderColor: 'var(--danger)' }
          }>
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Rechercher..."
            />

            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: 'var(--text-muted)' }} />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 appearance-none cursor-pointer"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
              >
                <option value="all">Tous les rôles</option>
                <option value="parent">Parent</option>
                <option value="player">Joueur</option>
                <option value="coach">Entraîneur</option>
                <option value="committee">Comité</option>
                <option value="member">Membre</option>
                <option value="supporter">Supporter</option>
                <option value="admin">Admin</option>
                <option value="confrerie">{confrerieLabel} ({users.filter(u => isConfrerieMatch(u)).length})</option>
              </select>
            </div>

            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: 'var(--text-muted)' }} />
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 appearance-none cursor-pointer"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
              >
                <option value="all">Toutes les équipes</option>
                {teams.map(team => (
                  <option key={team.id} value={team.name}>{team.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end" style={{ color: 'var(--text-secondary)' }}>
              {filteredUsers.length} utilisateur{filteredUsers.length !== 1 ? 's' : ''}
            </div>
          </div>

        {invites.length > 0 && (
          <div className="rounded-lg shadow-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-hover)' }}>
              <Clock size={16} style={{ color: 'var(--warning)' }} />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Invitations en attente ({invites.length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead style={{ background: 'var(--table-header-bg)' }}>
                  <tr className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                    <th className="text-left py-2.5 px-4 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Nom</th>
                    <th className="text-left py-2.5 px-4 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Email</th>
                    <th className="text-left py-2.5 px-4 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Rôle</th>
                    <th className="text-left py-2.5 px-4 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Envoyée le</th>
                    <th className="text-left py-2.5 px-4 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Expire le</th>
                    <th className="text-right py-2.5 px-4 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((inv) => {
                    const expired = isExpired(inv);
                    const name = [inv.first_name, inv.last_name].filter(Boolean).join(' ') || '—';
                    return (
                      <tr key={inv.id} className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                        <td className="py-2.5 px-4 text-sm" style={{ color: 'var(--text-primary)' }}>{name}</td>
                        <td className="py-2.5 px-4 text-sm" style={{ color: 'var(--text-primary)' }}>{inv.email}</td>
                        <td className="py-2.5 px-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium" style={getRoleStyle(inv.role)}>
                            {getRoleLabel(inv.role)}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-sm" style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{formatInviteDate(inv.sent_at)}</td>
                        <td className="py-2.5 px-4 text-sm" style={{ whiteSpace: 'nowrap', color: expired ? 'var(--danger-text)' : 'var(--text-secondary)' }}>
                          {formatInviteExpiry(inv.expires_at)}
                          {expired && <span className="ml-1.5 text-xs font-medium">Expirée</span>}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleResendInvite(inv)}
                              disabled={inviteActionId === inv.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                              title="Renvoyer l'invitation"
                            >
                              <RotateCw size={13} className={inviteActionId === inv.id ? 'animate-spin' : ''} />
                              Renvoyer
                            </button>
                            <button
                              onClick={() => setRevokeInvite({ id: inv.id, email: inv.email })}
                              disabled={inviteActionId === inv.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                              style={{ background: 'var(--danger-soft)', color: 'var(--danger-text)' }}
                              title="Révoquer l'invitation"
                            >
                              <XCircle size={13} />
                              Révoquer
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="rounded-lg shadow-xl overflow-hidden" style={{ background: 'var(--bg-card)' }}>
          <style>{`
            .users-stickhead thead th {
              position: sticky; top: 0; z-index: 2;
              background: var(--table-header-bg);
              border-bottom: 1px solid var(--border-color);
            }
            .users-stickhead thead th::after {
              content: ''; position: absolute; left: 0; right: 0; bottom: -8px; height: 8px;
              pointer-events: none;
              background: linear-gradient(to bottom, rgba(0,0,0,0.28), rgba(0,0,0,0));
            }
          `}</style>
          <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
            <table className="w-full users-stickhead">
              <thead style={{ background: 'var(--table-header-bg)' }}>
                <tr className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                  <th onClick={() => handleSort('full_name')} className="text-left py-3 px-4 text-sm font-semibold cursor-pointer select-none hover:opacity-80" style={{ color: 'var(--text-secondary)' }}><span className="inline-flex items-center gap-1">Nom <SortIcon field="full_name" /></span></th>
                  <th onClick={() => handleSort('email')} className="text-left py-3 px-4 text-sm font-semibold cursor-pointer select-none hover:opacity-80" style={{ color: 'var(--text-secondary)' }}><span className="inline-flex items-center gap-1">Email <SortIcon field="email" /></span></th>
                  <th onClick={() => handleSort('role')} className="text-left py-3 px-4 text-sm font-semibold cursor-pointer select-none hover:opacity-80" style={{ color: 'var(--text-secondary)' }}><span className="inline-flex items-center gap-1">R&ocirc;le <SortIcon field="role" /></span></th>
                  <th onClick={() => handleSort('team_name')} className="text-left py-3 px-4 text-sm font-semibold cursor-pointer select-none hover:opacity-80" style={{ color: 'var(--text-secondary)' }}><span className="inline-flex items-center gap-1">&Eacute;quipe <SortIcon field="team_name" /></span></th>
                  <th onClick={() => handleSort('last_sign_in_at')} className="text-left py-3 px-4 text-sm font-semibold cursor-pointer select-none hover:opacity-80" style={{ color: 'var(--text-secondary)' }}><span className="inline-flex items-center gap-1">Derni&egrave;re connexion <SortIcon field="last_sign_in_at" /></span></th>
                  <th onClick={() => handleSort('created_at')} className="text-left py-3 px-4 text-sm font-semibold cursor-pointer select-none hover:opacity-80" style={{ color: 'var(--text-secondary)' }}><span className="inline-flex items-center gap-1">Cr&eacute;&eacute; le <SortIcon field="created_at" /></span></th>
                  <th className="text-left py-3 px-4 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Statut</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b transition-colors duration-300"
                    style={
                      deletedUserId === user.id
                        ? { background: 'var(--success-soft)' }
                        : undefined
                    }
                  >
                    <td className="py-3 px-4" style={{ color: 'var(--text-primary)' }}>{user.full_name}</td>
                    <td className="py-3 px-4">{user.email}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium" style={getRoleStyle(user.role)}>
                          {getRoleLabel(user.role)}
                        </span>
                        {isConfrerieMatch(user) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>
                            <Award size={12} />
                            {confrerieLabel}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 px-4">{user.team_name || '-'}</td>
                    <td className="py-3 px-4" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(user.last_sign_in_at)}</td>
                    <td className="py-3 px-4">{formatDate(user.created_at)}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium" style={
                        user.is_active
                          ? { background: 'var(--success-soft)', color: 'var(--success-text)' }
                          : { background: 'var(--bg-hover)', color: 'var(--text-muted)' }
                      }>
                        {user.is_active ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {deletedUserId === user.id ? (
                        <CheckCircle className="w-4 h-4 ml-auto" style={{ color: 'var(--success)' }} />
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          {canEditUsers && (
                            <button
                              onClick={() => setEmailChangeUser(user)}
                              className="transition-colors hover:opacity-80"
                              style={{ color: 'var(--accent)' }}
                              title="Modifier l'email"
                            >
                              <Mail className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => openSetPassword(user)}
                            className="transition-colors hover:opacity-80"
                            style={{ color: 'var(--success)' }}
                            title="Définir un mot de passe"
                          >
                            <Key className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleResetPasswordClick(user)}
                            className="transition-colors hover:opacity-80"
                            style={{ color: 'var(--warning)' }}
                            title="Réinitialiser le mot de passe (email)"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          {canEditUsers && (
                            <button
                              onClick={() => handleDeleteClick(user)}
                              className="transition-colors hover:opacity-80"
                              style={{ color: 'var(--danger)' }}
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {sortedUsers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center" style={{ color: 'var(--text-secondary)' }}>
                      Aucun utilisateur trouvé
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!deleteUserId}
        title="Supprimer le compte"
        message={`Supprimer le compte de ${deleteUserName} ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        loadingLabel="Suppression..."
        cancelLabel="Annuler"
        confirmStyle="danger"
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          if (deleting) return;
          setDeleteUserId(null);
          setDeleteUserName('');
        }}
      />

      <ConfirmModal
        isOpen={!!resetEmail}
        title="Réinitialiser le mot de passe"
        message={`Envoyer un email de réinitialisation à ${resetUserName} (${resetEmail}) ?`}
        confirmLabel="Envoyer"
        loadingLabel="Envoi..."
        cancelLabel="Annuler"
        confirmStyle="primary"
        loading={resetting}
        onConfirm={handleResetPasswordConfirm}
        onCancel={() => {
          if (resetting) return;
          setResetEmail(null);
          setResetUserName('');
        }}
      />

      <ConfirmModal
        isOpen={!!revokeInvite}
        title="Révoquer l'invitation"
        message={`Révoquer l'invitation de ${revokeInvite?.email || ''} ? Le lien reçu ne fonctionnera plus.`}
        confirmLabel="Révoquer"
        loadingLabel="Révocation..."
        cancelLabel="Annuler"
        confirmStyle="danger"
        loading={revoking}
        onConfirm={handleRevokeConfirm}
        onCancel={() => {
          if (revoking) return;
          setRevokeInvite(null);
        }}
      />

      <EmailChangeModal
        isOpen={!!emailChangeUser}
        currentEmail={emailChangeUser?.email || ''}
        onConfirm={handleAdminEmailChangeConfirm}
        onCancel={() => setEmailChangeUser(null)}
      />

      {showCreateUserModal && (
        <CreateUserModal
          onClose={() => setShowCreateUserModal(false)}
          onSuccess={() => {
            fetchUsers();
            fetchInvites();
          }}
        />
      )}

      {setPasswordUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="rounded-xl w-full max-w-md shadow-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-center justify-between px-6 py-4 rounded-t-xl" style={{ background: 'var(--bg-modal-header)' }}>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-modal-header)' }}>Définir un mot de passe</h2>
              <button onClick={closeSetPassword} disabled={settingPassword} className="hover:opacity-80 transition-opacity disabled:opacity-50" style={{ color: 'var(--text-modal-header)' }}>
                <Key size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Définir un nouveau mot de passe pour <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{setPasswordUser.full_name}</span>
              </p>
              <div>
                <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Nouveau mot de passe</label>
                <PasswordInput
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPasswordErrors(null); }}
                  placeholder="Mot de passe"
                  className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 placeholder:text-[var(--text-muted)]"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
                  disabled={settingPassword}
                  autoFocus
                />
                <PasswordLengthHint password={newPassword} errors={passwordErrors} />
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Confirmer le mot de passe</label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Répéter le mot de passe"
                  className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 placeholder:text-[var(--text-muted)]"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
                  disabled={settingPassword}
                  onKeyDown={(e) => e.key === 'Enter' && handleSetPasswordConfirm()}
                />
                <PasswordMismatchHint password={newPassword} confirmPassword={confirmPassword} />
              </div>
              {passwordError && (
                <Alert variant="danger" title="Erreur">{passwordError}</Alert>
              )}
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <Button
                variant="secondary"
                onClick={closeSetPassword}
                disabled={settingPassword}
                className="flex-1"
              >
                Annuler
              </Button>
              <Button
                variant="primary"
                onClick={handleSetPasswordConfirm}
                disabled={settingPassword || !canSetPassword}
                className="flex-1"
              >
                {settingPassword ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
