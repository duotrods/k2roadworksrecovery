import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { isStale } from "../../utils/responderTracking";
import { formatRelativeTime } from "../../utils/relativeTime";
import {
  VEHICLE_ALLOCATED_OPTIONS,
  getVehicleAllocatedHex,
} from "../../utils/incidentForm";

const UK_CENTER = [52.5, -1.5];

// divIcon (a styled <div>) instead of Leaflet's default image marker, whose
// image URLs break under Vite bundling.
const pinIcon = (stale, selected, color) =>
  L.divIcon({
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12],
    html: `<div style="width:22px;height:22px;border-radius:9999px;border:3px solid #fff;background:${
      stale ? "#9ca3af" : color
    };box-shadow:0 0 0 ${selected ? 4 : 1}px ${
      selected ? "#0ea5e9" : "rgba(0,0,0,.35)"
    }"></div>`,
  });

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

const ResponderMap = ({ pins, selectedIncidentId, onSelect }) => {
  // Tick so pins grey out on their own when updates stop arriving.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const points = useMemo(() => pins.map((p) => [p.lat, p.lng]), [pins]);
  const fitKey = useMemo(
    () => pins.map((p) => p.id).sort().join(","),
    [pins],
  );

  return (
    <div className="relative h-96 overflow-hidden rounded-lg border border-gray-100 sm:h-[36rem]">
      <MapContainer center={UK_CENTER} zoom={6} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} fitKey={fitKey} />
        {pins.map((pin) => {
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
      </MapContainer>
      <div className="absolute bottom-3 left-3 z-1000 flex flex-col gap-1 rounded-lg bg-white/90 px-3 py-2 text-xs shadow">
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
      {pins.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-1000 flex items-center justify-center">
          <p className="rounded-lg bg-white/90 px-4 py-2 text-sm font-medium text-gray-500 shadow">
            No operators en route right now
          </p>
        </div>
      )}
    </div>
  );
};

export default ResponderMap;
