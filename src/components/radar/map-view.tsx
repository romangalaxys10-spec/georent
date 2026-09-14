'use client';

/**
 * MapView — Leaflet map with price-pill pins for the loaded listings.
 *
 * - OpenStreetMap raster tiles, tinted dark via CSS filter to match the
 *   Signal Terminal palette (no tile-server key needed);
 * - one divIcon pin per listing: "$75,300" pill colored by deal score
 *   (signal = great deal, amber = mid, slate = pricey);
 * - click pin → mini-card popup (photo, price, district, offer-page link);
 * - fitBounds on items change, markers diffed by listing key;
 * - leaflet is imported lazily (window-only) and destroyed on unmount.
 */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

import { useI18n } from '@/lib/i18n';
import type { ScoredListing } from './types';

type LeafletModules = typeof import('leaflet');

const pillColor = (score: number | undefined): string => {
  if ((score ?? 0) >= 70) return '#3DD68C';
  if ((score ?? 0) >= 40) return '#E8A03C';
  return '#5B6470';
};

/** Convert listing coords to a pin position; Georgia centroid fallback. */
function posOf(l: ScoredListing): [number, number] | null {
  if (typeof l.lat === 'number' && typeof l.lng === 'number' && (l.lat !== 0 || l.lng !== 0)) {
    return [l.lat, l.lng];
  }
  return null;
}

export function MapView({ items }: { items: ScoredListing[] }) {
  const { t, locale } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const LRef = useRef<LeafletModules | null>(null);
  const markersRef = useRef(new Map<string, import('leaflet').Marker>());
  const groupRef = useRef<import('leaflet').LayerGroup | null>(null);
  const [ready, setReady] = useState(false);

  // Init map once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = await import('leaflet');
      if (cancelled || !containerRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(containerRef.current, {
        center: [41.7151, 44.8271], // Tbilisi
        zoom: 12,
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: false, // keep page scroll intact; enable on focus
      });
      map.on('focus', () => map.scrollWheelZoom.enable());
      map.on('blur', () => map.scrollWheelZoom.disable());
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        className: 'dr-map-tiles',
      }).addTo(map);
      groupRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // Sync markers with items.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = groupRef.current;
    if (!ready || !L || !map || !group) return;

    const nextKeys = new Set<string>();
    for (const l of items) {
      const p = posOf(l);
      if (!p) continue;
      nextKeys.add(l.key);
      if (markersRef.current.has(l.key)) continue;

      const color = pillColor(l.score);
      const html = `
        <span class="dr-price-pill" style="--pill:${color}">
          <span class="dr-price-pill-dot"></span>$${Math.round(l.priceUsd).toLocaleString('en-US')}
        </span>`;
      const icon = L.divIcon({
        html,
        className: 'dr-price-pin',
        iconSize: [0, 0],
        iconAnchor: [0, 12],
      });
      const marker = L.marker(p, { icon, keyboard: false, riseOnHover: true });
      const img = l.image
        ? `<img src="${l.image}" alt="" class="dr-popup-img" loading="lazy"/>`
        : '';
      const place = l.districtName ?? l.cityName ?? '';
      marker.bindPopup(
        `<div class="dr-popup">
          ${img}
          <div class="dr-popup-body">
            <div class="dr-popup-price">$${Math.round(l.priceUsd).toLocaleString('en-US')}</div>
            <div class="dr-popup-meta">${place} · ${Math.round(l.area)} m² · ${l.roomCount} br</div>
            <a href="/listing/${l.provider}/${l.objectId}" class="dr-popup-link">${t('listing.offerPage')} →</a>
          </div>
        </div>`,
        { closeButton: true, maxWidth: 240 },
      );
      marker.addTo(group);
      markersRef.current.set(l.key, marker);
    }

    // Remove stale pins.
    for (const [key, marker] of markersRef.current) {
      if (!nextKeys.has(key)) {
        group.removeLayer(marker);
        markersRef.current.delete(key);
      }
    }

    // Fit bounds to current pins.
    const pts = items.map(posOf).filter((p): p is [number, number] => p !== null);
    if (pts.length > 0) {
      map.fitBounds(L.latLngBounds(pts).pad(0.12), { animate: true });
    }
  }, [items, ready, t]);

  const geolocated = items.filter((l) => posOf(l) !== null).length;

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-surface">
      <div ref={containerRef} className="h-[560px] w-full" role="application" aria-label={t('sources.viewMap')} />
      {/* Legend */}
      <div className="pointer-events-none absolute bottom-3 start-3 z-[500] flex flex-col gap-1 rounded-lg border border-border bg-[#0B0E0C]/85 px-3 py-2 backdrop-blur-sm">
        <span className="micro text-faint">{t('map.legend')}</span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
          <span aria-hidden className="size-[7px] rounded-full" style={{ background: '#3DD68C' }} />
          {t('listing.scoreExcellent')}
          <span aria-hidden className="ms-2 size-[7px] rounded-full" style={{ background: '#E8A03C' }} />
          {t('listing.scoreGood')}
          <span aria-hidden className="ms-2 size-[7px] rounded-full" style={{ background: '#5B6470' }} />
          {t('listing.scorePricey')}
        </span>
      </div>
      {/* Count badge */}
      <div className="pointer-events-none absolute end-3 top-3 z-[500] rounded-md border border-border bg-[#0B0E0C]/85 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted tnum backdrop-blur-sm">
        {geolocated} / {items.length} {t('map.pins')}
      </div>
      {!ready ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="micro animate-pulse text-faint">{t('common.loading')}…</span>
        </div>
      ) : null}
    </div>
  );
}
