import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { isStale, buildStaffPins } from "../../utils/responderTracking";
import { formatRelativeTime } from "../../utils/relativeTime";
import {
  VEHICLE_ALLOCATED_OPTIONS,
  getVehicleAllocatedHex,
} from "../../utils/incidentForm";

const UK_CENTER = [52.5, -1.5];

// divIcon (a styled <div>) instead of Leaflet's default image marker, whose
// image URLs break under Vite bundling.
// White truck glyph (Lucide "truck") on a coloured badge; colour = vehicle type.
const TRUCK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>';

const pinIcon = (stale, selected, color) =>
  L.divIcon({
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
    html: `<div style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:9999px;border:3px solid #fff;background:${
      stale ? "#9ca3af" : color
    };box-shadow:0 0 0 ${selected ? 4 : 1}px ${
      selected ? "#0ea5e9" : "rgba(0,0,0,.35)"
    }">${TRUCK_SVG}</div>`,
  });

// Green = on duty with no live job sheet; the pin takes the vehicle colour
// (VEHICLE_ALLOCATED_HEX) while their job sheet is live.
const ON_DUTY_GREEN = "#16a34a";

// Re-fits the view only when the *set* of operators changes, not on every GPS
// update — otherwise the map would fight an admin who is panning around.
function FitBounds({ points, fitKey }) {
  const map = useMap();
  const pointsRef = useRef(points);
  useEffect(() => {
    pointsRef.current = points;
  });
  useEffect(() => {
    const pts = pointsRef.current;
    if (pts.length === 0) return;
    if (pts.length === 1) map.setView(pts[0], 15);
    else map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
  }, [map, fitKey]);
  return null;
}

const ResponderMap = ({ pins, staff = [], jobs = [], selectedIncidentId, onSelect }) => {
  // Tick so pins grey out on their own when updates stop arriving.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  // One pin per on-duty person (green, or their live job's colour). The
  // per-job pins only fill in for operators who aren't sharing as on-duty.
  const staffPins = useMemo(() => buildStaffPins(staff, jobs, now), [staff, jobs, now]);
  const onDutyUserIds = useMemo(() => new Set(staffPins.map((s) => s.userId)), [staffPins]);
  const jobPins = useMemo(
    () => pins.filter((p) => !onDutyUserIds.has(p.userId)),
    [pins, onDutyUserIds],
  );

  const points = useMemo(
    () => [...jobPins, ...staffPins].map((p) => [p.lat, p.lng]),
    [jobPins, staffPins],
  );
  const fitKey = useMemo(
    () =>
      [...jobPins, ...staffPins]
        .map((p) => p.id)
        .sort()
        .join(","),
    [jobPins, staffPins],
  );

  return (
    <div className="relative h-96 overflow-hidden rounded-lg border border-gray-100 sm:h-[36rem]">
      <MapContainer center={UK_CENTER} zoom={6} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} fitKey={fitKey} />
        {jobPins.map((pin) => {
          const stale = isStale(pin.recordedAt, now);
          return (
            <Marker
              key={pin.id}
              position={[pin.lat, pin.lng]}
              icon={pinIcon(
                stale,
                pin.incidentId === selectedIncidentId,
                getVehicleAllocatedHex(pin.vehicleAllocated),
              )}
              eventHandlers={{ click: () => onSelect?.(pin.incidentId) }}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">{pin.operatorName || "Operator"}</p>
                  <p>{pin.reference}</p>
                  {pin.vehicleAllocated && (
                    <p style={{ color: getVehicleAllocatedHex(pin.vehicleAllocated) }}>
                      {pin.vehicleAllocated}
                    </p>
                  )}
                  <p className={stale ? "text-gray-500" : "text-emerald-600"}>
                    Last seen {formatRelativeTime(pin.recordedAt, new Date(now)) || "—"}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}
        {staffPins.map((member) => {
          const stale = isStale(member.recordedAt, now);
          const job = member.job;
          const color = job ? getVehicleAllocatedHex(job.vehicleAllocated) : ON_DUTY_GREEN;
          return (
            <Marker
              key={member.id}
              position={[member.lat, member.lng]}
              icon={pinIcon(stale, !!job && job.id === selectedIncidentId, color)}
              eventHandlers={{ click: () => job && onSelect?.(job.id) }}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">{member.operatorName || "Staff"}</p>
                  {job ? (
                    <>
                      <p>{job.referenceId || "Job sheet in progress"}</p>
                      {job.vehicleAllocated && (
                        <p style={{ color }}>{job.vehicleAllocated}</p>
                      )}
                    </>
                  ) : (
                    <p style={{ color: ON_DUTY_GREEN }}>On duty · no job sheet</p>
                  )}
                  <p className={stale ? "text-gray-500" : "text-emerald-600"}>
                    Last seen {formatRelativeTime(member.recordedAt, new Date(now)) || "—"}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      <div className="absolute bottom-3 left-3 z-1000 flex flex-col gap-1 rounded-lg bg-white/90 px-3 py-2 text-xs shadow">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: ON_DUTY_GREEN }} />
          On duty (no job sheet)
        </div>
        {VEHICLE_ALLOCATED_OPTIONS.map((v) => (
          <div key={v} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: getVehicleAllocatedHex(v) }}
            />
            {v}
          </div>
        ))}
      </div>
      {jobPins.length === 0 && staffPins.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-1000 flex items-center justify-center">
          <p className="rounded-lg bg-white/90 px-4 py-2 text-sm font-medium text-gray-500 shadow">
            No staff on duty or en route right now
          </p>
        </div>
      )}
    </div>
  );
};

export default ResponderMap;
