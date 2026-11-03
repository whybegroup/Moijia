import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { requestPermissionPrompt } from '../utils/permissions';
import {
  searchLocationSuggestions,
  type GeoCoords,
  type LocationSuggestion,
} from '../utils/locationSuggestions';

const GPS_TIMEOUT_MS = 8000;

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name;
  return name === 'AbortError';
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (typeof err === 'string' && err.trim()) return err.trim();
  return 'Location lookup failed';
}

async function resolveDeviceCoords(): Promise<GeoCoords | null> {
  try {
    const lastKnown = await Location.getLastKnownPositionAsync();
    const fresh = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        mayShowUserSettingsDialog: true,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), GPS_TIMEOUT_MS)),
    ]);
    const pos = fresh ?? lastKnown;
    if (!pos) return null;
    return {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
    };
  } catch {
    return null;
  }
}

/**
 * Debounced Google Places Autocomplete for a location text field.
 * Biases toward device GPS when available; returns addresses and places
 * in Google's relevance ranking (Maps-style as-you-type).
 */
export function useLocationSuggestions(query: string, enabled = true) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  /** True while the suggestion panel should stay open (incl. empty Places results). */
  const [panelOpen, setPanelOpen] = useState(false);
  const coordsRef = useRef<GeoCoords | null>(null);
  const coordsPromiseRef = useRef<Promise<GeoCoords | null> | null>(null);
  const locationPromptedRef = useRef(false);

  const ensureCoords = () => {
    if (coordsRef.current) {
      return Promise.resolve(coordsRef.current);
    }
    if (coordsPromiseRef.current) {
      return coordsPromiseRef.current;
    }

    coordsPromiseRef.current = (async () => {
      try {
        if (!locationPromptedRef.current) {
          locationPromptedRef.current = true;
          const allowed = await requestPermissionPrompt(
            () => Location.getForegroundPermissionsAsync(),
            () => Location.requestForegroundPermissionsAsync(),
            {
              title: 'Location',
              message: 'Allow location access in Settings to suggest nearby places.',
            },
          );
          if (!allowed) return null;
        } else {
          const existing = await Location.getForegroundPermissionsAsync();
          if (!existing.granted) return null;
        }
        const coords = await resolveDeviceCoords();
        if (coords) coordsRef.current = coords;
        return coords ?? coordsRef.current;
      } catch {
        return coordsRef.current;
      } finally {
        coordsPromiseRef.current = null;
      }
    })();

    return coordsPromiseRef.current;
  };

  // Prefetch GPS while the field is active so the first search is already biased.
  useEffect(() => {
    if (!enabled) return;
    void ensureCoords();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setSuggestions([]);
      setSuggesting(false);
      setSuggestionError(null);
      setPanelOpen(false);
      return;
    }

    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      setSuggesting(false);
      setSuggestionError(null);
      setPanelOpen(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      void (async () => {
        try {
          setSuggesting(true);
          setPanelOpen(true);
          setSuggestionError(null);
          const near = await ensureCoords();
          if (controller.signal.aborted) return;
          const next = await searchLocationSuggestions(trimmed, {
            near,
            limit: 6,
            signal: controller.signal,
          });
          if (!controller.signal.aborted) {
            setSuggestions(next);
            setSuggestionError(null);
            setPanelOpen(true);
          }
        } catch (err) {
          if (controller.signal.aborted || isAbortError(err)) return;
          setSuggestions([]);
          setSuggestionError(errorMessage(err));
          setPanelOpen(true);
        } finally {
          if (!controller.signal.aborted) setSuggesting(false);
        }
      })();
    }, 260);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query, enabled]);

  const clearSuggestions = () => {
    setSuggestions([]);
    setSuggestionError(null);
    setSuggesting(false);
    setPanelOpen(false);
  };

  return { suggestions, suggesting, suggestionError, panelOpen, clearSuggestions };
}
