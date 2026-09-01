// Four-part progress indicator for the Job Sheet form: Start Job -> On Scene
// -> Drop-Off Sheet -> Customer. On mobile it's a compact horizontal stepper
// with the labels stacked *under* the circles (so long labels wrap in their
// own column instead of pushing the row sideways); from sm: upward it's the
// original inline horizontal stepper with labels beside the circles.
// `short` is the compact label used in the mobile stepper (labels sit under
// the circles there, so they must stay to one line); `label` is the full text
// shown beside the circles on desktop.
const STEPS = [
  { label: "Start Job", short: "Start Job" },
  { label: "On Scene", short: "On Scene" },
  { label: "Drop-Off Sheet", short: "Drop-Off" },
  { label: "Customer", short: "Customer" },
];

const StepIndicator = ({ currentStep, totalSteps = 4 }) => {
  const steps = STEPS.slice(0, totalSteps);
  const circleClass = (step) =>
    `flex items-center justify-center w-10 h-10 rounded-full font-bold shrink-0 ${
      currentStep >= step ? "bg-brand-500 text-white" : "bg-gray-200 text-gray-500"
    }`;
  const labelClass = (step) =>
    `font-semibold ${currentStep >= step ? "text-brand-600" : "text-gray-400"}`;
  const lineClass = (step) => (currentStep > step ? "bg-brand-500" : "bg-gray-200");

  return (
    <div className="mb-8">
      {/* Mobile: compact horizontal stepper, labels under the circles.
          The connector for each step is absolutely positioned from the circle's
          centre (top-5 = the 40px circle's mid-point) across to the next
          circle's centre (left-1/2 + w-full), sitting behind the circle. */}
      <div className="flex sm:hidden">
        {steps.map(({ short }, index) => {
          const step = index + 1;
          const isLast = step === steps.length;
          return (
            <div
              key={short}
              className="relative flex flex-1 flex-col items-center"
            >
              {!isLast && (
                <div
                  className={`absolute top-5 left-1/2 h-1 w-full -translate-y-1/2 rounded ${lineClass(step)}`}
                />
              )}
              <div className={`relative z-10 ${circleClass(step)}`}>{step}</div>
              <span
                className={`mt-2 px-1 text-center text-xs leading-tight ${labelClass(step)}`}
              >
                {short}
              </span>
            </div>
          );
        })}
      </div>

      {/* Desktop: horizontal stepper with labels beside the circles */}
      <div className="hidden sm:flex items-center justify-center">
        {steps.map(({ label }, index) => {
          const step = index + 1;
          return (
            <div key={label} className="flex items-center">
              <div className={circleClass(step)}>{step}</div>
              <span className={`ml-2 ${labelClass(step)}`}>{label}</span>
              {step < steps.length && (
                <div className={`w-16 h-1 mx-4 ${lineClass(step)}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StepIndicator;
