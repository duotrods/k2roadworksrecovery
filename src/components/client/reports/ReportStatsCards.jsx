import {
  FileText,
  AlertTriangle,
  Wrench,
  ShieldAlert,
  Car,
  Hammer,
} from "lucide-react";

// The two rows of clickable summary cards at the top of the Reports page.
// Each card drives a filter via onCardClick(type, sub?).
const Card = ({ icon, hoverBorder, label, value, onClick }) => (
  <div
    className={`bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md hover:border-l-4 ${hoverBorder} transition-all`}
    onClick={onClick}
  >
    <div className="flex items-center gap-1.5 mb-1">
      {icon}
      <p className="text-gray-500 text-sm">{label}</p>
    </div>
    <p className="text-2xl font-bold text-brand-500">{value}</p>
  </div>
);

const ReportStatsCards = ({ reportStats, onCardClick }) => (
  <>
    {/* Row 1: Report Type Counts */}
    <div className="grid grid-cols-2 gap-4 mb-4">
      <Card
        icon={<FileText className="w-3.5 h-3.5 text-brand-500" />}
        hoverBorder="hover:border-brand-500"
        label="Total Reports"
        value={reportStats.total}
        onClick={() => onCardClick("all")}
      />
      <Card
        icon={<AlertTriangle className="w-3.5 h-3.5 text-orange-500" />}
        hoverBorder="hover:border-orange-500"
        label="Incidents"
        value={reportStats.pureIncident}
        onClick={() => onCardClick("incident", "pure")}
      />
    </div>

    {/* Row 2: Incident Metrics */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <Card
        icon={<Wrench className="w-3.5 h-3.5 text-green-500" />}
        hoverBorder="hover:border-green-500"
        label="Free Recovery"
        value={reportStats.freeRecovery}
        onClick={() => onCardClick("incident", "free-recovery")}
      />
      <Card
        icon={<ShieldAlert className="w-3.5 h-3.5 text-red-500" />}
        hoverBorder="hover:border-red-500"
        label="Incursions"
        value={reportStats.incursions}
        onClick={() => onCardClick("incident", "incursion")}
      />
      <Card
        icon={<Car className="w-3.5 h-3.5 text-blue-500" />}
        hoverBorder="hover:border-blue-500"
        label="Vehicles Dispatched"
        value={reportStats.vehiclesDispatched}
        onClick={() => onCardClick("incident")}
      />
      <Card
        icon={<Hammer className="w-3.5 h-3.5 text-yellow-500" />}
        hoverBorder="hover:border-yellow-500"
        label="Asset Damage"
        value={reportStats.incidentAssetDamage}
        onClick={() => onCardClick("incident", "asset-damage")}
      />
    </div>
  </>
);

export default ReportStatsCards;
