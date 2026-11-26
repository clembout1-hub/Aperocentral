import React, {useEffect, useMemo, useState} from 'react';
import type {User as SupabaseUser} from '@supabase/supabase-js';
import {
  Bike,
  Car,
  Check,
  Copy,
  Footprints,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  Search,
  Sparkles,
  TrainFront,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {isSupabaseConfigured} from '../lib/supabase';
import {
  createSharedGroup,
  deleteOrLeaveSharedGroup,
  respondFriendInvite,
  searchProfiles,
  sendFriendInvite,
  signInWithEmail,
  signOutAccount,
  signUpWithProfile,
  updateMyProfile,
} from '../lib/supabaseService';
import type {
  SharedGroupWithMembers,
  SupabaseFriendship,
  SupabaseProfile,
  TransportMode,
} from '../types/apero';
import {getModeLabel} from '../utils/geo';
import {AddressAutocompleteInput} from './AddressAutocompleteInput';

export type AccountFriendsModalTab = 'profile' | 'friends' | 'groups';

interface AccountAndFriendsModalProps {
  isOpen: boolean;
  initialTab: AccountFriendsModalTab;
  onClose: () => void;
  mapsReady: boolean;
  authUser: SupabaseUser | null;
  profile: SupabaseProfile | null;
  friendships: SupabaseFriendship[];
  groups: SharedGroupWithMembers[];
  onRefreshData: () => Promise<void>;
  onProfileUpdated: (profile: SupabaseProfile | null) => void;
  onLaunchGroup: (group: SharedGroupWithMembers) => void;
  onShowToast: (msg: string) => void;
}

const MODES: {id: TransportMode; label: string; icon: React.ComponentType<{className?: string}>}[] = [
  {id: 'TRANSIT', label: 'Métro/RER', icon: TrainFront},
  {id: 'BICYCLING', label: 'Vélo', icon: Bike},
  {id: 'WALKING', label: 'Marche', icon: Footprints},
  {id: 'DRIVING', label: 'Voiture', icon: Car},
];

async function copyClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export const AccountAndFriendsModal: React.FC<AccountAndFriendsModalProps> = ({
  isOpen,
  initialTab,
  onClose,
  mapsReady,
  authUser,
  profile,
  friendships,
  groups,
  onRefreshData,
  onProfileUpdated,
  onLaunchGroup,
  onShowToast,
}) => {
  const [tab, setTab] = useState<AccountFriendsModalTab>(initialTab);
  const [authSubMode, setAuthSubMode] = useState<'login' | 'signup'>('login');

  // Auth / Profile form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [addressText, setAddressText] = useState('');
  const [addressCoords, setAddressCoords] = useState<{lat: number; lng: number} | null>(null);
  const [defaultMode, setDefaultMode] = useState<TransportMode>('TRANSIT');
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);

  // Friend search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SupabaseProfile[]>([]);
  const [hasSearchedProfiles, setHasSearchedProfiles] = useState(false);
  const [isSearchingProfiles, setIsSearchingProfiles] = useState(false);
  const [friendsBusyId, setFriendsBusyId] = useState<string | null>(null);
  const [friendsError, setFriendsError] = useState<string | null>(null);

  // Group creation state
  const [groupName, setGroupName] = useState('');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [isGroupBusy, setIsGroupBusy] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setAuthError(null);
      setAuthInfo(null);
      setFriendsError(null);
      setGroupError(null);
      if (profile) {
        setUsername(profile.username);
        setAddressText(profile.default_address || '');
        setAddressCoords(
          profile.default_lat !== null && profile.default_lng !== null
            ? {lat: profile.default_lat, lng: profile.default_lng}
            : null
        );
        setDefaultMode(profile.default_mode || 'TRANSIT');
      }
    }
  }, [isOpen, initialTab, profile]);

  const receivedPending = useMemo(
    () =>
      profile
        ? friendships.filter((f) => f.status === 'pending' && f.addressee_id === profile.id)
        : [],
    [friendships, profile]
  );

  const sentPending = useMemo(
    () =>
      profile
        ? friendships.filter((f) => f.status === 'pending' && f.requester_id === profile.id)
        : [],
    [friendships, profile]
  );

  const acceptedFriends = useMemo(() => {
    if (!profile) return [] as {friendshipId: string; friend: SupabaseProfile}[];
    const items: {friendshipId: string; friend: SupabaseProfile}[] = [];
    for (const f of friendships) {
      if (f.status !== 'accepted') continue;
      const other = f.requester_id === profile.id ? f.addressee : f.requester;
      if (other) {
        items.push({friendshipId: f.id, friend: other});
      }
    }
    return items;
  }, [friendships, profile]);

  if (!isOpen) return null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setAuthError('Saisis ton email et ton mot de passe.');
      return;
    }
    setIsAuthBusy(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      const res = await signInWithEmail(email, password);
      onProfileUpdated(res.profile);
      await onRefreshData();
      onShowToast(`Bienvenue ${res.profile?.username || ''} !`);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Erreur de connexion.');
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setAuthError('Indique ton pseudo.');
      return;
    }
    if (!email.trim() || !password || password.length < 6) {
      setAuthError('Saisis un email valide et un mot de passe (6 caractères min.).');
      return;
    }
    if (!addressCoords || !addressText.trim()) {
      setAuthError('Sélectionne ton adresse de départ dans les suggestions Google Maps.');
      return;
    }

    setIsAuthBusy(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      const res = await signUpWithProfile({
        email,
        password,
        username,
        defaultAddress: addressText,
        defaultLat: addressCoords.lat,
        defaultLng: addressCoords.lng,
        defaultMode,
      });

      if (res.needsEmailConfirmation) {
        setAuthInfo(
          'Compte créé ! Confirme ton adresse via le lien reçu par e-mail puis connecte-toi.'
        );
        setAuthSubMode('login');
      } else {
        onProfileUpdated(res.profile);
        await onRefreshData();
        onShowToast(`Compte créé ! Ton ID : ${res.profile?.short_id || ''}`);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Erreur lors de l’inscription.');
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!username.trim()) {
      setAuthError('Le pseudo est obligatoire.');
      return;
    }
    if (!addressCoords || !addressText.trim()) {
      setAuthError('Sélectionne une adresse valide dans les suggestions Google Maps.');
      return;
    }

    setIsAuthBusy(true);
    setAuthError(null);
    try {
      const updated = await updateMyProfile(profile.id, {
        username,
        default_address: addressText,
        default_lat: addressCoords.lat,
        default_lng: addressCoords.lng,
        default_mode: defaultMode,
      });
      onProfileUpdated(updated);
      await onRefreshData();
      onShowToast('Profil mis à jour');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Impossible de mettre à jour.');
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setIsAuthBusy(true);
    try {
      await signOutAccount();
      onProfileUpdated(null);
      setSearchResults([]);
      setHasSearchedProfiles(false);
      onShowToast('Déconnecté');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Erreur de déconnexion.');
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleSearchProfiles = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!searchQuery.trim()) {
      setFriendsError('Entre un pseudo ou un ID (ex. CLEM-4829).');
      return;
    }
    setIsSearchingProfiles(true);
    setFriendsError(null);
    try {
      const results = await searchProfiles(searchQuery, profile.id);
      setSearchResults(results);
      setHasSearchedProfiles(true);
    } catch (err) {
      setFriendsError(err instanceof Error ? err.message : 'Erreur de recherche.');
    } finally {
      setIsSearchingProfiles(false);
    }
  };

  const handleSendInvite = async (targetProfile: SupabaseProfile) => {
    if (!profile) return;
    setFriendsBusyId(targetProfile.id);
    setFriendsError(null);
    try {
      await sendFriendInvite(profile.id, targetProfile.id);
      await onRefreshData();
      onShowToast(`Invitation envoyée à ${targetProfile.username}`);
    } catch (err) {
      setFriendsError(err instanceof Error ? err.message : "Impossible d'envoyer l'invitation.");
    } finally {
      setFriendsBusyId(null);
    }
  };

  const handleRespondInvite = async (friendshipId: string, accept: boolean) => {
    setFriendsBusyId(friendshipId);
    setFriendsError(null);
    try {
      await respondFriendInvite(friendshipId, accept);
      await onRefreshData();
      onShowToast(accept ? 'Ami ajouté !' : 'Invitation refusée');
    } catch (err) {
      setFriendsError(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setFriendsBusyId(null);
    }
  };

  const handleCreateGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!groupName.trim()) {
      setGroupError('Donne un nom au groupe (ex. Les Galopins).');
      return;
    }
    if (selectedFriendIds.length === 0) {
      setGroupError('Sélectionne au moins un ami accepté.');
      return;
    }

    setIsGroupBusy(true);
    setGroupError(null);
    try {
      await createSharedGroup(groupName, profile.id, selectedFriendIds);
      setGroupName('');
      setSelectedFriendIds([]);
      await onRefreshData();
      onShowToast(`Groupe « ${groupName.trim()} » créé !`);
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : 'Impossible de créer le groupe.');
    } finally {
      setIsGroupBusy(false);
    }
  };

  const handleDeleteOrLeaveGroup = async (group: SharedGroupWithMembers) => {
    if (!profile) return;
    setIsGroupBusy(true);
    setGroupError(null);
    try {
      await deleteOrLeaveSharedGroup(group.id, profile.id, group.created_by);
      await onRefreshData();
      onShowToast(
        group.created_by === profile.id ? 'Groupe supprimé' : 'Tu as quitté le groupe'
      );
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : 'Erreur sur le groupe.');
    } finally {
      setIsGroupBusy(false);
    }
  };

  const getRelationStatus = (
    otherId: string
  ): 'none' | 'accepted' | 'sent' | 'received' => {
    if (!profile) return 'none';
    const match = friendships.find(
      (f) =>
        (f.requester_id === profile.id && f.addressee_id === otherId) ||
        (f.addressee_id === profile.id && f.requester_id === otherId)
    );
    if (!match) return 'none';
    if (match.status === 'accepted') return 'accepted';
    return match.requester_id === profile.id ? 'sent' : 'received';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--bg-backdrop)] backdrop-blur-md p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-friends-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-xl flex-col rounded-t-3xl sm:rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card-strong)] p-5 shadow-2xl backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0A84FF]/15 text-[#0A84FF]">
              {profile ? (
                <UserCheck className="h-4 w-4" aria-hidden="true" />
              ) : (
                <User className="h-4 w-4" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0">
              <h2
                id="account-friends-title"
                className="truncate text-base font-semibold tracking-tight text-[var(--text-primary)]"
              >
                Compte &amp; Amis
              </h2>
              <p className="truncate text-xs text-[var(--text-secondary)]">
                {profile
                  ? `${profile.username} · ID ${profile.short_id}`
                  : 'Connecte-toi pour retrouver tes amis et groupes'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer Compte & Amis"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 3 Tabs: Mon Profil | Amis & Invitations | Mes Groupes */}
        <div
          role="tablist"
          aria-label="Navigation Compte & Amis"
          className="mt-4 grid grid-cols-3 gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'profile'}
            onClick={() => setTab('profile')}
            className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
              tab === 'profile'
                ? 'bg-[#0A84FF] text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <User className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">Mon Profil</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'friends'}
            onClick={() => setTab('friends')}
            className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
              tab === 'friends'
                ? 'bg-[#0A84FF] text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <UserPlus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">Amis &amp; Invitations</span>
            {receivedPending.length > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  tab === 'friends' ? 'bg-white text-[#0A84FF]' : 'bg-[#FF453A] text-white'
                }`}
              >
                {receivedPending.length}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'groups'}
            onClick={() => setTab('groups')}
            className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
              tab === 'groups'
                ? 'bg-[#0A84FF] text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">Mes Groupes</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto space-y-4 pr-0.5">
          {!isSupabaseConfigured && (
            <div className="rounded-2xl border border-[#FF9F0A]/40 bg-[#FF9F0A]/12 p-4 text-xs text-[#FF9F0A] space-y-1">
              <p className="font-semibold">Configuration Supabase requise</p>
              <p className="text-[var(--text-secondary)]">
                Ajoute <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> dans
                les variables d&apos;environnement pour activer les comptes en ligne, les
                invitations d&apos;amis et les groupes partagés.
              </p>
            </div>
          )}

          {/* TAB 1: MON PROFIL */}
          {tab === 'profile' && isSupabaseConfigured && (
            <>
              {authUser && profile ? (
                <div className="space-y-4">
                  {/* Short ID Card + Logout */}
                  <div className="rounded-2xl border border-[#0A84FF]/35 bg-[#0A84FF]/10 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-medium text-[#0A84FF]">
                          Mon identifiant ApéroCentral
                        </span>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="text-lg font-bold tracking-wider text-[var(--text-primary)] tabular-nums">
                            {profile.short_id}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              void copyClipboard(profile.short_id);
                              onShowToast(`ID ${profile.short_id} copié !`);
                            }}
                            aria-label="Copier mon ID"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-card-strong)] text-[#0A84FF] hover:opacity-80"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {authUser.email && (
                          <p className="text-[11px] text-[var(--text-secondary)]">
                            {authUser.email}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleSignOut()}
                        disabled={isAuthBusy}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card-strong)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)] hover:border-[#FF453A]/50 hover:text-[#FF453A] disabled:opacity-50"
                      >
                        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Déconnexion</span>
                      </button>
                    </div>
                  </div>

                  {/* Update Profile Form */}
                  <form
                    onSubmit={(e) => void handleUpdateProfile(e)}
                    className="space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4"
                  >
                    <div>
                      <label
                        htmlFor="profile-username"
                        className="block text-[11px] font-medium text-[var(--text-secondary)]"
                      >
                        Pseudo
                      </label>
                      <input
                        id="profile-username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        maxLength={35}
                        className="mt-1 min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[#0A84FF] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="profile-default-address"
                        className="block text-[11px] font-medium text-[var(--text-secondary)]"
                      >
                        Adresse de départ par défaut
                      </label>
                      <div className="mt-1">
                        {mapsReady ? (
                          <AddressAutocompleteInput
                            inputId="profile-default-address"
                            value={addressText}
                            isSelectedCoordsValid={addressCoords !== null}
                            placeholder="Adresse par défaut…"
                            onChangeText={(txt) => {
                              setAddressText(txt);
                              setAddressCoords(null);
                            }}
                            onSelectAddress={(sel) => {
                              setAddressText(sel.address);
                              setAddressCoords({lat: sel.lat, lng: sel.lng});
                              setAuthError(null);
                            }}
                          />
                        ) : (
                          <div className="flex min-h-[42px] items-center rounded-xl border border-[#FF9F0A]/30 bg-[#FF9F0A]/10 px-3 text-xs text-[#FF9F0A]">
                            Clé Google Maps requise pour autocompléter l&apos;adresse.
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)]">
                        Mode de transport préféré
                      </span>
                      <div className="grid grid-cols-4 gap-1 rounded-xl bg-[var(--bg-card)] p-1">
                        {MODES.map((m) => {
                          const Icon = m.icon;
                          const active = defaultMode === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setDefaultMode(m.id)}
                              className={`flex min-h-[38px] flex-col sm:flex-row items-center justify-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-semibold transition-all ${
                                active
                                  ? 'bg-[#0A84FF] text-white shadow-sm'
                                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span className="truncate">{m.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {authError && (
                      <p role="alert" className="text-xs font-medium text-[#FF453A]">
                        {authError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={isAuthBusy}
                      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0A84FF]/90 disabled:opacity-50"
                    >
                      {isAuthBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="h-4 w-4" aria-hidden="true" />
                      )}
                      <span>Enregistrer mon profil</span>
                    </button>
                  </form>
                </div>
              ) : (
                <div className="space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                  <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--bg-card)] p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthSubMode('login');
                        setAuthError(null);
                      }}
                      className={`min-h-[36px] rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                        authSubMode === 'login'
                          ? 'bg-[#0A84FF] text-white'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      Se connecter
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthSubMode('signup');
                        setAuthError(null);
                      }}
                      className={`min-h-[36px] rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                        authSubMode === 'signup'
                          ? 'bg-[#0A84FF] text-white'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      Créer un compte
                    </button>
                  </div>

                  {authInfo && (
                    <p
                      role="status"
                      className="rounded-xl border border-[#30D158]/40 bg-[#30D158]/10 px-3 py-2 text-xs font-medium text-[#30D158]"
                    >
                      {authInfo}
                    </p>
                  )}

                  {authSubMode === 'login' ? (
                    <form onSubmit={(e) => void handleSignIn(e)} className="space-y-3">
                      <div>
                        <label
                          htmlFor="login-email"
                          className="block text-[11px] font-medium text-[var(--text-secondary)]"
                        >
                          Email
                        </label>
                        <input
                          id="login-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="prenom@exemple.com"
                          autoComplete="email"
                          className="mt-1 min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[#0A84FF] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="login-password"
                          className="block text-[11px] font-medium text-[var(--text-secondary)]"
                        >
                          Mot de passe
                        </label>
                        <input
                          id="login-password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          autoComplete="current-password"
                          className="mt-1 min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[#0A84FF] focus:outline-none"
                        />
                      </div>

                      {authError && (
                        <p role="alert" className="text-xs font-medium text-[#FF453A]">
                          {authError}
                        </p>
                      )}

                      <button
                        type="submit"
                        disabled={isAuthBusy}
                        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0A84FF]/90 disabled:opacity-50"
                      >
                        {isAuthBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <LogIn className="h-4 w-4" aria-hidden="true" />
                        )}
                        <span>Se connecter</span>
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={(e) => void handleSignUp(e)} className="space-y-3">
                      <div>
                        <label
                          htmlFor="signup-username"
                          className="block text-[11px] font-medium text-[var(--text-secondary)]"
                        >
                          Pseudo
                        </label>
                        <input
                          id="signup-username"
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="Ex: Clem"
                          maxLength={35}
                          className="mt-1 min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[#0A84FF] focus:outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="signup-email"
                            className="block text-[11px] font-medium text-[var(--text-secondary)]"
                          >
                            Email
                          </label>
                          <input
                            id="signup-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="prenom@exemple.com"
                            autoComplete="email"
                            className="mt-1 min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[#0A84FF] focus:outline-none"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="signup-password"
                            className="block text-[11px] font-medium text-[var(--text-secondary)]"
                          >
                            Mot de passe
                          </label>
                          <input
                            id="signup-password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="6 caractères min."
                            autoComplete="new-password"
                            className="mt-1 min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[#0A84FF] focus:outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="signup-address"
                          className="block text-[11px] font-medium text-[var(--text-secondary)]"
                        >
                          Adresse de départ par défaut
                        </label>
                        <div className="mt-1">
                          {mapsReady ? (
                            <AddressAutocompleteInput
                              inputId="signup-address"
                              value={addressText}
                              isSelectedCoordsValid={addressCoords !== null}
                              placeholder="Ex: 14 Rue de Rivoli, Paris…"
                              onChangeText={(txt) => {
                                setAddressText(txt);
                                setAddressCoords(null);
                              }}
                              onSelectAddress={(sel) => {
                                setAddressText(sel.address);
                                setAddressCoords({lat: sel.lat, lng: sel.lng});
                                setAuthError(null);
                              }}
                            />
                          ) : (
                            <div className="flex min-h-[42px] items-center rounded-xl border border-[#FF9F0A]/30 bg-[#FF9F0A]/10 px-3 text-xs text-[#FF9F0A]">
                              Configure une clé Google Maps pour rechercher ton adresse.
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <span className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)]">
                          Mode de transport préféré
                        </span>
                        <div className="grid grid-cols-4 gap-1 rounded-xl bg-[var(--bg-card)] p-1">
                          {MODES.map((m) => {
                            const Icon = m.icon;
                            const active = defaultMode === m.id;
                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => setDefaultMode(m.id)}
                                className={`flex min-h-[38px] flex-col sm:flex-row items-center justify-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-semibold transition-all ${
                                  active
                                    ? 'bg-[#0A84FF] text-white shadow-sm'
                                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                }`}
                              >
                                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span className="truncate">{m.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {authError && (
                        <p role="alert" className="text-xs font-medium text-[#FF453A]">
                          {authError}
                        </p>
                      )}

                      <button
                        type="submit"
                        disabled={isAuthBusy}
                        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0A84FF]/90 disabled:opacity-50"
                      >
                        {isAuthBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Sparkles className="h-4 w-4" aria-hidden="true" />
                        )}
                        <span>Créer mon compte</span>
                      </button>
                    </form>
                  )}
                </div>
              )}
            </>
          )}

          {/* TAB 2: AMIS & INVITATIONS */}
          {tab === 'friends' && isSupabaseConfigured && (
            <>
              {!profile ? (
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-center space-y-3">
                  <p className="text-xs text-[var(--text-secondary)]">
                    Connecte-toi dans l&apos;onglet <strong>Mon Profil</strong> pour rechercher des
                    amis par Pseudo ou ID et gérer tes invitations.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab('profile')}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[#0A84FF] px-4 py-1.5 text-xs font-semibold text-white"
                  >
                    <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Aller à Mon Profil</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Received Pending Invites */}
                  {receivedPending.length > 0 && (
                    <div className="rounded-2xl border border-[#FF9F0A]/40 bg-[#FF9F0A]/10 p-4 space-y-2.5">
                      <h3 className="text-xs font-semibold text-[#FF9F0A]">
                        Invitations reçues ({receivedPending.length})
                      </h3>
                      <div className="space-y-2">
                        {receivedPending.map((inv) => (
                          <div
                            key={inv.id}
                            className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card-strong)] p-2.5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
                                {inv.requester?.username || 'Utilisateur'}{' '}
                                {inv.requester?.short_id && (
                                  <span className="text-[11px] font-bold text-[#0A84FF]">
                                    ({inv.requester.short_id})
                                  </span>
                                )}
                              </p>
                              {inv.requester?.default_address && (
                                <p className="truncate text-[11px] text-[var(--text-secondary)]">
                                  {inv.requester.default_address}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={friendsBusyId === inv.id}
                                onClick={() => void handleRespondInvite(inv.id, true)}
                                className="inline-flex min-h-[32px] items-center gap-1 rounded-full bg-[#30D158] px-3 py-1 text-[11px] font-semibold text-black hover:bg-[#30D158]/90 disabled:opacity-50"
                              >
                                <Check className="h-3 w-3" aria-hidden="true" />
                                <span>Accepter</span>
                              </button>
                              <button
                                type="button"
                                disabled={friendsBusyId === inv.id}
                                onClick={() => void handleRespondInvite(inv.id, false)}
                                className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-[#FF453A]/40 bg-[#FF453A]/15 px-2.5 py-1 text-[11px] font-semibold text-[#FF453A] hover:bg-[#FF453A]/25 disabled:opacity-50"
                              >
                                <X className="h-3 w-3" aria-hidden="true" />
                                <span>Refuser</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Online Profile Search by Username or short_id */}
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
                    <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                      Rechercher un ami par Pseudo ou ID
                    </h3>

                    <form onSubmit={(e) => void handleSearchProfiles(e)} className="flex gap-2">
                      <div className="relative flex-1">
                        <Search
                          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-secondary)]"
                          aria-hidden="true"
                        />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Pseudo ou ID (ex. CLEM-4829)…"
                          className="min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] pl-8 pr-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:border-[#0A84FF] focus:outline-none"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isSearchingProfiles}
                        className="inline-flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-xl bg-[#0A84FF] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0A84FF]/90 disabled:opacity-50"
                      >
                        {isSearchingProfiles ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Search className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        <span>Chercher</span>
                      </button>
                    </form>

                    {friendsError && (
                      <p role="alert" className="text-xs font-medium text-[#FF453A]">
                        {friendsError}
                      </p>
                    )}

                    {hasSearchedProfiles && searchResults.length === 0 && !isSearchingProfiles && (
                      <p className="text-xs text-[var(--text-secondary)]">
                        Aucun utilisateur trouvé pour « {searchQuery} ».
                      </p>
                    )}

                    {searchResults.length > 0 && (
                      <ul className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]">
                        {searchResults.map((candidate) => {
                          const rel = getRelationStatus(candidate.id);
                          return (
                            <li
                              key={candidate.id}
                              className="flex items-center justify-between gap-2 px-3 py-2.5"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                                  <span className="truncate">{candidate.username}</span>
                                  <span className="rounded bg-[var(--bg-surface)] px-1.5 py-0.5 text-[10px] font-bold text-[#0A84FF] tabular-nums">
                                    {candidate.short_id}
                                  </span>
                                </div>
                                <p className="truncate text-[11px] text-[var(--text-secondary)]">
                                  {candidate.default_address || 'Adresse non renseignée'} ·{' '}
                                  {getModeLabel(candidate.default_mode)}
                                </p>
                              </div>

                              {rel === 'none' ? (
                                <button
                                  type="button"
                                  disabled={friendsBusyId === candidate.id}
                                  onClick={() => void handleSendInvite(candidate)}
                                  className="inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-full bg-[#0A84FF] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#0A84FF]/90 disabled:opacity-50"
                                >
                                  <UserPlus className="h-3 w-3" aria-hidden="true" />
                                  <span>Inviter</span>
                                </button>
                              ) : rel === 'accepted' ? (
                                <span className="shrink-0 rounded-full bg-[#30D158]/20 px-2.5 py-1 text-[10px] font-semibold text-[#30D158]">
                                  Déjà ami
                                </span>
                              ) : rel === 'sent' ? (
                                <span className="shrink-0 rounded-full bg-[var(--bg-surface)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-secondary)]">
                                  En attente
                                </span>
                              ) : (
                                <span className="shrink-0 rounded-full bg-[#FF9F0A]/20 px-2.5 py-1 text-[10px] font-semibold text-[#FF9F0A]">
                                  T&apos;a invité
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {/* Accepted Friends List */}
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-2.5">
                    <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                      Mes amis ({acceptedFriends.length})
                    </h3>

                    {acceptedFriends.length === 0 ? (
                      <p className="text-xs text-[var(--text-secondary)]">
                        Aucun ami accepté pour le moment. Recherche un ami par son pseudo ou ID
                        ci-dessus !
                      </p>
                    ) : (
                      <ul className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]">
                        {acceptedFriends.map(({friendshipId, friend}) => (
                          <li
                            key={friendshipId}
                            className="flex items-center justify-between gap-2 px-3 py-2"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                                <span className="truncate">{friend.username}</span>
                                <span className="rounded bg-[var(--bg-surface)] px-1.5 py-0.5 text-[10px] font-bold text-[#0A84FF] tabular-nums">
                                  {friend.short_id}
                                </span>
                                <span className="text-[11px] font-normal text-[var(--text-secondary)]">
                                  · {getModeLabel(friend.default_mode)}
                                </span>
                              </div>
                              <p className="truncate text-[11px] text-[var(--text-secondary)]">
                                {friend.default_address || 'Adresse non renseignée'}
                              </p>
                            </div>

                            <button
                              type="button"
                              disabled={friendsBusyId === friendshipId}
                              onClick={() => void handleRespondInvite(friendshipId, false)}
                              aria-label={`Retirer ${friend.username}`}
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[#FF453A]/15 hover:text-[#FF453A]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {sentPending.length > 0 && (
                      <p className="pt-1 text-[11px] text-[var(--text-secondary)]">
                        {sentPending.length} invitation{sentPending.length > 1 ? 's' : ''} envoyée
                        {sentPending.length > 1 ? 's' : ''} en attente de réponse.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* TAB 3: MES GROUPES */}
          {tab === 'groups' && isSupabaseConfigured && (
            <>
              {!profile ? (
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-center space-y-3">
                  <p className="text-xs text-[var(--text-secondary)]">
                    Connecte-toi dans l&apos;onglet <strong>Mon Profil</strong> pour créer et charger
                    des groupes partagés avec tes amis.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab('profile')}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[#0A84FF] px-4 py-1.5 text-xs font-semibold text-white"
                  >
                    <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Aller à Mon Profil</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Shared Groups List */}
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3">
                    <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                      Mes groupes partagés ({groups.length})
                    </h3>

                    {groups.length === 0 ? (
                      <p className="text-xs text-[var(--text-secondary)]">
                        Aucun groupe partagé pour le moment. Crée-en un ci-dessous avec tes amis
                        acceptés !
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {groups.map((grp) => (
                          <div
                            key={grp.id}
                            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                                  {grp.name}
                                </p>
                                <p className="text-[11px] text-[var(--text-secondary)] tabular-nums">
                                  {grp.members.length} membre{grp.members.length > 1 ? 's' : ''}
                                </p>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onLaunchGroup(grp);
                                    onClose();
                                  }}
                                  className="inline-flex min-h-[34px] items-center gap-1 rounded-full bg-[#0A84FF] px-3 py-1 text-xs font-semibold text-white hover:bg-[#0A84FF]/90"
                                >
                                  <span>Charger en 1 tap</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isGroupBusy}
                                  onClick={() => void handleDeleteOrLeaveGroup(grp)}
                                  aria-label={`Supprimer ou quitter ${grp.name}`}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[#FF453A]/15 hover:text-[#FF453A]"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                              {grp.members.map((m) => (
                                <span
                                  key={`${grp.id}-${m.id}`}
                                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-0.5 text-[11px] text-[var(--text-primary)]"
                                >
                                  <span className="font-medium">{m.username}</span>
                                  <span className="text-[10px] text-[#0A84FF]">
                                    · {getModeLabel(m.default_mode)}
                                  </span>
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Create Shared Group Form */}
                  <form
                    onSubmit={(e) => void handleCreateGroupSubmit(e)}
                    className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3"
                  >
                    <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                      Créer un groupe commun
                    </h3>
                    <input
                      type="text"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      placeholder="Ex: Les Galopins"
                      maxLength={40}
                      className="min-h-[40px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:border-[#0A84FF] focus:outline-none"
                    />

                    {acceptedFriends.length === 0 ? (
                      <p className="text-xs text-[var(--text-secondary)]">
                        Ajoute d&apos;abord des amis dans l&apos;onglet{' '}
                        <strong>Amis &amp; Invitations</strong> pour pouvoir former un groupe.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-[var(--text-secondary)]">
                          Sélectionne tes amis (tu es inclus automatiquement) :
                        </p>
                        {acceptedFriends.map(({friend}) => {
                          const checked = selectedFriendIds.includes(friend.id);
                          return (
                            <label
                              key={`pick-${friend.id}`}
                              className="flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 text-xs text-[var(--text-primary)]"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setSelectedFriendIds((prev) =>
                                    prev.includes(friend.id)
                                      ? prev.filter((id) => id !== friend.id)
                                      : [...prev, friend.id]
                                  )
                                }
                                className="h-4 w-4 rounded accent-[#0A84FF]"
                              />
                              <span className="font-semibold">{friend.username}</span>
                              <span className="text-[10px] font-bold text-[#0A84FF]">
                                {friend.short_id}
                              </span>
                              <span className="truncate text-[11px] text-[var(--text-secondary)]">
                                · {getModeLabel(friend.default_mode)}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {groupError && (
                      <p role="alert" className="text-xs font-medium text-[#FF453A]">
                        {groupError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={isGroupBusy || acceptedFriends.length === 0}
                      className="flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-full bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0A84FF]/90 disabled:opacity-50"
                    >
                      {isGroupBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span>Créer le groupe partagé</span>
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
