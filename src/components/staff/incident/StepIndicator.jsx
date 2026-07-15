// Four-part progress indicator for the Job Sheet form: Start Job -> On Scene
// -> Drop-Off Sheet -> Customer.
const STEPS = ["Start Job", "On Scene", "Drop-Off Sheet", "Customer"];

const StepIndicator = ({ currentStep }) => (
  <div className="flex items-center justify-center mb-8 flex-wrap gap-y-4">
    {STEPS.map((label, index) => {
      const step = index + 1;
      return (
        <div key={label} className="flex items-center">
          <div className="flex items-center">
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-full font-bold ${
                currentStep >= step
                  ? "bg-brand-500 text-white"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {step}
            </div>
            <span
              className={`ml-2 font-semibold ${
                currentStep >= step ? "text-brand-600" : "text-gray-400"
              }`}
            >
              {label}
            </span>
          </div>
          {step < STEPS.length && (
            <div
              className={`w-10 sm:w-16 h-1 mx-4 ${
                currentStep > step ? "bg-brand-500" : "bg-gray-200"
              }`}
            />
          )}
        </div>
      );
    })}
  </div>
);

export default StepIndicator;
