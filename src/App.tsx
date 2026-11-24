import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  APILoadingStatus,
  APIProvider,
  useApiLoadingStatus,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Beer,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  Compass,
  Copy,
  KeyRound,
  Loader2,
  Pencil,
  RotateCcw,
  Settings,
  Trophy,
} from 'lucide-react';
import {AperoMap} from './components/AperoMap';
import {ApiKeyModal} from './components/ApiKeyModal';
import {BarList} from './components/BarList';
import {MessengerShareBar} from './components/MessengerShareBar';
import {OfflineIndicator} from './components/OfflineIndicator';
import {ParticipantManager} from './components/ParticipantManager';
import {PWAInstallButton} from './components/PWAInstallButton';
import {ZoneExclusionDrawer} from './components/ZoneExclusionDrawer';
import type {
  BarCandidate,
  ExcludedCustomZone,
  OpeningPeriodLite,
  Participant,
  SessionState,
  SortCriterion,
  TransportMode,
  TravelTimeInfo,
} from './types/apero';
import {
  buildMessengerRecapText,
  buildSpiralPointsForRadius,
  buildWhatsAppUrl,
  calculateWeightedBarycenter,
  downloadIcsFile,
  estimateTravelSeconds,
  evaluateOpeningStatus,
  extractPostalCode,
  formatPriceLevel,
  formatTransitLineBadge,
  haversineDistanceMeters,
  isCheapBar,
  isPointInExcludedZones,
  parseNumericPintPrice,
  SPIRAL_RADII_METERS,
  type SpiralSearchPoint,
} from './utils/geo';
import {
  buildShareUrl,
  createDefaultSession,
  getSessionFromUrl,
  loadCustomApiKey,
  saveCustomApiKey,
  syncSessionToUrl,
} from './utils/storage';

declare const __GMAPS_ENV_KEY__: string | undefined;

const ENV_API_KEY = (
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ||
  (typeof __GMAPS_ENV_KEY__ !== 'undefined' ? __GMAPS_ENV_KEY__ : '') ||
  ''
).trim();

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('429') ||
    msg.includes('Quota')
  );
}

function extractOpeningPeriods(
  regularOpeningHours: google.maps.places.OpeningHours | null | undefined
): OpeningPeriodLite[] | null {
  if (!regularOpeningHours?.periods || regularOpeningHours.periods.length === 0) {
    return null;
  }
  return regularOpeningHours.periods.map((period) => ({
    open: {
      day: period.open.day,
      hour: period.open.hour,
      minute: period.open.minute,
    },
    close: period.close
      ? {
          day: period.close.day,
          hour: period.close.hour,
          minute: period.close.minute,
        }
      : null,
  }));
}

interface SearchPipelineResult {
  bars: BarCandidate[];
  travelMatrix: Record<string, Record<string, TravelTimeInfo>>;
  effectiveSearchCenter: {lat: number; lng: number} | null;
  shiftNotice: string | null;
}

interface MapsWorkspaceProps {
  session: SessionState;
  centerPoint: {lat: number; lng: number} | null;
  effectiveSearchCenter: {lat: number; lng: number} | null;
  shiftNotice: string | null;
  bars: BarCandidate[];
  selectedBarId: string | null;
  winningBarId: string | null;
  searchTriggerId: number;
  onSelectBar: (id: string | null) => void;
  onSearchLoadingChange: (barsLoading: boolean, routesLoading: boolean) => void;
  onSearchError: (err: string | null) => void;
  onSearchComplete: (result: SearchPipelineResult) => void;
  onMapsReadyChange: (ready: boolean) => void;
}

const MapsWorkspace: React.FC<MapsWorkspaceProps> = ({
  session,
  centerPoint,
  effectiveSearchCenter,
  shiftNotice,
  bars,
  selectedBarId,
  winningBarId,
  searchTriggerId,
  onSelectBar,
  onSearchLoadingChange,
  onSearchError,
  onSearchComplete,
  onMapsReadyChange,
}) => {
  const loadingStatus = useApiLoadingStatus();
  const placesLib = useMapsLibrary('places');
  const routesLib = useMapsLibrary('routes');
  const executedTriggerRef = useRef<number>(0);
  const mapRef = useRef<google.maps.Map | null>(null);

  const latestSessionRef = useRef(session);
  latestSessionRef.current = session;
  const latestCenterRef = useRef(centerPoint);
  latestCenterRef.current = centerPoint;

  useEffect(() => {
    onMapsReadyChange(Boolean(placesLib));
    if (loadingStatus === APILoadingStatus.AUTH_FAILURE) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  }, [loadingStatus, placesLib, onMapsReadyChange]);

  useEffect(() => {
    if (searchTriggerId <= 0) return;
    if (executedTriggerRef.current === searchTriggerId) return;
    if (!placesLib) return;

    const currentSession = latestSessionRef.current;
    const weightedCenter = latestCenterRef.current;
    if (!weightedCenter || currentSession.participants.length === 0) return;

    executedTriggerRef.current = searchTriggerId;
    let cancelled = false;

    const runQuotaOptimizedSearch = async () => {
      onSearchLoadingChange(true, false);
      onSearchError(null);

      const isStrictlyValid = (bar: BarCandidate): boolean =>
        !isPointInExcludedZones(
          bar.lat,
          bar.lng,
          bar.postalCode,
          currentSession.excludedZones,
          bar.address
        );

      const searchNearbyBars = async (
        searchOrigin: {lat: number; lng: number}
      ): Promise<BarCandidate[]> => {
        try {
          if (!placesLib.Place?.searchNearby) {
            throw new Error('Place.searchNearby unavailable');
          }

          const response = await placesLib.Place.searchNearby({
            fields: [
              'id',
              'displayName',
              'location',
              'formattedAddress',
              'addressComponents',
              'rating',
              'priceLevel',
              'regularOpeningHours',
            ],
            locationRestriction: {
              center: searchOrigin,
              radius: 800,
            },
            includedPrimaryTypes: ['bar', 'pub'],
            maxResultCount: 20,
            rankPreference: placesLib.SearchNearbyRankPreference.POPULARITY,
            language: 'fr',
            region: 'FR',
            internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
          });

          const rawPlaces = response.places || [];
          return rawPlaces
            .filter((p) => p.location && p.businessStatus !== 'CLOSED_PERMANENTLY')
            .map((p) => {
              const lat = p.location!.lat();
              const lng = p.location!.lng();
              const address = p.formattedAddress || '';
              const postalCode = extractPostalCode(address, p.addressComponents);
              const openingPeriods = extractOpeningPeriods(p.regularOpeningHours);
              const openEval = evaluateOpeningStatus(openingPeriods, currentSession.dateTime);
              const attrs = Array.isArray(p.attributions)
                ? p.attributions.map((a) => ({
                    provider: a.provider || 'Google',
                    providerURI: a.providerURI,
                  }))
                : [];
              return {
                id: p.id,
                name: p.displayName || 'Bar',
                address,
                postalCode,
                lat,
                lng,
                rating: typeof p.rating === 'number' ? p.rating : null,
                userRatingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
                priceLevel: p.priceLevel ?? null,
                googleMapsURI: p.googleMapsURI ?? null,
                attributions: attrs,
                distanceFromCenterMeters: haversineDistanceMeters(searchOrigin, {lat, lng}),
                openingPeriods,
                isOpenAtTarget: openEval.isOpen,
                closesLabel: openEval.closesLabel,
                nearestStation: null,
              };
            });
        } catch (newApiErr) {
          const newApiMsg =
            newApiErr instanceof Error ? newApiErr.message : String(newApiErr);

          // Automatic fallback to classic PlacesService.nearbySearch
          const serviceTarget = mapRef.current ?? document.createElement('div');
          const service = new placesLib.PlacesService(serviceTarget);

          const legacyResults = await new Promise<google.maps.places.PlaceResult[]>(
            (resolve, reject) => {
              service.nearbySearch(
                {
                  location: searchOrigin,
                  radius: 800,
                  type: 'bar',
                },
                (results, status) => {
                  if (status === placesLib.PlacesServiceStatus.OK) {
                    resolve(results || []);
                  } else if (status === placesLib.PlacesServiceStatus.ZERO_RESULTS) {
                    resolve([]);
                  } else {
                    reject(
                      new Error(
                        `PlacesService: ${status} | Place.searchNearby: ${newApiMsg}`
                      )
                    );
                  }
                }
              );
            }
          );

          return legacyResults
            .filter((p) => p.geometry?.location && p.business_status !== 'CLOSED_PERMANENTLY')
            .map((p, idx) => {
              const lat = p.geometry!.location!.lat();
              const lng = p.geometry!.location!.lng();
              const address = p.vicinity || p.formatted_address || '';
              const postalCode = extractPostalCode(address);
              let isOpenAtTarget: boolean | null = null;
              try {
                if (typeof p.opening_hours?.isOpen === 'function') {
                  isOpenAtTarget = p.opening_hours.isOpen() ?? null;
                }
              } catch {
                isOpenAtTarget = null;
              }
              return {
                id: p.place_id || `legacy_bar_${idx}_${lat.toFixed(5)}`,
                name: p.name || 'Bar',
                address,
                postalCode,
                lat,
                lng,
                rating: typeof p.rating === 'number' ? p.rating : null,
                userRatingCount:
                  typeof p.user_ratings_total === 'number' ? p.user_ratings_total : null,
                priceLevel: typeof p.price_level === 'number' ? p.price_level : null,
                googleMapsURI: null,
                attributions: [],
                distanceFromCenterMeters: haversineDistanceMeters(searchOrigin, {lat, lng}),
                openingPeriods: null,
                isOpenAtTarget,
                closesLabel: null,
                nearestStation: null,
              };
            });
        }
      };

      try {
        // 1. Initial search around weighted barycenter (800m radius)
        const initialRaw = await searchNearbyBars(weightedCenter);
        if (cancelled) return;

        let effectiveCenter = weightedCenter;
        let nextShiftNotice: string | null = null;
        let filtered = initialRaw.filter(isStrictlyValid);

        const allValidById: Record<string, BarCandidate> = {};
        for (const b of filtered) {
          allValidById[b.id] = b;
        }

        // 2. Mandatory 8-direction spiral search (1.5 km -> 2.5 km -> 4 km) if < 5 valid bars
        if (filtered.length < 5) {
          type SpiralCandidateResult = {
            point: SpiralSearchPoint;
            bars: BarCandidate[];
          };

          let winningSpiral: SpiralCandidateResult | null = null;
          let bestPartialSpiral: SpiralCandidateResult | null = null;

          const isBetterPartial = (
            candidate: SpiralCandidateResult,
            currentBest: SpiralCandidateResult | null
          ) => {
            if (!currentBest) return true;
            if (candidate.bars.length !== currentBest.bars.length) {
              return candidate.bars.length > currentBest.bars.length;
            }
            return candidate.point.avgParticipantDist < currentBest.point.avgParticipantDist;
          };

          const probeGroup = async (
            points: SpiralSearchPoint[]
          ): Promise<{winner: SpiralCandidateResult | null; best: SpiralCandidateResult | null}> => {
            if (points.length === 0) return {winner: null, best: null};
            const results = await Promise.all(
              points.map(async (pt) => {
                const raw = await searchNearbyBars({lat: pt.lat, lng: pt.lng});
                const valid = raw.filter(isStrictlyValid);
                for (const b of valid) {
                  allValidById[b.id] = b;
                }
                return {point: pt, bars: valid};
              })
            );

            let best: SpiralCandidateResult | null = null;
            for (const entry of results) {
              if (isBetterPartial(entry, best)) {
                best = entry;
              }
            }

            const winner = results.find((entry) => entry.bars.length >= 5) || null;
            return {winner, best};
          };

          for (const ringRadius of SPIRAL_RADII_METERS) {
            if (cancelled) return;
            const ringPoints = buildSpiralPointsForRadius(
              weightedCenter,
              ringRadius,
              currentSession.participants,
              currentSession.excludedZones
            );

            const primaryPoints = ringPoints.filter((p) => !p.isPointExcluded);
            const secondaryPoints = ringPoints.filter((p) => p.isPointExcluded);

            const primaryRes = await probeGroup(primaryPoints);
            if (cancelled) return;
            if (primaryRes.best && isBetterPartial(primaryRes.best, bestPartialSpiral)) {
              bestPartialSpiral = primaryRes.best;
            }
            winningSpiral = primaryRes.winner;

            if (!winningSpiral) {
              const secondaryRes = await probeGroup(secondaryPoints);
              if (cancelled) return;
              if (secondaryRes.best && isBetterPartial(secondaryRes.best, bestPartialSpiral)) {
                bestPartialSpiral = secondaryRes.best;
              }
              winningSpiral = secondaryRes.winner;
            }

            if (winningSpiral) {
              break;
            }
          }

          if (winningSpiral) {
            effectiveCenter = {
              lat: winningSpiral.point.lat,
              lng: winningSpiral.point.lng,
            };
            filtered = winningSpiral.bars;
            const kmLabel = (winningSpiral.point.radiusMeters / 1000)
              .toFixed(1)
              .replace('.0', '')
              .replace('.', ',');
            nextShiftNotice = `Point de recherche déplacé à ${kmLabel} km (${winningSpiral.point.directionLabel}) pour éviter les zones exclues.`;
          } else {
            const fallbackAnchor =
              bestPartialSpiral && bestPartialSpiral.bars.length > 0
                ? {lat: bestPartialSpiral.point.lat, lng: bestPartialSpiral.point.lng}
                : weightedCenter;
            effectiveCenter = fallbackAnchor;
            filtered = Object.values(allValidById).map((b) => ({
              ...b,
              distanceFromCenterMeters: haversineDistanceMeters(fallbackAnchor, {
                lat: b.lat,
                lng: b.lng,
              }),
            }));
            if (bestPartialSpiral && bestPartialSpiral.bars.length > 0) {
              const kmLabel = (bestPartialSpiral.point.radiusMeters / 1000)
                .toFixed(1)
                .replace('.0', '')
                .replace('.', ',');
              nextShiftNotice = `Point de recherche élargi à ${kmLabel} km (${bestPartialSpiral.point.directionLabel}) hors zones exclues.`;
            }
          }
        }

        // 3. Pick top 5 valid bars before calling RouteMatrix
        const rankedForMatrix = [...filtered].sort((a, b) => {
          const score = (bar: BarCandidate) => {
            const distPenalty = bar.distanceFromCenterMeters / 100;
            const ratingBonus = (bar.rating ?? 3.8) * 1.4;
            const openBonus = bar.isOpenAtTarget === false ? -4 : 1.5;
            return ratingBonus + openBonus - distPenalty;
          };
          return score(b) - score(a);
        });
        const top5Bars = rankedForMatrix.slice(0, 5);

        if (top5Bars.length === 0) {
          onSearchComplete({
            bars: [],
            travelMatrix: {},
            effectiveSearchCenter: effectiveCenter,
            shiftNotice: nextShiftNotice,
          });
          onSearchLoadingChange(false, false);
          return;
        }

        onSearchLoadingChange(false, true);

        // 4. Single RouteMatrix batch per active transport mode for ONLY those top 5 bars
        const matrixResult: Record<string, Record<string, TravelTimeInfo>> = {};
        for (const bar of top5Bars) {
          matrixResult[bar.id] = {};
        }

        const byMode: Record<TransportMode, Participant[]> = {
          TRANSIT: [],
          BICYCLING: [],
          WALKING: [],
          DRIVING: [],
        };
        for (const p of currentSession.participants) {
          byMode[p.mode].push(p);
        }

        const parsedDate = new Date(currentSession.dateTime);
        const nowMs = Date.now();
        const maxFutureMs = nowMs + 95 * 24 * 60 * 60 * 1000;
        const validFutureDeparture =
          !Number.isNaN(parsedDate.getTime()) &&
          parsedDate.getTime() > nowMs + 60 * 1000 &&
          parsedDate.getTime() < maxFutureMs
            ? parsedDate
            : undefined;

        const modes: TransportMode[] = ['TRANSIT', 'BICYCLING', 'WALKING', 'DRIVING'];
        const destinations = top5Bars.map((b) => ({lat: b.lat, lng: b.lng}));

        await Promise.all(
          modes.map(async (mode) => {
            const group = byMode[mode];
            if (group.length === 0) return;

            if (!routesLib?.RouteMatrix) {
              for (const participant of group) {
                for (const bar of top5Bars) {
                  const dist = haversineDistanceMeters(participant, bar);
                  matrixResult[bar.id][participant.id] = {
                    durationSeconds: estimateTravelSeconds(dist, participant.mode),
                    distanceMeters: Math.round(dist),
                    isEstimate: true,
                  };
                }
              }
              return;
            }

            const origins = group.map((p) => ({lat: p.lat, lng: p.lng}));

            try {
              const request: google.maps.routes.ComputeRouteMatrixRequest = {
                origins,
                destinations,
                travelMode: mode,
                fields: ['distanceMeters', 'durationMillis', 'condition'],
                language: 'fr',
                region: 'FR',
                internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
                ...(mode === 'TRANSIT' && validFutureDeparture
                  ? {departureTime: validFutureDeparture}
                  : {}),
              };

              const {matrix} = await routesLib.RouteMatrix.computeRouteMatrix(request);

              group.forEach((participant, oIdx) => {
                const row = matrix.rows[oIdx];
                top5Bars.forEach((bar, dIdx) => {
                  const item = row?.items?.[dIdx];
                  if (
                    item &&
                    item.condition === 'ROUTE_EXISTS' &&
                    typeof item.durationMillis === 'number' &&
                    Number.isFinite(item.durationMillis)
                  ) {
                    matrixResult[bar.id][participant.id] = {
                      durationSeconds: Math.round(item.durationMillis / 1000),
                      distanceMeters:
                        item.distanceMeters ?? Math.round(haversineDistanceMeters(participant, bar)),
                      isEstimate: false,
                    };
                  } else {
                    const dist = haversineDistanceMeters(participant, bar);
                    matrixResult[bar.id][participant.id] = {
                      durationSeconds: estimateTravelSeconds(dist, participant.mode),
                      distanceMeters: Math.round(dist),
                      isEstimate: true,
                    };
                  }
                });
              });
            } catch (err) {
              if (isQuotaError(err)) {
                window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
              }
              for (const participant of group) {
                for (const bar of top5Bars) {
                  const dist = haversineDistanceMeters(participant, bar);
                  matrixResult[bar.id][participant.id] = {
                    durationSeconds: estimateTravelSeconds(dist, participant.mode),
                    distanceMeters: Math.round(dist),
                    isEstimate: true,
                  };
                }
              }
            }
          })
        );

        if (cancelled) return;

        // Determine Top 3 bars by fairness so transit line lookups match displayed top 3
        const provisionalSorted = [...top5Bars].sort((a, b) => {
          const score = (bar: BarCandidate) => {
            const row = matrixResult[bar.id];
            const durations = currentSession.participants
              .map((p) => row?.[p.id]?.durationSeconds)
              .filter((d): d is number => typeof d === 'number');
            if (durations.length === 0) return bar.distanceFromCenterMeters;
            const max = Math.max(...durations);
            const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
            return max + 0.35 * avg;
          };
          return score(a) - score(b);
        });
        const provisionalTop3 = provisionalSorted.slice(0, 3);

        // 5. Enrich Top 5 with nearest metro/station (350m) & Top 3 TRANSIT routes with line badges
        const stationByBarId: Record<string, string | null> = {};

        const stationTasks = top5Bars.map(async (bar) => {
          try {
            const res = await placesLib.Place.searchNearby({
              fields: ['displayName'],
              locationRestriction: {
                center: {lat: bar.lat, lng: bar.lng},
                radius: 350,
              },
              includedPrimaryTypes: ['subway_station', 'transit_station', 'train_station'],
              maxResultCount: 1,
              rankPreference: placesLib.SearchNearbyRankPreference.DISTANCE,
              language: 'fr',
              region: 'FR',
              internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
            });
            const stationName = res.places?.[0]?.displayName?.trim();
            if (stationName) {
              stationByBarId[bar.id] = stationName;
            }
          } catch (err) {
            if (isQuotaError(err)) {
              window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
            }
          }
        });

        const transitParticipants = byMode.TRANSIT;
        const transitTasks: Promise<void>[] = [];

        if (transitParticipants.length > 0 && routesLib?.Route?.computeRoutes) {
          for (const bar of provisionalTop3) {
            for (const participant of transitParticipants) {
              transitTasks.push(
                (async () => {
                  try {
                    const {routes} = await routesLib.Route.computeRoutes({
                      origin: {lat: participant.lat, lng: participant.lng},
                      destination: {lat: bar.lat, lng: bar.lng},
                      travelMode: 'TRANSIT',
                      fields: ['legs'],
                      language: 'fr',
                      region: 'FR',
                      internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
                      ...(validFutureDeparture ? {departureTime: validFutureDeparture} : {}),
                    });
                    const steps = routes?.[0]?.legs?.[0]?.steps || [];
                    const transitStep = steps.find((s) => s.transitDetails?.transitLine);
                    const line = transitStep?.transitDetails?.transitLine;
                    if (line) {
                      const badge = formatTransitLineBadge(
                        line.shortName,
                        line.vehicle?.vehicleType,
                        line.name
                      );
                      if (badge && matrixResult[bar.id]?.[participant.id]) {
                        matrixResult[bar.id][participant.id] = {
                          ...matrixResult[bar.id][participant.id],
                          transitLine: badge,
                          transitLineColor: line.color || null,
                        };
                      }
                    }
                  } catch (err) {
                    if (isQuotaError(err)) {
                      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
                    }
                  }
                })()
              );
            }
          }
        }

        await Promise.all([...stationTasks, ...transitTasks]);

        if (cancelled) return;

        const enrichedTop5 = top5Bars.map((bar) => ({
          ...bar,
          nearestStation: stationByBarId[bar.id] ?? null,
        }));

        onSearchComplete({
          bars: enrichedTop5,
          travelMatrix: matrixResult,
          effectiveSearchCenter: effectiveCenter,
          shiftNotice: nextShiftNotice,
        });
      } catch (err) {
        if (cancelled) return;
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        const exactError =
          err instanceof Error
            ? err.message
            : typeof err === 'object' && err !== null && 'status' in err
            ? String((err as {status: unknown}).status)
            : String(err);
        onSearchError(`Erreur Google Places : ${exactError}`);
      } finally {
        if (!cancelled) {
          onSearchLoadingChange(false, false);
        }
      }
    };

    void runQuotaOptimizedSearch();

    return () => {
      cancelled = true;
    };
  }, [
    searchTriggerId,
    placesLib,
    routesLib,
    onSearchLoadingChange,
    onSearchError,
    onSearchComplete,
  ]);

  return (
    <AperoMap
      participants={session.participants}
      centerPoint={centerPoint}
      effectiveSearchCenter={effectiveSearchCenter}
      excludedZones={session.excludedZones}
      shiftNotice={shiftNotice}
      bars={bars}
      selectedBarId={selectedBarId}
      winningBarId={winningBarId}
      onSelectBar={onSelectBar}
      votes={session.votes}
      customPrices={session.customPrices}
      onMapReady={(m) => {
        mapRef.current = m;
      }}
    />
  );
};

export default function App() {
  const initialUrlSessionRef = useRef<SessionState | null>(getSessionFromUrl());
  const [session, setSession] = useState<SessionState>(() => {
    return initialUrlSessionRef.current ?? createDefaultSession();
  });

  const [customApiKey, setCustomApiKey] = useState<string>(() => loadCustomApiKey());
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const [searchTriggerId, setSearchTriggerId] = useState<number>(() =>
    initialUrlSessionRef.current && initialUrlSessionRef.current.participants.length > 0 ? 1 : 0
  );
  const [hasSearchedOnce, setHasSearchedOnce] = useState(false);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  const [bars, setBars] = useState<BarCandidate[]>([]);
  const [travelMatrix, setTravelMatrix] = useState<Record<string, Record<string, TravelTimeInfo>>>({});
  const [effectiveSearchCenter, setEffectiveSearchCenter] = useState<{lat: number; lng: number} | null>(null);
  const [shiftNotice, setShiftNotice] = useState<string | null>(null);

  const [isLoadingBars, setIsLoadingBars] = useState(false);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false);
  const [barsError, setBarsError] = useState<string | null>(null);
  const [mapsReady, setMapsReady] = useState(false);

  const [selectedBarId, setSelectedBarId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortCriterion>('fairness');
  const [onlyCheap, setOnlyCheap] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [activeUserName, setActiveUserName] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const activeApiKey = customApiKey || ENV_API_KEY;

  useEffect(() => {
    const handler = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  useEffect(() => {
    syncSessionToUrl(session);
  }, [session]);

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const centerPoint = useMemo(
    () => calculateWeightedBarycenter(session.participants),
    [session.participants]
  );

  const barsWithLiveHours = useMemo(() => {
    return bars.map((bar) => {
      if (!bar.openingPeriods) return bar;
      const evalRes = evaluateOpeningStatus(bar.openingPeriods, session.dateTime);
      return {
        ...bar,
        isOpenAtTarget: evalRes.isOpen,
        closesLabel: evalRes.closesLabel,
      };
    });
  }, [bars, session.dateTime]);

  const filteredAndSortedBars = useMemo(() => {
    const filtered = barsWithLiveHours.filter((bar) => {
      if (
        isPointInExcludedZones(
          bar.lat,
          bar.lng,
          bar.postalCode,
          session.excludedZones,
          bar.address
        )
      ) {
        return false;
      }
      if (onlyCheap && !isCheapBar(bar, session.customPrices[bar.id])) {
        return false;
      }
      if (onlyOpen && bar.isOpenAtTarget === false) {
        return false;
      }
      return true;
    });

    const getFairnessScore = (bar: BarCandidate): number => {
      const row = travelMatrix[bar.id];
      if (!row || session.participants.length === 0) {
        return bar.distanceFromCenterMeters;
      }
      const durations = session.participants
        .map((p) => row[p.id]?.durationSeconds)
        .filter((d): d is number => typeof d === 'number');
      if (durations.length === 0) return bar.distanceFromCenterMeters;
      const max = Math.max(...durations);
      const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
      return max + 0.35 * avg;
    };

    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sortBy === 'rating') {
        const diff = (b.rating ?? 0) - (a.rating ?? 0);
        if (Math.abs(diff) > 0.01) return diff;
      }

      if (sortBy === 'price') {
        const pintA = parseNumericPintPrice(session.customPrices[a.id]);
        const pintB = parseNumericPintPrice(session.customPrices[b.id]);
        const rankA = pintA !== null ? (pintA < 6 ? 0.5 : 1.5) : formatPriceLevel(a.priceLevel).numericRank;
        const rankB = pintB !== null ? (pintB < 6 ? 0.5 : 1.5) : formatPriceLevel(b.priceLevel).numericRank;
        if (rankA !== rankB) return rankA - rankB;
      }

      return getFairnessScore(a) - getFairnessScore(b);
    });

    return copy;
  }, [
    barsWithLiveHours,
    session.excludedZones,
    onlyCheap,
    onlyOpen,
    sortBy,
    travelMatrix,
    session.participants,
    session.customPrices,
  ]);

  const winningBar = useMemo(() => {
    if (filteredAndSortedBars.length === 0) return null;
    let bestBar = filteredAndSortedBars[0];
    let bestVotes = (session.votes[bestBar.id] || []).length;

    for (const bar of filteredAndSortedBars) {
      const count = (session.votes[bar.id] || []).length;
      if (count > bestVotes) {
        bestVotes = count;
        bestBar = bar;
      }
    }
    return bestBar;
  }, [filteredAndSortedBars, session.votes]);

  const handleSearchLoadingChange = useCallback((barsLoading: boolean, routesLoading: boolean) => {
    setIsLoadingBars(barsLoading);
    setIsLoadingRoutes(routesLoading);
  }, []);

  const handleSearchComplete = useCallback((result: SearchPipelineResult) => {
    setBars(result.bars);
    setTravelMatrix(result.travelMatrix);
    setEffectiveSearchCenter(result.effectiveSearchCenter);
    setShiftNotice(result.shiftNotice);
    setHasSearchedOnce(true);
    setHasPendingChanges(false);
    setSelectedBarId(null);
  }, []);

  const handleTriggerSearch = () => {
    if (session.participants.length === 0 || !activeApiKey) return;
    setSearchTriggerId((prev) => prev + 1);
  };

  const handleUpsertParticipant = useCallback(
    (participant: Participant) => {
      setSession((prev) => {
        const exists = prev.participants.some((p) => p.id === participant.id);
        const nextParticipants = exists
          ? prev.participants.map((p) => (p.id === participant.id ? participant : p))
          : [...prev.participants, participant];
        return {...prev, participants: nextParticipants};
      });
      if (hasSearchedOnce) setHasPendingChanges(true);
    },
    [hasSearchedOnce]
  );

  const handleRemoveParticipant = useCallback(
    (participantId: string) => {
      setSession((prev) => {
        const nextParticipants = prev.participants.filter((p) => p.id !== participantId);
        return {...prev, participants: nextParticipants};
      });
      if (hasSearchedOnce) setHasPendingChanges(true);
    },
    [hasSearchedOnce]
  );

  const handleTogglePostalCode = useCallback(
    (postalCode: string, label?: string) => {
      setSession((prev) => {
        const current = prev.excludedZones.postalCodes;
        const exists = current.includes(postalCode);
        const nextCodes = exists
          ? current.filter((c) => c !== postalCode)
          : [...current, postalCode];

        const nextLabels = {...(prev.excludedZones.postalCodeLabels || {})};
        if (exists) {
          delete nextLabels[postalCode];
        } else if (label) {
          nextLabels[postalCode] = label;
        }

        return {
          ...prev,
          excludedZones: {
            ...prev.excludedZones,
            postalCodes: nextCodes,
            postalCodeLabels: Object.keys(nextLabels).length > 0 ? nextLabels : undefined,
          },
        };
      });
      if (hasSearchedOnce) setHasPendingChanges(true);
    },
    [hasSearchedOnce]
  );

  const handleRemovePostalCode = useCallback(
    (postalCode: string) => {
      setSession((prev) => {
        const nextCodes = prev.excludedZones.postalCodes.filter((c) => c !== postalCode);
        const nextLabels = {...(prev.excludedZones.postalCodeLabels || {})};
        delete nextLabels[postalCode];
        return {
          ...prev,
          excludedZones: {
            ...prev.excludedZones,
            postalCodes: nextCodes,
            postalCodeLabels: Object.keys(nextLabels).length > 0 ? nextLabels : undefined,
          },
        };
      });
      if (hasSearchedOnce) setHasPendingChanges(true);
    },
    [hasSearchedOnce]
  );

  const handleAddCustomExcludedZone = useCallback(
    (zone: ExcludedCustomZone) => {
      setSession((prev) => ({
        ...prev,
        excludedZones: {
          ...prev.excludedZones,
          customZones: [...prev.excludedZones.customZones, zone],
        },
      }));
      if (hasSearchedOnce) setHasPendingChanges(true);
    },
    [hasSearchedOnce]
  );

  const handleRemoveCustomExcludedZone = useCallback(
    (zoneId: string) => {
      setSession((prev) => ({
        ...prev,
        excludedZones: {
          ...prev.excludedZones,
          customZones: prev.excludedZones.customZones.filter((z) => z.id !== zoneId),
        },
      }));
      if (hasSearchedOnce) setHasPendingChanges(true);
    },
    [hasSearchedOnce]
  );

  const handleClearExcludedZones = useCallback(() => {
    setSession((prev) => ({
      ...prev,
      excludedZones: {postalCodes: [], customZones: []},
    }));
    if (hasSearchedOnce) setHasPendingChanges(true);
  }, [hasSearchedOnce]);

  const handleToggleVote = useCallback(
    (barId: string) => {
      const voter = activeUserName.trim() || session.participants[0]?.name || 'Moi';
      setSession((prev) => {
        const current = prev.votes[barId] || [];
        const exists = current.some((v) => v.toLowerCase() === voter.toLowerCase());
        const nextForBar = exists
          ? current.filter((v) => v.toLowerCase() !== voter.toLowerCase())
          : [...current, voter];
        return {
          ...prev,
          votes: {
            ...prev.votes,
            [barId]: nextForBar,
          },
        };
      });
    },
    [activeUserName, session.participants]
  );

  const handleChangeCustomPrice = useCallback((barId: string, price: string) => {
    const cleaned = price.replace(/[^0-9.,]/g, '').slice(0, 6);
    setSession((prev) => {
      const nextPrices = {...prev.customPrices};
      if (cleaned) {
        nextPrices[barId] = cleaned;
      } else {
        delete nextPrices[barId];
      }
      return {...prev, customPrices: nextPrices};
    });
  }, []);

  const shareUrl = useMemo(() => buildShareUrl(session), [session]);

  const whatsappLinkUrl = useMemo(() => {
    const title = session.title.trim() || 'ApéroCentral';
    return buildWhatsAppUrl(`🍻 Rejoins « ${title} » et ajoute ton trajet :\n${shareUrl}`);
  }, [session.title, shareUrl]);

  const whatsappRecapUrl = useMemo(() => {
    if (!winningBar) return '#';
    const text = buildMessengerRecapText(
      session,
      winningBar,
      travelMatrix[winningBar.id] || {}
    );
    return buildWhatsAppUrl(text);
  }, [session, winningBar, travelMatrix]);

  const handleShareLinkFeedback = () => {
    window.history.replaceState({}, '', shareUrl);
    void copyTextToClipboard(shareUrl);
    showToast('Lien mis à jour & copié');
  };

  const handleShareMessenger = () => {
    syncSessionToUrl(session);
    const fullUrl = buildShareUrl(session);
    void copyTextToClipboard(fullUrl);
    showToast('Lien copié ! Colle-le dans votre groupe Messenger');

    if (typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      const link = document.createElement('a');
      link.href = `fb-messenger://share?link=${encodeURIComponent(window.location.href)}`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleCopyMessengerRecap = () => {
    if (!winningBar) return;
    const text = buildMessengerRecapText(
      session,
      winningBar,
      travelMatrix[winningBar.id] || {}
    );
    void copyTextToClipboard(text);
    showToast('Récap copié ! Colle-le dans votre groupe Messenger');
  };

  const handleShareRecapFeedback = () => {
    if (!winningBar) return;
    const text = buildMessengerRecapText(
      session,
      winningBar,
      travelMatrix[winningBar.id] || {}
    );
    void copyTextToClipboard(text);
    showToast('Récap copié pour WhatsApp');
  };

  const handleResetSession = () => {
    const fresh = createDefaultSession();
    setSession(fresh);
    setBars([]);
    setTravelMatrix({});
    setEffectiveSearchCenter(null);
    setShiftNotice(null);
    setSelectedBarId(null);
    setHasSearchedOnce(false);
    setHasPendingChanges(false);
    setBarsError(null);
    showToast('Nouvelle soirée prête');
  };

  const handleSaveApiKey = (newKey: string) => {
    saveCustomApiKey(newKey);
    setCustomApiKey(newKey);
    setQuotaExceeded(false);
    showToast(newKey ? 'Clé Google Maps enregistrée' : 'Clé personnalisée effacée');
  };

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      {/* Tier 1 & Tier 2 Demo Quota Banner */}
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      <OfflineIndicator />

      {/* Minimalist Apple-style Header: Tap-to-edit title + Compact Date Pill + Gear */}
      <header className="border-b border-white/10 bg-black/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2.5 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FF9F0A]/15 text-[#FF9F0A]">
              <Beer className="h-4 w-4" aria-hidden="true" />
            </span>

            <div className="min-w-0 flex-1">
              {isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={session.title}
                  onChange={(e) => setSession((prev) => ({...prev, title: e.target.value}))}
                  onBlur={() => {
                    setIsEditingTitle(false);
                    if (!session.title.trim()) {
                      setSession((prev) => ({...prev, title: 'Apéro de la Team'}));
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') {
                      setIsEditingTitle(false);
                    }
                  }}
                  maxLength={60}
                  aria-label="Nom de la soirée"
                  className="w-full max-w-xs rounded-lg border border-[#0A84FF] bg-[#1C1C1E] px-2 py-0.5 text-base font-semibold tracking-tight text-white focus:outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(true)}
                  title="Taper pour modifier le titre"
                  className="group flex max-w-full items-center gap-1.5 text-left"
                >
                  <span className="truncate text-base sm:text-lg font-semibold tracking-tight text-white">
                    {session.title || 'Apéro de la Team'}
                  </span>
                  <Pencil
                    className="h-3.5 w-3.5 shrink-0 text-[#8E8E93] opacity-70 transition-opacity group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </button>
              )}

              {/* Native iOS-styled Date/Time Picker */}
              <div className="mt-1.5 flex items-center gap-2">
                <div
                  onClick={() => {
                    try {
                      const el = dateInputRef.current as
                        | (HTMLInputElement & {showPicker?: () => void})
                        | null;
                      el?.showPicker?.();
                      el?.focus();
                    } catch {
                      dateInputRef.current?.focus();
                    }
                  }}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-[#1C1C1E] px-2.5 py-1 transition-colors hover:border-[#0A84FF]/50"
                >
                  <Calendar className="h-3.5 w-3.5 shrink-0 text-[#0A84FF]" aria-hidden="true" />
                  <input
                    ref={dateInputRef}
                    id="session-datetime"
                    type="datetime-local"
                    aria-label="Date et heure du rendez-vous"
                    value={session.dateTime}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        setSession((prev) => ({...prev, dateTime: val}));
                      }
                    }}
                    className="cursor-pointer bg-transparent text-xs font-medium text-white focus:outline-none [color-scheme:dark] tabular-nums"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <PWAInstallButton />

            {session.participants.length > 0 && (
              <button
                type="button"
                onClick={handleResetSession}
                aria-label="Nouvelle session"
                title="Nouvelle session"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#1C1C1E] text-[#8E8E93] transition-colors hover:bg-[#2C2C2E] hover:text-white"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsApiKeyModalOpen(true)}
              aria-label="Paramètres clé API Google Maps"
              title="Paramètres clé API Google Maps"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#1C1C1E] text-[#8E8E93] transition-colors hover:bg-[#2C2C2E] hover:text-white"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Responsive Layout */}
      {(() => {
        const isSearching = isLoadingBars || isLoadingRoutes;
        const mainContent = (
          <main className="mx-auto max-w-7xl px-3 pt-4 sm:px-6 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
            {/* 1. Framed Interactive Map (38vh on mobile, sticky right column on desktop) */}
            <div className="lg:col-span-7 lg:col-start-6 lg:row-start-1 lg:row-span-5 lg:sticky lg:top-4 lg:h-[calc(100vh-112px)]">
              {activeApiKey ? (
                <MapsWorkspace
                  session={session}
                  centerPoint={centerPoint}
                  effectiveSearchCenter={effectiveSearchCenter}
                  shiftNotice={shiftNotice}
                  bars={filteredAndSortedBars}
                  selectedBarId={selectedBarId}
                  winningBarId={winningBar?.id || null}
                  searchTriggerId={searchTriggerId}
                  onSelectBar={setSelectedBarId}
                  onSearchLoadingChange={handleSearchLoadingChange}
                  onSearchError={setBarsError}
                  onSearchComplete={handleSearchComplete}
                  onMapsReadyChange={setMapsReady}
                />
              ) : (
                <div className="flex h-[38vh] min-h-[260px] lg:h-full lg:min-h-[540px] flex-col items-center justify-center rounded-3xl border border-dashed border-[#0A84FF]/35 bg-[#1C1C1E]/75 p-6 text-center backdrop-blur-xl">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0A84FF]/15 text-[#0A84FF]">
                    <KeyRound className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h2 className="mt-3 text-base font-semibold tracking-tight text-white">
                    Clé API Google Maps requise
                  </h2>
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-[#8E8E93]">
                    Ajoute ta clé Google Maps Platform (Maps JS, Places New, Routes) pour afficher la carte sombre et calculer les trajets réels.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsApiKeyModalOpen(true)}
                    className="mt-4 inline-flex min-h-[42px] items-center gap-2 rounded-full bg-[#0A84FF] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0A84FF]/90"
                  >
                    <Settings className="h-4 w-4" aria-hidden="true" />
                    <span>Saisir ma clé API</span>
                  </button>
                </div>
              )}
            </div>

            {/* 2. Participants iOS Grouped Form & List */}
            <div className="mt-4 lg:mt-0 lg:col-span-5 lg:col-start-1">
              <ParticipantManager
                participants={session.participants}
                onUpsertParticipant={handleUpsertParticipant}
                onRemoveParticipant={handleRemoveParticipant}
                activeUserName={activeUserName}
                onSetActiveUserName={setActiveUserName}
                mapsReady={Boolean(activeApiKey) && mapsReady}
              />
            </div>

            {/* 3. Zone & Postal Code Exclusions Drawer + Primary Search CTA */}
            <div className="mt-4 space-y-3 lg:col-span-5 lg:col-start-1">
              <ZoneExclusionDrawer
                excludedZones={session.excludedZones}
                mapsReady={Boolean(activeApiKey) && mapsReady}
                onTogglePostalCode={handleTogglePostalCode}
                onRemovePostalCode={handleRemovePostalCode}
                onAddCustomZone={handleAddCustomExcludedZone}
                onRemoveCustomZone={handleRemoveCustomExcludedZone}
                onClearAll={handleClearExcludedZones}
              />

              <button
                type="button"
                onClick={handleTriggerSearch}
                disabled={session.participants.length === 0 || !activeApiKey || isSearching}
                className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${
                  hasPendingChanges
                    ? 'bg-[#30D158] text-black shadow-[0_8px_24px_rgba(48,209,88,0.28)] hover:bg-[#30D158]/90'
                    : 'bg-[#0A84FF] text-white shadow-[0_8px_24px_rgba(10,132,255,0.3)] hover:bg-[#0A84FF]/90'
                }`}
              >
                {isSearching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>
                      {isLoadingBars
                        ? 'Recherche des bars…'
                        : 'Calcul des trajets & lignes métro…'}
                    </span>
                  </>
                ) : (
                  <>
                    <Compass className="h-4 w-4" aria-hidden="true" />
                    <span>
                      {hasPendingChanges
                        ? 'Recalculer le QG idéal'
                        : 'Trouver le QG idéal'}
                    </span>
                  </>
                )}
              </button>
            </div>

            {/* 4. Winning Bar Quick Summary */}
            {winningBar && (
              <div className="mt-4 lg:col-span-5 lg:col-start-1">
                <div className="space-y-3 rounded-2xl border border-[#0A84FF]/35 bg-[#1C1C1E]/85 px-4 py-3.5 backdrop-blur-xl">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0A84FF]">
                        <Trophy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>QG retenu</span>
                      </div>
                      <p className="truncate text-sm font-semibold tracking-tight text-white">
                        {winningBar.name}
                      </p>
                      {winningBar.nearestStation && (
                        <p className="truncate text-xs text-[#8E8E93]">
                          🚉 {winningBar.nearestStation}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadIcsFile(session, winningBar)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-[#30D158]/35 bg-[#30D158]/15 px-3.5 py-1.5 text-xs font-semibold text-[#30D158] transition-colors hover:bg-[#30D158]/25 whitespace-nowrap shrink-0"
                    >
                      <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Agenda</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyMessengerRecap}
                    className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-full bg-[#0084FF] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0073E6]"
                  >
                    <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>Copier le récap pour Messenger</span>
                  </button>
                </div>
              </div>
            )}

            {/* 5. Bars Ranking, Filters & Voting */}
            <div className="mt-4 lg:col-span-5 lg:col-start-1">
              <BarList
                bars={filteredAndSortedBars}
                totalBarsBeforeFilter={barsWithLiveHours.length}
                participants={session.participants}
                travelMatrix={travelMatrix}
                votes={session.votes}
                customPrices={session.customPrices}
                activeUserName={activeUserName}
                selectedBarId={selectedBarId}
                winningBarId={winningBar?.id || null}
                sortBy={sortBy}
                onlyCheap={onlyCheap}
                onlyOpen={onlyOpen}
                isLoadingBars={isLoadingBars}
                isLoadingRoutes={isLoadingRoutes}
                hasSearchedOnce={hasSearchedOnce}
                barsError={barsError}
                shiftNotice={shiftNotice}
                onChangeSort={setSortBy}
                onToggleCheapFilter={() => setOnlyCheap((p) => !p)}
                onToggleOpenFilter={() => setOnlyOpen((p) => !p)}
                onResetFilters={() => {
                  setOnlyCheap(false);
                  setOnlyOpen(false);
                }}
                onSelectBar={(id) => setSelectedBarId(id)}
                onToggleVote={handleToggleVote}
                onChangeCustomPrice={handleChangeCustomPrice}
                onAddToCalendar={(bar) => downloadIcsFile(session, bar)}
              />
            </div>
          </main>
        );

        return activeApiKey ? (
          <APIProvider
            key={activeApiKey}
            apiKey={activeApiKey}
            libraries={['places', 'routes']}
            language="fr"
            region="FR"
          >
            {mainContent}
          </APIProvider>
        ) : (
          mainContent
        );
      })()}

      {/* Translucent Floating Bottom WhatsApp & Messenger Share Bar */}
      <MessengerShareBar
        whatsappLinkUrl={whatsappLinkUrl}
        whatsappRecapUrl={whatsappRecapUrl}
        onShareLink={handleShareLinkFeedback}
        onShareMessenger={handleShareMessenger}
        onShareRecap={handleShareRecapFeedback}
        onAddCalendar={() => {
          if (winningBar) downloadIcsFile(session, winningBar);
        }}
        canCopyRecap={Boolean(winningBar)}
      />

      {/* iOS Toast Pill */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-full border border-white/15 bg-[#1C1C1E]/95 px-4 py-2 text-xs sm:text-sm font-medium text-white shadow-2xl backdrop-blur-2xl whitespace-nowrap"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#30D158]" aria-hidden="true" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Gear API Key Modal */}
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        customApiKey={customApiKey}
        envApiKeyPresent={Boolean(ENV_API_KEY)}
        onSaveKey={handleSaveApiKey}
      />
    </div>
  );
}
