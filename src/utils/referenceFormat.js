// Pure reference-ID formatting, separated from the Firestore counter logic so
// it can be unit-tested without Firebase.
// Format: PREFIX + zero-padded number (e.g. IN01). Demo submissions get a
// "-DEMO" suffix and draw from an isolated demo counter.

const REFERENCE_CONFIGS = {
  incident: { prefix: "IN", digits: 2, counterName: "incidentReports" },
  dailyAllocation: { prefix: "DA", digits: 2, counterName: "dailyAllocation" },
  cabinSafety: { prefix: "CH", digits: 2, counterName: "cabinSafety" },
  vehicleCheck: { prefix: "VC", digits: 2, counterName: "vehicleCheck" },
};

export const getReferenceConfig = (type) => {
  const config = REFERENCE_CONFIGS[type];
  if (!config) throw new Error(`Unknown form type: ${type}`);
  return config;
};

// Resolve which counter document a submission should draw from.
export const getCounterName = (config, { isDemo } = {}) => {
  if (isDemo) return `${config.counterName}_demo`;
  return config.counterName;
};

export const formatReferenceId = (config, number, { isDemo } = {}) => {
  const formattedNumber = String(number).padStart(config.digits, "0");
  return isDemo
    ? `${config.prefix}${formattedNumber}-DEMO`
    : `${config.prefix}${formattedNumber}`;
};
