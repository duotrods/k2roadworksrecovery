// Pure helpers for the K2 Job Sheet form. No React/Firebase imports so the
// (bug-prone) time math can be unit-tested in isolation.

// Format a date as DD/MM/YYYY.
export const formatDateToBritish = (date) => {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

// Minutes between two HH:MM times, wrapping past midnight. null if either missing.
export const minutesBetween = (time1, time2) => {
  if (!time1 || !time2) return null;
  const [hours1, mins1] = time1.split(":").map(Number);
  const [hours2, mins2] = time2.split(":").map(Number);
  const totalMins1 = hours1 * 60 + mins1;
  const totalMins2 = hours2 * 60 + mins2;
  let diff = totalMins2 - totalMins1;
  if (diff < 0) diff += 24 * 60;
  return diff;
};

// Derive the "X mins" duration fields from the receipt/arrival/completed times.
// Output field names are kept from the old highways-incident form
// (timeSpottedToOn / timeOnsiteToCleared) on purpose: client-facing "time to
// site" / "time to recovery" charts (NewClientDashboard, ClientChartsPage,
// clientDataService) key off these literal names.
export const calculateTimeDifferences = (data) => {
  const result = { ...data };

  if (data.time && data.timeOfArrival) {
    const mins = minutesBetween(data.time, data.timeOfArrival);
    if (mins !== null) result.timeSpottedToOn = `${mins} mins`;
  }

  if (data.timeOfArrival && data.timeCompleted) {
    const mins = minutesBetween(data.timeOfArrival, data.timeCompleted);
    if (mins !== null) result.timeOnsiteToCleared = `${mins} mins`;
  }

  return result;
};

// The 8 fixed customer/driver service acceptance statements from the paper
// Jobsheet, rendered as a checkbox list in Part 2 and checked-off in views/PDF.
export const SERVICE_ACCEPTANCE_STATEMENTS = [
  "I accept that any roadside repair will be of a temporary nature and that advice of a franchised dealer should be sought by me as soon as possible.",
  "I can confirm that all removed items, i.e. drive shafts, nuts, bolts, washers, collets, brake chamber bolts etc are with the recovered vehicle, and I am also aware after the prop/half shafts (s) have been removed the differential oil will need checking, and if the prop shaft has been refitted bolts will also need checking before the vehicle is road worthy.",
  "In the cases of forced entry, I confirm that I specifically requested the operator to forcefully enter the vehicle and that all damage occasioned thereby is and shall be my sole responsibility.",
  "I acknowledge that following a wheel change the wheel nuts and tyre pressure need to be checked and re-torqued after 50km, and removed wheel / tyre has been fitted back into carrier, etc.",
  "Following advice from attending mechanic I understand my vehicle is unfit for further road use, and I accept all responsibility for continuing to drive the vehicle.",
  "Satisfaction of the condition of the disabled vehicle prior to and after recovery. Acceptance and acknowledgement that accidental damage may be caused as a result of moving the disabled vehicle in order to carry out repair and / or recovery.",
  "I am entitled to the service provided. In the event of this subsequently not being the case I shall be responsible for the cost of the assistance provided.",
  "I certify that my caravan / trailer is of a roadworthy condition and accept full responsibility for any damage (including 3rd party) caused during towing by tyre failure and will cover any costs incurred in necessary repairs as a result.",
];

// Vehicle condition sections from the paper form's damage diagram, rendered
// as a checkbox-list (damage present + note) instead of a tappable diagram.
export const VEHICLE_CONDITION_SECTIONS = [
  { key: "frontBumper", label: "Front Bumper" },
  { key: "bonnet", label: "Bonnet" },
  { key: "screen", label: "Screen" },
  { key: "roof", label: "Roof" },
  { key: "bootLid", label: "Boot Lid" },
  { key: "rearBumper", label: "Rear Bumper" },
  { key: "wheels", label: "Wheels" },
  { key: "doors", label: "Doors" },
  { key: "Wing", label: "Wing" },
  { key: "N/A", label: "N/A" },
];

// Yes/No operational checks from the paper form.
export const CHECK_ITEMS = [
  { key: "propRemoved", label: "Prop Removed" },
  { key: "halfShaftRemoved", label: "Half Shaft Removed" },
  { key: "propOrHalfShaftsRemoved", label: "Prop/Half Shaft(s) Removed" },
  { key: "rearLift", label: "Rear Lift" },
  { key: "keys", label: "Keys" },
  { key: "keysWithDriver", label: "Keys with Driver" },
  { key: "brakesWoundOff", label: "Brakes Wound Off" },
  { key: "brakesWoundBackIn", label: "Brakes Wound Back In" },
];

// Placeholder options for the Step 1 "Source of Call" drop-down. "Other"
// reveals a free-text box in the form itself.
export const SOURCE_OF_CALL_OPTIONS = [
  "Highways England",
  "Customer",
  "Control Room",
];

export const VEHICLE_ALLOCATED_OPTIONS = [
  "Light Recovery",
  "Heavy Recovery",
  "RIPV",
  "Motorbike",
];

export const VEHICLE_TRANSMISSION_OPTIONS = [
  "Manual",
  "Automatic",
];

// The recovered vehicle's own type (Step 2 On Scene, and shared into Step 3
// Vehicle Details — same field, same value in both places). Drives whether
// the Checks section (Step 3) is enabled — only for HGV/Coach-Bus.
export const VEHICLE_TYPE_OPTIONS = [
  "Car",
  "Car+ Trailer",
  "Van",
  "HGV",
  "Motorbike",
  "Coach/Bus",
  "None",
];

export const INCIDENT_TYPE_OPTIONS = [
"Free Recovery",
"Police Incident",
"RTC",
"Drive Off",
"Medical Incident",
"Vehicle Fire",
"Fire",
"Other"
];

export const ACTUAL_TYPE_OPTIONS = [
  "Puncture",
  "Mechanical",
  "Wrong Fuel",
  "No Fuel",
  "Drive Off",
  "Vehicle Fire",
  "No Fault",
  "Other"
];

export const createEmptyVehicleCondition = () =>
  Object.fromEntries(
    VEHICLE_CONDITION_SECTIONS.map(({ key }) => [key, { damage: false, note: "" }]),
  );

export const createEmptyChecks = () =>
  Object.fromEntries(CHECK_ITEMS.map(({ key }) => [key, "No"]));
