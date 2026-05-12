import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiGet } from '@/lib/api';

const STORAGE_KEY = 'lbss-admin-season-id';

const RETRY_DELAYS_MS = [0, 450, 1200];

async function fetchAdminSeasonsWithRetry(): Promise<AdminSeasonRow[]> {
  let lastErr: unknown;
  for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
    if (RETRY_DELAYS_MS[i]! > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[i]));
    }
    try {
      const data = await apiGet<AdminSeasonRow[]>('/admin/seasons');
      return Array.isArray(data) ? data : [];
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export interface AdminSeasonRow {
  id: number;
  year: number;
  name: string;
  isActive: boolean;
  seasonKind?: string;
}

interface AdminSeasonContextValue {
  seasons: AdminSeasonRow[];
  selectedSeasonId: number | null;
  selectedSeason: AdminSeasonRow | null;
  setSelectedSeasonId: (id: number | null) => void;
  /** True while fetching /admin/seasons on first load. */
  seasonsLoading: boolean;
  /** Set when the seasons list could not be loaded (e.g. network or session). */
  seasonsError: string | null;
  /** Reload seasons from API (e.g. after create/delete on Seasons page). */
  reloadSeasons: () => Promise<void>;
}

const AdminSeasonContext = createContext<AdminSeasonContextValue | null>(null);

export function AdminSeasonProvider({ children }: { children: ReactNode }) {
  const [seasons, setSeasons] = useState<AdminSeasonRow[]>([]);
  const [selectedSeasonId, setSelectedSeasonIdState] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [seasonsError, setSeasonsError] = useState<string | null>(null);

  const applySeasonList = useCallback((list: AdminSeasonRow[]) => {
    setSeasonsError(null);
    setSeasons(list);
    if (list.length === 0) {
      setSelectedSeasonIdState(null);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    setSelectedSeasonIdState((prev) => {
      if (prev != null && list.some((s) => s.id === prev)) {
        return prev;
      }
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      if (stored) {
        const sid = parseInt(stored, 10);
        if (!isNaN(sid) && list.some((s) => s.id === sid)) {
          return sid;
        }
      }
      const active = list.find((s) => s.isActive);
      const next = (active ?? list[0]).id;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const reloadSeasons = useCallback(async () => {
    setSeasonsError(null);
    setLoading(true);
    try {
      const list = await fetchAdminSeasonsWithRetry();
      applySeasonList(list);
    } catch (e) {
      setSeasons([]);
      setSelectedSeasonIdState(null);
      setSeasonsError(e instanceof Error ? e.message : 'Could not load seasons');
    } finally {
      setLoading(false);
    }
  }, [applySeasonList]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await fetchAdminSeasonsWithRetry();
        if (cancelled) return;
        applySeasonList(list);
      } catch (e) {
        if (!cancelled) {
          setSeasons([]);
          setSelectedSeasonIdState(null);
          setSeasonsError(e instanceof Error ? e.message : 'Could not load seasons');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySeasonList]);

  const setSelectedSeasonId = useCallback((id: number | null) => {
    setSelectedSeasonIdState(id);
    try {
      if (id != null) {
        localStorage.setItem(STORAGE_KEY, String(id));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const selectedSeason = useMemo(
    () => seasons.find((s) => s.id === selectedSeasonId) ?? null,
    [seasons, selectedSeasonId],
  );

  const value = useMemo<AdminSeasonContextValue>(
    () => ({
      seasons,
      selectedSeasonId,
      selectedSeason,
      setSelectedSeasonId,
      seasonsLoading: loading,
      seasonsError,
      reloadSeasons,
    }),
    [seasons, selectedSeasonId, selectedSeason, setSelectedSeasonId, loading, seasonsError, reloadSeasons],
  );

  return <AdminSeasonContext.Provider value={value}>{children}</AdminSeasonContext.Provider>;
}

export function useAdminSeason(): AdminSeasonContextValue {
  const ctx = useContext(AdminSeasonContext);
  if (!ctx) {
    throw new Error('useAdminSeason must be used within AdminSeasonProvider');
  }
  return ctx;
}
