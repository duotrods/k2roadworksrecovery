import { useState, useEffect, useCallback, useRef } from "react";
import { clientDataService } from "../services/clientDataService";

/**
 * Custom hook for real-time live incidents using Supabase Realtime
 * (postgres_changes). More cost-effective than polling because updates
 * only arrive when data actually changes, instantly.
 */
export function useLiveIncidents(schemeId) {
  const [liveIncidents, setLiveIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!schemeId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Subscribe to real-time updates
    const unsubscribe = clientDataService.subscribeLiveIncidents(
      schemeId,
      (incidents) => {
        setLiveIncidents(incidents);
        setLoading(false);
      },
      (err) => {
        console.error("Error in live incidents subscription:", err);
        setError(err);
        setLoading(false);
      }
    );

    // Cleanup: unsubscribe when component unmounts or schemeId changes
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [schemeId]);

  return { liveIncidents, loading, error };
}

/**
 * Custom hook for real-time scheme incidents (both live and completed)
 * Uses Supabase Realtime (postgres_changes) for efficient real-time updates
 */
export function useSchemeIncidents(schemeId) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!schemeId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Subscribe to real-time updates
    const unsubscribe = clientDataService.subscribeSchemeIncidents(
      schemeId,
      (allIncidents) => {
        setIncidents(allIncidents);
        setLoading(false);
      },
      (err) => {
        console.error("Error in scheme incidents subscription:", err);
        setError(err);
        setLoading(false);
      }
    );

    // Cleanup: unsubscribe when component unmounts or schemeId changes
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [schemeId]);

  // Derived data: split into live and completed
  const liveIncidents = incidents.filter((r) => r.status === "live");
  const completedIncidents = incidents.filter((r) => r.status === "completed");

  return { incidents, liveIncidents, completedIncidents, loading, error };
}

/**
 * Hook for paginated completed incidents - TRUE server-side pagination
 * Only reads 10 rows at a time (massive cost savings!)
 *
 * Example: 1000 completed incidents
 * - Old way: 1000 reads every time
 * - New way: 10 reads per page (only when user navigates)
 */
export function usePaginatedCompletedIncidents(schemeId, pageSize = 10) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [cursors, setCursors] = useState([]); // Store cursors for each page
  const [hasMore, setHasMore] = useState(true);

  // Page cache: stores fetched page data so revisiting a page costs 0 reads
  const pageCacheRef = useRef({});

  const totalPages = Math.ceil(totalCount / pageSize);

  // Fetch total count once
  useEffect(() => {
    if (!schemeId) return;

    clientDataService.getCompletedIncidentsCount(schemeId)
      .then(setTotalCount)
      .catch(console.error);
  }, [schemeId]);

  // Fetch page data (checks cache first, only hits Supabase on cache miss)
  const fetchPage = useCallback(async (page) => {
    if (!schemeId) return;

    setError(null);

    // Check cache first — if page was already fetched, use cached data (0 reads!)
    const cached = pageCacheRef.current[page];
    if (cached) {
      setIncidents(cached.incidents);
      setHasMore(cached.hasMore);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // Get cursor for previous page (or null for first page)
      const lastDoc = page > 1 ? cursors[page - 2] : null;

      const result = await clientDataService.getCompletedIncidentsPaginated(
        schemeId,
        pageSize,
        lastDoc
      );

      setIncidents(result.incidents);
      setHasMore(result.hasMore);

      // Store in cache for instant access later
      pageCacheRef.current[page] = {
        incidents: result.incidents,
        hasMore: result.hasMore,
      };

      // Store cursor for this page
      if (result.lastDoc) {
        setCursors(prev => {
          const newCursors = [...prev];
          newCursors[page - 1] = result.lastDoc;
          return newCursors;
        });
      }
    } catch (err) {
      console.error("Error fetching paginated incidents:", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [schemeId, pageSize, cursors]);

  // Fetch first page on mount
  useEffect(() => {
    fetchPage(1);
  }, [schemeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigation functions
  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages && hasMore) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      fetchPage(nextPage);
    }
  }, [currentPage, totalPages, hasMore, fetchPage]);

  const goToPrevPage = useCallback(() => {
    if (currentPage > 1) {
      const prevPage = currentPage - 1;
      setCurrentPage(prevPage);
      fetchPage(prevPage);
    }
  }, [currentPage, fetchPage]);

  const goToFirstPage = useCallback(() => {
    setCurrentPage(1);
    setCursors([]); // Reset cursors
    fetchPage(1);
  }, [fetchPage]);

  // Refresh completed list (go back to page 1 and re-fetch count)
  // Called when a live incident gets completed so the completed list updates automatically
  const refreshCompleted = useCallback(() => {
    setCurrentPage(1);
    setCursors([]);
    pageCacheRef.current = {}; // Clear cache since data changed
    fetchPage(1);
    if (schemeId) {
      clientDataService.getCompletedIncidentsCount(schemeId).then(setTotalCount).catch(console.error);
    }
  }, [fetchPage, schemeId]);

  return {
    incidents,
    loading,
    error,
    currentPage,
    totalPages,
    totalCount,
    hasMore,
    goToNextPage,
    goToPrevPage,
    goToFirstPage,
    refreshCompleted,
    pageSize,
  };
}
