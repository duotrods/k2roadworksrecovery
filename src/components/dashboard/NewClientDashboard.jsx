/* eslint-disable no-constant-binary-expression */
import { useState, useRef, useEffect, useMemo, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../hooks/useAuth";
import { useLiveIncidents } from "../../hooks/useLiveIncidents";
import { clientDataService } from "../../services/clientDataService";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  AlertTriangle,
  Calendar,
  Download,
  FileSpreadsheet,
  Radio,
  Eye,
  Wrench,
  Truck,
  Car,
  Clock,
  BarChart3,
  PieChart as PieChartIcon,
  History,
  X,
} from "lucide-react";
import { SCHEMES } from "../../utils/schemes";
import DrillDownSidebar from "./DrillDownSidebar";
import {
  DateRangePicker,
  defaultStaticRanges,
  createStaticRanges,
} from "react-date-range";
import "react-date-range/dist/styles.css"; // main css file
import "react-date-range/dist/theme/default.css"; // theme css file
import { addDays, startOfDay, endOfDay } from "date-fns";
import toast from "react-hot-toast";
import { PIE_COLORS, exportChartsToPDF } from "../../utils/pdfChartExport";
import { layoutPieLabels } from "../../utils/pieLabelLayout";
import { exportDashboardToExcel } from "../../utils/excelExport";
import {
  clearanceBucket,
  clearanceRateData,
  monthlyRecoverySummary,
} from "../../utils/incidentStats";

const commonChartProps = {
  cartesianGrid: { strokeDasharray: "3 3", stroke: "#0865ad" },
  xAxis: { tick: { fontSize: 13 } },
  yAxis: { tick: { fontSize: 13 } },
  tooltip: {
    contentStyle: {
      backgroundColor: "#fff",
      border: "1px solid #0865ad",
      borderRadius: "8px",
    },
    labelStyle: { fontWeight: "bold" },
  },
  legend: { wrapperStyle: { paddingTop: "20px" } },
  bar: { fill: "#0865ad", radius: [8, 8, 0, 0] },
  chartMargin: { top: 10, right: 20, left: -35, bottom: 10 },
};

const fmtPct = (value, total) => {
  if (!total || !value) return "0%";
  const pct = (value / total) * 100;
  return pct < 1 ? "<1%" : `${Math.round(pct)}%`;
};

const truncate = (text, max) =>
  text.length > max ? `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…` : text;

// Pie view for ChartCard: a labelled pie whose labels never overlap or get
// clipped (see layoutPieLabels), with a compact legend underneath. The card
// keeps its height — the pie takes whatever the legend leaves.
const PieBreakdown = ({ data, height, onSliceClick, tooltipFormatter }) => {
  const wrapRef = useRef(null);
  const legendRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [legendHeight, setLegendHeight] = useState(0);
  const [activeName, setActiveName] = useState(null);

  useEffect(() => {
    const measure = () => {
      setWidth(wrapRef.current?.clientWidth ?? 0);
      setLegendHeight(legendRef.current?.offsetHeight ?? 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (wrapRef.current) observer.observe(wrapRef.current);
    if (legendRef.current) observer.observe(legendRef.current);
    return () => observer.disconnect();
  }, []);

  // Colour is tied to a category's position in the full data set, so a
  // zero-value category dropping out doesn't repaint the rest.
  const slices = data
    .map((d, i) => ({
      ...d,
      Number: Number(d.Number) || 0,
      color: PIE_COLORS[i % PIE_COLORS.length],
    }))
    .filter((d) => d.Number > 0);
  const total = slices.reduce((sum, d) => sum + d.Number, 0);
  const chartHeight = height - legendHeight;
  const layout =
    width > 0 && total > 0
      ? layoutPieLabels(slices.map((d) => d.Number), width, chartHeight)
      : null;

  const renderLabel = ({ index }) => {
    const label = layout.labels[index];
    if (!label) return null;
    const slice = slices[index];
    const dimmed = activeName && activeName !== slice.name;
    const anchor = label.right ? "start" : "end";
    const [lineEndX] = label.lineEnd;
    const stats = `${slice.Number.toLocaleString()} (${fmtPct(slice.Number, total)})`;
    return (
      <g key={slice.name} opacity={dimmed ? 0.3 : 1} style={{ pointerEvents: "none" }}>
        <polyline
          points={`${label.edge.join(",")} ${label.bend.join(",")} ${lineEndX},${label.y}`}
          fill="none"
          stroke={slice.color}
          strokeWidth={1.5}
        />
        <circle cx={lineEndX} cy={label.y} r={2.5} fill={slice.color} />
        {layout.twoLine ? (
          <text x={label.x} textAnchor={anchor} fontSize={12}>
            <tspan x={label.x} y={label.y - 3} fill="#1f2937" fontWeight={600}>
              {truncate(slice.name, layout.maxChars)}
            </tspan>
            <tspan x={label.x} y={label.y + 12} fill="#637381">
              {stats}
            </tspan>
          </text>
        ) : (
          <text x={label.x} y={label.y + 4} textAnchor={anchor} fontSize={12} fill="#1f2937">
            <tspan fontWeight={600}>
              {truncate(slice.name, Math.max(4, layout.maxChars - stats.length - 1))}
            </tspan>
            <tspan fill="#637381">{` ${stats}`}</tspan>
          </text>
        )}
      </g>
    );
  };

  return (
    <div ref={wrapRef} className="flex flex-col" style={{ height }}>
      {total === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
          No data for this period
        </div>
      ) : (
        layout && (
          <PieChart width={width} height={chartHeight}>
            <Pie
              data={slices}
              dataKey="Number"
              nameKey="name"
              cx={layout.cx}
              cy={layout.cy}
              outerRadius={layout.radius}
              startAngle={layout.startAngle}
              endAngle={layout.startAngle - 360}
              stroke="#fff"
              strokeWidth={2}
              label={renderLabel}
              labelLine={false}
              isAnimationActive={false}
              onClick={(entry) => onSliceClick?.(entry.name)}
              onMouseEnter={(entry) => setActiveName(entry.name)}
              onMouseLeave={() => setActiveName(null)}
              style={{ cursor: onSliceClick ? "pointer" : "default", outline: "none" }}
            >
              {slices.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={entry.color}
                  fillOpacity={activeName && activeName !== entry.name ? 0.3 : 1}
                />
              ))}
            </Pie>
            <Tooltip
              {...commonChartProps.tooltip}
              formatter={
                tooltipFormatter ||
                ((value, name) => [`${value} (${fmtPct(value, total)})`, name])
              }
            />
          </PieChart>
        )
      )}
      <ul
        ref={legendRef}
        className="mt-auto pt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 max-h-[66px] overflow-y-auto"
      >
        {slices.map((slice) => (
          <li key={slice.name}>
            <button
              type="button"
              onClick={() => onSliceClick?.(slice.name)}
              onMouseEnter={() => setActiveName(slice.name)}
              onMouseLeave={() => setActiveName(null)}
              className={`flex items-center gap-1.5 text-xs text-gray-600 transition-opacity ${
                onSliceClick ? "cursor-pointer hover:text-gray-900" : "cursor-default"
              } ${activeName && activeName !== slice.name ? "opacity-40" : ""}`}
            >
              <span className="size-2.5 rounded-sm shrink-0" style={{ backgroundColor: slice.color }} />
              {slice.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

// `data` + `onSliceClick` are optional — only charts that pass a plain array
// of { name, Number } get the bar/pie toggle; charts that don't (e.g. the
// time-series chart) always render their `children` bar chart as-is.
// `chartKey` + `chartTypesRef` mirror the toggle into a ref keyed by
// chartKey so handleExportPDF (which lives outside this component and can't
// see its state) knows whether to draw a bar or pie chart for this card in
// the PDF.
const ChartCard = memo(
  ({
    title,
    children,
    data,
    onSliceClick,
    fullWidth = false,
    height = 380,
    chartKey,
    chartTypesRef,
    tooltipFormatter,
  }) => {
    const [type, setType] = useState("bar");
    const canTogglePie = Array.isArray(data);

    const changeType = (t) => {
      setType(t);
      if (chartTypesRef && chartKey) chartTypesRef.current[chartKey] = t;
    };

    return (
      <div
        className={`bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow ${fullWidth ? "col-span-full" : ""}`}
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between mb-6 border-b pb-3">
          <h5 className="text-xl font-bold text-gray-800">{title}</h5>
          {canTogglePie && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => changeType("bar")}
                title="Bar chart"
                className={`p-1.5 rounded-md transition-colors ${
                  type === "bar"
                    ? "bg-brand-500 text-white"
                    : "bg-gray-100 text-gray-400 hover:text-gray-600"
                }`}
              >
                <BarChart3 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => changeType("pie")}
                title="Pie chart"
                className={`p-1.5 rounded-md transition-colors ${
                  type === "pie"
                    ? "bg-brand-500 text-white"
                    : "bg-gray-100 text-gray-400 hover:text-gray-600"
                }`}
              >
                <PieChartIcon className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        {canTogglePie && type === "pie" ? (
          <PieBreakdown
            data={data}
            height={height}
            onSliceClick={onSliceClick}
            tooltipFormatter={tooltipFormatter}
          />
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            {children}
          </ResponsiveContainer>
        )}
      </div>
    );
  },
);

// The confirmed fault classification for an incident — set once the job's
// fully inspected (Step 3's Fault). Mirrors clientDataService.incidentClassification.
const incidentClassification = (i) => i.actualFault || "";

// Tooltip for the clearance-rate charts: count plus its share, e.g. "12 (80%)".
const clearanceTooltipFormatter = (value, _name, item) =>
  `${value} (${item?.payload?.pct ?? 0}%)`;

// Combined first so it pairs with Vehicle Type in the 2-column grid,
// leaving Heavy and Light side by side on the next row.
const CLEARANCE_CHARTS = [
  {
    key: "combinedClearance",
    title: "Clearance Rate (Light + Heavy)",
    vehicleTypes: ["Light Recovery", "Heavy Recovery"],
  },
  { key: "heavyClearance", title: "Heavy Clearance Rate", vehicleTypes: ["Heavy Recovery"] },
  { key: "lightClearance", title: "Light Clearance Rate", vehicleTypes: ["Light Recovery"] },
];

const transformDataForChart = (dataObj, filterUnknown = true) => {
  if (!dataObj) return [];
  return Object.entries(dataObj)
    .filter(([name, count]) => {
      if (
        filterUnknown &&
        (name === "Unknown" || name === "" || name === "undefined")
      )
        return false;
      return count > 0;
    })
    .map(([name, count]) => ({ name, Number: count }))
    .sort((a, b) => b.Number - a.Number);
};

const NewClientDashboard = ({ basePath = "/dashboard/client" }) => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const datePickerRef = useRef(null);
  const dashboardRef = useRef(null);
  // Current bar/pie selection per chart, keyed by chartKey — written by
  // ChartCard, read by handleExportPDF so the download matches what's on
  // screen. A ref (not state) since it's write-only until export time.
  const chartTypesRef = useRef({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [drillDown, setDrillDown] = useState(null); // { title, incidents }

  const openDrillDown = useCallback((data) => {
    const sorted = [...data.incidents].sort((a, b) => {
      const aTime =
        a.createdAt?.seconds ?? a.createdAt?.toMillis?.() / 1000 ?? 0;
      const bTime =
        b.createdAt?.seconds ?? b.createdAt?.toMillis?.() / 1000 ?? 0;
      return bTime - aTime;
    });
    setDrillDown({ ...data, incidents: sorted });
  }, []);
  const closeDrillDown = useCallback(() => setDrillDown(null), []);

  const getScroller = () => document.getElementById("client-main-scroll");

  const navigateToReport = (id) => {
    const scroller = getScroller();
    sessionStorage.setItem(
      "clientDashboardDrillDown",
      JSON.stringify(drillDown),
    );
    sessionStorage.setItem(
      "clientDashboardScroll",
      String(scroller ? scroller.scrollTop : 0),
    );
    setDrillDown(null);
    navigate(`${basePath}/reports/incident/${id}`);
  };

  // Set default date range to last 30 days
  const [dateRange, setDateRange] = useState([
    {
      startDate: addDays(new Date(), -30),
      endDate: new Date(),
      key: "selection",
    },
  ]);

  const schemeId = userProfile?.activeSchemeId || userProfile?.schemeId;

  // Convert date range to string format for queries
  const startDate = dateRange[0].startDate.toISOString().split("T")[0];
  const endDate = dateRange[0].endDate.toISOString().split("T")[0];

  // Cached query for the earliest incident date — drives the "All Time"
  // static range below so it starts exactly when this scheme's data does.
  const { data: earliestIncidentDate } = useQuery({
    queryKey: ["earliestIncidentDate", schemeId],
    queryFn: () => clientDataService.getEarliestIncidentDate(schemeId),
    enabled: !!schemeId,
    staleTime: 60 * 60 * 1000, // an hour — this date essentially never changes
  });

  // Adds an "All Time" preset (start of the scheme's data → today) alongside
  // the date picker's built-in presets (Today, This Week, etc.).
  const staticRanges = useMemo(
    () =>
      createStaticRanges([
        ...defaultStaticRanges,
        {
          label: "All Time",
          range: () => ({
            startDate: startOfDay(earliestIncidentDate || new Date("2020-01-01")),
            endDate: endOfDay(new Date()),
          }),
        },
      ]),
    [earliestIncidentDate],
  );

  // Close date picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        datePickerRef.current &&
        !datePickerRef.current.contains(event.target)
      ) {
        setShowDatePicker(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Get the active scheme name for display
  const getActiveSchemeName = () => {
    // If activeSchemeName is set, use it
    if (userProfile?.activeSchemeName) {
      return userProfile.activeSchemeName;
    }

    // If we have an activeSchemeId but no activeSchemeName, look it up
    if (userProfile?.activeSchemeId) {
      const activeSchemeObj = SCHEMES.find(
        (s) => s.id === userProfile.activeSchemeId,
      );
      if (activeSchemeObj) {
        return activeSchemeObj.fullName;
      }
    }

    // Fall back to the default scheme name
    return userProfile?.schemeName;
  };

  const getActiveSchemeId = () => {
    return userProfile?.activeSchemeId || userProfile?.schemeId;
  };

  // Cached query for stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["schemeStats", schemeId, startDate, endDate],
    queryFn: () =>
      clientDataService.getSchemeStatsByDateRange(schemeId, startDate, endDate),
    enabled: !!schemeId && !!startDate && !!endDate,
  });

  // Cached query for time series
  const { data: timeSeriesData = [], isLoading: timeSeriesLoading } = useQuery({
    queryKey: ["timeSeriesData", schemeId, startDate, endDate],
    queryFn: () =>
      clientDataService.getTimeSeriesDataByDateRange(
        schemeId,
        startDate,
        endDate,
      ),
    enabled: !!schemeId && !!startDate && !!endDate,
  });

  // Real-time subscription for live incidents (no polling - only charges when data changes)
  const { liveIncidents, loading: liveIncidentsLoading } =
    useLiveIncidents(schemeId);

  const loading = statsLoading || timeSeriesLoading;

  // Reopen sidebar and restore scroll when coming back from a report view
  useEffect(() => {
    const savedDrillDown = sessionStorage.getItem("clientDashboardDrillDown");
    const savedScroll = sessionStorage.getItem("clientDashboardScroll");
    if (!savedDrillDown) return;
    sessionStorage.removeItem("clientDashboardDrillDown");
    sessionStorage.removeItem("clientDashboardScroll");
    setDrillDown(JSON.parse(savedDrillDown));
    if (savedScroll) {
      const pos = parseInt(savedScroll, 10);
      const scroller = getScroller();
      if (!scroller) return;
      // Keep setting scrollTop on every scroll event until user scrolls manually
      const enforce = () => {
        scroller.scrollTop = pos;
      };
      scroller.addEventListener("scroll", enforce);
      scroller.scrollTop = pos;
      // Stop enforcing after 1s (enough for all re-renders to settle)
      const timer = setTimeout(
        () => scroller.removeEventListener("scroll", enforce),
        1000,
      );
      return () => {
        clearTimeout(timer);
        scroller.removeEventListener("scroll", enforce);
      };
    }
  }, []);

  const incidents = useMemo(() => stats?.incidents || [], [stats]);

  const {
    incidentTypeData,
    vehiclesDispatchedData,
    spottedByData,
    timeToRecoverData,
    timeToSiteData,
    emergencyServicesData,
    vehicleTypeData,
    incursionsData,
  } = useMemo(
    () => ({
      incidentTypeData: transformDataForChart(stats?.incidentsByType),
      vehiclesDispatchedData: transformDataForChart(
        stats?.vehicleTypesDispatched,
      ),
      spottedByData: transformDataForChart(stats?.spottedBy),
      timeToRecoverData: transformDataForChart(stats?.timeToRecover, false),
      timeToSiteData: transformDataForChart(stats?.timeToSite, false),
      emergencyServicesData: transformDataForChart(stats?.emergencyServices),
      vehicleTypeData: transformDataForChart(stats?.vehicleTypes),
      incursionsData: [{ name: "Incursions", Number: stats?.incursions || 0 }],
    }),
    [stats],
  );

  const clearanceCharts = useMemo(
    () =>
      CLEARANCE_CHARTS.map((c) => ({
        ...c,
        data: clearanceRateData(incidents, c.vehicleTypes),
      })),
    [incidents],
  );

  const handleClearanceClick = useCallback(
    (chart, label) => {
      if (!label) return;
      const filtered = incidents.filter(
        (i) =>
          chart.vehicleTypes.includes(i.vehicleAllocated) &&
          clearanceBucket(i) === label,
      );
      if (filtered.length)
        openDrillDown({ title: `${chart.title} – ${label}`, incidents: filtered });
    },
    [incidents, openDrillDown],
  );

  const handleBarClick = useCallback(
    (chartType, label) => {
      if (!label || !incidents.length) return;
      let filtered = [];
      const onSceneFieldByLabel = {
        "Driver on scene": "driverOnScene",
        "Police on scene": "policeOnScene",
        "NH on scene": "nhOnScene",
        "RIPV on scene": "ripvOnScene",
      };

      if (chartType === "incidentType")
        filtered = incidents.filter((i) => incidentClassification(i) === label);
      else if (chartType === "jobSource")
        filtered = incidents.filter((i) => i.jobSource === label);
      else if (chartType === "emergencyServices") {
        const field = onSceneFieldByLabel[label];
        filtered = field ? incidents.filter((i) => i[field]) : [];
      } else if (chartType === "vehicleTypes")
        filtered = incidents.filter((i) => i.vehicleType === label);
      else if (chartType === "vehicleTypesDispatched")
        filtered = incidents.filter((i) => i.vehicleAllocated === label);
      else if (chartType === "timeToRecover") {
        filtered = incidents.filter((i) => {
          const m = parseInt(i.timeOnsiteToCleared?.match(/(\d+)/)?.[1]);
          if (isNaN(m)) return false;
          if (label === "0-15") return m <= 15;
          if (label === "16-30") return m >= 16 && m <= 30;
          if (label === "31-45") return m >= 31 && m <= 45;
          if (label === "46-60") return m >= 46 && m <= 60;
          if (label === "60+") return m > 60;
          return false;
        });
      } else if (chartType === "timeToSite") {
        filtered = incidents.filter((i) => {
          const m = parseInt(i.timeSpottedToOn?.match(/(\d+)/)?.[1]);
          if (isNaN(m)) return false;
          if (label === "0-5") return m <= 5;
          if (label === "6-10") return m >= 6 && m <= 10;
          if (label === "11-15") return m >= 11 && m <= 15;
          if (label === "16-20") return m >= 16 && m <= 20;
          if (label === "20+") return m > 20;
          return false;
        });
      } else if (chartType === "incursions")
        filtered = incidents.filter((i) => incidentClassification(i) === "Incursion");
      if (filtered.length) openDrillDown({ title: label, incidents: filtered });
    },
    [incidents, openDrillDown],
  );

  // Same 5 cards (title + underlying metric) as the staff dashboard's KPI
  // row, scoped here to this client's own scheme and selected date range
  // instead of a fixed week.
  const statsCards = [
    {
      title: "Total Vehicle Dispatched",
      value: loading ? "..." : (stats?.vehiclesDispatched || 0).toString(),
      icon: AlertTriangle,
      filter: () => incidents.filter((i) => i.vehicleAllocated),
    },
    {
      title: "RIPV Recovery",
      value: loading
        ? "..."
        : (Number(stats?.vehicleTypesDispatched?.["RIPV"]) || 0).toString(),
      icon: Truck,
      filter: () => incidents.filter((i) => i.vehicleAllocated === "RIPV"),
    },
    {
      title: "Police On Scene",
      value: loading
        ? "..."
        : (Number(stats?.emergencyServices?.["Police on scene"]) || 0).toString(),
      icon: Truck,
      filter: () => incidents.filter((i) => i.policeOnScene),
    },
    {
      title: "Light Recovery",
      value: loading
        ? "..."
        : (
            Number(stats?.vehicleTypesDispatched?.["Light Recovery"]) || 0
          ).toString(),
      icon: Car,
      filter: () =>
        incidents.filter((i) => i.vehicleAllocated === "Light Recovery"),
    },
    {
      title: "Heavy Recovery",
      value: loading
        ? "..."
        : (
            Number(stats?.vehicleTypesDispatched?.["Heavy Recovery"]) || 0
          ).toString(),
      icon: Truck,
      filter: () =>
        incidents.filter((i) => i.vehicleAllocated === "Heavy Recovery"),
    },
  ];

  // Compact label for the selected date range, shown as the KPI card subtitle
  // in place of a fixed period like the staff dashboard's "This week" — the
  // client dashboard's counts are already scoped by this range.
  const formatShortDate = (d) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const periodLabel = `${formatShortDate(dateRange[0].startDate)} – ${dateRange[0].endDate.toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "short", year: "numeric" },
  )}`;

  // Export dashboard as PDF — layout/drawing lives in utils/pdfChartExport
  // so every "Export Charts" button in the app can share one design.
  // Shared by the PDF and Excel exports so both list the same charts.
  const exportDateRangeText = `${dateRange[0].startDate.toLocaleDateString("en-GB")} - ${dateRange[0].endDate.toLocaleDateString("en-GB")}`;
  const exportSubtitle = `${getActiveSchemeId()} - ${getActiveSchemeName()}`;
  const exportFileBase = `dashboard_${getActiveSchemeId()}_${startDate}_to_${endDate}`;
  const getExportCharts = () => [
    { data: timeToSiteData, title: "Time to Site (mins)", key: "timeToSite" },
    { data: timeToRecoverData, title: "Time to Recover (mins)", key: "timeToRecover" },
    { data: incidentTypeData, title: "Incident Type", key: "incidentType" },
    { data: vehiclesDispatchedData, title: "Vehicle Allocated", key: "vehicleAllocated" },
    { data: spottedByData, title: "Source of Call", key: "spottedBy" },
    { data: emergencyServicesData, title: "Emergency Services Attended", key: "emergencyServices" },
    { data: vehicleTypeData, title: "Vehicle Type", key: "vehicleType" },
    ...clearanceCharts.map(({ data, title, key }) => ({ data, title, key })),
    { data: incursionsData, title: "Incursions", key: "incursions" },
  ];

  const handleExportPDF = async () => {
    setIsExporting(true);
    toast.loading("Generating PDF...", { id: "export-pdf" });

    try {
      const statsText = `Total Incidents: ${stats?.totalIncidents || 0} | Vehicles Dispatched: ${stats?.vehiclesDispatched || 0} | Free Recovery: ${(Number(stats?.incidentsByType?.["Free Recovery"]) || 0)}`;

      await exportChartsToPDF({
        reportTitle: "Dashboard Report",
        subtitle: exportSubtitle,
        dateRangeText: exportDateRangeText,
        statsText,
        charts: getExportCharts(),
        chartTypesRef,
        fileName: `${exportFileBase}.pdf`,
      });

      toast.success("Dashboard exported successfully!", { id: "export-pdf" });
    } catch (error) {
      console.error("Failed to export PDF:", error);
      toast.error("Failed to export dashboard", { id: "export-pdf" });
    } finally {
      setIsExporting(false);
    }
  };

  // Excel version of the export: the client's monthly Recovery Report sheet
  // first, then KPI cards on a Summary sheet and every chart's numbers (plus
  // Incidents Over Time) on a Chart Data sheet.
  const handleExportExcel = async () => {
    setIsExporting(true);
    toast.loading("Generating Excel...", { id: "export-excel" });

    try {
      await exportDashboardToExcel({
        reportTitle: "Dashboard Report",
        subtitle: exportSubtitle,
        dateRangeText: exportDateRangeText,
        kpis: [
          { label: "Total Incidents", value: Number(stats?.totalIncidents) || 0 },
          ...statsCards.map((c) => ({ label: c.title, value: Number(c.value) || 0 })),
          {
            label: "Free Recovery",
            value: Number(stats?.incidentsByType?.["Free Recovery"]) || 0,
          },
        ],
        charts: [
          ...getExportCharts(),
          {
            title: "Incidents Over Time",
            data: timeSeriesData.map((d) => ({ name: d.name, Number: d.count })),
          },
        ],
        recoveryReport: monthlyRecoverySummary(
          incidents,
          dateRange[0].startDate,
          dateRange[0].endDate,
        ),
        fileName: `${exportFileBase}.xlsx`,
      });

      toast.success("Dashboard exported successfully!", { id: "export-excel" });
    } catch (error) {
      console.error("Failed to export Excel:", error);
      toast.error("Failed to export dashboard", { id: "export-excel" });
    } finally {
      setIsExporting(false);
    }
  };

  const isAllTimeRange =
    dateRange[0].startDate.getTime() ===
    startOfDay(earliestIncidentDate || new Date("2020-01-01")).getTime();

  return (
    <div className="max-w-[1600px] mx-auto px-4">
      {/* Header with Date Filter */}
      <div className="mb-6 sm:mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
            Welcome back, {userProfile?.displayName}!
          </h1>
          <p className="text-gray-600 mt-2">
            {getActiveSchemeId()} - {getActiveSchemeName()}
          </p>
        </div>

        {/* Date Range Filter and Export Button */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleExportPDF}
            disabled={isExporting || loading}
            className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-brand-600 hover:shadow-md transition-all disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <Download className="w-5 h-5" />
            <span className="font-medium">Export PDF</span>
          </button>

          <button
            onClick={handleExportExcel}
            disabled={isExporting || loading}
            className="flex items-center gap-2 bg-white text-brand-600 border border-brand-500 px-4 py-2 rounded-lg shadow-sm hover:bg-brand-50 hover:shadow-md transition-all disabled:text-gray-400 disabled:border-gray-300 disabled:bg-white disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="w-5 h-5" />
            <span className="font-medium">Export Excel</span>
          </button>

          <div className="relative" ref={datePickerRef}>
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${
                isAllTimeRange
                  ? "bg-brand-50 border-brand-500"
                  : "bg-white border-gray-200"
              }`}
            >
              <Calendar className="w-5 h-5 text-brand-600" />
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-gray-700">
                  {dateRange[0].startDate.toLocaleDateString("en-GB")}
                </span>
                <span className="text-gray-400">→</span>
                <span className="font-medium text-gray-700">
                  {dateRange[0].endDate.toLocaleDateString("en-GB")}
                </span>
                {isAllTimeRange && (
                  <span className="text-xs font-semibold text-brand-600 bg-brand-100 px-2 py-0.5 rounded-full">
                    All Time
                  </span>
                )}
              </div>
            </button>

            {showDatePicker && (
              <div className="absolute right-0 top-full mt-2 z-50 shadow-xl rounded-lg overflow-hidden border border-gray-200">
                <DateRangePicker
                  ranges={dateRange}
                  onChange={(item) => setDateRange([item.selection])}
                  moveRangeOnFirstSelection={false}
                  months={2}
                  direction="horizontal"
                  showDateDisplay={false}
                  rangeColors={["#0865ad"]}
                  staticRanges={staticRanges}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setDateRange([
                  {
                    startDate: startOfDay(
                      earliestIncidentDate || new Date("2020-01-01"),
                    ),
                    endDate: endOfDay(new Date()),
                    key: "selection",
                  },
                ]);
                setShowDatePicker(false);
              }}
              title="Loads full incident history — auto-updates when new incidents come in, no need to re-click"
              className={`flex items-center gap-3 px-4 py-2 rounded-lg border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${
                isAllTimeRange
                  ? "bg-brand-50 border-brand-500"
                  : "bg-white border-gray-200"
              }`}
            >
              <History className="w-4 h-4 text-brand-600 shrink-0" />
              <span className="text-sm font-medium text-gray-700">
                All Time
              </span>
            </button>

            {isAllTimeRange && (
              <button
                onClick={() => {
                  setDateRange([
                    {
                      startDate: addDays(new Date(), -30),
                      endDate: new Date(),
                      key: "selection",
                    },
                  ]);
                }}
                title="Clear All Time — back to last 30 days"
                className="flex items-center justify-center w-9 h-9 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md hover:text-red-500 hover:border-red-200 text-gray-400 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-6 mb-6">
        {statsCards.map((stat, index) => (
          <div
            key={index}
            role="button"
            tabIndex={0}
            className={`bg-white rounded-xl shadow-lg p-4 sm:p-6 hover:shadow-xl transition-shadow cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500 ${
              index === statsCards.length - 1 && statsCards.length % 2 === 1
                ? "col-span-2 lg:col-span-1"
                : ""
            }`}
            onClick={() => {
              const filtered = stat.filter();
              if (filtered.length)
                openDrillDown({ title: stat.title, incidents: filtered });
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              const filtered = stat.filter();
              if (filtered.length)
                openDrillDown({ title: stat.title, incidents: filtered });
            }}
          >
            <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-brand-500 flex items-center justify-center shrink-0">
                <stat.icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <h6 className="text-xs sm:text-sm font-medium text-gray-600 leading-tight">
                {stat.title}
              </h6>
            </div>
            <div className="mt-2">
              <span className="text-3xl sm:text-4xl font-bold text-gray-800">
                {stat.value}
              </span>
              <p className="text-xs sm:text-sm text-gray-400 mt-1">{periodLabel}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Metric Cards Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="bg-white rounded-xl shadow-lg p-7 hover:shadow-xl transition-shadow">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-brand-500 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <h6 className="text-sm font-medium text-gray-600 leading-tight">
              Avg Time to Site
            </h6>
          </div>
          <div className="mt-2">
            <span className="text-4xl font-bold text-gray-800">
              {loading ? "..." : `${stats?.avgTimeToSite ?? 0} mins`}
            </span>
            <p className="text-sm text-gray-400 mt-1">{periodLabel}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-7 hover:shadow-xl transition-shadow">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-brand-500 flex items-center justify-center shrink-0">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <h6 className="text-sm font-medium text-gray-600 leading-tight">
              Avg Time to Recover
            </h6>
          </div>
          <div className="mt-2">
            <span className="text-4xl font-bold text-gray-800">
              {loading ? "..." : `${stats?.avgTimeToRecover ?? 0} mins`}
            </span>
            <p className="text-sm text-gray-400 mt-1">{periodLabel}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-96">
          <span className="loading loading-spinner loading-lg text-brand-500"></span>
        </div>
      ) : (
        <div ref={dashboardRef}>
          {/* Live Incidents Link Card */}
          <div className="grid grid-cols-1 gap-6 mb-10">
            <div
              onClick={() => navigate(`${basePath}/live-incidents`)}
              className=" bg-white rounded-xl shadow-lg overflow-hidden cursor-pointer hover:shadow-xl transition-shadow"
            >
              <div className=" px-6 py-4 flex items-center gap-3">
                <div className="w-10 h-10rounded-full flex items-center justify-center">
                  <Radio className="w-6 h-6 text-red-500" />
                </div>
                <div className="flex-1">
                  <span className="font-semibold text-xl">Live Incidents</span>
                  <p className=" text-sm">
                    View and monitor live incidents for your scheme
                  </p>
                </div>
                {liveIncidentsLoading ? (
                  <span className="loading loading-spinner loading-sm text-white"></span>
                ) : (
                  <span className="bg-red-500 text-white px-4 py-2 rounded-full text-lg font-bold">
                    {liveIncidents.length} Active
                  </span>
                )}
                <Eye className="w-6 h-6 text-red-500" />
              </div>
            </div>
          </div>

          {/* All Charts in 2 Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <ChartCard
              title="Time to Site (mins)"
              data={timeToSiteData}
              chartKey="timeToSite"
              chartTypesRef={chartTypesRef}
              onSliceClick={(label) => handleBarClick("timeToSite", label)}
            >
              <BarChart
                data={timeToSiteData}
                margin={commonChartProps.chartMargin}
                onClick={(d) =>
                  d?.activeLabel && handleBarClick("timeToSite", d.activeLabel)
                }
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid {...commonChartProps.cartesianGrid} />
                <XAxis dataKey="name" {...commonChartProps.xAxis} />
                <YAxis {...commonChartProps.yAxis} />
                <Tooltip {...commonChartProps.tooltip} />
                <Legend {...commonChartProps.legend} />
                <Bar dataKey="Number" {...commonChartProps.bar} />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Time to recover (mins)"
              data={timeToRecoverData}
              chartKey="timeToRecover"
              chartTypesRef={chartTypesRef}
              onSliceClick={(label) => handleBarClick("timeToRecover", label)}
            >
              <BarChart
                data={timeToRecoverData}
                margin={commonChartProps.chartMargin}
                onClick={(d) =>
                  d?.activeLabel &&
                  handleBarClick("timeToRecover", d.activeLabel)
                }
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid {...commonChartProps.cartesianGrid} />
                <XAxis dataKey="name" {...commonChartProps.xAxis} />
                <YAxis {...commonChartProps.yAxis} />
                <Tooltip {...commonChartProps.tooltip} />
                <Legend {...commonChartProps.legend} />
                <Bar dataKey="Number" {...commonChartProps.bar} />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Incident Type"
              data={incidentTypeData}
              chartKey="incidentType"
              chartTypesRef={chartTypesRef}
              onSliceClick={(label) => handleBarClick("incidentType", label)}
            >
              <BarChart
                data={incidentTypeData}
                margin={commonChartProps.chartMargin}
                onClick={(d) =>
                  d?.activeLabel &&
                  handleBarClick("incidentType", d.activeLabel)
                }
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid {...commonChartProps.cartesianGrid} />
                <XAxis dataKey="name" {...commonChartProps.xAxis} />
                <YAxis {...commonChartProps.yAxis} />
                <Tooltip {...commonChartProps.tooltip} />
                <Legend {...commonChartProps.legend} />
                <Bar dataKey="Number" {...commonChartProps.bar} />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Vehicle Allocated"
              data={vehiclesDispatchedData}
              chartKey="vehicleAllocated"
              chartTypesRef={chartTypesRef}
              onSliceClick={(label) => handleBarClick("vehicleTypesDispatched", label)}
            >
              <BarChart
                data={vehiclesDispatchedData}
                margin={commonChartProps.chartMargin}
                onClick={(d) =>
                  d?.activeLabel &&
                  handleBarClick("vehicleTypesDispatched", d.activeLabel)
                }
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid {...commonChartProps.cartesianGrid} />
                <XAxis dataKey="name" {...commonChartProps.xAxis} />
                <YAxis {...commonChartProps.yAxis} />
                <Tooltip {...commonChartProps.tooltip} />
                <Legend {...commonChartProps.legend} />
                <Bar dataKey="Number" {...commonChartProps.bar} />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Source of Call"
              data={spottedByData}
              chartKey="spottedBy"
              chartTypesRef={chartTypesRef}
              onSliceClick={(label) => handleBarClick("jobSource", label)}
            >
              <BarChart
                data={spottedByData}
                margin={commonChartProps.chartMargin}
                onClick={(d) =>
                  d?.activeLabel && handleBarClick("jobSource", d.activeLabel)
                }
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid {...commonChartProps.cartesianGrid} />
                <XAxis dataKey="name" {...commonChartProps.xAxis} />
                <YAxis {...commonChartProps.yAxis} />
                <Tooltip {...commonChartProps.tooltip} />
                <Legend {...commonChartProps.legend} />
                <Bar dataKey="Number" {...commonChartProps.bar} />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Emergency Services Attended"
              data={emergencyServicesData}
              chartKey="emergencyServices"
              chartTypesRef={chartTypesRef}
              onSliceClick={(label) => handleBarClick("emergencyServices", label)}
            >
              <BarChart
                data={emergencyServicesData}
                margin={commonChartProps.chartMargin}
                onClick={(d) =>
                  d?.activeLabel &&
                  handleBarClick("emergencyServices", d.activeLabel)
                }
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid {...commonChartProps.cartesianGrid} />
                <XAxis dataKey="name" {...commonChartProps.xAxis} />
                <YAxis {...commonChartProps.yAxis} />
                <Tooltip {...commonChartProps.tooltip} />
                <Legend {...commonChartProps.legend} />
                <Bar dataKey="Number" {...commonChartProps.bar} />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Vehicle Type"
              data={vehicleTypeData}
              chartKey="vehicleType"
              chartTypesRef={chartTypesRef}
              onSliceClick={(label) => handleBarClick("vehicleTypes", label)}
            >
              <BarChart
                data={vehicleTypeData}
                margin={commonChartProps.chartMargin}
                onClick={(d) =>
                  d?.activeLabel &&
                  handleBarClick("vehicleTypes", d.activeLabel)
                }
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid {...commonChartProps.cartesianGrid} />
                <XAxis dataKey="name" {...commonChartProps.xAxis} />
                <YAxis {...commonChartProps.yAxis} />
                <Tooltip {...commonChartProps.tooltip} />
                <Legend {...commonChartProps.legend} />
                <Bar dataKey="Number" {...commonChartProps.bar} />
              </BarChart>
            </ChartCard>

            {clearanceCharts.map((chart) => (
              <ChartCard
                key={chart.key}
                title={chart.title}
                data={chart.data}
                chartKey={chart.key}
                chartTypesRef={chartTypesRef}
                tooltipFormatter={clearanceTooltipFormatter}
                onSliceClick={(label) => handleClearanceClick(chart, label)}
              >
                <BarChart
                  data={chart.data}
                  margin={commonChartProps.chartMargin}
                  onClick={(d) =>
                    d?.activeLabel && handleClearanceClick(chart, d.activeLabel)
                  }
                  style={{ cursor: "pointer" }}
                >
                  <CartesianGrid {...commonChartProps.cartesianGrid} />
                  <XAxis dataKey="name" {...commonChartProps.xAxis} />
                  <YAxis {...commonChartProps.yAxis} />
                  <Tooltip
                    {...commonChartProps.tooltip}
                    formatter={clearanceTooltipFormatter}
                  />
                  <Legend {...commonChartProps.legend} />
                  <Bar dataKey="Number" {...commonChartProps.bar} />
                </BarChart>
              </ChartCard>
            ))}

            {/* <ChartCard title="Incursions">
              <BarChart
                data={incursionsData}
                onClick={(d) =>
                  d?.activeLabel && handleBarClick("incursions", d.activeLabel)
                }
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid {...commonChartProps.cartesianGrid} />
                <XAxis dataKey="name" tick={{ fontSize: 13 }} />
                <YAxis {...commonChartProps.yAxis} />
                <Tooltip {...commonChartProps.tooltip} />
                <Legend {...commonChartProps.legend} />
                <Bar dataKey="Number" {...commonChartProps.bar} />
              </BarChart>
            </ChartCard> */}
          </div>

          {/* Full Width: Incidents Over Time */}
          <div className="">
            <ChartCard title="Incidents Over Time" fullWidth height={350}>
              <BarChart
                data={
                  timeSeriesData.length > 0
                    ? timeSeriesData.map((d) => ({ ...d, Number: d.count }))
                    : [{ name: "No Data", Number: 0 }]
                }
                margin={commonChartProps.chartMargin}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#0865ad" />
                <XAxis dataKey="name" tick={{ fontSize: 13 }} />
                <YAxis tick={{ fontSize: 13 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #0865ad",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ fontWeight: "bold" }}
                />
                <Legend wrapperStyle={{ paddingTop: "20px" }} />
                <Bar dataKey="Number" fill="#0865ad" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ChartCard>
          </div>
        </div>
      )}

      {/* Drill-down sidebar — rendered in a portal so it never affects page scroll */}
      <DrillDownSidebar
        drillDown={drillDown}
        onClose={closeDrillDown}
        onNavigate={navigateToReport}
      />
    </div>
  );
};

export default NewClientDashboard;
