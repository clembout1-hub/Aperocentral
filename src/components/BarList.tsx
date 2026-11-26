import React, {useState} from 'react';
import {
  Beer,
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  ExternalLink,
  Footprints,
  Loader2,
  MapPin,
  Navigation,
  Route,
  Search,
  Star,
  Tag,
  TrainFront,
  Trophy,
} from 'lucide-react';
import type {BarCandidate, Participant, SortCriterion, TravelTimeInfo} from '../types/apero';
import {
  buildCitymapperUrl,
  buildGoogleMapsUrl,
  formatDistanceKm,
  formatDuration,
  formatEuroPrice,
  formatPriceLevel,
  formatTimeFrench,
  getEffectiveBarPintPrice,
  getModeEmoji,
  isCheapBar,
} from '../utils/geo';

interface BarListProps {
  bars: BarCandidate[];
  totalBarsBeforeFilter: number;
  participants: Participant[];
  travelMatrix: Record<string, Record<string, TravelTimeInfo>>; // barId -> participantId -> info
  customPrices: Record<string, string>;
  targetDateTime: string;
  selectedBarId: string | null;
  winningBarId: string | null;
  sortBy: SortCriterion;
  onlyCheap: boolean;
  onlyTopRated: boolean;
  onlyOpen: boolean;
  isLoadingBars: boolean;
  isLoadingRoutes: boolean;
  hasSearchedOnce: boolean;
  barsError: string | null;
  shiftNotice: string | null;
  registerBarRef?: (barId: string, el: HTMLElement | null) => void;
  onChangeSort: (sort: SortCriterion) => void;
  onSelectAllFilter: () => void;
  onToggleCheapFilter: () => void;
  onToggleTopRatedFilter: () => void;
  onToggleOpenFilter: () => void;
  onResetFilters: () => void;
  onSelectBar: (barId: string) => void;
  onAddToCalendar: (bar: BarCandidate) => void;
}

const FAST_TRIP_SECONDS = 18 * 60;

export const BarList: React.FC<BarListProps> = ({
  bars,
  totalBarsBeforeFilter,
  participants,
  travelMatrix,
  customPrices,
  targetDateTime,
  selectedBarId,
  winningBarId,
  sortBy,
  onlyCheap,
  onlyTopRated,
  onlyOpen,
  isLoadingBars,
  isLoadingRoutes,
  hasSearchedOnce,
  barsError,
  shiftNotice,
  registerBarRef,
  onChangeSort,
  onSelectAllFilter,
  onToggleCheapFilter,
  onToggleTopRatedFilter,
  onToggleOpenFilter,
  onResetFilters,
  onSelectBar,
  onAddToCalendar,
}) => {
  const [openNavBarId, setOpenNavBarId] = useState<string | null>(null);
  const [openStepsBarId, setOpenStepsBarId] = useState<string | null>(null);

  const isAllActive = !onlyCheap && !onlyTopRated && !onlyOpen;

  return (
    <section aria-labelledby="bars-heading" className="space-y-3">
      {/* Section Header & Segmented Sort */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2
            id="bars-heading"
            className="text-base font-semibold tracking-tight text-[var(--text-primary)]"
          >
            Top {Math.max(8, totalBarsBeforeFilter || 8)} bars autour du QG
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            {isLoadingRoutes
              ? 'Calcul porte-à-porte Google Routes…'
              : 'Classés par équité des trajets et note'}
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-1">
          {(
            [
              {id: 'fairness', label: 'Équité'},
              {id: 'price', label: 'Prix'},
              {id: 'rating', label: 'Note'},
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onChangeSort(option.id)}
              className={`min-h-[34px] rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                sortBy === option.id
                  ? 'bg-[#0A84FF] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSelectAllFilter}
          aria-pressed={isAllActive}
          className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap tabular-nums ${
            isAllActive
              ? 'border-[#0A84FF]/60 bg-[#0A84FF]/15 text-[#0A84FF]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
          }`}
        >
          <span>Tous ({totalBarsBeforeFilter || 8})</span>
        </button>

        <button
          type="button"
          onClick={onToggleCheapFilter}
          aria-pressed={onlyCheap}
          className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
            onlyCheap
              ? 'border-[#30D158]/50 bg-[#30D158]/15 text-[#30D158]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Pas cher (€)</span>
        </button>

        <button
          type="button"
          onClick={onToggleTopRatedFilter}
          aria-pressed={onlyTopRated}
          className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
            onlyTopRated
              ? 'border-[#FF9F0A]/50 bg-[#FF9F0A]/15 text-[#FF9F0A]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Star className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Top notes (4.3+)</span>
        </button>

        <button
          type="button"
          onClick={onToggleOpenFilter}
          aria-pressed={onlyOpen}
          className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
            onlyOpen
              ? 'border-[#30D158]/50 bg-[#30D158]/15 text-[#30D158]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Ouvert</span>
        </button>
      </div>

      {/* Spiral Fallback Notice */}
      {shiftNotice && (
        <div className="flex items-start gap-2 rounded-2xl border border-[#0A84FF]/30 bg-[#0A84FF]/10 px-3.5 py-2.5 text-xs text-[#0A84FF]">
          <Compass className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{shiftNotice}</span>
        </div>
      )}

      {isLoadingBars && (
        <div className="flex items-center justify-center gap-2.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] py-10 text-sm text-[var(--text-secondary)] backdrop-blur-xl">
          <Loader2 className="h-5 w-5 animate-spin text-[#0A84FF]" aria-hidden="true" />
          <span>Recherche des vrais bars autour du QG…</span>
        </div>
      )}

      {!isLoadingBars && barsError && (
        <div
          role="alert"
          className="rounded-2xl border border-[#FF453A]/30 bg-[#FF453A]/10 p-4 text-sm text-[#FF453A]"
        >
          {barsError}
        </div>
      )}

      {!isLoadingBars && !barsError && participants.length === 0 && (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 text-center backdrop-blur-xl">
          <Beer className="mx-auto h-8 w-8 text-[#FF9F0A]" aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
            Ajoute les participants dans l&apos;onglet Participants
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Puis touche « Trouver le QG idéal » pour lancer le calcul.
          </p>
        </div>
      )}

      {!isLoadingBars &&
        !barsError &&
        participants.length > 0 &&
        !hasSearchedOnce &&
        bars.length === 0 && (
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 text-center backdrop-blur-xl">
            <Search className="mx-auto h-7 w-7 text-[#0A84FF]" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
              Prêt à calculer le point de rendez-vous
            </p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Appuie sur « Trouver le QG idéal » quand le groupe est prêt.
            </p>
          </div>
        )}

      {!isLoadingBars &&
        !barsError &&
        participants.length > 0 &&
        hasSearchedOnce &&
        totalBarsBeforeFilter === 0 && (
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 text-center text-sm text-[var(--text-secondary)]">
            Aucun bar disponible hors des zones exclues. Essaie de réautoriser un quartier ou d&apos;ajuster les départs.
          </div>
        )}

      {!isLoadingBars && !barsError && totalBarsBeforeFilter > 0 && bars.length === 0 && (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 text-center backdrop-blur-xl">
          <p className="text-sm text-[var(--text-secondary)]">
            Aucun des bars retenus ne correspond aux filtres actifs.
          </p>
          <button
            type="button"
            onClick={onResetFilters}
            className="mt-3 inline-flex min-h-[38px] items-center rounded-full bg-[#0A84FF]/15 px-4 py-1.5 text-xs font-semibold text-[#0A84FF] hover:bg-[#0A84FF]/25"
          >
            Réinitialiser les filtres
          </button>
        </div>
      )}

      {/* Streamlined Bar Cards */}
      {!isLoadingBars && bars.length > 0 && (
        <div className="space-y-3">
          {bars.map((bar, idx) => {
            const barTimes = travelMatrix[bar.id] || {};
            const isWinner = winningBarId === bar.id;
            const isSelected = selectedBarId === bar.id;
            const priceInfo = formatPriceLevel(bar.priceLevel);
            const effectivePrice = getEffectiveBarPintPrice(
              bar,
              customPrices[bar.id],
              targetDateTime
            );
            const cheapHighlight = isCheapBar(bar, customPrices[bar.id], targetDateTime);
            const isNavOpen = openNavBarId === bar.id;
            const isStepsOpen = openStepsBarId === bar.id;

            const hasAnySteps = participants.some(
              (p) => (barTimes[p.id]?.steps?.length ?? 0) > 0
            );

            const durations = participants
              .map((p) => barTimes[p.id]?.durationSeconds)
              .filter((d): d is number => typeof d === 'number');
            const avgMinutes =
              durations.length > 0
                ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length / 60)
                : null;
            const maxMinutes =
              durations.length > 0 ? Math.round(Math.max(...durations) / 60) : null;

            const activePriceLabel = effectivePrice.isHappyHour
              ? `HH ${formatEuroPrice(effectivePrice.price!)}`
              : effectivePrice.price !== null
              ? formatEuroPrice(effectivePrice.price)
              : priceInfo.label;

            const isLocalSource = bar.source === 'local';
            const hhStartFormatted = formatTimeFrench(bar.happyHourStart);
            const hhEndFormatted = formatTimeFrench(bar.happyHourEnd);
            const hhRangeLabel =
              hhStartFormatted && hhEndFormatted
                ? `${hhStartFormatted}–${hhEndFormatted}`
                : null;

            const hhSubLineParts: string[] = [];
            if (hhRangeLabel && effectivePrice.happyHourPrice !== null) {
              hhSubLineParts.push(
                `HH ${hhRangeLabel} · ${formatEuroPrice(effectivePrice.happyHourPrice)}`
              );
            } else if (hhRangeLabel) {
              hhSubLineParts.push(`HH ${hhRangeLabel}`);
            }
            if (effectivePrice.isHappyHour && effectivePrice.regularPrice !== null) {
              hhSubLineParts.push(`Normal ${formatEuroPrice(effectivePrice.regularPrice)}`);
            }
            const hhSubLine = hhSubLineParts.join(' · ');

            return (
              <article
                key={bar.id}
                ref={(el) => registerBarRef?.(bar.id, el)}
                onClick={() => onSelectBar(bar.id)}
                className={`cursor-pointer rounded-2xl border p-4 backdrop-blur-xl transition-all ${
                  isSelected
                    ? 'border-[#0A84FF] bg-[var(--bg-card-strong)] shadow-[0_0_0_2px_rgba(10,132,255,0.35)]'
                    : isWinner
                    ? 'border-[#0A84FF]/45 bg-[var(--bg-card-strong)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-strong)]'
                }`}
              >
                {/* 1. En-tête : Rang + Nom + Badge provenance + Prix pinte à droite */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isWinner && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#0A84FF]/20 px-2 py-0.5 text-[11px] font-semibold text-[#0A84FF] shrink-0">
                          <Trophy className="h-3 w-3" aria-hidden="true" />
                          <span>QG</span>
                        </span>
                      )}
                      {isLocalSource ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#FF9F0A]/45 bg-[#FF9F0A]/15 px-2 py-0.5 text-[10px] font-semibold text-[#FF9F0A] shrink-0">
                          <span aria-hidden="true">🍺</span>
                          <span>MisterGoodBeer</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)] shrink-0">
                          Google Maps
                        </span>
                      )}
                    </div>

                    <h3 className="mt-1 truncate text-base font-semibold tracking-tight text-[var(--text-primary)]">
                      {idx + 1}. {bar.name}
                    </h3>
                  </div>

                  {/* Bloc prix de la pinte à droite */}
                  <div className="flex max-w-[150px] shrink-0 flex-col items-end text-right">
                    <span
                      className={`text-sm font-bold whitespace-nowrap tabular-nums ${
                        effectivePrice.isHappyHour
                          ? 'text-[#30D158]'
                          : cheapHighlight
                          ? 'text-[#30D158]'
                          : effectivePrice.price !== null || priceInfo.tier === 'medium'
                          ? 'text-[#FF9F0A]'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {activePriceLabel}
                    </span>
                    {hhSubLine && (
                      <span className="mt-0.5 text-[10px] leading-tight text-[var(--text-secondary)] tabular-nums">
                        {hhSubLine}
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. Infos clés sur 1 ligne : Adresse · Note · Temps moyen & max */}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[var(--text-secondary)]">
                  <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate max-w-[175px] sm:max-w-[230px]">
                      {bar.address}
                    </span>
                  </span>
                  {bar.rating !== null && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-0.5 font-semibold text-[#FF9F0A] tabular-nums whitespace-nowrap">
                        <Star
                          className="h-3 w-3 fill-[#FF9F0A] text-[#FF9F0A]"
                          aria-hidden="true"
                        />
                        {bar.rating.toFixed(1)}
                      </span>
                    </>
                  )}
                  {avgMinutes !== null && maxMinutes !== null && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-[var(--text-muted)] tabular-nums whitespace-nowrap">
                        moy. {avgMinutes} min · max {maxMinutes} min
                      </span>
                    </>
                  )}
                </div>

                {/* 3. Temps de trajet de chaque participant (OBLIGATOIRE) */}
                {participants.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {participants.map((p) => {
                      const info = barTimes[p.id];
                      const isFast = info && info.durationSeconds <= FAST_TRIP_SECONDS;
                      return (
                        <div
                          key={p.id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs"
                        >
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span aria-hidden="true">{getModeEmoji(p.mode)}</span>
                            <span className="font-semibold text-[var(--text-primary)] truncate max-w-[95px]">
                              {p.name}
                            </span>
                            <span aria-hidden="true" className="text-[var(--text-secondary)]">
                              :
                            </span>
                            <span
                              className={`font-bold tabular-nums whitespace-nowrap ${
                                isFast ? 'text-[#30D158]' : 'text-[var(--text-primary)]'
                              }`}
                            >
                              {info ? (
                                <>
                                  {info.isEstimate ? '~' : ''}
                                  {formatDuration(info.durationSeconds)}
                                </>
                              ) : isLoadingRoutes ? (
                                '…'
                              ) : (
                                'N/C'
                              )}
                            </span>
                            {info?.routeSummary && (
                              <>
                                <span aria-hidden="true" className="text-[var(--text-secondary)]">
                                  ·
                                </span>
                                <span className="truncate text-[var(--text-secondary)]">
                                  {info.routeSummary}
                                </span>
                              </>
                            )}
                          </div>

                          {info?.transitLine && (
                            <span
                              className="shrink-0 rounded-md border border-[#0A84FF]/35 bg-[#0A84FF]/20 px-1.5 py-0.5 text-[10px] font-bold tracking-tight text-[#0A84FF]"
                              style={
                                info.transitLineColor
                                  ? {
                                      borderColor: `${info.transitLineColor}66`,
                                      backgroundColor: `${info.transitLineColor}22`,
                                    }
                                  : undefined
                              }
                            >
                              {info.transitLine}
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {hasAnySteps && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenStepsBarId(isStepsOpen ? null : bar.id);
                        }}
                        aria-expanded={isStepsOpen}
                        className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1 text-[11px] font-semibold text-[#0A84FF] transition-colors hover:border-[#0A84FF]/50"
                      >
                        <Route className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {isStepsOpen ? 'Masquer le détail du trajet' : 'Voir le détail du trajet'}
                        </span>
                        {isStepsOpen ? (
                          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </button>
                    )}

                    {/* Expandable Step-by-Step Transfer Details */}
                    {isStepsOpen && (
                      <div
                        className="space-y-2.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {participants.map((p) => {
                          const info = barTimes[p.id];
                          const steps = info?.steps || [];
                          return (
                            <div
                              key={`steps-${p.id}`}
                              className="space-y-1.5 border-b border-[var(--border-subtle)] pb-2.5 last:border-b-0 last:pb-0"
                            >
                              <div className="flex items-center justify-between gap-2 font-semibold text-[var(--text-primary)]">
                                <span>
                                  {getModeEmoji(p.mode)} {p.name}
                                </span>
                                <span className="tabular-nums text-[#0A84FF]">
                                  {info
                                    ? `${info.isEstimate ? '~' : ''}${formatDuration(info.durationSeconds)} · ${formatDistanceKm(info.distanceMeters)}`
                                    : 'N/C'}
                                </span>
                              </div>

                              {steps.length === 0 ? (
                                <p className="text-[11px] text-[var(--text-secondary)]">
                                  Trajet direct ({formatDistanceKm(info?.distanceMeters || 0)}).
                                </p>
                              ) : (
                                <ol className="space-y-1.5 pl-1">
                                  {steps.map((step, sIdx) => {
                                    const stepMins =
                                      typeof step.durationSeconds === 'number'
                                        ? Math.max(1, Math.round(step.durationSeconds / 60))
                                        : null;
                                    if (step.kind === 'TRANSIT') {
                                      return (
                                        <li
                                          key={sIdx}
                                          className="flex items-start gap-2 text-[11px] leading-snug"
                                        >
                                          <TrainFront
                                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0A84FF]"
                                            aria-hidden="true"
                                          />
                                          <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                              {step.lineBadge && (
                                                <span
                                                  className="rounded px-1.5 py-0.5 text-[10px] font-bold text-[#0A84FF] border border-[#0A84FF]/40 bg-[#0A84FF]/15"
                                                  style={
                                                    step.lineColor
                                                      ? {
                                                          borderColor: `${step.lineColor}66`,
                                                          backgroundColor: `${step.lineColor}22`,
                                                        }
                                                      : undefined
                                                  }
                                                >
                                                  {step.lineBadge}
                                                </span>
                                              )}
                                              {step.headsign && (
                                                <span className="font-medium text-[var(--text-primary)]">
                                                  dir. {step.headsign}
                                                </span>
                                              )}
                                              {stepMins !== null && (
                                                <span className="text-[var(--text-secondary)] tabular-nums">
                                                  ({stepMins} min
                                                  {step.stopCount ? ` · ${step.stopCount} arrêts` : ''})
                                                </span>
                                              )}
                                            </div>
                                            {(step.departureStop || step.arrivalStop) && (
                                              <p className="mt-0.5 text-[var(--text-secondary)]">
                                                {step.departureStop || 'Départ'} →{' '}
                                                {step.arrivalStop || 'Arrivée'}
                                              </p>
                                            )}
                                          </div>
                                        </li>
                                      );
                                    }

                                    return (
                                      <li
                                        key={sIdx}
                                        className="flex items-start gap-2 text-[11px] text-[var(--text-secondary)]"
                                      >
                                        <Footprints
                                          className="mt-0.5 h-3.5 w-3.5 shrink-0"
                                          aria-hidden="true"
                                        />
                                        <span className="min-w-0 flex-1">
                                          {step.instructions ? (
                                            <>{step.instructions}</>
                                          ) : step.kind === 'BICYCLING' ? (
                                            'Vélo'
                                          ) : step.kind === 'DRIVING' ? (
                                            'Conduite'
                                          ) : (
                                            'Marche'
                                          )}{' '}
                                          <span className="tabular-nums">
                                            ({stepMins !== null ? `${stepMins} min · ` : ''}
                                            {formatDistanceKm(step.distanceMeters)})
                                          </span>
                                        </span>
                                      </li>
                                    );
                                  })}
                                </ol>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Clean Actions Row: "Y aller" + "Agenda (.ics)" on #1 QG */}
                <div
                  className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-2.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isWinner ? (
                    <button
                      type="button"
                      onClick={() => onAddToCalendar(bar)}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[#30D158]/35 bg-[#30D158]/15 px-3 py-1 text-xs font-semibold text-[#30D158] transition-colors hover:bg-[#30D158]/25 whitespace-nowrap"
                    >
                      <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Agenda (.ics)</span>
                    </button>
                  ) : (
                    <div />
                  )}

                  <button
                    type="button"
                    onClick={() => setOpenNavBarId(isNavOpen ? null : bar.id)}
                    aria-expanded={isNavOpen}
                    className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      isNavOpen
                        ? 'border-[#0A84FF]/50 bg-[#0A84FF]/20 text-[#0A84FF]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                    }`}
                  >
                    <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Y aller</span>
                  </button>
                </div>

                {/* Inline "Y aller" Google Maps / Citymapper Drawer */}
                {isNavOpen && (
                  <div
                    className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                      Ouvrir avec :
                    </span>
                    <a
                      href={buildGoogleMapsUrl(bar)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card-strong)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)] hover:border-[#0A84FF]/60"
                    >
                      <span>Google Maps</span>
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                    <a
                      href={buildCitymapperUrl(bar)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-[#30D158]/35 bg-[#30D158]/15 px-3 py-1 text-xs font-semibold text-[#30D158] hover:bg-[#30D158]/25"
                    >
                      <span>Citymapper</span>
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </div>
                )}

                {/* Required Google Places Attributions */}
                {bar.attributions.length > 0 && (
                  <p className="mt-2 text-[10px] text-[var(--text-secondary)]">
                    Source :{' '}
                    {bar.attributions.map((attr, aIdx) => (
                      <React.Fragment key={`${attr.provider}-${aIdx}`}>
                        {aIdx > 0 && ', '}
                        {attr.providerURI ? (
                          <a
                            href={attr.providerURI}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="underline hover:text-[var(--text-primary)]"
                          >
                            {attr.provider}
                          </a>
                        ) : (
                          attr.provider
                        )}
                      </React.Fragment>
                    ))}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
