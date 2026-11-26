import type {
  BarCandidate,
  ExcludedZones,
  OpeningPeriodLite,
  Participant,
  RouteStepDetail,
  SessionState,
  TransportMode,
  TravelTimeInfo,
} from '../types/apero';

export interface ParisArrondissement {
  code: string; // '75001'..'75020'
  shortLabel: string; // '1er'..'20e'
  lat: number;
  lng: number;
}

export const PARIS_ARRONDISSEMENTS: ParisArrondissement[] = [
  {code: '75001', shortLabel: '1er', lat: 48.8626, lng: 2.3364},
  {code: '75002', shortLabel: '2e', lat: 48.8682, lng: 2.3426},
  {code: '75003', shortLabel: '3e', lat: 48.8629, lng: 2.3600},
  {code: '75004', shortLabel: '4e', lat: 48.8543, lng: 2.3574},
  {code: '75005', shortLabel: '5e', lat: 48.8448, lng: 2.3471},
  {code: '75006', shortLabel: '6e', lat: 48.8492, lng: 2.3324},
  {code: '75007', shortLabel: '7e', lat: 48.8565, lng: 2.3125},
  {code: '75008', shortLabel: '8e', lat: 48.8744, lng: 2.3110},
  {code: '75009', shortLabel: '9e', lat: 48.8769, lng: 2.3375},
  {code: '75010', shortLabel: '10e', lat: 48.8761, lng: 2.3612},
  {code: '75011', shortLabel: '11e', lat: 48.8588, lng: 2.3794},
  {code: '75012', shortLabel: '12e', lat: 48.8396, lng: 2.3958},
  {code: '75013', shortLabel: '13e', lat: 48.8286, lng: 2.3623},
  {code: '75014', shortLabel: '14e', lat: 48.8296, lng: 2.3266},
  {code: '75015', shortLabel: '15e', lat: 48.8414, lng: 2.2974},
  {code: '75016', shortLabel: '16e', lat: 48.8602, lng: 2.2756},
  {code: '75017', shortLabel: '17e', lat: 48.8872, lng: 2.3075},
  {code: '75018', shortLabel: '18e', lat: 48.8919, lng: 2.3481},
  {code: '75019', shortLabel: '19e', lat: 48.8870, lng: 2.3849},
  {code: '75020', shortLabel: '20e', lat: 48.8634, lng: 2.4008},
];

const ALLOWED_BAR_PRIMARY_TYPES = new Set([
  'bar',
  'pub',
  'wine_bar',
  'cocktail_bar',
  'bar_and_grill',
  'beer_garden',
  'brewpub',
  'brewery',
  'gastropub',
  'brasserie',
]);

const EXCLUDED_FOOD_AND_CAFE_TYPES = new Set([
  'restaurant',
  'fast_food_restaurant',
  'cafe',
  'bakery',
]);

const REJECTED_CORPORATE_TYPES = new Set([
  'corporate_office',
  'real_estate_agency',
  'travel_agency',
  'insurance_agency',
  'lawyer',
  'accounting',
  'finance',
  'consultant',
  'consulting',
  'local_government_office',
  'bank',
  'atm',
  'post_office',
  'school',
  'university',
  'hospital',
  'doctor',
  'pharmacy',
  'supermarket',
  'grocery_store',
  'convenience_store',
  'department_store',
  'clothing_store',
  'electronics_store',
  'hardware_store',
  'car_dealer',
  'car_repair',
  'coworking_space',
  'gym',
  'fitness_center',
  'lodging',
  'hotel',
]);

const REJECTED_NAME_REGEX =
  /\b(sarl|sas|sasu|eurl|sci|agence|cabinet|bureau|bureaux|coworking|holding|consulting|conseil|immobili[eè]re?|assurance|assurances|banque|si[eè]ge\s+social|entreprise|soci[eé]t[eé]|comptable|avocat|notaire|int[eé]rim|recrutement|showroom|supermarch[eé]|carrefour|monoprix|franprix|auch[ae]n|leclerc)\b/i;

const AU_BUREAU_EXCEPTION_REGEX = /\bau\s+bureau\b/i;

/**
 * Strict double filter:
 * 1) primaryType must be a bar/pub/wine_bar/cocktail_bar (rejecting restaurant, fast_food_restaurant, cafe, bakery)
 * 2) Reject corporate offices, agencies, stores, or company-like names (preserving "Au Bureau" pubs)
 */
export function isRealBarPlace(
  name: string,
  primaryType?: string | null,
  types?: string[] | null
): boolean {
  const normalizedPrimary = (primaryType || '').toLowerCase().trim();
  const normalizedTypes = Array.isArray(types) ? types.map((t) => t.toLowerCase().trim()) : [];

  if (normalizedPrimary) {
    if (EXCLUDED_FOOD_AND_CAFE_TYPES.has(normalizedPrimary)) {
      return false;
    }
    if (!ALLOWED_BAR_PRIMARY_TYPES.has(normalizedPrimary)) {
      return false;
    }
  } else if (normalizedTypes.length > 0) {
    const hasBarType = normalizedTypes.some((t) => ALLOWED_BAR_PRIMARY_TYPES.has(t));
    if (!hasBarType) return false;
  }

  if (normalizedTypes.some((t) => REJECTED_CORPORATE_TYPES.has(t))) {
    return false;
  }

  const trimmedName = (name || '').trim();
  if (!trimmedName) return false;

  if (REJECTED_NAME_REGEX.test(trimmedName)) {
    const isAuBureauPub =
      AU_BUREAU_EXCEPTION_REGEX.test(trimmedName) &&
      (normalizedPrimary === 'bar' ||
        normalizedPrimary === 'pub' ||
        normalizedPrimary === 'brasserie' ||
        normalizedTypes.includes('bar'));
    if (!isAuBureauPub) {
      return false;
    }
  }

  return true;
}

// Typical urban speeds in meters/min.
// To equalize travel *time*, slower modes get higher spatial weight (1 / speed).
const MODE_SPEED_MPM: Record<TransportMode, number> = {
  WALKING: 80, // ~4.8 km/h
  BICYCLING: 240, // ~14.4 km/h
  TRANSIT: 330, // ~19.8 km/h
  DRIVING: 420, // ~25.2 km/h urban traffic
};

export function calculateWeightedBarycenter(
  participants: Participant[]
): {lat: number; lng: number} | null {
  if (participants.length === 0) return null;
  if (participants.length === 1) {
    return {lat: participants[0].lat, lng: participants[0].lng};
  }

  let x = 0;
  let y = 0;
  let z = 0;
  let totalWeight = 0;

  for (const p of participants) {
    const speed = MODE_SPEED_MPM[p.mode] || MODE_SPEED_MPM.TRANSIT;
    const weight = 1 / speed;
    const latRad = (p.lat * Math.PI) / 180;
    const lngRad = (p.lng * Math.PI) / 180;
    x += weight * Math.cos(latRad) * Math.cos(lngRad);
    y += weight * Math.cos(latRad) * Math.sin(lngRad);
    z += weight * Math.sin(latRad);
    totalWeight += weight;
  }

  x /= totalWeight;
  y /= totalWeight;
  z /= totalWeight;

  const centralLng = Math.atan2(y, x);
  const centralHyp = Math.sqrt(x * x + y * y);
  const centralLat = Math.atan2(z, centralHyp);

  return {
    lat: (centralLat * 180) / Math.PI,
    lng: (centralLng * 180) / Math.PI,
  };
}

export function haversineDistanceMeters(
  a: {lat: number; lng: number},
  b: {lat: number; lng: number}
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function offsetLatLng(
  origin: {lat: number; lng: number},
  distanceMeters: number,
  bearingDeg: number
): {lat: number; lng: number} {
  const R = 6371000;
  const brng = (bearingDeg * Math.PI) / 180;
  const lat1 = (origin.lat * Math.PI) / 180;
  const lng1 = (origin.lng * Math.PI) / 180;
  const angularDist = distanceMeters / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDist) +
      Math.cos(lat1) * Math.sin(angularDist) * Math.cos(brng)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(angularDist) * Math.cos(lat1),
      Math.cos(angularDist) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: (lat2 * 180) / Math.PI,
    lng: (lng2 * 180) / Math.PI,
  };
}

export function extractPostalCode(
  formattedAddress: string,
  addressComponents?: google.maps.places.AddressComponent[]
): string | null {
  if (addressComponents) {
    const postal = addressComponents.find((c) => c.types?.includes('postal_code'));
    const text = (postal?.longText || postal?.shortText || '').trim();
    if (/^\d{5}$/.test(text)) {
      return text === '75116' ? '75016' : text;
    }
  }
  const match = formattedAddress.match(/\b(\d{5})\b/);
  if (match) {
    return match[1] === '75116' ? '75016' : match[1];
  }
  return null;
}

export function extractAllPostalCodesFromText(text: string): string[] {
  const matches = text.match(/\b\d{5}\b/g);
  if (!matches) return [];
  const normalized = new Set<string>();
  for (const code of matches) {
    normalized.add(code);
    if (code === '75116') normalized.add('75016');
  }
  return Array.from(normalized);
}

export function normalizeArrondissementToPostalCode(
  rawArr?: string | null,
  fallbackPostal?: string | null,
  address?: string | null
): string | null {
  const tryConvert = (val?: string | null): string | null => {
    if (!val) return null;
    const trimmed = val.trim();
    const fiveDigit = trimmed.match(/\b(\d{5})\b/);
    if (fiveDigit) {
      return fiveDigit[1] === '75116' ? '75016' : fiveDigit[1];
    }
    const arrMatch = trimmed.match(/\b(1?\d|20)\s*(?:er|e|ème|eme)?\b/i);
    if (arrMatch) {
      const num = Number.parseInt(arrMatch[1], 10);
      if (num >= 1 && num <= 20) {
        return `750${String(num).padStart(2, '0')}`;
      }
    }
    return null;
  };

  return (
    tryConvert(fallbackPostal) ||
    tryConvert(rawArr) ||
    tryConvert(address)
  );
}

export function isPointInExcludedZones(
  lat: number,
  lng: number,
  postalCode: string | null,
  excludedZones: ExcludedZones,
  addressText?: string,
  arrondissement?: string | null
): boolean {
  const excludedCodes = excludedZones.postalCodes || [];

  const candidateCodes = new Set<string>();
  if (postalCode) {
    candidateCodes.add(postalCode);
    candidateCodes.add(postalCode === '75116' ? '75016' : postalCode);
  }
  const normalizedArrCode = normalizeArrondissementToPostalCode(
    arrondissement,
    postalCode,
    addressText
  );
  if (normalizedArrCode) {
    candidateCodes.add(normalizedArrCode);
  }
  if (addressText) {
    for (const c of extractAllPostalCodesFromText(addressText)) {
      candidateCodes.add(c);
    }
  }

  for (const code of candidateCodes) {
    if (excludedCodes.includes(code)) {
      return true;
    }
  }

  for (const zone of excludedZones.customZones) {
    const dist = haversineDistanceMeters({lat, lng}, {lat: zone.lat, lng: zone.lng});
    if (dist <= (zone.radiusMeters || 500)) {
      return true;
    }
  }

  if (!postalCode && excludedCodes.length > 0) {
    if (lat >= 48.81 && lat <= 48.91 && lng >= 2.22 && lng <= 2.47) {
      let nearestArr: ParisArrondissement | null = null;
      let nearestDist = Infinity;
      for (const arr of PARIS_ARRONDISSEMENTS) {
        const d = haversineDistanceMeters({lat, lng}, {lat: arr.lat, lng: arr.lng});
        if (d < nearestDist) {
          nearestDist = d;
          nearestArr = arr;
        }
      }
      if (nearestArr && excludedCodes.includes(nearestArr.code)) {
        return true;
      }
    }
  }

  return false;
}

export const CARDINAL_DIRECTIONS: {label: string; bearingDeg: number}[] = [
  {label: 'Nord', bearingDeg: 0},
  {label: 'Nord-Est', bearingDeg: 45},
  {label: 'Est', bearingDeg: 90},
  {label: 'Sud-Est', bearingDeg: 135},
  {label: 'Sud', bearingDeg: 180},
  {label: 'Sud-Ouest', bearingDeg: 225},
  {label: 'Ouest', bearingDeg: 270},
  {label: 'Nord-Ouest', bearingDeg: 315},
];

export const SPIRAL_RADII_METERS = [1500, 2500, 4000] as const;

export interface SpiralSearchPoint {
  lat: number;
  lng: number;
  directionLabel: string;
  radiusMeters: number;
  avgParticipantDist: number;
  isPointExcluded: boolean;
}

export function buildSpiralPointsForRadius(
  originCenter: {lat: number; lng: number},
  radiusMeters: number,
  participants: Participant[],
  excludedZones: ExcludedZones
): SpiralSearchPoint[] {
  const points = CARDINAL_DIRECTIONS.map((dir) => {
    const pt = offsetLatLng(originCenter, radiusMeters, dir.bearingDeg);
    const avgParticipantDist =
      participants.length > 0
        ? participants.reduce((sum, p) => sum + haversineDistanceMeters(p, pt), 0) /
          participants.length
        : radiusMeters;
    const isPointExcluded = isPointInExcludedZones(pt.lat, pt.lng, null, excludedZones);
    return {
      lat: pt.lat,
      lng: pt.lng,
      directionLabel: dir.label,
      radiusMeters,
      avgParticipantDist,
      isPointExcluded,
    };
  });

  points.sort((a, b) => {
    if (a.isPointExcluded !== b.isPointExcluded) {
      return a.isPointExcluded ? 1 : -1;
    }
    return a.avgParticipantDist - b.avgParticipantDist;
  });

  return points;
}

export function evaluateOpeningStatus(
  periods: OpeningPeriodLite[] | null,
  targetDateInput: Date | string
): {isOpen: boolean | null; closesLabel: string | null} {
  if (!periods || periods.length === 0) {
    return {isOpen: null, closesLabel: null};
  }

  if (periods.length === 1 && periods[0].close === null) {
    return {isOpen: true, closesLabel: 'Ouvert 24h/24'};
  }

  const targetDate =
    targetDateInput instanceof Date ? targetDateInput : new Date(targetDateInput);
  const effectiveDate = Number.isNaN(targetDate.getTime()) ? new Date() : targetDate;

  const targetMin =
    effectiveDate.getDay() * 1440 +
    effectiveDate.getHours() * 60 +
    effectiveDate.getMinutes();

  for (const period of periods) {
    if (!period.open || !period.close) continue;
    const openMin = period.open.day * 1440 + period.open.hour * 60 + period.open.minute;
    let closeMin = period.close.day * 1440 + period.close.hour * 60 + period.close.minute;
    if (closeMin <= openMin) {
      closeMin += 7 * 1440;
    }

    const inRange =
      (targetMin >= openMin && targetMin < closeMin) ||
      (targetMin + 7 * 1440 >= openMin && targetMin + 7 * 1440 < closeMin);

    if (inRange) {
      const closeHour = String(period.close.hour).padStart(2, '0');
      const closeMinute = String(period.close.minute).padStart(2, '0');
      return {
        isOpen: true,
        closesLabel: `Ouvert · ferme à ${closeHour}h${closeMinute}`,
      };
    }
  }

  return {isOpen: false, closesLabel: 'Fermé sur ce créneau'};
}

export function estimateTravelSeconds(distanceMeters: number, mode: TransportMode): number {
  const speedMetersPerMin = MODE_SPEED_MPM[mode] || MODE_SPEED_MPM.TRANSIT;
  const baseWaitSeconds = mode === 'TRANSIT' ? 240 : 0;
  const detourFactor = mode === 'WALKING' ? 1.2 : 1.3;
  return Math.round(((distanceMeters * detourFactor) / speedMetersPerMin) * 60 + baseWaitSeconds);
}

export function formatDuration(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) {
    return `${mins} min`;
  }
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hours} h` : `${hours} h ${String(rem).padStart(2, '0')}`;
}

export function formatDistanceKm(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

export function getModeLabel(mode: TransportMode): string {
  switch (mode) {
    case 'TRANSIT':
      return 'Métro/RER';
    case 'BICYCLING':
      return 'Vélo';
    case 'WALKING':
      return 'Marche';
    case 'DRIVING':
      return 'Voiture';
  }
}

export function getModeEmoji(mode: TransportMode): string {
  switch (mode) {
    case 'TRANSIT':
      return '🚇';
    case 'BICYCLING':
      return '🚲';
    case 'WALKING':
      return '🚶';
    case 'DRIVING':
      return '🚗';
  }
}

export function formatTransitLineBadge(
  shortName?: string | null,
  vehicleType?: string | null,
  fullName?: string | null
): string | null {
  const raw = (shortName || '').trim();
  const type = (vehicleType || '').toUpperCase();

  if (raw) {
    if ((type === 'SUBWAY' || type === 'METRO_RAIL') && /^\d{1,2}(bis)?$/i.test(raw)) {
      return `M${raw}`;
    }
    if (
      (type === 'HEAVY_RAIL' || type === 'COMMUTER_TRAIN' || type === 'RAIL') &&
      /^[A-E]$/i.test(raw)
    ) {
      return `RER ${raw.toUpperCase()}`;
    }
    if (type === 'TRAM' && /^\d/.test(raw)) {
      return `T${raw}`;
    }
    if (type === 'BUS' && /^\d/.test(raw)) {
      return `Bus ${raw}`;
    }
    return raw;
  }

  const name = (fullName || '').trim();
  return name ? name.slice(0, 12) : null;
}

export function buildRouteSummary(
  mode: TransportMode,
  steps: RouteStepDetail[],
  distanceMeters: number
): string {
  if (mode === 'TRANSIT') {
    const transitTokens: string[] = [];
    let walkSeconds = 0;

    for (const s of steps) {
      if (s.kind === 'TRANSIT' && s.lineBadge) {
        if (transitTokens[transitTokens.length - 1] !== s.lineBadge) {
          transitTokens.push(s.lineBadge);
        }
      } else if (s.kind === 'WALKING' && typeof s.durationSeconds === 'number') {
        walkSeconds += s.durationSeconds;
      }
    }

    const walkMins = Math.round(walkSeconds / 60);
    if (transitTokens.length > 0) {
      if (walkMins >= 1) {
        return `${transitTokens.join(' + ')} + ${walkMins} min à pied`;
      }
      return transitTokens.join(' + ');
    }
    if (walkMins >= 1) {
      return `${walkMins} min à pied`;
    }
    return formatDistanceKm(distanceMeters);
  }

  if (mode === 'BICYCLING') {
    return `${formatDistanceKm(distanceMeters)} à vélo`;
  }
  if (mode === 'WALKING') {
    return `${formatDistanceKm(distanceMeters)} à pied`;
  }
  return `${formatDistanceKm(distanceMeters)} en voiture`;
}

export function buildWhatsAppUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function parseNumericPriceLevel(priceLevel: string | number | null | undefined): number | null {
  if (typeof priceLevel === 'number' && Number.isFinite(priceLevel)) {
    return priceLevel;
  }
  if (typeof priceLevel === 'string') {
    const normalized = priceLevel.toUpperCase();
    if (normalized === 'FREE' || normalized === 'PRICE_LEVEL_FREE') return 0;
    if (normalized === 'INEXPENSIVE' || normalized === 'PRICE_LEVEL_INEXPENSIVE') return 1;
    if (normalized === 'MODERATE' || normalized === 'PRICE_LEVEL_MODERATE') return 2;
    if (normalized === 'EXPENSIVE' || normalized === 'PRICE_LEVEL_EXPENSIVE') return 3;
    if (normalized === 'VERY_EXPENSIVE' || normalized === 'PRICE_LEVEL_VERY_EXPENSIVE') return 4;
  }
  return null;
}

export function parseNumericPintPrice(customPrice?: string): number | null {
  if (!customPrice) return null;
  const normalized = customPrice.replace(',', '.').trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseTimeToMinutes(raw?: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  const match = trimmed.match(/^(\d{1,2})\s*[:h.]\s*(\d{2})?$/);
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const mins = match[2] ? Number.parseInt(match[2], 10) : 0;
  if (!Number.isFinite(hours) || !Number.isFinite(mins) || hours < 0 || hours > 24 || mins < 0 || mins > 59) {
    return null;
  }
  return (hours % 24) * 60 + mins;
}

export function formatTimeFrench(raw?: string | null): string | null {
  const mins = parseTimeToMinutes(raw);
  if (mins === null) return raw?.trim() || null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`;
}

export function isHappyHourActive(
  startStr?: string | null,
  endStr?: string | null,
  targetDateTime?: string | Date | null
): boolean {
  const startMins = parseTimeToMinutes(startStr);
  const endMins = parseTimeToMinutes(endStr);
  if (startMins === null || endMins === null) return false;

  const targetDate =
    targetDateTime instanceof Date
      ? targetDateTime
      : targetDateTime
      ? new Date(targetDateTime)
      : new Date();
  const effectiveDate = Number.isNaN(targetDate.getTime()) ? new Date() : targetDate;
  const targetMins = effectiveDate.getHours() * 60 + effectiveDate.getMinutes();

  if (startMins <= endMins) {
    return targetMins >= startMins && targetMins <= endMins;
  }
  // Overnight happy hour (e.g. 18:00 - 01:00)
  return targetMins >= startMins || targetMins <= endMins;
}

export function formatEuroPrice(price: number): string {
  return `${price.toFixed(2).replace('.', ',')} €`;
}

export function getEffectiveBarPintPrice(
  bar: Pick<BarCandidate, 'pintPrice' | 'happyHourPrice' | 'happyHourStart' | 'happyHourEnd'>,
  customPrice?: string,
  targetDateTime?: string | Date | null
): {
  price: number | null;
  isHappyHour: boolean;
  regularPrice: number | null;
  happyHourPrice: number | null;
  happyHourSlotLabel: string | null;
} {
  const regularPrice =
    typeof bar.pintPrice === 'number' && Number.isFinite(bar.pintPrice) && bar.pintPrice > 0
      ? bar.pintPrice
      : null;
  const hhPrice =
    typeof bar.happyHourPrice === 'number' &&
    Number.isFinite(bar.happyHourPrice) &&
    bar.happyHourPrice > 0
      ? bar.happyHourPrice
      : null;

  const startLabel = formatTimeFrench(bar.happyHourStart);
  const endLabel = formatTimeFrench(bar.happyHourEnd);
  const happyHourSlotLabel =
    startLabel && endLabel ? `HH : ${startLabel} - ${endLabel}` : null;

  const customPint = parseNumericPintPrice(customPrice);
  const hhActive =
    hhPrice !== null && isHappyHourActive(bar.happyHourStart, bar.happyHourEnd, targetDateTime);

  if (customPint !== null) {
    return {
      price: customPint,
      isHappyHour: false,
      regularPrice,
      happyHourPrice: hhPrice,
      happyHourSlotLabel,
    };
  }

  if (hhActive && hhPrice !== null) {
    return {
      price: hhPrice,
      isHappyHour: true,
      regularPrice,
      happyHourPrice: hhPrice,
      happyHourSlotLabel,
    };
  }

  return {
    price: regularPrice,
    isHappyHour: false,
    regularPrice,
    happyHourPrice: hhPrice,
    happyHourSlotLabel,
  };
}

export function isCheapBar(
  bar: BarCandidate,
  customPrice?: string,
  targetDateTime?: string | Date | null
): boolean {
  const effective = getEffectiveBarPintPrice(bar, customPrice, targetDateTime);
  if (effective.price !== null) {
    return effective.price < 6;
  }
  const numericLevel = parseNumericPriceLevel(bar.priceLevel);
  if (numericLevel !== null && numericLevel <= 1) {
    return true;
  }
  return false;
}

export function formatPriceLevel(priceLevel: string | number | null | undefined): {
  label: string;
  tier: 'cheap' | 'medium' | 'expensive' | 'unknown';
  numericRank: number;
} {
  const numeric = parseNumericPriceLevel(priceLevel);
  if (numeric === null) {
    return {label: 'N/C', tier: 'unknown', numericRank: 2.5};
  }
  if (numeric <= 1) {
    return {label: '€', tier: 'cheap', numericRank: numeric};
  }
  if (numeric === 2) {
    return {label: '€€', tier: 'medium', numericRank: 2};
  }
  return {label: '€€€', tier: 'expensive', numericRank: numeric};
}

export function getParticipantWalkSeconds(
  participant: Participant,
  info: TravelTimeInfo | undefined
): number {
  if (!info) return 0;
  if (typeof info.walkSeconds === 'number' && Number.isFinite(info.walkSeconds)) {
    return info.walkSeconds;
  }
  if (info.steps && info.steps.length > 0) {
    let walkSec = 0;
    for (const s of info.steps) {
      if (s.kind === 'WALKING') {
        if (typeof s.durationSeconds === 'number' && Number.isFinite(s.durationSeconds)) {
          walkSec += s.durationSeconds;
        } else if (s.distanceMeters > 0) {
          walkSec += Math.round((s.distanceMeters / 80) * 60);
        }
      }
    }
    return walkSec;
  }
  if (participant.mode === 'WALKING') {
    return info.durationSeconds;
  }
  return 0;
}

export interface BarFairnessMetrics {
  avgTime: number; // minutes
  maxTime: number; // minutes
  minTime: number; // minutes
  spread: number; // minutes (maxTime - minTime)
  maxWalkMinutes: number;
  score: number;
  hasRoutes: boolean;
}

export function computeBarFairnessMetrics(
  barId: string,
  participants: Participant[],
  travelMatrix: Record<string, Record<string, TravelTimeInfo>>
): BarFairnessMetrics {
  const row = travelMatrix[barId];
  if (!row || participants.length === 0) {
    return {
      avgTime: 0,
      maxTime: 0,
      minTime: 0,
      spread: 0,
      maxWalkMinutes: 0,
      score: Number.POSITIVE_INFINITY,
      hasRoutes: false,
    };
  }

  const durationsMin: number[] = [];
  const walkMins: number[] = [];
  for (const p of participants) {
    const info = row[p.id];
    if (info && typeof info.durationSeconds === 'number') {
      durationsMin.push(info.durationSeconds / 60);
      walkMins.push(getParticipantWalkSeconds(p, info) / 60);
    }
  }

  if (durationsMin.length === 0) {
    return {
      avgTime: 0,
      maxTime: 0,
      minTime: 0,
      spread: 0,
      maxWalkMinutes: 0,
      score: Number.POSITIVE_INFINITY,
      hasRoutes: false,
    };
  }

  const avgTime = durationsMin.reduce((sum, d) => sum + d, 0) / durationsMin.length;
  const maxTime = Math.max(...durationsMin);
  const minTime = Math.min(...durationsMin);
  const spread = maxTime - minTime;
  const maxWalkMinutes = walkMins.length > 0 ? Math.max(...walkMins) : 0;
  const walkPenalty = maxWalkMinutes > 12 ? (maxWalkMinutes - 12) * 3 : 0;
  const score = avgTime + 1.8 * spread + walkPenalty;

  return {
    avgTime,
    maxTime,
    minTime,
    spread,
    maxWalkMinutes,
    score,
    hasRoutes: true,
  };
}

export function buildGoogleMapsUrl(
  bar: Pick<BarCandidate, 'id' | 'lat' | 'lng' | 'googleMapsURI' | 'name'>
): string {
  if (bar.googleMapsURI) return bar.googleMapsURI;
  const query = encodeURIComponent(`${bar.name}`);
  return `https://www.google.com/maps/search/?api=1&query=${bar.lat},${bar.lng}&query_place_id=${encodeURIComponent(bar.id)}&q=${query}`;
}

export function buildCitymapperUrl(bar: Pick<BarCandidate, 'lat' | 'lng' | 'name'>): string {
  return `https://citymapper.com/directions?endcoord=${bar.lat},${bar.lng}&endname=${encodeURIComponent(bar.name)}`;
}

export function formatFrenchDateTime(dateTimeStr: string): string {
  try {
    const d = new Date(dateTimeStr);
    if (Number.isNaN(d.getTime())) return dateTimeStr;
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return dateTimeStr;
  }
}

export function buildMessengerRecapText(
  session: SessionState,
  bar: BarCandidate,
  travelTimesByParticipant: Record<string, TravelTimeInfo>
): string {
  const dateLabel = formatFrenchDateTime(session.dateTime);
  const effectivePrice = getEffectiveBarPintPrice(
    bar,
    session.customPrices[bar.id],
    session.dateTime
  );
  const priceTag =
    effectivePrice.price !== null
      ? effectivePrice.isHappyHour
        ? ` · HH ${formatEuroPrice(effectivePrice.price)}`
        : ` · Pinte ${formatEuroPrice(effectivePrice.price)}`
      : '';
  const voteCount = (session.votes[bar.id] || []).length;
  const voteLine = voteCount > 0 ? ` (${voteCount} vote${voteCount > 1 ? 's' : ''})` : '';

  const participantLines = session.participants.map((p) => {
    const t = travelTimesByParticipant[p.id];
    const durationStr = t ? formatDuration(t.durationSeconds) : 'N/C';
    const detailTag = t?.routeSummary
      ? ` (${t.routeSummary})`
      : t?.transitLine
      ? ` [${t.transitLine}]`
      : '';
    return `• ${p.name} (${getModeLabel(p.mode)}) : ${durationStr}${detailTag}`;
  });

  const gmapsUrl = buildGoogleMapsUrl(bar);
  const citymapperUrl = buildCitymapperUrl(bar);

  return [
    `🍻 *${session.title}*${voteLine}`,
    `📍 *${bar.name}*${priceTag}`,
    bar.nearestStation ? `🚉 Métro/Station : ${bar.nearestStation}` : null,
    `🏠 ${bar.address}`,
    `🗓️ ${dateLabel}`,
    '',
    '⏱️ Trajets :',
    ...(participantLines.length > 0 ? participantLines : ['• Ajoutez vos trajets sur le lien !']),
    '',
    `🗺️ Maps : ${gmapsUrl}`,
    `🚇 Citymapper : ${citymapperUrl}`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function toIcsUtcString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function downloadIcsFile(session: SessionState, bar: BarCandidate): void {
  const start = new Date(session.dateTime);
  const validStart = Number.isNaN(start.getTime()) ? new Date() : start;
  const end = new Date(validStart.getTime() + 2 * 60 * 60 * 1000);

  const gmapsUrl = buildGoogleMapsUrl(bar);
  const citymapperUrl = buildCitymapperUrl(bar);
  const customPrice = session.customPrices[bar.id];

  const descriptionLines = [
    `Lieu : ${bar.name}`,
    `Adresse : ${bar.address}`,
    customPrice ? `Prix pinte noté : ${customPrice} EUR` : null,
    `Itinéraire Google Maps : ${gmapsUrl}`,
    `Itinéraire Citymapper : ${citymapperUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AperoCentral//PWA//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:aperocentral-${bar.id}-${validStart.getTime()}@aperocentral.app`,
    `DTSTAMP:${toIcsUtcString(new Date())}`,
    `DTSTART:${toIcsUtcString(validStart)}`,
    `DTEND:${toIcsUtcString(end)}`,
    `SUMMARY:${escapeIcsText(`${session.title} — ${bar.name}`)}`,
    `LOCATION:${escapeIcsText(`${bar.name}, ${bar.address}`)}`,
    `DESCRIPTION:${escapeIcsText(descriptionLines)}`,
    `URL:${gmapsUrl}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([icsContent], {type: 'text/calendar;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safeTitle =
    session.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'apero';
  link.download = `aperocentral-${safeTitle}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function isAddressMatchingSpot(
  addressText: string,
  coords: {lat: number; lng: number} | null | undefined,
  spot: {address: string; lat: number; lng: number} | null | undefined
): boolean {
  if (!spot) return false;
  const normalizedCurrent = addressText.trim().toLowerCase();
  const normalizedSpot = spot.address.trim().toLowerCase();
  if (!normalizedCurrent || !normalizedSpot) return false;
  if (normalizedCurrent !== normalizedSpot) return false;
  if (coords) {
    return haversineDistanceMeters(coords, spot) < 50;
  }
  return true;
}

