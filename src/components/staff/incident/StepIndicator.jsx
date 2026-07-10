// Two-part progress indicator for the Job Sheet form.
const StepIndicator = ({ currentStep }) => (
  <div className="flex items-center justify-center mb-8">
    <div className="flex items-center">
      <div
        className={`flex items-center justify-center w-10 h-10 rounded-full font-bold ${
          currentStep >= 1
            ? "bg-brand-500 text-white"
            : "bg-gray-200 text-gray-500"
        }`}
      >
        1
      </div>
      <span
        className={`ml-2 font-semibold ${currentStep >= 1 ? "text-brand-600" : "text-gray-400"}`}
      >
        Arrival
      </span>
    </div>
    <div
      className={`w-16 h-1 mx-4 ${currentStep >= 2 ? "bg-brand-500" : "bg-gray-200"}`}
    />
    <div className="flex items-center">
      <div
        className={`flex items-center justify-center w-10 h-10 rounded-full font-bold ${
          currentStep >= 2
            ? "bg-brand-500 text-white"
            : "bg-gray-200 text-gray-500"
        }`}
      >
        2
      </div>
      <span
        className={`ml-2 font-semibold ${currentStep >= 2 ? "text-brand-600" : "text-gray-400"}`}
      >
        Completion
      </span>
    </div>
  </div>
);

export default StepIndicator;
