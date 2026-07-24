import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { clientDataService } from '../../services/clientDataService';
import ClientSidebarLayout from '../../components/layout/ClientSidebarLayout';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  TrendingUp, AlertTriangle, Car, Camera, Clock,
  MapPin, Calendar, Filter
} from 'lucide-react';

const AnalyticsPage = () => {
  const { userProfile } = useAuth();
  const [stats, setStats] = useState(null);
  const [timeSeriesData, setTimeSeriesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30');

  useEffect(() => {
    const activeScheme = userProfile?.activeSchemeId || userProfile?.schemeId;
    if (activeScheme) {
      loadAnalyticsData();
    }
  }, [userProfile?.activeSchemeId, userProfile?.schemeId, dateRange]);

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);
      const activeScheme = userProfile.activeSchemeId || userProfile.schemeId;
      const [schemeStats, weeklyData] = await Promise.all([
        clientDataService.getSchemeStats(activeScheme),
        clientDataService.getTimeSeriesData(activeScheme, parseInt(dateRange))
      ]);

      setStats(schemeStats);
      setTimeSeriesData(weeklyData);
    } catch (error) {
      console.error('Failed to load analytics data:', error);
      // Import toast if not already imported
      const toast = (await import('react-hot-toast')).default;
      if (error.message?.includes('index') || error.cause?.message?.includes('index')) {
        toast.error('Firebase indexes are still building. Please wait 5-10 minutes and refresh.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Transform stats data for charts
  const incidentTypeData = stats?.incidentsByType
    ? Object.entries(stats.incidentsByType).map(([name, count]) => ({ name, count }))
    : [];

  const laneAffectedData = stats?.incidentsByLane
    ? Object.entries(stats.incidentsByLane).map(([name, count]) => ({ name, count }))
    : [];

  const spottedByData = stats?.spottedBy
    ? Object.entries(stats.spottedBy).map(([name, count]) => ({ name, count }))
    : [];

  const COLORS = ['#17af93', '#0891b2', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981'];

  const statsCards = [
    {
      title: 'Total Incidents',
      value: loading ? '...' : (stats?.totalIncidents || 0).toString(),
      change: '+12%',
      icon: AlertTriangle,
      color: 'text-orange-500',
      bgColor: 'bg-orange-50',
      description: `Last ${dateRange} days`
    },
    {
      title: 'Vehicles Dispatched',
      value: loading ? '...' : (stats?.vehiclesDispatched || 0).toString(),
      change: '+8%',
      icon: Car,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
      description: 'Total dispatches'
    },
    {
      title: 'Avg Response Time',
      value: '8.2 min',
      change: '-5%',
      icon: Clock,
      color: 'text-teal-500',
      bgColor: 'bg-teal-50',
      description: 'Average response'
    },
  ];

  return (
    <ClientSidebarLayout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Analytics Dashboard</h1>
            <p className="text-gray-600 mt-2">
              {userProfile?.activeSchemeId || userProfile?.schemeId} - {userProfile?.schemeNames?.[userProfile?.activeSchemeId] || userProfile?.schemeName}
            </p>
          </div>

          {/* Date Range Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-500" />
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="select select-bordered select-sm bg-white border-gray-300"
            >
              <option value="7">Last 7 days</option>
              <option value="14">Last 14 days</option>
              <option value="30">Last 30 days</option>
              <option value="60">Last 60 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {statsCards.map((stat, index) => (
            <div key={index} className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <span className={`text-sm font-semibold ${stat.change.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
                  {stat.change}
                </span>
              </div>
              <h3 className="text-gray-500 text-sm font-medium mb-1">{stat.title}</h3>
              <p className="text-2xl font-bold text-gray-800 mb-1">{stat.value}</p>
              <p className="text-xs text-gray-400">{stat.description}</p>
            </div>
          ))}
        </div>

        {/* Charts Grid - Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Incidents Over Time */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-brand-500" />
              <h3 className="text-lg font-bold text-gray-800">Incidents Over Time</h3>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={timeSeriesData.length > 0 ? timeSeriesData : [{ name: 'No Data', count: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="count" stroke="#17af93" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Incident Type Distribution */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              <h3 className="text-lg font-bold text-gray-800">Incident Type Distribution</h3>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={incidentTypeData.length > 0 ? incidentTypeData : [{ name: 'No Data', count: 1 }]}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {incidentTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Charts Grid - Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Lane Affected Chart */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-5 h-5 text-blue-500" />
              <h3 className="text-lg font-bold text-gray-800">Lane Affected Analysis</h3>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={laneAffectedData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#0891b2" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Spotted By Chart */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <Camera className="w-5 h-5 text-purple-500" />
              <h3 className="text-lg font-bold text-gray-800">Detection Source</h3>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={spottedByData.length > 0 ? spottedByData : [{ name: 'No Data', count: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center gap-2 mb-6">
            <Calendar className="w-5 h-5 text-brand-500" />
            <h3 className="text-lg font-bold text-gray-800">Performance Metrics</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Response Efficiency */}
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-blue-600" />
                <h4 className="font-semibold text-blue-800">Response Efficiency</h4>
              </div>
              <div className="mt-4">
                <p className="text-2xl font-bold text-blue-700">8.2 min</p>
                <p className="text-xs text-gray-600 mt-1">Average response time</p>
                <p className="text-xs text-green-600 mt-2">↓ 5% improvement</p>
              </div>
            </div>

            {/* Incident Resolution */}
            <div className="p-4 bg-orange-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
                <h4 className="font-semibold text-orange-800">Incident Resolution</h4>
              </div>
              <div className="mt-4">
                <p className="text-2xl font-bold text-orange-700">92%</p>
                <p className="text-xs text-gray-600 mt-1">Resolution rate</p>
                <p className="text-xs text-green-600 mt-2">↑ 12% improvement</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ClientSidebarLayout>
  );
};

export default AnalyticsPage;
