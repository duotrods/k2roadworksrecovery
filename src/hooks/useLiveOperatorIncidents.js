import { useState, useEffect, useCallback, useRef } from "react";
import { staffService } from "../services/staffService";

/**
 * Custom hook for real-time live incidents (Live Operator Dashboard)
 * Uses Supabase Realtime (postgres_changes) for instant updates - only
 * fires when data actually changes, unlike polling.
 */
export function useLiveOperatorIncidents() {
  const [liveIncidents, setLiveIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    // Subscribe to real-time updates
    const unsubscribe = staffService.subscribeLiveIncidents(
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

    // Cleanup: unsubscribe when component unmounts
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return { liveIncidents, loading, error };
}

/**
 * Hook for paginated completed incidents - TRUE server-side pagination
 * Only reads `pageSize` rows at a time (massive cost savings!)
 *
 * Example: 1000 completed incidents
 * - Old way: 1000 reads every time
 * - New way: 10 reads per page (only when user navigates)
 */
export function usePaginatedCompletedIncidentsForOperator(pageSize = 10) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [cursors, setCursors] = useState([]); // Store cursors for each page
  const [hasMore, setHasMore] = useState(true);

  // Page cache: stores fetched page data so revisiting a page costs 0 reads
  // Key = page number, Value = { incidents, hasMore }
  const pageCacheRef = useRef({});

  const totalPages = Math.ceil(totalCount / pageSize);

  // Fetch total count once
  useEffect(() => {
    staffService.getCompletedIncidentsCount()
      .then(setTotalCount)
      .catch(console.error);
  }, []);

  // Fetch page data (checks cache first, only hits Supabase on cache miss)
  const fetchPage = useCallback(async (page) => {
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

      const result = await staffService.getCompletedIncidentsPaginated(
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
  }, [pageSize, cursors]);

  // Fetch first page on mount
  useEffect(() => {
    fetchPage(1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    staffService.getCompletedIncidentsCount().then(setTotalCount).catch(console.error);
  }, [fetchPage]);

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
