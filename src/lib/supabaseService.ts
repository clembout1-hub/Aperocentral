import type {User} from '@supabase/supabase-js';
import type {
  SharedGroupWithMembers,
  SupabaseFriendship,
  SupabaseProfile,
  TransportMode,
} from '../types/apero';
import {supabase} from './supabase';

const VALID_MODES = new Set<TransportMode>(['TRANSIT', 'BICYCLING', 'WALKING', 'DRIVING']);

function normalizeMode(raw: unknown): TransportMode {
  return typeof raw === 'string' && VALID_MODES.has(raw as TransportMode)
    ? (raw as TransportMode)
    : 'TRANSIT';
}

export function generateShortId(username: string): string {
  const clean = username
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const prefix = (clean.slice(0, 4) || 'APER').padEnd(4, 'X');
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return `${prefix}-${digits}`;
}

function normalizeProfileRow(raw: Record<string, unknown>): SupabaseProfile {
  return {
    id: String(raw.id || ''),
    short_id: String(raw.short_id || '').toUpperCase(),
    username: String(raw.username || 'Utilisateur'),
    default_address: typeof raw.default_address === 'string' ? raw.default_address : null,
    default_lat:
      typeof raw.default_lat === 'number' && Number.isFinite(raw.default_lat)
        ? raw.default_lat
        : null,
    default_lng:
      typeof raw.default_lng === 'number' && Number.isFinite(raw.default_lng)
        ? raw.default_lng
        : null,
    default_mode: normalizeMode(raw.default_mode),
    created_at: typeof raw.created_at === 'string' ? raw.created_at : undefined,
  };
}

export async function ensureMyProfile(user: User): Promise<SupabaseProfile | null> {
  if (!supabase) return null;

  const {data: existing, error: fetchError} = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (existing) {
    return normalizeProfileRow(existing as Record<string, unknown>);
  }

  if (fetchError && fetchError.code !== 'PGRST116') {
    throw new Error(fetchError.message);
  }

  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const fallbackName =
    (typeof meta.username === 'string' && meta.username.trim()) ||
    user.email?.split('@')[0] ||
    'Pote';
  const shortId =
    typeof meta.short_id === 'string' && meta.short_id.trim()
      ? meta.short_id.trim().toUpperCase()
      : generateShortId(fallbackName);

  const payload = {
    id: user.id,
    short_id: shortId,
    username: fallbackName,
    default_address:
      typeof meta.default_address === 'string' && meta.default_address.trim()
        ? meta.default_address.trim()
        : null,
    default_lat:
      typeof meta.default_lat === 'number' && Number.isFinite(meta.default_lat)
        ? meta.default_lat
        : null,
    default_lng:
      typeof meta.default_lng === 'number' && Number.isFinite(meta.default_lng)
        ? meta.default_lng
        : null,
    default_mode: normalizeMode(meta.default_mode),
  };

  const {data: upserted, error: upsertError} = await supabase
    .from('profiles')
    .upsert(payload, {onConflict: 'id'})
    .select('*')
    .single();

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  return normalizeProfileRow(upserted as Record<string, unknown>);
}

export async function signUpWithProfile(params: {
  email: string;
  password: string;
  username: string;
  defaultAddress: string;
  defaultLat: number;
  defaultLng: number;
  defaultMode: TransportMode;
}): Promise<{
  user: User | null;
  profile: SupabaseProfile | null;
  needsEmailConfirmation: boolean;
}> {
  if (!supabase) {
    throw new Error('Supabase non configuré.');
  }

  const shortId = generateShortId(params.username);
  const {data, error} = await supabase.auth.signUp({
    email: params.email.trim(),
    password: params.password,
    options: {
      data: {
        short_id: shortId,
        username: params.username.trim(),
        default_address: params.defaultAddress.trim(),
        default_lat: params.defaultLat,
        default_lng: params.defaultLng,
        default_mode: params.defaultMode,
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data.user) {
    throw new Error('Impossible de créer le compte.');
  }

  if (data.session) {
    const profilePayload = {
      id: data.user.id,
      short_id: shortId,
      username: params.username.trim(),
      default_address: params.defaultAddress.trim(),
      default_lat: params.defaultLat,
      default_lng: params.defaultLng,
      default_mode: params.defaultMode,
    };

    const {data: profileData, error: profileErr} = await supabase
      .from('profiles')
      .upsert(profilePayload, {onConflict: 'id'})
      .select('*')
      .single();

    if (profileErr) {
      throw new Error(profileErr.message);
    }

    return {
      user: data.user,
      profile: normalizeProfileRow(profileData as Record<string, unknown>),
      needsEmailConfirmation: false,
    };
  }

  return {
    user: data.user,
    profile: null,
    needsEmailConfirmation: true,
  };
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<{user: User; profile: SupabaseProfile | null}> {
  if (!supabase) {
    throw new Error('Supabase non configuré.');
  }

  const {data, error} = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!data.user) {
    throw new Error('Connexion impossible.');
  }

  const profile = await ensureMyProfile(data.user);
  return {user: data.user, profile};
}

export async function signOutAccount(): Promise<void> {
  if (!supabase) return;
  const {error} = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
}

export async function updateMyProfile(
  userId: string,
  updates: {
    username: string;
    default_address: string;
    default_lat: number;
    default_lng: number;
    default_mode: TransportMode;
  }
): Promise<SupabaseProfile> {
  if (!supabase) {
    throw new Error('Supabase non configuré.');
  }

  const {data, error} = await supabase
    .from('profiles')
    .update({
      username: updates.username.trim(),
      default_address: updates.default_address.trim(),
      default_lat: updates.default_lat,
      default_lng: updates.default_lng,
      default_mode: updates.default_mode,
    })
    .eq('id', userId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeProfileRow(data as Record<string, unknown>);
}

export async function searchProfiles(
  rawQuery: string,
  currentUserId: string
): Promise<SupabaseProfile[]> {
  if (!supabase) return [];
  const sanitized = rawQuery.replace(/[,().*%\\]/g, '').trim();
  if (!sanitized) return [];

  const [byShortId, byUsername] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .ilike('short_id', `%${sanitized}%`)
      .neq('id', currentUserId)
      .limit(10),
    supabase
      .from('profiles')
      .select('*')
      .ilike('username', `%${sanitized}%`)
      .neq('id', currentUserId)
      .limit(10),
  ]);

  if (byShortId.error) throw new Error(byShortId.error.message);
  if (byUsername.error) throw new Error(byUsername.error.message);

  const byId = new Map<string, SupabaseProfile>();
  for (const row of [...(byShortId.data || []), ...(byUsername.data || [])]) {
    const prof = normalizeProfileRow(row as Record<string, unknown>);
    if (prof.id && !byId.has(prof.id)) {
      byId.set(prof.id, prof);
    }
  }
  return Array.from(byId.values());
}

export async function fetchMyFriendships(
  currentUserId: string
): Promise<SupabaseFriendship[]> {
  if (!supabase) return [];

  const [sentRes, receivedRes] = await Promise.all([
    supabase
      .from('friendships')
      .select('id, requester_id, addressee_id, status, created_at')
      .eq('requester_id', currentUserId),
    supabase
      .from('friendships')
      .select('id, requester_id, addressee_id, status, created_at')
      .eq('addressee_id', currentUserId),
  ]);

  if (sentRes.error) throw new Error(sentRes.error.message);
  if (receivedRes.error) throw new Error(receivedRes.error.message);

  const rawRows = [...(sentRes.data || []), ...(receivedRes.data || [])];
  const uniqueMap = new Map<string, (typeof rawRows)[number]>();
  const otherIds = new Set<string>();

  for (const row of rawRows) {
    uniqueMap.set(String(row.id), row);
    if (row.requester_id !== currentUserId) otherIds.add(String(row.requester_id));
    if (row.addressee_id !== currentUserId) otherIds.add(String(row.addressee_id));
  }

  const profilesById = new Map<string, SupabaseProfile>();
  if (otherIds.size > 0) {
    const {data: profs, error: profErr} = await supabase
      .from('profiles')
      .select('*')
      .in('id', Array.from(otherIds));

    if (profErr) throw new Error(profErr.message);
    for (const p of profs || []) {
      const normalized = normalizeProfileRow(p as Record<string, unknown>);
      profilesById.set(normalized.id, normalized);
    }
  }

  return Array.from(uniqueMap.values())
    .map((row) => ({
      id: String(row.id),
      requester_id: String(row.requester_id),
      addressee_id: String(row.addressee_id),
      status: (row.status === 'accepted' ? 'accepted' : 'pending') as 'pending' | 'accepted',
      created_at: typeof row.created_at === 'string' ? row.created_at : undefined,
      requester: profilesById.get(String(row.requester_id)),
      addressee: profilesById.get(String(row.addressee_id)),
    }))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

export async function sendFriendInvite(
  requesterId: string,
  addresseeId: string
): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré.');
  if (requesterId === addresseeId) {
    throw new Error('Tu ne peux pas t’inviter toi-même.');
  }

  const [forwardRes, reverseRes] = await Promise.all([
    supabase
      .from('friendships')
      .select('id, status')
      .eq('requester_id', requesterId)
      .eq('addressee_id', addresseeId)
      .maybeSingle(),
    supabase
      .from('friendships')
      .select('id, status')
      .eq('requester_id', addresseeId)
      .eq('addressee_id', requesterId)
      .maybeSingle(),
  ]);

  if (forwardRes.error) throw new Error(forwardRes.error.message);
  if (reverseRes.error) throw new Error(reverseRes.error.message);

  if (forwardRes.data || reverseRes.data) {
    throw new Error('Une invitation ou amitié existe déjà avec cet utilisateur.');
  }

  const {error} = await supabase.from('friendships').insert({
    requester_id: requesterId,
    addressee_id: addresseeId,
    status: 'pending',
  });

  if (error) throw new Error(error.message);
}

export async function respondFriendInvite(
  friendshipId: string,
  accept: boolean
): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré.');

  if (accept) {
    const {error} = await supabase
      .from('friendships')
      .update({status: 'accepted'})
      .eq('id', friendshipId);
    if (error) throw new Error(error.message);
  } else {
    const {error} = await supabase
      .from('friendships')
      .delete()
      .eq('id', friendshipId);
    if (error) throw new Error(error.message);
  }
}

export async function removeFriendship(friendshipId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré.');
  const {error} = await supabase.from('friendships').delete().eq('id', friendshipId);
  if (error) throw new Error(error.message);
}

export async function fetchMySharedGroups(
  currentUserId: string
): Promise<SharedGroupWithMembers[]> {
  if (!supabase) return [];

  const {data: myMemberships, error: memErr} = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', currentUserId);

  if (memErr) throw new Error(memErr.message);

  const groupIds = Array.from(
    new Set((myMemberships || []).map((m) => String(m.group_id)).filter(Boolean))
  );

  if (groupIds.length === 0) return [];

  const [groupsRes, allMembersRes] = await Promise.all([
    supabase
      .from('groups')
      .select('id, name, created_by, created_at')
      .in('id', groupIds)
      .order('created_at', {ascending: false}),
    supabase
      .from('group_members')
      .select('group_id, user_id')
      .in('group_id', groupIds),
  ]);

  if (groupsRes.error) throw new Error(groupsRes.error.message);
  if (allMembersRes.error) throw new Error(allMembersRes.error.message);

  const memberUserIds = Array.from(
    new Set((allMembersRes.data || []).map((m) => String(m.user_id)).filter(Boolean))
  );

  const profilesById = new Map<string, SupabaseProfile>();
  if (memberUserIds.length > 0) {
    const {data: profs, error: profErr} = await supabase
      .from('profiles')
      .select('*')
      .in('id', memberUserIds);
    if (profErr) throw new Error(profErr.message);
    for (const p of profs || []) {
      const normalized = normalizeProfileRow(p as Record<string, unknown>);
      profilesById.set(normalized.id, normalized);
    }
  }

  return (groupsRes.data || []).map((g) => {
    const gid = String(g.id);
    const members = (allMembersRes.data || [])
      .filter((m) => String(m.group_id) === gid)
      .map((m) => profilesById.get(String(m.user_id)))
      .filter((p): p is SupabaseProfile => Boolean(p));

    return {
      id: gid,
      name: String(g.name || 'Groupe'),
      created_by: String(g.created_by || ''),
      created_at: typeof g.created_at === 'string' ? g.created_at : undefined,
      members,
    };
  });
}

export async function createSharedGroup(
  name: string,
  creatorId: string,
  friendIds: string[]
): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré.');

  const {data: groupRow, error: grpErr} = await supabase
    .from('groups')
    .insert({
      name: name.trim(),
      created_by: creatorId,
    })
    .select('id')
    .single();

  if (grpErr || !groupRow) {
    throw new Error(grpErr?.message || 'Impossible de créer le groupe.');
  }

  const groupId = String(groupRow.id);
  const memberIds = Array.from(new Set([creatorId, ...friendIds]));
  const rows = memberIds.map((uid) => ({
    group_id: groupId,
    user_id: uid,
  }));

  const {error: memErr} = await supabase.from('group_members').insert(rows);
  if (memErr) {
    throw new Error(memErr.message);
  }
}

export async function deleteOrLeaveSharedGroup(
  groupId: string,
  currentUserId: string,
  createdBy: string
): Promise<void> {
  if (!supabase) throw new Error('Supabase non configuré.');

  if (createdBy === currentUserId) {
    const {error} = await supabase.from('groups').delete().eq('id', groupId);
    if (error) throw new Error(error.message);
  } else {
    const {error} = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', currentUserId);
    if (error) throw new Error(error.message);
  }
}
