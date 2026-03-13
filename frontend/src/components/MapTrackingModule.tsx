import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { io, Socket } from 'socket.io-client';
import 'leaflet.heat';
import { Activity, Thermometer, Zap, Map as MapIcon, Layers, Mountain } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  Drone as DroneItem,
  RescueTeam as TeamItem,
  Task as TaskItem,
  HazardZone as HazardItem
} from '../types';
import { translations, Language } from '../translations';

type MapData = {
  drones: DroneItem[];
  teams: TeamItem[];
  tasks: TaskItem[];
  hazards: HazardItem[];
};

type Props = {
  apiBase: string;
  theme?: 'light' | 'dark';
  onClose: () => void;
};

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

const sevWeight = (s: string) => {
  const weights: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  return weights[s] ?? 1;
};
const prioWeight = (p: string) => {
  const weights: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  return weights[p] ?? 1;
};

function createDotIcon(color: string) {
  return L.divIcon({
    className: 'custom-dot-icon',
    html: `<div style="width:16px;height:16px;border-radius:999px;background:${color};border:2px solid #fff;box-shadow:0 0 10px rgba(0,0,0,.45)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function segmentPointDistanceKm(p: [number, number], a: [number, number], b: [number, number]) {
  const avgLat = ((a[0] + b[0]) / 2) * Math.PI / 180;
  const kmLat = 111;
  const kmLng = 111 * Math.cos(avgLat);
  const ax = a[1] * kmLng; const ay = a[0] * kmLat;
  const bx = b[1] * kmLng; const by = b[0] * kmLat;
  const px = p[1] * kmLng; const py = p[0] * kmLat;
  const vx = bx - ax; const vy = by - ay;
  const wx = px - ax; const wy = py - ay;
  const c1 = vx * wx + vy * wy;
  const c2 = vx * vx + vy * vy;
  const t = c2 === 0 ? 0 : Math.max(0, Math.min(1, c1 / c2));
  const cx = ax + t * vx; const cy = ay + t * vy;
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}

function routeDistanceKm(route: [number, number][]) {
  let km = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const [aLat, aLng] = route[i];
    const [bLat, bLng] = route[i + 1];
    const dx = (bLng - aLng) * 111 * Math.cos(((aLat + bLat) / 2) * Math.PI / 180);
    const dy = (bLat - aLat) * 111;
    km += Math.sqrt(dx * dx + dy * dy);
  }
  return km;
}

export default function MapTrackingModule({ apiBase, theme: propTheme, onClose }: Props) {
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const routeNodesRef = useRef<L.CircleMarker[]>([]);
  const heatmapLayerRef = useRef<any>(null);
  const socketRef = useRef<Socket | null>(null);

  const droneMarkers = useRef(new Map<string, L.Marker>());
  const teamMarkers = useRef(new Map<string, L.Marker>());
  const taskMarkers = useRef(new Map<string, L.Marker>());
  const hazardCircles = useRef(new Map<string, L.Circle>());

  const [status, setStatus] = useState('Connecting...');
  const [data, setData] = useState<MapData>({ drones: [], teams: [], tasks: [], hazards: [] });
  const [lang] = useState<Language>(() => {
    const params = new URLSearchParams(window.location.search);
    const urlLang = params.get('lang') as Language | null;
    if (urlLang) return urlLang;
    return (localStorage.getItem('lang') as Language) || 'en';
  });
  const t = translations[lang];
  const [routeInfo, setRouteInfo] = useState(t.noRouteCalculated);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (propTheme) return propTheme;
    const params = new URLSearchParams(window.location.search);
    const urlTheme = params.get('theme') as 'light' | 'dark';
    if (urlTheme) return urlTheme;
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });
  const [mapStyle, setMapStyle] = useState<'roadmap' | 'satellite' | 'hybrid'>('roadmap');
  const [mapLayers, setMapLayers] = useState({
    drones: true,
    teams: true,
    tasks: true,
    hazards: true,
    heatmap: true,
    terrain3D: false
  });

  useEffect(() => {
    if (propTheme) setTheme(propTheme);
  }, [propTheme]);

  const openTasks = useMemo(() => data.tasks.filter((t) => t.status !== 'completed'), [data.tasks]);
  const criticalTasks = useMemo(() => openTasks.filter((t) => t.priority === 'critical').length, [openTasks]);

  const updateLiveStatus = (label: string) => {
    setStatus(`${label} (${new Date().toLocaleTimeString()})`);
  };

  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;

    const map = L.map(mapElRef.current, { zoomControl: false }).setView([11.6643, 78.1460], 13);
    mapRef.current = map;

    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ position: 'bottomright' }).addTo(map);

    // Initial tile layer (handles Strict Mode re-mounts where theme effect might not re-run)
    const tileUrl = theme === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    L.tileLayer(tileUrl, {
      maxZoom: 19,
      attribution: theme === 'dark' ? '&copy; CartoDB' : '&copy; OpenStreetMap',
    }).addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    const map = mapRef.current;
    if (!map) return;

    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) map.removeLayer(layer);
    });

    let tileUrl = '';
    let subdomains = ['a', 'b', 'c'];

    if (mapStyle === 'satellite') {
      tileUrl = 'http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';
      subdomains = ['mt0', 'mt1', 'mt2', 'mt3'];
    } else if (mapStyle === 'hybrid') {
      tileUrl = 'http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}';
      subdomains = ['mt0', 'mt1', 'mt2', 'mt3'];
    } else {
      tileUrl = theme === 'dark'
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    }

    L.tileLayer(tileUrl, {
      maxZoom: 20,
      subdomains: mapStyle === 'roadmap' ? ['a', 'b', 'c'] : subdomains,
      attribution: mapStyle === 'roadmap' ? (theme === 'dark' ? '&copy; CartoDB' : '&copy; OpenStreetMap') : '&copy; Google'
    }).addTo(map);
  }, [theme, mapStyle]);

  const pushNotification = (type: string, message: string) => {
    setStatus(`${message} (${new Date().toLocaleTimeString()})`);
  };

  const dispatchTeamToTask = async (teamId: string, taskId: string) => {
    pushNotification('INFO', t.teamAssigned);
    try {
      const res = await fetch(`${apiBase}/api/task/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: teamId, task_id: taskId })
      });
      if (res.ok) fetchData().catch(() => { });
    } catch {
      // Failed to dispatch, let standard polling eventually catch up if needed
    }
  };

  const findSafeRoute = async (autoDispatch = false) => {
    const map = mapRef.current;
    if (!map) return;
    const task = openTasks.slice().sort((a, b) => b.victim_count - a.victim_count || prioWeight(b.priority) - prioWeight(a.priority))[0];
    const teams = data.teams.filter((t) => t.status !== 'offline' && t.current_load < t.max_load);
    if (!task || teams.length === 0) {
      setRouteInfo(t.noOpenTasksOrTeams);
      return;
    }

    const buildRoute = (start: [number, number], end: [number, number]) => {
      const route: [number, number][] = [start, end];
      const hazards = [...data.hazards].sort((a, b) => sevWeight(b.severity) - sevWeight(a.severity));
      let detours = 0;
      for (const h of hazards) {
        if (detours >= 3) break;
        const radiusKm = h.radius / 1000 + 0.12;
        for (let i = 0; i < route.length - 1; i++) {
          const a = route[i];
          const b = route[i + 1];
          const riskDist = segmentPointDistanceKm([h.lat, h.lng], a, b);
          if (riskDist > radiusKm) continue;
          const midLat = (a[0] + b[0]) / 2;
          const midLng = (a[1] + b[1]) / 2;
          const kmLng = 111 * Math.cos(((a[0] + b[0]) / 2) * Math.PI / 180);
          const vx = (b[1] - a[1]) * kmLng;
          const vy = (b[0] - a[0]) * 111;
          const len = Math.sqrt(vx * vx + vy * vy) || 1;
          let px = -vy / len;
          let py = vx / len;
          const hx = (h.lng - midLng) * kmLng;
          const hy = (h.lat - midLat) * 111;
          if (hx * px + hy * py > 0) { px *= -1; py *= -1; }
          const detourKm = radiusKm + 0.2;
          route.splice(i + 1, 0, [midLat + (py * detourKm) / 111, midLng + (px * detourKm) / kmLng]);
          detours++;
          break;
        }
      }
      return route;
    };

    const candidates = teams.map((team) => {
      const route = buildRoute([team.lat, team.lng], [task.lat, task.lng]);
      const dist = routeDistanceKm(route);
      return { team, route, dist };
    }).sort((a, b) => a.dist - b.dist);

    const best = candidates[0];
    if (!best) return;

    if (routeLineRef.current) map.removeLayer(routeLineRef.current);
    routeNodesRef.current.forEach((n) => map.removeLayer(n));
    routeNodesRef.current = [];

    routeLineRef.current = L.polyline(best.route, { color: '#10b981', weight: 5, opacity: 0.92 }).addTo(map);
    best.route.slice(1, -1).forEach((pt) => {
      const node = L.circleMarker(pt, { radius: 5, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.9, weight: 2 }).addTo(map);
      routeNodesRef.current.push(node);
    });
    map.fitBounds(routeLineRef.current.getBounds(), { padding: [40, 40] });
    setRouteInfo(`${best.team.name} -> ${task.type} | ${t.distance} ${best.dist.toFixed(2)} km | ${t.etaLabel} ${Math.max(2, Math.round(best.dist * 3))} min`);

    if (autoDispatch) {
      await dispatchTeamToTask(best.team.id, task.id);
    }
  };

  const renderMapData = (next: MapData) => {
    const map = mapRef.current;
    if (!map) return;

    const sync = <T extends { id: string }, U extends L.Layer>(
      list: T[],
      store: Map<string, U>,
      create: (item: T) => U,
      update: (entity: U, item: T) => void
    ) => {
      const alive = new Set<string>();
      list.forEach((item) => {
        alive.add(item.id);
        const existing = store.get(item.id);
        if (existing) update(existing, item);
        else store.set(item.id, create(item));
      });
      [...store.keys()].forEach((id) => {
        const layer = store.get(id);
        if (!alive.has(id) && layer) {
          map.removeLayer(layer);
          store.delete(id);
        }
      });
    };

    const requestSupplyDrop = async (taskId: string) => {
      pushNotification('INFO', 'Finding drone for supply drop...');
      const availableDrones = mapRef.current ? next.drones.filter(d => 
        (d.status === 'standby' || d.status === 'active') && 
        d.capabilities?.includes('supply')
      ) : [];
      
      if (availableDrones.length === 0) {
        pushNotification('WARN', 'No supply drones available!');
        return;
      }

      // Just pick the first supply drone for simplicity
      const droneId = availableDrones[0].id;
      
      try {
        const res = await fetch(`${apiBase}/api/tasks/${taskId}/supply-drop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ drone_id: droneId })
        });
        if (res.ok) {
          pushNotification('SUCCESS', `Supply drone ${availableDrones[0].name} dispatched!`);
          fetchData().catch(() => { });
        } else {
          pushNotification('ERROR', 'Failed to dispatch supply drone.');
        }
      } catch {
        pushNotification('ERROR', 'Network error dispatching drone.');
      }
    };

    sync(next.tasks.filter((t) => t.status !== 'completed'), taskMarkers.current,
      (t) => {
        if (!mapLayers.tasks) return null as any;
        const color = t.priority === 'critical' ? '#ef4444' : t.priority === 'high' ? '#f59e0b' : '#2563eb';
        const marker = L.marker([t.lat, t.lng], { icon: createDotIcon(color) }).addTo(map);
        
        const popupDiv = document.createElement('div');
        popupDiv.innerHTML = `
          <b>${t.type}</b><br>
          Priority: ${t.priority}<br>
          Status: ${t.status}<br>
          ${t.description ? `<span style="font-size:10px;color:gray">${t.description}</span><br>` : ''}
          <button class="supply-btn mt-1 rounded bg-blue-500 px-2 py-1 text-white text-xs hover:bg-blue-600 block w-full">Request Supplies</button>
        `;
        
        const btn = popupDiv.querySelector('.supply-btn');
        if (btn) btn.addEventListener('click', () => requestSupplyDrop(t.id));
        
        return marker.bindPopup(popupDiv);
      },
      (m, t) => {
        const color = t.priority === 'critical' ? '#ef4444' : t.priority === 'high' ? '#f59e0b' : '#2563eb';
        
        const popupDiv = document.createElement('div');
        popupDiv.innerHTML = `
          <b>${t.type}</b><br>
          Priority: ${t.priority}<br>
          Status: ${t.status}<br>
          ${t.description ? `<span style="font-size:10px;color:gray">${t.description}</span><br>` : ''}
          <button class="supply-btn mt-1 rounded bg-blue-500 px-2 py-1 text-white text-xs hover:bg-blue-600 block w-full">Request Supplies</button>
        `;
        
        const btn = popupDiv.querySelector('.supply-btn');
        if (btn) btn.addEventListener('click', () => requestSupplyDrop(t.id));

        m.setLatLng([t.lat, t.lng]).setIcon(createDotIcon(color)).setPopupContent(popupDiv);
      });

    sync(next.hazards, hazardCircles.current,
      (h) => {
        if (!mapLayers.hazards) return null as any;
        const color = h.severity === 'critical' ? '#ef4444' : h.severity === 'high' ? '#f59e0b' : '#3b82f6';
        return L.circle([h.lat, h.lng], { radius: h.radius, color, fillColor: color, fillOpacity: 0.14, dashArray: '6,6' }).addTo(map);
      },
      (c, h) => {
        const color = h.severity === 'critical' ? '#ef4444' : h.severity === 'high' ? '#f59e0b' : '#3b82f6';
        c.setLatLng([h.lat, h.lng]).setRadius(h.radius).setStyle({ color, fillColor: color });
      });
  };

  const fetchData = async () => {
    const res = await fetch(`${apiBase}/api/map-data`);
    if (!res.ok) throw new Error('Map API failed');
    const next = await res.json() as MapData;
    setData(next);
    renderMapData(next);
    updateLiveStatus(t.liveViaApi);
  };

  const refreshMapData = () => {
    fetchData().catch(() => setStatus(t.refreshFailedRetrying));
  };

  return (
    <div className="fixed inset-0 z-[200] bg-white dark:bg-[#0b1220] transition-colors">
      <div
        ref={mapElRef}
        className={cn(
          "h-full w-full transition-all duration-1000",
          mapLayers.terrain3D && "perspective-[1000px] rotate-x-[20deg] scale-[1.1]"
        )}
      />

      {/* Floating Map Controls */}
      <div className="absolute top-6 left-6 z-[1001] flex flex-col gap-3">
        {/* Map Style Toggle */}
        <div className="bg-white/70 dark:bg-[#121214]/70 backdrop-blur-xl p-3 rounded-2xl border border-white/20 dark:border-white/10 shadow-2xl">
          <h3 className="text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest mb-2">Map Style</h3>
          <div className="flex gap-1">
            <button onClick={() => setMapStyle('roadmap')} className={cn("px-3 py-1 rounded-lg text-[10px] font-medium transition-all", mapStyle === 'roadmap' ? "bg-emerald-500 text-white" : "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-white/40 hover:bg-gray-200 dark:hover:bg-white/10")}>Road</button>
            <button onClick={() => setMapStyle('satellite')} className={cn("px-3 py-1 rounded-lg text-[10px] font-medium transition-all", mapStyle === 'satellite' ? "bg-emerald-500 text-white" : "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-white/40 hover:bg-gray-200 dark:hover:bg-white/10")}>Sat</button>
            <button onClick={() => setMapStyle('hybrid')} className={cn("px-3 py-1 rounded-lg text-[10px] font-medium transition-all", mapStyle === 'hybrid' ? "bg-emerald-500 text-white" : "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-white/40 hover:bg-gray-200 dark:hover:bg-white/10")}>Hybrid</button>
          </div>
        </div>

        {/* Layer Controls */}
        <div className="bg-white/70 dark:bg-[#121214]/70 backdrop-blur-xl p-3 rounded-2xl border border-white/20 dark:border-white/10 shadow-2xl">
          <h3 className="text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest mb-2">Map Layers</h3>
          <div className="flex flex-col gap-2">
            {Object.entries(mapLayers).map(([key, value]) => (
              <button
                key={key}
                onClick={() => {
                  setMapLayers(prev => ({ ...prev, [key]: !value }));
                  // Trigger re-render of map data to apply layer filtering
                  renderMapData(data);
                }}
                className={cn(
                  "flex items-center justify-between px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all",
                  value ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-white/40 hover:bg-gray-200 dark:hover:bg-white/10"
                )}
              >
                {key.replace(/([A-Z])/g, ' $1').trim()}
                <div className={cn("w-2 h-2 rounded-full", value ? "bg-emerald-500" : "bg-gray-300 dark:bg-white/10")} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Weather Widget */}
      <div className="absolute bottom-6 right-6 z-[1001] bg-white/70 dark:bg-[#121214]/70 backdrop-blur-xl p-3 rounded-2xl border border-white/20 dark:border-white/10 shadow-2xl flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Thermometer size={16} className="text-orange-400" />
          <span className="text-xs font-bold">28°C</span>
        </div>
        <div className="w-px h-4 bg-gray-200 dark:bg-white/10" />
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-blue-400" />
          <span className="text-xs font-bold">12 km/h NW</span>
        </div>
        <div className="w-px h-4 bg-gray-200 dark:bg-white/10" />
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-emerald-400" />
          <span className="text-xs font-bold tracking-tighter uppercase">Clear Skies</span>
        </div>
      </div>

      <div className="absolute left-4 top-4 z-[1000] w-[340px] rounded-xl border border-white/20 dark:border-white/20 bg-white/70 dark:bg-[#0b1220]/70 p-3 text-gray-900 dark:text-white shadow-2xl backdrop-blur-xl">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">{t.mapLiveTracking}</p>
          <button onClick={onClose} className="rounded-lg bg-gray-100 dark:bg-white/10 px-2 py-1 text-xs hover:bg-gray-200 dark:hover:bg-white/20">{t.closeLabel}</button>
        </div>
        <p className="mb-2 text-xs text-gray-500 dark:text-white/70">{status}</p>
        <div className="mb-2 grid grid-cols-4 gap-1 text-center text-xs">
          <div className="rounded bg-gray-100 dark:bg-white/10 p-1"><p className="text-[10px] text-gray-500 dark:text-white/60">{t.dronesLabel}</p><p className="font-bold">{data.drones.length}</p></div>
          <div className="rounded bg-gray-100 dark:bg-white/10 p-1"><p className="text-[10px] text-gray-500 dark:text-white/60">{t.teamsLabel}</p><p className="font-bold">{data.teams.length}</p></div>
          <div className="rounded bg-gray-100 dark:bg-white/10 p-1"><p className="text-[10px] text-gray-500 dark:text-white/60">{t.openLabel}</p><p className="font-bold">{openTasks.length}</p></div>
          <div className="rounded bg-gray-100 dark:bg-white/10 p-1"><p className="text-[10px] text-gray-500 dark:text-white/60">{t.critical}</p><p className="font-bold text-red-500 dark:text-red-400">{criticalTasks}</p></div>
        </div>
        <div className="mb-2 flex flex-col gap-1">
          <div className="flex gap-2">
            <button onClick={() => findSafeRoute(false)} className="flex-1 rounded-lg bg-blue-500 px-2 py-2 text-xs font-bold hover:bg-blue-600 text-white truncate">{t.findSafestRoute}</button>
            <button onClick={() => mapRef.current?.setView([11.6643, 78.1460], 13)} className="rounded-lg bg-gray-500 px-3 py-2 text-xs font-bold hover:bg-gray-600 text-white">{t.centerLabel}</button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => findSafeRoute(true)} className="flex-1 rounded-lg bg-orange-500 px-2 py-2 text-xs font-bold hover:bg-orange-600 text-white truncate">{t.autoDispatch}</button>
            <button onClick={refreshMapData} className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold hover:bg-emerald-600 text-white">{t.refreshLabel}</button>
          </div>
        </div>
        <div className="rounded bg-gray-100 dark:bg-white/10 p-2 text-xs text-gray-800 dark:text-white/90">{routeInfo}</div>
      </div>
    </div>
  );
}
