export type TransportMode = 'TRANSIT' | 'BICYCLING' | 'WALKING' | 'DRIVING';

export interface Participant {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  mode: TransportMode;
}

export interface ExcludedCustomZone {
  id: string;
  label: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  postalCode?: string | null;
}

export interface ExcludedZones {
  postalCodes: string[]; // 5-digit postal codes, e.g. ['75001', '93100', '92100']
  postalCodeLabels?: Record<string, string>; // e.g. {'93100': 'Montreuil'}
  customZones: ExcludedCustomZone[];
}

export interface SessionState {
  title: string;
  dateTime: string;
  participants: Participant[];
  excludedZones: ExcludedZones;
  votes: Record<string, string[]>;
  customPrices: Record<string, string>;
}

export interface SavedFavoriteAddress {
  id: string;
  label: string; // e.g. 'Maison', 'Travail'
  address: string;
  lat: number;
  lng: number;
  mode: TransportMode;
}

export interface UserPrefs {
  name: string;
  address: string;
  lat: number;
  lng: number;
  mode: TransportMode;
}

export interface BarPlaceAttribution {
  provider: string;
  providerURI?: string | null;
}

export interface OpeningPeriodPoint {
  day: number;
  hour: number;
  minute: number;
}

export interface OpeningPeriodLite {
  open: OpeningPeriodPoint;
  close: OpeningPeriodPoint | null;
}

export interface BarCandidate {
  id: string;
  name: string;
  address: string;
  postalCode: string | null;
  lat: number;
  lng: number;
  rating: number | null;
  userRatingCount: number | null;
  priceLevel: string | number | null;
  googleMapsURI: string | null;
  attributions: BarPlaceAttribution[];
  distanceFromCenterMeters: number;
  openingPeriods: OpeningPeriodLite[] | null;
  isOpenAtTarget: boolean | null;
  closesLabel: string | null;
  nearestStation?: string | null;
}

export interface TravelTimeInfo {
  durationSeconds: number;
  distanceMeters: number;
  isEstimate?: boolean;
  transitLine?: string | null; // e.g. 'M11', 'RER A'
  transitLineColor?: string | null;
}

export type SortCriterion = 'fairness' | 'price' | 'rating';
