import type {BarCandidate, LocalParisBarRecord} from '../types/apero';
import {haversineDistanceMeters, normalizeArrondissementToPostalCode} from './geo';

function parseOptionalNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const cleaned = raw.replace(',', '.').replace(/[^0-9.-]/g, '').trim();
    if (!cleaned) return null;
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseOptionalString(raw: unknown): string | null {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw);
  }
  return null;
}

function sanitizeCoverImageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/')
  ) {
    return trimmed;
  }
  return null;
}

export function normalizeLocalBarRecord(
  raw: unknown,
  idx: number
): LocalParisBarRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const name = parseOptionalString(obj.name ?? obj.title);
  if (!name) return null;

  const locationObj =
    obj.location && typeof obj.location === 'object'
      ? (obj.location as Record<string, unknown>)
      : obj.coords && typeof obj.coords === 'object'
      ? (obj.coords as Record<string, unknown>)
      : null;

  const lat = parseOptionalNumber(obj.lat ?? obj.latitude ?? locationObj?.lat);
  const lng = parseOptionalNumber(
    obj.lng ?? obj.lon ?? obj.longitude ?? locationObj?.lng ?? locationObj?.lon
  );

  if (lat === null || lng === null || (lat === 0 && lng === 0)) {
    return null;
  }

  const address =
    parseOptionalString(obj.address ?? obj.formattedAddress ?? obj.street) || '';
  const rawArr = parseOptionalString(obj.arrondissement ?? obj.district);
  const rawPostal = parseOptionalString(
    obj.postalCode ?? obj.codePostal ?? obj.zip ?? obj.zipCode
  );
  const postalCode = normalizeArrondissementToPostalCode(rawArr, rawPostal, address);

  const pintPrice = parseOptionalNumber(obj.pintPrice ?? obj.regularPrice ?? obj.price);
  const happyHourPrice = parseOptionalNumber(
    obj.happyHourPrice ?? obj.hhPrice ?? obj.happy_hour_price
  );
  const happyHourStart = parseOptionalString(
    obj.happyHourStart ?? obj.hhStart ?? obj.happy_hour_start
  );
  const happyHourEnd = parseOptionalString(
    obj.happyHourEnd ?? obj.hhEnd ?? obj.happy_hour_end
  );
  const rating = parseOptionalNumber(obj.rating ?? obj.note);
  const userRatingCount = parseOptionalNumber(
    obj.userRatingCount ?? obj.reviewsCount ?? obj.reviewCount
  );
  const coverImageUrl = sanitizeCoverImageUrl(
    obj.coverImageUrl ?? obj.imageUrl ?? obj.photoUrl ?? obj.image
  );
  const nearestStation = parseOptionalString(
    obj.nearestStation ?? obj.metro ?? obj.station
  );

  const id =
    parseOptionalString(obj.id ?? obj.placeId ?? obj.slug) ||
    `local_bar_${idx}_${lat.toFixed(5)}_${lng.toFixed(5)}`;

  return {
    id,
    name,
    address,
    arrondissement: rawArr,
    postalCode,
    lat,
    lng,
    pintPrice: pintPrice !== null && pintPrice > 0 ? pintPrice : null,
    happyHourPrice: happyHourPrice !== null && happyHourPrice > 0 ? happyHourPrice : null,
    happyHourStart,
    happyHourEnd,
    rating,
    userRatingCount,
    coverImageUrl,
    nearestStation,
  };
}

export async function fetchLocalParisBars(): Promise<LocalParisBarRecord[]> {
  try {
    const resp = await fetch('/bars-paris.json', {
      headers: {Accept: 'application/json'},
    });
    if (!resp.ok) return [];

    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      return [];
    }

    const rawText = await resp.text();
    const trimmed = rawText.trim();
    if (!trimmed || trimmed.startsWith('<')) {
      return [];
    }

    const parsed = JSON.parse(trimmed) as unknown;
    const rawList = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as {bars?: unknown[]}).bars)
      ? (parsed as {bars: unknown[]}).bars
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as {data?: unknown[]}).data)
      ? (parsed as {data: unknown[]}).data
      : [];

    const normalized: LocalParisBarRecord[] = [];
    for (let i = 0; i < rawList.length; i++) {
      const item = normalizeLocalBarRecord(rawList[i], i);
      if (item) {
        normalized.push(item);
      }
    }
    return normalized;
  } catch {
    return [];
  }
}

export function toBarCandidateFromLocal(
  record: LocalParisBarRecord,
  searchCenter: {lat: number; lng: number}
): BarCandidate {
  return {
    id: record.id,
    name: record.name,
    primaryType: 'bar',
    address: record.address,
    postalCode: record.postalCode,
    arrondissement: record.arrondissement,
    lat: record.lat,
    lng: record.lng,
    rating: record.rating,
    userRatingCount: record.userRatingCount,
    priceLevel: null,
    pintPrice: record.pintPrice,
    happyHourPrice: record.happyHourPrice,
    happyHourStart: record.happyHourStart,
    happyHourEnd: record.happyHourEnd,
    coverImageUrl: record.coverImageUrl,
    googleMapsURI: null,
    attributions: [],
    distanceFromCenterMeters: haversineDistanceMeters(searchCenter, {
      lat: record.lat,
      lng: record.lng,
    }),
    openingPeriods: null,
    isOpenAtTarget: null,
    closesLabel: null,
    nearestStation: record.nearestStation,
    source: 'local',
  };
}
