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
  Radio,
  Eye,
  Wrench,
  Truck,
  Car,
  Clock,
} from "lucide-react";
import { SCHEMES } from "../../utils/schemes";
import DrillDownSidebar from "./DrillDownSidebar";
import { DateRangePicker } from "react-date-range";
import "react-date-range/dist/styles.css"; // main css file
import "react-date-range/dist/theme/default.css"; // theme css file
import { addDays } from "date-fns";
import { jsPDF } from "jspdf";
import toast from "react-hot-toast";

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

const ChartCard = memo(
  ({ title, children, fullWidth = false, height = 380 }) => (
    <div
      className={`bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow ${fullWidth ? "col-span-full" : ""}`}
      onMouseDown={(e) => e.preventDefault()}
    >
      <h5 className="text-xl font-bold text-gray-800 mb-6 border-b pb-3">
        {title}
      </h5>
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </div>
  ),
);

// The confirmed fault classification for an incident — set once the job's
// fully inspected (Step 3's Fault). Mirrors clientDataService.incidentClassification.
const incidentClassification = (i) => i.actualFault || "";

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

  // Helper function to draw a bar chart in PDF
  const drawBarChart = (pdf, data, title, x, y, width, height) => {
    if (!data || data.length === 0) return;

    // Draw chart background
    pdf.setFillColor(255, 255, 255);
    pdf.rect(x, y, width, height, "F");
    pdf.setDrawColor(229, 231, 235);
    pdf.rect(x, y, width, height, "S");

    // Draw title at the top with better positioning
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(31, 41, 55);
    pdf.text(title, x + width / 2, y + 6, { align: "center" });

    // Adjusted margins - less bottom margin since labels are closer
    const margin = { top: 12, right: 10, bottom: 18, left: 10 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Calculate max value - ensure it's at least 1 to avoid division by zero
    const maxValue = Math.max(...data.map((d) => d.Number), 1);
    const barWidth = (chartWidth / data.length) * 0.7;
    const gap = (chartWidth / data.length) * 0.3;

    // Draw bars
    data.forEach((item, index) => {
      const barHeight = (item.Number / maxValue) * chartHeight;
      const barX = x + margin.left + index * (barWidth + gap);
      const barY = y + margin.top + chartHeight - barHeight;

      // Only draw bar if height is valid and greater than 0
      if (
        barHeight > 0 &&
        !isNaN(barHeight) &&
        !isNaN(barX) &&
        !isNaN(barY) &&
        barWidth > 0
      ) {
        // Draw bar - use regular rect if height is too small for rounded corners
        pdf.setFillColor(23, 175, 147); // brand color
        if (barHeight >= 4) {
          pdf.roundedRect(barX, barY, barWidth, barHeight, 2, 2, "F");
        } else {
          pdf.rect(barX, barY, barWidth, barHeight, "F");
        }
      }

      // Draw value on top of bar
      pdf.setFontSize(8);
      pdf.setTextColor(31, 41, 55);
      const valueY =
        barHeight > 0 ? barY - 2 : y + margin.top + chartHeight - 2;
      pdf.text(String(item.Number), barX + barWidth / 2, valueY, {
        align: "center",
      });

      // Draw label below bar - much closer now
      pdf.setFontSize(7);
      pdf.setTextColor(107, 114, 128);
      const label =
        item.name.length > 12 ? item.name.substring(0, 12) + "..." : item.name;
      const labelY = y + margin.top + chartHeight + 5; // Just 5mm below the chart area
      pdf.text(label, barX + barWidth / 2, labelY, {
        align: "center",
        maxWidth: barWidth,
      });
    });
  };

  // Export dashboard as PDF
  const handleExportPDF = async () => {
    setIsExporting(true);
    toast.loading("Generating PDF...", { id: "export-pdf" });

    try {
      // Create PDF in landscape orientation with compression enabled
      const pdf = new jsPDF({
        orientation: "l",
        unit: "mm",
        format: "a4",
        compress: true,
      });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      // Add header to the PDF
      const headerHeight = 25;
      pdf.setFillColor(23, 175, 147); // brand color
      pdf.rect(0, 0, pdfWidth, headerHeight, "F");

      // Header text - left side
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(18);
      pdf.setFont("helvetica", "bold");
      pdf.text("Dashboard Report", 15, 12);

      pdf.setFontSize(11);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${getActiveSchemeId()} - ${getActiveSchemeName()}`, 15, 19);

      // Date range and stats - right side
      const dateRangeText = `${dateRange[0].startDate.toLocaleDateString("en-GB")} - ${dateRange[0].endDate.toLocaleDateString("en-GB")}`;
      pdf.text(dateRangeText, pdfWidth - 15, 12, { align: "right" });

      const statsText = `Total Incidents: ${stats?.totalIncidents || 0} | Vehicles Dispatched: ${stats?.vehiclesDispatched || 0} | Free Recovery: ${(Number(stats?.incidentsByType?.["Free Recovery"]) || 0)}`;
      pdf.text(statsText, pdfWidth - 15, 19, { align: "right" });

      // Content area
      const contentStartY = headerHeight + 10;
      const chartWidth = (pdfWidth - 30) / 2; // 2 columns with margins
      const chartHeight = 60;
      const chartGap = 10;

      let currentY = contentStartY;
      let currentX = 15;
      let chartCount = 0;

      // Helper to add new page if needed
      const checkNewPage = () => {
        if (currentY + chartHeight > pdfHeight - 10) {
          pdf.addPage();

          // Add header to new page
          pdf.setFillColor(23, 175, 147);
          pdf.rect(0, 0, pdfWidth, headerHeight, "F");
          pdf.setTextColor(255, 255, 255);
          pdf.setFontSize(18);
          pdf.setFont("helvetica", "bold");
          pdf.text("Dashboard Report", 15, 12);
          pdf.setFontSize(11);
          pdf.setFont("helvetica", "normal");
          pdf.text(`${getActiveSchemeId()} - ${getActiveSchemeName()}`, 15, 19);
          pdf.text(dateRangeText, pdfWidth - 15, 12, { align: "right" });
          pdf.text(statsText, pdfWidth - 15, 19, { align: "right" });

          currentY = contentStartY;
          currentX = 15;
          chartCount = 0;
        }
      };

      // Draw all charts in 2-column layout
      const charts = [
        { data: timeToSiteData, title: "Time to Site (mins)" },
        { data: timeToRecoverData, title: "Time to Recover (mins)" },
        { data: incidentTypeData, title: "Incident Type" },
        { data: vehiclesDispatchedData, title: "Vehicle Allocated" },
        { data: spottedByData, title: "Source of Call" },
        { data: emergencyServicesData, title: "Emergency Services Attended" },
        { data: vehicleTypeData, title: "Vehicle Type" },
        { data: incursionsData, title: "Incursions" },
      ];

      charts.forEach((chart) => {
        if (chart.data && chart.data.length > 0) {
          checkNewPage();

          drawBarChart(
            pdf,
            chart.data,
            chart.title,
            currentX,
            currentY,
            chartWidth - 5,
            chartHeight,
          );

          chartCount++;
          if (chartCount % 2 === 0) {
            // Move to next row
            currentY += chartHeight + chartGap;
            currentX = 15;
          } else {
            // Move to next column
            currentX = 15 + chartWidth + 5;
          }
        }
      });

      // Save the PDF
      const fileName = `dashboard_${getActiveSchemeId()}_${startDate}_to_${endDate}.pdf`;
      pdf.save(fileName);

      toast.success("Dashboard exported successfully!", { id: "export-pdf" });
    } catch (error) {
      console.error("Failed to export PDF:", error);
      toast.error("Failed to export dashboard", { id: "export-pdf" });
    } finally {
      setIsExporting(false);
    }
  };

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
            <span className="font-medium">Export Charts</span>
          </button>

          <div className="relative" ref={datePickerRef}>
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="flex items-center gap-3 bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
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
                  rangeColors={["#17af93"]}
                />
              </div>
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
            <ChartCard title="Time to Site (mins)">
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

            <ChartCard title="Time to recover (mins)">
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

            <ChartCard title="Incident Type">
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

            <ChartCard title="Vehicle Allocated">
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

            <ChartCard title="Source of Call">
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

            <ChartCard title="Emergency Services Attended">
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

            <ChartCard title="Vehicle Type">
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
