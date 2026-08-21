import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { staffService } from "../../services/staffService";
import AdminSidebarLayout from "../../components/layout/AdminSidebarLayout";
import DrillDownSidebar from "../../components/dashboard/DrillDownSidebar";
import { SCHEMES, getInternalSchemeIds } from "../../utils/schemes";
import { defectCountsFromAggregates } from "../../utils/vehicleCheckStats";
import {
  AlertTriangle,
  Calendar,
  Download,
  Filter,
  Truck,
  Car,
} from "lucide-react";
import { toast } from "react-hot-toast";
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
import { jsPDF } from 'jspdf';
import { DateRangePicker, defaultStaticRanges } from 'react-date-range';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { addDays } from 'date-fns';

// Static ranges (Today/This Week/etc.) hidden entirely on mobile so the
// picker stays short enough to avoid scrolling into view.
const MOBILE_STATIC_RANGES = [];

// Chart Card Component
const ChartCard = ({ title, children, fullWidth = false, height = 380 }) => (
  <div
    className={`bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow ${fullWidth ? 'col-span-full' : ''}`}
    onMouseDown={(e) => e.preventDefault()}
  >
    <h4 className="text-xl font-bold text-gray-800 mb-6 border-b pb-3">{title}</h4>
    <ResponsiveContainer width="100%" height={height}>
      {children}
    </ResponsiveContainer>
  </div>
);

const ClientChartsPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [selectedScheme, setSelectedScheme] = useState("");
  const [reports, setReports] = useState([]);
  const [schemes, setSchemes] = useState([]);
  const [isExporting, setIsExporting] = useState(false);
  const [formCounts, setFormCounts] = useState({ incidentReportTotal: 0, cabinSafetyTotal: 0, vehicleCheckTotal: 0 });
  const [vehicleCheckDefects, setVehicleCheckDefects] = useState([]);
  const datePickerRef = useRef(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [drillDown, setDrillDown] = useState(null); // { title, incidents }

  const openDrillDown = (data) => {
    if (!data.incidents.length) return;
    const toMillis = (createdAt) => {
      if (!createdAt) return 0;
      if (typeof createdAt.toDate === "function") return createdAt.toDate().getTime();
      return new Date(createdAt).getTime();
    };
    const sorted = [...data.incidents].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    setDrillDown({ ...data, incidents: sorted });
  };
  const closeDrillDown = () => setDrillDown(null);
  const navigateToReport = (id) => {
    setDrillDown(null);
    navigate(`/dashboard/admin/staff-reports/incident/${id}`);
  };

  // Drives DateRangePicker's month count/direction — its own props don't
  // respond to CSS breakpoints, so we track viewport width in JS instead.
  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 639px)');
    setIsMobile(mediaQuery.matches);
    const handleChange = (e) => setIsMobile(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Set default date range to last 30 days
  const [dateRange, setDateRange] = useState([
    {
      startDate: addDays(new Date(), -30),
      endDate: new Date(),
      key: 'selection'
    }
  ]);

  //bar chart color
  const COLORS = {
    brand: "#0865ad",
  };

  // Common chart props
  const commonChartProps = {
    //background grid lines of the charts
    cartesianGrid: { strokeDasharray: "4 5", stroke: COLORS.brand },
    //font size of the x and y axis labels
    xAxis: { tick: { fontSize: 12 } },
    yAxis: { tick: { fontSize: 12 } },
    tooltip: {
      contentStyle: { backgroundColor: '#fff', border: '1px solid #0865ad', borderRadius: '8px' },
      labelStyle: { fontWeight: 'bold' }
    },
    legend: { wrapperStyle: { paddingTop: '0px' } },
    bar: { fill: COLORS.brand, radius: [8, 8, 0, 0] },
    chartMargin: { top: 10, right: 20, left: -35, bottom: 10 }
  };

  useEffect(() => {
    // Scheme dropdown = the set of active schemes (stable, independent of the
    // selected date range, so changing the range never disturbs the selection).
    const activeSchemeNames = SCHEMES.map((s) => s.fullName).sort();
    setSchemes(activeSchemeNames);
    if (activeSchemeNames.length > 0) setSelectedScheme(activeSchemeNames.find(name => name.startsWith('M3')) || activeSchemeNames[0]);
    loadFormCounts();
  }, []);

  useEffect(() => {
    // Independent of the paginated incident-report data above — the chart
    // needs defect counts across every vehicle check. Aggregated server-side
    // (RPC) instead of fetching every row, so this stays cheap as the table
    // grows. Not scheme-scoped (the RPC has no scheme filter yet).
    staffService.getVehicleCheckDefectCounts().then((rows) => {
      setVehicleCheckDefects(defectCountsFromAggregates(rows));
    });
  }, []);

  // Refetch incidents whenever the date range changes — scoped server-side so
  // we read only the selected window instead of the whole collection.
  useEffect(() => {
    loadAllData(dateRange[0].startDate, dateRange[0].endDate);
  }, [dateRange]);

  // Close date picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target)) {
        setShowDatePicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadAllData = async (startDate, endDate) => {
    try {
      setLoading(true);
      // Only load incident reports - all 12 charts are incident-based.
      // Scoped to the selected date window so we don't read the whole collection.
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // include the entire end day
      const incidentReports = await staffService.getIncidentReports(null, null, {
        startDate,
        endDate: end,
      });
      const reportsWithType = incidentReports.map((f) => ({ ...f, type: "Recovery Job Sheet" }));
      setReports(reportsWithType);
    } catch (error) {
      console.error("Failed to load data:", error);
      toast.error("Failed to load chart data");
    } finally {
      setLoading(false);
    }
  };

  const loadFormCounts = async () => {
    try {
      // Cards count internal schemes only — excludes demo data.
      const counts = await staffService.getAllFormsCountByType(getInternalSchemeIds());
      setFormCounts(counts);
    } catch (error) {
      console.warn('Could not load form counts:', error);
    }
  };

  // Convert date range to timestamps for filtering
  const startDate = dateRange[0].startDate;
  const endDate = new Date(dateRange[0].endDate);
  endDate.setHours(23, 59, 59, 999); // Include the entire end date

  // Compact label for the selected range, shown as the stat cards' subtitle
  const formatShortDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const periodLabel = `${formatShortDate(startDate)} – ${endDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  // Filter reports by selected scheme and date range
  const getFilteredReports = () => {
    let filtered = reports;

    // Filter by scheme
    if (selectedScheme) {
      filtered = filtered.filter((r) => r.scheme === selectedScheme);
    }

    // Filter by date range
    filtered = filtered.filter((r) => {
      if (!r.createdAt) return false;
      const reportDate = r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
      return reportDate >= startDate && reportDate <= endDate;
    });

    return filtered;
  };

  // Get incident reports only
  const getIncidentReports = () => {
    return getFilteredReports().filter(r => r.type === "Recovery Job Sheet");
  };

  // Chart data extraction functions
  const getIncidentTypeData = () => {
    const incidents = getIncidentReports();
    const typeCounts = {};
    incidents.forEach(report => {
      // Confirmed classification, set once the job's fully inspected (Step
      // 3's Fault) — mirrors clientDataService.incidentClassification.
      const type = report.actualFault;
      if (type) {
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      }
    });
    return Object.entries(typeCounts).map(([name, Number]) => ({ name, Number }));
  };

  const getVehiclesDispatchedData = () => {
    const incidents = getIncidentReports();
    const dispatchCounts = {};
    incidents.forEach(report => {
      if (report.vehicleAllocated) {
        dispatchCounts[report.vehicleAllocated] = (dispatchCounts[report.vehicleAllocated] || 0) + 1;
      }
    });
    return Object.entries(dispatchCounts).map(([name, Number]) => ({ name, Number }));
  };

  const getSpottedByData = () => {
    const incidents = getIncidentReports();
    const spottedCounts = {};
    incidents.forEach(report => {
      if (report.jobSource) {
        spottedCounts[report.jobSource] = (spottedCounts[report.jobSource] || 0) + 1;
      }
    });
    return Object.entries(spottedCounts).map(([name, Number]) => ({ name, Number }));
  };

  const getTimeToRecoverData = () => {
    const incidents = getIncidentReports();
    const timeBuckets = { '0-15': 0, '16-30': 0, '31-45': 0, '46-60': 0, '60+': 0 };
    incidents.forEach(report => {
      if (report.timeOnsiteToCleared) {
        const match = report.timeOnsiteToCleared.match(/(\d+)/);
        if (match) {
          const mins = parseInt(match[1]);
          if (mins <= 15) timeBuckets['0-15']++;
          else if (mins <= 30) timeBuckets['16-30']++;
          else if (mins <= 45) timeBuckets['31-45']++;
          else if (mins <= 60) timeBuckets['46-60']++;
          else timeBuckets['60+']++;
        }
      }
    });
    return Object.entries(timeBuckets).map(([name, Number]) => ({ name, Number }));
  };

  const getEmergencyServicesData = () => {
    const incidents = getIncidentReports();
    // Attendance is stored as separate on-scene booleans, not an array field.
    const serviceCounts = {
      'Driver on scene': 0,
      'Police on scene': 0,
      'NH on scene': 0,
      'RIPV on scene': 0,
    };
    incidents.forEach(report => {
      if (report.driverOnScene) serviceCounts['Driver on scene']++;
      if (report.policeOnScene) serviceCounts['Police on scene']++;
      if (report.nhOnScene) serviceCounts['NH on scene']++;
      if (report.ripvOnScene) serviceCounts['RIPV on scene']++;
    });
    return Object.entries(serviceCounts).map(([name, Number]) => ({ name, Number }));
  };

  const getTimeToSiteData = () => {
    const incidents = getIncidentReports();
    const timeBuckets = { '0-5': 0, '6-10': 0, '11-15': 0, '16-20': 0, '20+': 0 };
    incidents.forEach(report => {
      if (report.timeSpottedToOn) {
        const match = report.timeSpottedToOn.match(/(\d+)/);
        if (match) {
          const mins = parseInt(match[1]);
          if (mins <= 5) timeBuckets['0-5']++;
          else if (mins <= 10) timeBuckets['6-10']++;
          else if (mins <= 15) timeBuckets['11-15']++;
          else if (mins <= 20) timeBuckets['16-20']++;
          else timeBuckets['20+']++;
        }
      }
    });
    return Object.entries(timeBuckets).map(([name, Number]) => ({ name, Number }));
  };

  const getVehicleTypeData = () => {
    const incidents = getIncidentReports();
    const vehicleCounts = {};
    incidents.forEach(report => {
      if (report.vehicleType) {
        vehicleCounts[report.vehicleType] = (vehicleCounts[report.vehicleType] || 0) + 1;
      }
    });
    return Object.entries(vehicleCounts).map(([name, Number]) => ({ name, Number }));
  };

  const getTimeSeriesData = () => {
    const incidents = getIncidentReports();
    const monthlyCounts = {};
    incidents.forEach(report => {
      if (report.createdAt) {
        const date = report.createdAt.toDate ? report.createdAt.toDate() : new Date(report.createdAt);
        const monthKey = `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`;
        monthlyCounts[monthKey] = (monthlyCounts[monthKey] || 0) + 1;
      }
    });
    return Object.entries(monthlyCounts).map(([name, count]) => ({ name, count, Number: count }));
  };

  // Clicking a bar drills into the underlying incidents behind that label —
  // each branch mirrors the same grouping logic as its get*Data function above.
  const handleBarClick = (chartType, label) => {
    if (!label) return;
    const incidents = getIncidentReports();
    const onSceneFieldByLabel = {
      'Driver on scene': 'driverOnScene',
      'Police on scene': 'policeOnScene',
      'NH on scene': 'nhOnScene',
      'RIPV on scene': 'ripvOnScene',
    };
    let filtered = [];

    if (chartType === 'incidentType') filtered = incidents.filter((r) => r.actualFault === label);
    else if (chartType === 'vehiclesDispatched') filtered = incidents.filter((r) => r.vehicleAllocated === label);
    else if (chartType === 'spottedBy') filtered = incidents.filter((r) => r.jobSource === label);
    else if (chartType === 'emergencyServices') {
      const field = onSceneFieldByLabel[label];
      filtered = field ? incidents.filter((r) => r[field]) : [];
    } else if (chartType === 'vehicleType') filtered = incidents.filter((r) => r.vehicleType === label);
    else if (chartType === 'timeToSite') {
      filtered = incidents.filter((r) => {
        const m = parseInt(r.timeSpottedToOn?.match(/(\d+)/)?.[1]);
        if (isNaN(m)) return false;
        if (label === '0-5') return m <= 5;
        if (label === '6-10') return m >= 6 && m <= 10;
        if (label === '11-15') return m >= 11 && m <= 15;
        if (label === '16-20') return m >= 16 && m <= 20;
        if (label === '20+') return m > 20;
        return false;
      });
    } else if (chartType === 'timeToRecover') {
      filtered = incidents.filter((r) => {
        const m = parseInt(r.timeOnsiteToCleared?.match(/(\d+)/)?.[1]);
        if (isNaN(m)) return false;
        if (label === '0-15') return m <= 15;
        if (label === '16-30') return m >= 16 && m <= 30;
        if (label === '31-45') return m >= 31 && m <= 45;
        if (label === '46-60') return m >= 46 && m <= 60;
        if (label === '60+') return m > 60;
        return false;
      });
    } else if (chartType === 'timeSeries') {
      filtered = incidents.filter((r) => {
        if (!r.createdAt) return false;
        const date = r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
        return `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}` === label;
      });
    }

    if (filtered.length) openDrillDown({ title: label, incidents: filtered });
  };

  // Helper function to draw a bar chart in PDF
  const drawBarChart = (pdf, data, title, x, y, width, height) => {
    if (!data || data.length === 0) return;

    // Draw chart background
    pdf.setFillColor(255, 255, 255);
    pdf.rect(x, y, width, height, 'F');
    pdf.setDrawColor(229, 231, 235);
    pdf.rect(x, y, width, height, 'S');

    // Draw title at the top with better positioning
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(31, 41, 55);
    pdf.text(title, x + width / 2, y + 6, { align: 'center' });

    // Adjusted margins - less bottom margin since labels are closer
    const margin = { top: 12, right: 10, bottom: 18, left: 10 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const plotLeft = x + margin.left;
    const plotTop = y + margin.top;
    const plotBottom = plotTop + chartHeight;

    // Calculate max value
    // Floor of 1 avoids a divide-by-zero (-> NaN -> jsPDF throws) when every
    // bucket in this chart is 0, e.g. no incidents matched in the date range.
    const maxValue = Math.max(...data.map(d => d.Number), 1);
    // Bars are centered within their slot (rather than packed from the left
    // edge) so there's breathing room before the first bar/axis line and
    // after the last, not just between bars.
    const slotWidth = chartWidth / data.length;
    const barWidth = slotWidth * 0.4;
    const barCornerRadius = 1; // mm — jsPDF's roundedRect takes rx/ry in the doc's own unit

    // Cartesian grid: horizontal gridlines + y-axis tick labels, mirroring
    // the on-screen <CartesianGrid>/<YAxis>.
    const tickCount = 4;
    pdf.setLineDashPattern([1, 1], 0);
    pdf.setDrawColor(229, 231, 235);
    for (let i = 0; i <= tickCount; i++) {
      const tickValue = Math.round((maxValue / tickCount) * i);
      const tickY = plotBottom - (tickValue / maxValue) * chartHeight;
      pdf.line(plotLeft, tickY, plotLeft + chartWidth, tickY);
      pdf.setFontSize(6);
      pdf.setTextColor(107, 114, 128);
      pdf.text(String(tickValue), plotLeft - 2, tickY, { align: 'right', baseline: 'middle' });
    }
    pdf.setLineDashPattern([], 0);

    // Draw bars
    data.forEach((item, index) => {
      const barHeight = (item.Number / maxValue) * chartHeight;
      const barX = plotLeft + index * slotWidth + (slotWidth - barWidth) / 2;
      const barY = plotBottom - barHeight;

      // Draw bar
      pdf.setFillColor(COLORS.brand); // Teal color
      pdf.roundedRect(barX, barY, barWidth, barHeight, barCornerRadius, barCornerRadius, 'F');

      // Draw value on top of bar
      pdf.setFontSize(8);
      pdf.setTextColor(31, 41, 55);
      pdf.text(String(item.Number), barX + barWidth / 2, barY - 2, { align: 'center' });

      // Draw label below bar - much closer now
      pdf.setFontSize(7);
      pdf.setTextColor(107, 114, 128);
      const label = item.name.length > 12 ? item.name.substring(0, 12) + '...' : item.name;
      const labelY = plotBottom + 10; // Just 10mm below the chart area
      pdf.text(label, barX + barWidth / 2, labelY, { align: 'center', maxWidth: barWidth });
    });

    // X/Y axis lines, drawn last so they sit crisp on top of the grid and bars.
    pdf.setDrawColor(107, 114, 122);
    pdf.line(plotLeft, plotTop, plotLeft, plotBottom); // y-axis
    pdf.line(plotLeft, plotBottom, plotLeft + chartWidth, plotBottom); // x-axis
  };

  // Export dashboard as PDF
  const handleExportPDF = async () => {
    setIsExporting(true);
    toast.loading('Generating PDF...', { id: 'export-pdf' });

    try {
      // Create PDF in landscape orientation with compression enabled
      const pdf = new jsPDF({
        orientation: 'l',
        unit: 'mm',
        format: 'a4',
        compress: true
      });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      // Add header to the PDF
      const headerHeight = 25;
      pdf.setFillColor(COLORS.brand); // Brand color
      pdf.rect(0, 0, pdfWidth, headerHeight, 'F');

      // Header text - left side
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Reports & Analytics', 15, 12);

      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Scheme: ${selectedScheme}`, 15, 19);

      // Stats - right side
      const statsText = `Total Incidents: ${stats.incident} | Total Reports: ${stats.total}`;
      pdf.text(statsText, pdfWidth - 15, 15, { align: 'right' });

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
          pdf.setFillColor(COLORS.brand);
          pdf.rect(0, 0, pdfWidth, headerHeight, 'F');
          pdf.setTextColor(255, 255, 255);
          pdf.setFontSize(18);
          pdf.setFont('helvetica', 'bold');
          pdf.text('Reports & Analytics', 15, 12);
          pdf.setFontSize(11);
          pdf.setFont('helvetica', 'normal');
          pdf.text(`Scheme: ${selectedScheme}`, 15, 19);
          pdf.text(statsText, pdfWidth - 15, 15, { align: 'right' });

          currentY = contentStartY;
          currentX = 15;
          chartCount = 0;
        }
      };

      // Draw all charts in 2-column layout
      const charts = [
        { data: timeToSiteData, title: 'Time to Site (mins)' },
        { data: timeToRecoverData, title: 'Time to Recover (mins)' },
        { data: incidentTypeData, title: 'Incident Type' },
        { data: vehiclesDispatchedData, title: 'Vehicle Allocated' },
        { data: spottedByData, title: 'Source of Call' },
        { data: emergencyServicesData, title: 'Emergency Services Attended' },
        { data: vehicleTypeData, title: 'Vehicle Type' },
      ];

      charts.forEach((chart) => {
        if (chart.data && chart.data.length > 0) {
          checkNewPage();

          drawBarChart(pdf, chart.data, chart.title, currentX, currentY, chartWidth - 5, chartHeight);

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
      const fileName = `client_charts_${selectedScheme.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);

      toast.success('Charts exported successfully!', { id: 'export-pdf' });
    } catch (error) {
      console.error('Failed to export PDF:', error);
      toast.error('Failed to export charts', { id: 'export-pdf' });
    } finally {
      setIsExporting(false);
    }
  };

  // Statistics - use aggregation counts for cards (consistent with other pages)
  const stats = {
    total:
      formCounts.incidentReportTotal +
      formCounts.cabinSafetyTotal +
      formCounts.vehicleCheckTotal,
    incident: formCounts.incidentReportTotal,
    cabinSafety: formCounts.cabinSafetyTotal,
    vehicleCheck: formCounts.vehicleCheckTotal,
  };

  // Stat cards — same metrics as the client dashboard's KPI row (minus
  // Police On Scene), scoped to this scheme + selected date range.
  const dispatchedIncidents = getIncidentReports().filter((r) => r.vehicleAllocated);
  const vehicleCards = [
    {
      title: 'Total Vehicle Dispatched',
      icon: AlertTriangle,
      incidents: dispatchedIncidents,
    },
    {
      title: 'RIPV Recovery',
      icon: Truck,
      incidents: dispatchedIncidents.filter((r) => r.vehicleAllocated === 'RIPV'),
    },
    {
      title: 'Light Recovery',
      icon: Car,
      incidents: dispatchedIncidents.filter((r) => r.vehicleAllocated === 'Light Recovery'),
    },
    {
      title: 'Heavy Recovery',
      icon: Truck,
      incidents: dispatchedIncidents.filter((r) => r.vehicleAllocated === 'Heavy Recovery'),
    },
  ];

  // Extract chart data
  const incidentTypeData = getIncidentTypeData();
  const vehiclesDispatchedData = getVehiclesDispatchedData();
  const spottedByData = getSpottedByData();
  const timeToRecoverData = getTimeToRecoverData();
  const emergencyServicesData = getEmergencyServicesData();
  const timeToSiteData = getTimeToSiteData();
  const vehicleTypeData = getVehicleTypeData();
  const timeSeriesData = getTimeSeriesData();

  return (
    <AdminSidebarLayout>
      <div className="max-w-8xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-semibold text-gray-800 mb-2">Reports & Analytics</h1>
          <p className="text-gray-500 text-[13px] sm:text-[14px]">Visual analytics of all reports and submissions per scheme</p>
        </div>

        {/* Filter and Export */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="relative w-full sm:w-auto max-w-md">
                <Filter className="w-5 h-5 text-brand-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                <select
                  value={selectedScheme}
                  onChange={(e) => setSelectedScheme(e.target.value)}
                  className="select text-gray-600 pl-10 bg-white border-gray-200 rounded-lg w-full focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
                >
                  {schemes.map((scheme) => (
                    <option key={scheme} value={scheme}>
                      {scheme}
                    </option>
                  ))}
                </select>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              {/* Date Range Picker */}
              <div className="relative" ref={datePickerRef}>
                <button
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className="flex items-center justify-center sm:justify-start gap-3 bg-white px-4 py-2.5 sm:py-2 rounded-lg border border-gray-200 hover:shadow-xs transition-shadow cursor-pointer w-full sm:w-auto"
                >
                  <Calendar className="w-5 h-5 text-brand-500" />
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-gray-700">
                      {dateRange[0].startDate.toLocaleDateString('en-GB')}
                    </span>
                    <span className="text-gray-400">→</span>
                    <span className="font-medium text-gray-700">
                      {dateRange[0].endDate.toLocaleDateString('en-GB')}
                    </span>
                  </div>
                </button>

                {showDatePicker && (
                  <div className="absolute left-1/2 -translate-x-1/2 sm:left-auto sm:right-0 sm:translate-x-0 top-full mt-2 z-50 max-w-[92vw] overflow-x-auto shadow-xl rounded-lg border border-gray-200 [&_.rdrDateRangePickerWrapper]:flex-col sm:[&_.rdrDateRangePickerWrapper]:flex-row [&_.rdrDefinedRangesWrapper]:w-full! sm:[&_.rdrDefinedRangesWrapper]:w-[226px]! [&_.rdrDefinedRangesWrapper]:border-r-0! [&_.rdrDefinedRangesWrapper]:border-b sm:[&_.rdrDefinedRangesWrapper]:border-b-0 sm:[&_.rdrDefinedRangesWrapper]:border-r! [&_.rdrDefinedRangesWrapper]:border-gray-100 [&_.rdrStaticRanges]:grid [&_.rdrStaticRanges]:grid-cols-2 sm:[&_.rdrStaticRanges]:block [&_.rdrInputRanges]:grid [&_.rdrInputRanges]:grid-cols-2 sm:[&_.rdrInputRanges]:block">
                    <DateRangePicker
                      ranges={dateRange}
                      onChange={(item) => setDateRange([item.selection])}
                      moveRangeOnFirstSelection={false}
                      staticRanges={isMobile ? MOBILE_STATIC_RANGES : defaultStaticRanges}
                      months={isMobile ? 1 : 2}
                      direction={isMobile ? 'vertical' : 'horizontal'}
                      showDateDisplay={false}
                      rangeColors={[COLORS.brand]}
                    />
                  </div>
                )}
              </div>

              <button
                onClick={handleExportPDF}
                disabled={isExporting || loading}
                className="flex items-center justify-center gap-2 bg-brand-500 text-white px-4 py-2 sm:py-1.5 rounded-lg shadow-sm hover:bg-brand-600 hover:shadow-md transition-all disabled:bg-gray-300 disabled:cursor-not-allowed w-full sm:w-auto"
              >
                <Download className="w-4 h-4" />
                <span className="text-sm py-1 font-semibold">Export Charts</span>
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-96">
            <div className="loading loading-spinner loading-lg text-brand-500"></div>
          </div>
        ) : (
          <>
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {vehicleCards.map((card) => (
                <div
                  key={card.title}
                  role="button"
                  tabIndex={0}
                  className="bg-white rounded-xl shadow-lg p-7 hover:shadow-xl transition-shadow cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500"
                  onClick={() => openDrillDown({ title: card.title, incidents: card.incidents })}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    openDrillDown({ title: card.title, incidents: card.incidents });
                  }}
                >
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-lg bg-brand-500 flex items-center justify-center shrink-0">
                      <card.icon className="w-5 h-5 text-white" />
                    </div>
                    <h6 className="text-sm font-medium text-gray-600 leading-tight">{card.title}</h6>
                  </div>
                  <div className="mt-2">
                    <span className="text-4xl font-bold text-gray-800">{card.incidents.length}</span>
                    <p className="text-sm text-gray-400 mt-1">{periodLabel}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Incident Analytics Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Chart 9: Time to Site */}
              <ChartCard title="Time to Site (mins)">
                <BarChart
                  data={timeToSiteData.length > 0 ? timeToSiteData : [{ name: "No Data", Number: 0 }]}
                  margin={commonChartProps.chartMargin}
                  onClick={(d) => d?.activeLabel && handleBarClick('timeToSite', d.activeLabel)}
                  style={{ cursor: 'pointer' }}
                >
                  <CartesianGrid {...commonChartProps.cartesianGrid} />
                  <XAxis dataKey="name" {...commonChartProps.xAxis} />
                  <YAxis {...commonChartProps.yAxis} />
                  <Tooltip {...commonChartProps.tooltip} />
                  <Legend {...commonChartProps.legend} />
                  <Bar dataKey="Number" {...commonChartProps.bar} />
                </BarChart>
              </ChartCard>

              {/* Chart 6: Time to Recover */}
              <ChartCard title="Time to recover (mins)">
                <BarChart
                  data={timeToRecoverData.length > 0 ? timeToRecoverData : [{ name: "No Data", Number: 0 }]}
                  margin={commonChartProps.chartMargin}
                  onClick={(d) => d?.activeLabel && handleBarClick('timeToRecover', d.activeLabel)}
                  style={{ cursor: 'pointer' }}
                >
                  <CartesianGrid {...commonChartProps.cartesianGrid} />
                  <XAxis dataKey="name" {...commonChartProps.xAxis} />
                  <YAxis {...commonChartProps.yAxis} />
                  <Tooltip {...commonChartProps.tooltip} />
                  <Legend {...commonChartProps.legend} />
                  <Bar dataKey="Number" {...commonChartProps.bar} />
                </BarChart>
              </ChartCard>

              {/* Chart 2: Incident Type */}
              <ChartCard title="Incident Type">
                <BarChart
                  data={incidentTypeData.length > 0 ? incidentTypeData : [{ name: "No Data", Number: 0 }]}
                  margin={commonChartProps.chartMargin}
                  onClick={(d) => d?.activeLabel && handleBarClick('incidentType', d.activeLabel)}
                  style={{ cursor: 'pointer' }}
                >
                  <CartesianGrid {...commonChartProps.cartesianGrid} />
                  <XAxis dataKey="name" {...commonChartProps.xAxis} />
                  <YAxis {...commonChartProps.yAxis} />
                  <Tooltip {...commonChartProps.tooltip} />
                  <Legend {...commonChartProps.legend} />
                  <Bar dataKey="Number" {...commonChartProps.bar} />
                </BarChart>
              </ChartCard>

              {/* Chart 3: Vehicles Dispatched */}
              <ChartCard title="Vehicle Allocated">
                <BarChart
                  data={vehiclesDispatchedData.length > 0 ? vehiclesDispatchedData : [{ name: "No Data", Number: 0 }]}
                  margin={commonChartProps.chartMargin}
                  onClick={(d) => d?.activeLabel && handleBarClick('vehiclesDispatched', d.activeLabel)}
                  style={{ cursor: 'pointer' }}
                >
                  <CartesianGrid {...commonChartProps.cartesianGrid} />
                  <XAxis dataKey="name" {...commonChartProps.xAxis} />
                  <YAxis {...commonChartProps.yAxis} />
                  <Tooltip {...commonChartProps.tooltip} />
                  <Legend {...commonChartProps.legend} />
                  <Bar dataKey="Number" {...commonChartProps.bar} />
                </BarChart>
              </ChartCard>

              {/* Chart 4: Spotted By */}
              <ChartCard title="Source of Call">
                <BarChart
                  data={spottedByData.length > 0 ? spottedByData : [{ name: "No Data", Number: 0 }]}
                  margin={commonChartProps.chartMargin}
                  onClick={(d) => d?.activeLabel && handleBarClick('spottedBy', d.activeLabel)}
                  style={{ cursor: 'pointer' }}
                >
                  <CartesianGrid {...commonChartProps.cartesianGrid} />
                  <XAxis dataKey="name" {...commonChartProps.xAxis} />
                  <YAxis {...commonChartProps.yAxis} />
                  <Tooltip {...commonChartProps.tooltip} />
                  <Legend {...commonChartProps.legend} />
                  <Bar dataKey="Number" {...commonChartProps.bar} />
                </BarChart>
              </ChartCard>

              {/* Chart 8: Emergency Services Attended */}
              <ChartCard title="Emergency Services Attended">
                <BarChart
                  data={emergencyServicesData.length > 0 ? emergencyServicesData : [{ name: "No Data", Number: 0 }]}
                  margin={commonChartProps.chartMargin}
                  onClick={(d) => d?.activeLabel && handleBarClick('emergencyServices', d.activeLabel)}
                  style={{ cursor: 'pointer' }}
                >
                  <CartesianGrid {...commonChartProps.cartesianGrid} />
                  <XAxis dataKey="name" {...commonChartProps.xAxis} />
                  <YAxis {...commonChartProps.yAxis} />
                  <Tooltip {...commonChartProps.tooltip} />
                  <Legend {...commonChartProps.legend} />
                  <Bar dataKey="Number" {...commonChartProps.bar} />
                </BarChart>
              </ChartCard>
              {/* Chart 11: Vehicle Type */}
              <ChartCard title="Vehicle Type">
                <BarChart
                  data={vehicleTypeData.length > 0 ? vehicleTypeData : [{ name: "No Data", Number: 0 }]}
                  margin={commonChartProps.chartMargin}
                  onClick={(d) => d?.activeLabel && handleBarClick('vehicleType', d.activeLabel)}
                  style={{ cursor: 'pointer' }}
                >
                  <CartesianGrid {...commonChartProps.cartesianGrid} />
                  <XAxis dataKey="name" {...commonChartProps.xAxis} />
                  <YAxis {...commonChartProps.yAxis} />
                  <Tooltip {...commonChartProps.tooltip} />
                  <Legend {...commonChartProps.legend} />
                  <Bar dataKey="Number" {...commonChartProps.bar} />
                </BarChart>
              </ChartCard>

              {/* Chart 13: Vehicle Check Defect Frequency */}
              <ChartCard title="Defect Frequency by Check Item" fullWidth>
                <BarChart
                  data={vehicleCheckDefects}
                  margin={commonChartProps.chartMargin}
                >
                  <CartesianGrid {...commonChartProps.cartesianGrid} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={70} />
                  <YAxis {...commonChartProps.yAxis} allowDecimals={false} />
                  <Tooltip {...commonChartProps.tooltip} />
                  <Bar dataKey="count" name="Defects" {...commonChartProps.bar} />
                </BarChart>
              </ChartCard>
            </div>

            {/* Full Width: Incidents Over Time */}
            <div className="mb-8">
              <ChartCard title="Incidents Over Time" fullWidth height={350}>
                <BarChart
                  data={
                    timeSeriesData.length > 0
                      ? timeSeriesData.map(d => ({ ...d, Number: d.count }))
                      : [{ name: "No Data", Number: 0 }]
                  }
                  margin={commonChartProps.chartMargin}
                  onClick={(d) => d?.activeLabel && handleBarClick('timeSeries', d.activeLabel)}
                  style={{ cursor: 'pointer' }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 13 }} />
                  <YAxis tick={{ fontSize: 13 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                    labelStyle={{ fontWeight: 'bold' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar dataKey="Number" fill={COLORS.brand} radius={[8, 8, 0, 0]} />
                </BarChart>
              </ChartCard>
            </div>
          </>
        )}
      </div>

      {/* Drill-down sidebar — rendered in a portal so it never affects page scroll */}
      <DrillDownSidebar
        drillDown={drillDown}
        onClose={closeDrillDown}
        onNavigate={navigateToReport}
      />
    </AdminSidebarLayout>
  );
};

export default ClientChartsPage;
