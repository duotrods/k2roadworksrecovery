import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { FileText, ShieldCheck, Car } from 'lucide-react';
import StaffSidebarLayout from '../../components/layout/StaffSidebarLayout';
import { getStaffBasePath } from '../../utils/constants';

const FormsSelectionPage = () => {
  const navigate = useNavigate();
  const { userProfile, role } = useAuth();
  const basePath = getStaffBasePath(role);

  const formCards = [
    {
      title: 'Incident Sheet',
      description: 'Report highway incidents and traffic disruptions',
      icon: FileText,
      color: 'from-teal-400 to-teal-500',
      bgColor: 'bg-teal-50',
      path: `${basePath}/forms/incident-report`
    },
    {
      title: 'Cabin Health & Safety Check',
      description: 'Complete the monthly cabin health & safety inspection checklist',
      icon: ShieldCheck,
      color: 'from-green-400 to-green-500',
      bgColor: 'bg-green-50',
      path: `${basePath}/forms/cabin-safety-check`,
      // Admin-revocable — Admin → Assignments & Access → Cabin Check Access.
      disabled: role === 'staff' && userProfile?.canSubmitCabinHsChecks === false,
    },
    {
      title: 'Vehicle Daily Check Sheet',
      description: 'Record daily vehicle checks for the week',
      icon: Car,
      color: 'from-amber-400 to-amber-500',
      bgColor: 'bg-amber-50',
      path: `${basePath}/forms/vehicle-daily-check`
    },
  ];

  return (
    <StaffSidebarLayout basePath={basePath}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            How would you like to start, <span className="text-teal-500">{userProfile?.displayName?.split(' ')[0]}!</span>
          </h1>
          <p className="text-gray-600">
            Choose a form to get started! Record every detail, stay organized, and keep your shift running smoothly.
          </p>
        </div>

        {/* Form Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {formCards.map((form, index) => (
            <button
              key={index}
              onClick={() => !form.disabled && navigate(form.path)}
              disabled={form.disabled}
              className={`group relative rounded-2xl p-8 shadow-md transition-all duration-300 text-left overflow-hidden ${
                form.disabled
                  ? "bg-gray-100 cursor-not-allowed opacity-60"
                  : "bg-white hover:shadow-2xl"
              }`}
            >
              {/* Background Gradient Effect */}
              {!form.disabled && (
                <div className={`absolute inset-0 bg-linear-to-br ${form.color} opacity-0 group-hover:opacity-5 transition-opacity`}></div>
              )}

              {/* Content */}
              <div className="relative">
                {/* Icon */}
                <div
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-transform ${
                    form.disabled ? "bg-gray-200" : `${form.bgColor} group-hover:scale-110`
                  }`}
                >
                  <form.icon className={`w-8 h-8 ${form.disabled ? "text-gray-400" : "text-teal-600"}`} />
                </div>

                {/* Title */}
                <h3
                  className={`text-xl font-bold mb-3 transition-colors ${
                    form.disabled ? "text-gray-500" : "text-gray-800 group-hover:text-teal-600"
                  }`}
                >
                  {form.title}
                </h3>

                {/* Description */}
                <p className="text-gray-600 text-sm leading-relaxed">
                  {form.description}
                </p>

                {form.disabled ? (
                  <p className="text-xs text-gray-400 mt-4">Ask your admin for access.</p>
                ) : (
                  /* Arrow Icon (appears on hover) */
                  <div className="mt-4 flex items-center text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-sm font-semibold">Get Started</span>
                    <svg
                      className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Help Text */}
        <div className="mt-12 text-center">
          <p className="text-gray-500 text-sm">
            Need help? Contact your supervisor or check the{' '}
            <button className="text-teal-600 hover:underline font-semibold">
              documentation
            </button>
          </p>
        </div>
      </div>
    </StaffSidebarLayout>
  );
};

export default FormsSelectionPage;
