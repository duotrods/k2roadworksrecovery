import { useState } from "react";
import { supabase } from "../../config/supabase";
import { referenceIdService } from "../../services/referenceIdService";
import AdminSidebarLayout from "../../components/layout/AdminSidebarLayout";
import { Hash, RotateCcw, Pencil, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "react-hot-toast";

const FORM_TYPES = [
  { type: "incident",        label: "Recovery Job Sheet",        prefix: "IN" },
  { type: "cabinSafety",     label: "Cabin H&S Check",           prefix: "CH" },
  { type: "vehicleCheck",    label: "Vehicle Daily Check",        prefix: "VC" },
  { type: "dailyAllocation", label: "Daily Allocations",          prefix: "DA" },
];

// Returns every counter name that exists for a given form type
function getCounterVariants(type) {
  const config = referenceIdService.getTypeConfig(type);
  const variants = [
    { counterName: config.counterName,        label: "Real Staff",  suffix: "" },
    { counterName: `${config.counterName}_demo`, label: "Demo",     suffix: "-DEMO" },
  ];
  return variants;
}

const CounterRow = ({ formType, counterName, label, prefix, suffix }) => {
  const [current, setCurrent] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("counters")
      .select("current")
      .eq("name", counterName)
      .maybeSingle();
    setCurrent(data?.current ?? 0);
    setLoaded(true);
  };

  const handleEdit = () => {
    setInputVal(String(current ?? 0));
    setEditing(true);
  };

  const handleSave = async () => {
    const num = parseInt(inputVal, 10);
    if (isNaN(num) || num < 0) {
      toast.error("Enter a valid number (0 or above)");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("admin_set_counter", {
        p_name: counterName,
        p_value: num,
      });
      if (error) throw error;
      setCurrent(num);
      setEditing(false);
      const nextId = num === 0
        ? `${prefix}01${suffix}`
        : `${prefix}${String(num + 1).padStart(2, "0")}${suffix}`;
      toast.success(`Counter set to ${num}. Next ID will be ${nextId}`);
    } catch {
      toast.error("Failed to save. Check Supabase permissions.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("admin_set_counter", {
        p_name: counterName,
        p_value: 0,
      });
      if (error) throw error;
      setCurrent(0);
      setEditing(false);
      toast.success(`Counter reset to 0. Next ID will be ${prefix}01${suffix}`);
    } catch {
      toast.error("Failed to reset. Check Supabase permissions.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-4 py-3 px-4 rounded-lg bg-gray-50 border border-gray-100">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-400 font-mono">{counterName}</p>
      </div>

      {!loaded ? (
        <button
          onClick={load}
          className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
        >
          Load
        </button>
      ) : editing ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            className="w-24 input input-sm bg-white border-gray-300 rounded-lg text-center font-mono"
            autoFocus
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-sm bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono text-gray-700">
            Current: <span className="font-bold text-gray-900">{current}</span>
            <span className="text-gray-400 ml-2">
              (next: {prefix}{String((current ?? 0) + 1).padStart(2, "0")}{suffix})
            </span>
          </span>
          <button
            onClick={handleEdit}
            title="Set to specific value"
            className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors text-gray-500"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={handleReset}
            disabled={saving}
            title="Reset to 0"
            className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-red-400 disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

const ReferenceIdManagerPage = () => {
  const [openType, setOpenType] = useState(null);

  return (
    <AdminSidebarLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-1">
            <Hash className="w-6 h-6 text-teal-500" />
            <h3 className="text-xl font-bold text-gray-800">Reference ID Manager</h3>
          </div>
          <p className="text-gray-500 text-sm mb-4">
            View and reset reference ID counters. Each counter is isolated — changing one does not affect any other.
          </p>
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Resetting a counter means the next form submission will start from 01 again.
              Existing documents are not changed — only future IDs are affected.
            </span>
          </div>
        </div>

        {FORM_TYPES.map(({ type, label, prefix }) => (
          <div key={type} className="bg-white rounded-xl shadow-sm overflow-hidden">
            <button
              onClick={() => setOpenType(openType === type ? null : type)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded">
                  {prefix}
                </span>
                <span className="font-semibold text-gray-800">{label}</span>
              </div>
              <CheckCircle2
                className={`w-4 h-4 transition-transform ${openType === type ? "rotate-180 text-teal-500" : "text-gray-300"}`}
              />
            </button>

            {openType === type && (
              <div className="px-6 pb-6 space-y-2 border-t border-gray-100 pt-4">
                {getCounterVariants(type).map((v) => (
                  <CounterRow
                    key={v.counterName}
                    formType={type}
                    counterName={v.counterName}
                    label={v.label}
                    prefix={prefix}
                    suffix={v.suffix}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </AdminSidebarLayout>
  );
};

export default ReferenceIdManagerPage;
