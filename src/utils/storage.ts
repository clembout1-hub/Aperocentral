import LZString from 'lz-string';
import type {
  ExcludedCustomZone,
  ExcludedZones,
  Participant,
  SavedFavoriteAddress,
  SessionState,
  TransportMode,
  UserPrefs,
} from '../types/apero';

const USER_PREFS_KEY = 'aperocentral_user_prefs';
const FAVORITES_KEY = 'aperocentral_saved_places';
const GMAPS_KEY_STORAGE = 'aperocentral_gmaps_key';

function getDefaultDateTimeLocal(): string {
  const now = new Date();
  now.setHours(19, 0, 0, 0);
  if (now.getTime() < Date.now()) {
    now.setDate(now.getDate() + 1);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

const INITIAL_DEFAULT_DATETIME = getDefaultDateTimeLocal();

export function createDefaultSession(): SessionState {
  return {
    title: 'Apéro de la Team',
    dateTime: INITIAL_DEFAULT_DATETIME,
    participants: [],
    excludedZones: {
      postalCodes: [],
      postalCodeLabels: {},
      customZones: [],
    },
    votes: {},
    customPrices: {},
  };
}

export function encodeSessionToUrlParam(session: SessionState): string {
  const json = JSON.stringify(session);
  return LZString.compressToEncodedURIComponent(json);
}

function decodeBase64Utf8(str: string): string | null {
  try {
    const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
    const padLength = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + '='.repeat(padLength);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function isValidMode(mode: unknown): mode is TransportMode {
  return (
    mode === 'TRANSIT' ||
    mode === 'BICYCLING' ||
    mode === 'WALKING' ||
    mode === 'DRIVING'
  );
}

function sanitizeExcludedZones(raw: unknown): ExcludedZones {
  if (!raw || typeof raw !== 'object') {
    return {postalCodes: [], postalCodeLabels: {}, customZones: []};
  }
  const obj = raw as Record<string, unknown>;

  const rawCodes = Array.isArray(obj.postalCodes)
    ? obj.postalCodes
    : Array.isArray(obj.arrondissements)
    ? obj.arrondissements
    : [];

  const postalCodes = Array.from(
    new Set(
      rawCodes.filter((cp): cp is string => typeof cp === 'string' && /^\d{5}$/.test(cp.trim()))
    )
  );

  const postalCodeLabels: Record<string, string> = {};
  if (obj.postalCodeLabels && typeof obj.postalCodeLabels === 'object' && !Array.isArray(obj.postalCodeLabels)) {
    for (const [cp, label] of Object.entries(obj.postalCodeLabels as Record<string, unknown>)) {
      if (/^\d{5}$/.test(cp) && typeof label === 'string' && label.trim()) {
        postalCodeLabels[cp] = label.trim().slice(0, 40);
      }
    }
  }

  const customZones: ExcludedCustomZone[] = Array.isArray(obj.customZones)
    ? obj.customZones
        .filter((z): z is Record<string, unknown> => Boolean(z && typeof z === 'object'))
        .map((z, idx) => ({
          id: typeof z.id === 'string' && z.id ? z.id : `ez_${idx}`,
          label: typeof z.label === 'string' ? z.label.trim().slice(0, 60) : 'Zone exclue',
          lat: typeof z.lat === 'number' && Number.isFinite(z.lat) ? z.lat : 0,
          lng: typeof z.lng === 'number' && Number.isFinite(z.lng) ? z.lng : 0,
          radiusMeters: typeof z.radiusMeters === 'number' && z.radiusMeters > 0 ? z.radiusMeters : 500,
          postalCode: typeof z.postalCode === 'string' ? z.postalCode : null,
        }))
        .filter((z) => z.lat !== 0 || z.lng !== 0)
    : [];

  return {postalCodes, postalCodeLabels, customZones};
}

function sanitizeSession(raw: unknown): SessionState | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;

  const participants: Participant[] = Array.isArray(data.participants)
    ? data.participants
        .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === 'object'))
        .map((p, idx) => ({
          id: typeof p.id === 'string' && p.id ? p.id : `p_${idx}_${Date.now()}`,
          name: typeof p.name === 'string' ? p.name.trim().slice(0, 40) : 'Pote',
          address: typeof p.address === 'string' ? p.address : '',
          lat: typeof p.lat === 'number' && Number.isFinite(p.lat) ? p.lat : 0,
          lng: typeof p.lng === 'number' && Number.isFinite(p.lng) ? p.lng : 0,
          mode: isValidMode(p.mode) ? p.mode : 'TRANSIT',
        }))
        .filter((p) => p.name.length > 0 && (p.lat !== 0 || p.lng !== 0))
    : [];

  const votes: Record<string, string[]> = {};
  if (data.votes && typeof data.votes === 'object' && !Array.isArray(data.votes)) {
    for (const [placeId, voters] of Object.entries(data.votes as Record<string, unknown>)) {
      if (Array.isArray(voters)) {
        votes[placeId] = voters.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
      }
    }
  }

  const customPrices: Record<string, string> = {};
  if (data.customPrices && typeof data.customPrices === 'object' && !Array.isArray(data.customPrices)) {
    for (const [placeId, price] of Object.entries(data.customPrices as Record<string, unknown>)) {
      if (typeof price === 'string' && price.trim().length > 0) {
        customPrices[placeId] = price.trim().slice(0, 12);
      }
    }
  }

  return {
    title: typeof data.title === 'string' && data.title.trim() ? data.title.trim().slice(0, 80) : 'Apéro de la Team',
    dateTime: typeof data.dateTime === 'string' && data.dateTime ? data.dateTime : getDefaultDateTimeLocal(),
    participants,
    excludedZones: sanitizeExcludedZones(data.excludedZones),
    votes,
    customPrices,
  };
}

export function decodeSessionFromUrlParam(param: string): SessionState | null {
  if (!param) return null;

  try {
    const decompressed = LZString.decompressFromEncodedURIComponent(param);
    if (decompressed) {
      const parsed = JSON.parse(decompressed);
      const valid = sanitizeSession(parsed);
      if (valid) return valid;
    }
  } catch {
    // Fallback to Base64 UTF-8
  }

  const base64Json = decodeBase64Utf8(param);
  if (base64Json) {
    try {
      const parsed = JSON.parse(base64Json);
      return sanitizeSession(parsed);
    } catch {
      return null;
    }
  }

  return null;
}

export function getSessionFromUrl(): SessionState | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('s');
  if (!raw) return null;
  return decodeSessionFromUrlParam(raw);
}

export function buildShareUrl(session: SessionState): string {
  const url = new URL(window.location.href);
  const encoded = encodeSessionToUrlParam(session);
  url.searchParams.set('s', encoded);
  return url.toString();
}

export function syncSessionToUrl(session: SessionState): string {
  const url = new URL(window.location.href);
  const hasExclusions =
    session.excludedZones.postalCodes.length > 0 ||
    session.excludedZones.customZones.length > 0;
  if (
    session.participants.length === 0 &&
    !hasExclusions &&
    Object.keys(session.votes).length === 0 &&
    Object.keys(session.customPrices).length === 0 &&
    session.title === 'Apéro de la Team' &&
    session.dateTime === INITIAL_DEFAULT_DATETIME
  ) {
    url.searchParams.delete('s');
  } else {
    url.searchParams.set('s', encodeSessionToUrlParam(session));
  }
  window.history.replaceState({}, '', url.toString());
  return url.toString();
}

export function loadUserPrefs(): UserPrefs | null {
  try {
    const raw = localStorage.getItem(USER_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserPrefs>;
    if (
      typeof parsed.name === 'string' &&
      typeof parsed.address === 'string' &&
      typeof parsed.lat === 'number' &&
      typeof parsed.lng === 'number' &&
      isValidMode(parsed.mode)
    ) {
      return {
        name: parsed.name,
        address: parsed.address,
        lat: parsed.lat,
        lng: parsed.lng,
        mode: parsed.mode,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveUserPrefs(prefs: UserPrefs): void {
  try {
    localStorage.setItem(USER_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadFavoriteAddresses(): SavedFavoriteAddress[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedFavoriteAddress =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        typeof item.label === 'string' &&
        typeof item.address === 'string' &&
        typeof item.lat === 'number' &&
        typeof item.lng === 'number' &&
        isValidMode(item.mode)
    );
  } catch {
    return [];
  }
}

export function saveFavoriteAddresses(favorites: SavedFavoriteAddress[]): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadCustomApiKey(): string {
  try {
    return localStorage.getItem(GMAPS_KEY_STORAGE)?.trim() || '';
  } catch {
    return '';
  }
}

export function saveCustomApiKey(key: string): void {
  try {
    const cleaned = key.trim();
    if (cleaned) {
      localStorage.setItem(GMAPS_KEY_STORAGE, cleaned);
    } else {
      localStorage.removeItem(GMAPS_KEY_STORAGE);
    }
  } catch {
    // Ignore storage quota errors
  }
}
