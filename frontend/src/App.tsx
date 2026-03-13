import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity as ActivityIcon, Map as MapIcon, Shield, Users, AlertTriangle, Navigation, Camera, Mic, CheckCircle2, Clock, Battery, Wifi, Radio, ChevronRight, Plus, LogOut, Bell, Play, Pause, Download, Sun, Moon, Route, Languages, BarChart3, PieChart, LineChart as LineChartIcon, Settings, Maximize2, Zap, Thermometer, Eye, Volume2, Package, AlertCircle, Info, ZapOff, PlaneTakeoff, Video, UserPlus, Target, MapPin, MessageSquare, Bot, Send, X, Ruler, VolumeX, Scan, Fingerprint, ShieldCheck, Lock, Hospital, Tent, Signal, WifiOff, Server, Home, PauseCircle, PlayCircle, AlertOctagon, Cpu, Gauge
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, AreaChart, Area, PieChart as RePieChart, Pie, Sector, ScatterChart, Scatter, ZAxis } from 'recharts';
import ReactECharts from 'echarts-for-react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
import L from 'leaflet';
import 'leaflet.heat';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

import { Drone, RescueTeam, Task, HazardZone, Activity, CameraSource, MissionEvent, CapturedPhoto, ReplayEvent, Facility } from './types';
import { translations, Language } from './translations';
import { chatWithAegis } from './services/aiChat';
import StandaloneMapPage from './assets/map_module';
import telemetryFallbackImg from './assets/telemetry-fallback.svg';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
function toBase64Utf8(input: string) {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}
function distanceBetweenKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const kmPerLat = 111;
  const kmPerLng = 111 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  const dx = (b.lng - a.lng) * kmPerLng;
  const dy = (b.lat - a.lat) * kmPerLat;
  return Math.sqrt(dx * dx + dy * dy);
}

const PRIORITY_COLORS = { low: 'bg-blue-500', medium: 'bg-yellow-500', high: 'bg-orange-500', critical: 'bg-red-600' };
const isLocalHost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const defaultLocalApi = isLocalHost ? 'http://localhost:3001' : '';
const API_BASE = (import.meta.env.VITE_API_URL ?? defaultLocalApi).replace(/\/$/, '');
const SOCKET_BASE = API_BASE || undefined;
const apiUrl = (path: string) => API_BASE ? `${API_BASE}${path}` : path;
type UiNotification = { id: string; type: string; message: string; createdAt: number };
type RouteCandidate = {
  teamId: string;
  teamName: string;
  taskId: string;
  taskType: string;
  distanceKm: number;
  timeMin: number;
  safetyScore: number;
  score: number;
  route: [number, number][];
};
type RoutingInfo = {
  distance: string;
  time: string;
  team: string;
  safety: string;
  route: [number, number][];
  task: string;
  victims: number;
};
type AuthUser = {
  id?: string;
  email: string;
  role: string;
  name?: string;
};
type NotificationPayload = {
  type?: string;
  message?: string;
};
type LoginResponse = {
  user: AuthUser;
};

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authStep, setAuthStep] = useState<'credentials' | 'analyzing'>('credentials');
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [drones, setDrones] = useState<Drone[]>([]);
  const [teams, setTeams] = useState<RescueTeam[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notifications, setNotifications] = useState<UiNotification[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [systemHealth, setSystemHealth] = useState({ status: 'operational', latency: 24, uptime: 0 });
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityFilter, setActivityFilter] = useState<'all' | 'drone' | 'team' | 'system' | 'battery'>('all');
  const [selectedDrone, setSelectedDrone] = useState<Drone | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'map' | 'tasks' | 'analytics' | 'drones' | 'reports' | 'settings' | 'photos'>('dashboard');
  const [isSimulating, setIsSimulating] = useState(false);
  const [triggerRoute, setTriggerRoute] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as 'light' | 'dark') || 'dark');
  const [lang, setLang] = useState<Language>(() => (localStorage.getItem('lang') as Language) || 'en');
  const [routingInfo, setRoutingInfo] = useState<RoutingInfo | null>(null);
  const [routeCandidates, setRouteCandidates] = useState<RouteCandidate[]>([]);
  const [mapStyle, setMapStyle] = useState<'roadmap' | 'satellite' | 'hybrid'>('roadmap');
  const [hazardZones, setHazardZones] = useState<HazardZone[]>([]);
  const [videoPlaying, setVideoPlaying] = useState(true);
  const [currentVideo, setCurrentVideo] = useState('flood');
  const [missionEvents, setMissionEvents] = useState<MissionEvent[]>([]);
  const [cameras, setCameras] = useState<CameraSource[]>([]);
  const [activeFeeds, setActiveFeeds] = useState<string[]>([]);
  const [mapLayers, setMapLayers] = useState({
    droneRoutes: true,
    rescueTeams: true,
    victimLocations: true,
    floodAreas: true,
    fireZones: true,
    heatmap: true,
    facilities: true,
    terrain3D: false
  });
  const [selectedCamera, setSelectedCamera] = useState<CameraSource | null>(null);
  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhoto[]>([]);
  const [replayEvents, setReplayEvents] = useState<ReplayEvent[]>([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayTime, setReplayTime] = useState(0);
  const [analyticsFilter, setAnalyticsFilter] = useState({ disasterType: 'all', zone: 'all', timeRange: '24h', droneId: 'all' });
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true);
  const [cameraMode, setCameraMode] = useState<'rgb' | 'thermal' | 'night' | 'supply' | 'voice'>('thermal');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string>('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [aiChatInput, setAiChatInput] = useState('');
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'ai', text: string }[]>([{ role: 'ai', text: 'AEGIS Command Assistant online. Awaiting orders.' }]);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiReport, setAiReport] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');

  const t = translations[lang];

  if (window.location.pathname === '/map_module') {
    return <StandaloneMapPage />;
  }

  const socketRef = useRef<Socket | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});
  const polylineRef = useRef<L.Polyline | null>(null);
  const routeWaypointRefs = useRef<L.CircleMarker[]>([]);
  const overlaysLayerRef = useRef<L.LayerGroup | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamAnimationRef = useRef<number | null>(null);
  const analyticsExportRef = useRef<HTMLDivElement>(null);
  const reportsExportRef = useRef<HTMLDivElement>(null);
  const notificationTimeoutsRef = useRef<number[]>([]);
  const [securityStatus, setSecurityStatus] = useState({ level: 'SECURE', biometrics: 'ACTIVE', ai_guard: 'ONLINE' });

  const openInNewTab = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const pushNotification = useCallback((input: NotificationPayload, ttlMs = 6000) => {
    const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const item: UiNotification = {
      id,
      type: (input.type || 'INFO').toUpperCase(),
      message: input.message || 'Notification',
      createdAt: Date.now()
    };
    setNotifications(prev => [item, ...prev].slice(0, 20));
    const timeoutId = window.setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
      notificationTimeoutsRef.current = notificationTimeoutsRef.current.filter((value) => value !== timeoutId);
    }, ttlMs);
    notificationTimeoutsRef.current.push(timeoutId);
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isAiChatOpen) scrollToBottom();
  }, [aiMessages, isAiChatOpen]);

  useEffect(() => {
    if (triggerRoute) {
      findSafestRescueRoute(false);
      setTriggerRoute(false);
    }
  }, [triggerRoute]);

  useEffect(() => {
    return () => {
      notificationTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      notificationTimeoutsRef.current = [];
    };
  }, []);

  // Initialize camera stream when a drone is selected.
  useEffect(() => {
    let localStream: MediaStream | null = null;

    const initCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera API not supported in this browser');
        }

        setCameraError('');
        setIsCameraActive(false);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          },
          audio: false
        });

        localStream = stream;
        stream.getVideoTracks().forEach((track) => {
          track.onended = () => {
            setIsCameraActive(false);
            setCameraError('Camera stream ended');
          };
        });

        setCameraStream(stream);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play()
              .then(() => setIsCameraActive(true))
              .catch((err) => {
                console.error('Play error:', err);
                setIsCameraActive(false);
                setCameraError('Unable to start camera playback');
              });
          };
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Camera not available';
        console.error('Camera error:', message);
        setCameraStream(null);
        setIsCameraActive(false);
        setCameraError(message);
      }
    };

    if (selectedDrone) {
      initCamera();
    } else {
      setIsCameraActive(false);
      setCameraStream(null);
      setCameraError('');
    }

    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
      if (streamAnimationRef.current) {
        cancelAnimationFrame(streamAnimationRef.current);
      }
    };
  }, [selectedDrone]);

  // Apply camera mode filters to canvas
  useEffect(() => {
    if (!canvasRef.current || !videoRef.current || !cameraStream || !isCameraActive) return;

    const applyFilters = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      // Check if video is ready to draw
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
        streamAnimationRef.current = requestAnimationFrame(applyFilters);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Set canvas size to match video dimensions
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      // Draw video frame
      try {
        ctx.drawImage(video, 0, 0);

        // Apply mode-specific filters
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        switch (cameraMode) {
          case 'thermal':
            // Convert to thermal (grayscale to heat map)
            for (let i = 0; i < data.length; i += 4) {
              const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
              data[i] = Math.min(255, gray + 80); // Red channel
              data[i + 1] = Math.max(0, gray - 40); // Green channel
              data[i + 2] = Math.max(0, gray - 100); // Blue channel
            }
            break;

          case 'night':
            // Night vision (green monochrome with brightness boost)
            for (let i = 0; i < data.length; i += 4) {
              const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
              const boosted = Math.min(255, gray * 1.8);
              data[i] = 0; // Red
              data[i + 1] = boosted; // Green
              data[i + 2] = boosted * 0.6; // Blue
            }
            break;

          case 'supply':
            // Supply drop view (blue overlay with contrast)
            for (let i = 0; i < data.length; i += 4) {
              const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
              data[i] = gray * 0.4;
              data[i + 1] = gray * 0.7;
              data[i + 2] = Math.min(255, gray * 1.2);
            }
            break;

          case 'voice':
            // Voice relay (purple hue)
            for (let i = 0; i < data.length; i += 4) {
              const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
              data[i] = Math.min(255, gray * 0.8 + 60);
              data[i + 1] = gray * 0.3;
              data[i + 2] = Math.min(255, gray * 1.1);
            }
            break;

          case 'rgb':
            // Normal RGB - no filter
            break;
        }

        ctx.putImageData(imageData, 0, 0);
      } catch (err) {
        console.error('Canvas draw error:', err);
      }

      streamAnimationRef.current = requestAnimationFrame(applyFilters);
    };

    if (cameraStream && isCameraActive) {
      streamAnimationRef.current = requestAnimationFrame(applyFilters);
    }

    return () => {
      if (streamAnimationRef.current) {
        cancelAnimationFrame(streamAnimationRef.current);
      }
    };
  }, [cameraMode, cameraStream, isCameraActive]);

  // Generate fallback camera feed SVG based on mode
  const getCameraFeedSrc = () => {
    const modes: Record<typeof cameraMode, { gradient: string, overlay: string }> = {
      thermal: { gradient: 'from-red-950 via-orange-900 to-yellow-900', overlay: 'thermal' },
      night: { gradient: 'from-cyan-950 via-green-950 to-emerald-950', overlay: 'night' },
      supply: { gradient: 'from-slate-900 via-blue-900 to-cyan-900', overlay: 'supply' },
      voice: { gradient: 'from-purple-950 via-indigo-900 to-blue-900', overlay: 'voice' },
      rgb: { gradient: 'from-gray-900 via-slate-800 to-gray-900', overlay: 'rgb' }
    };
    const seed = selectedDrone?.id || 'default';
    const mode = modes[cameraMode];

    // Generate SVG data URL for realistic camera feed effect
    const svg = `
      <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="glow" cx="50%" cy="50%" r="60%">
            <stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.1" />
            <stop offset="100%" style="stop-color:#000000;stop-opacity:0.3" />
          </radialGradient>
          <filter id="noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" result="noise" />
            <feColorMatrix in="noise" type="saturate" values="0.5" />
          </filter>
        </defs>
        ${cameraMode === 'thermal'
        ? `<rect width="1280" height="720" fill="url(#thermalBg)"/>
               <defs>
                 <linearGradient id="thermalBg" x1="0%" y1="0%" x2="100%" y2="100%">
                   <stop offset="0%" style="stop-color:#1a0000"/>
                   <stop offset="50%" style="stop-color:#ff6600;stop-opacity:0.6"/>
                   <stop offset="100%" style="stop-color:#ffaa00"/>
                 </linearGradient>
               </defs>
               <circle cx="400" cy="300" r="150" fill="#ff3300" opacity="0.7"/>
               <circle cx="800" cy="400" r="120" fill="#ff6600" opacity="0.6"/>
               <circle cx="900" cy="200" r="80" fill="#ffaa00" opacity="0.5"/>
               <text x="50" y="50" font-size="16" fill="#00ff00" font-family="monospace">THERMAL MODE | TEMP: 245°C</text>
               <text x="50" y="680" font-size="12" fill="#00ff00" font-family="monospace">HEAT SIGNATURE DETECTED</text>`
        : cameraMode === 'night'
          ? `<rect width="1280" height="720" fill="#0a1628"/>
               <circle cx="640" cy="360" r="400" fill="url(#nightGlow)" opacity="0.9"/>
               <defs>
                 <radialGradient id="nightGlow">
                   <stop offset="0%" style="stop-color:#00ff7f;stop-opacity:0.4" />
                   <stop offset="100%" style="stop-color:#0077ff;stop-opacity:0"/>
                 </radialGradient>
               </defs>
               <rect x="200" y="150" width="600" height="400" fill="none" stroke="#00ff7f" stroke-width="2" opacity="0.7" />
               <text x="50" y="50" font-size="16" fill="#00ff7f" font-family="monospace">NIGHT VISION | GAIN: MAX</text>
               <text x="50" y="680" font-size="12" fill="#00ff7f" font-family="monospace">LOW-LIGHT ENVIRONMENT DETECTED</text>`
          : cameraMode === 'supply'
            ? `<rect width="1280" height="720" fill="#1a2633"/>
               <circle cx="640" cy="360" r="300" fill="#3366ff" opacity="0.3"/>
               <rect x="400" y="200" width="200" height="250" fill="#ff6600" opacity="0.8"/>
               <path d="M 500 200 L 560 100 L 620 200" fill="#ffaa00" opacity="0.7"/>
               <text x="50" y="50" font-size="16" fill="#66ffff" font-family="monospace">SUPPLY DROP CAM | PAYLOAD: 2.5kg</text>
               <text x="50" y="680" font-size="12" fill="#66ffff" font-family="monospace">DEPLOYMENT ALTITUDE: 120m</text>`
            : cameraMode === 'voice'
              ? `<rect width="1280" height="720" fill="#1a0f2e"/>
               <circle cx="400" cy="200" r="80" fill="none" stroke="#ff00ff" stroke-width="2" opacity="0.8" />
               <circle cx="400" cy="200" r="100" fill="none" stroke="#ff00ff" stroke-width="1" opacity="0.5" />
               <circle cx="400" cy="200" r="120" fill="none" stroke="#ff00ff" stroke-width="1" opacity="0.3" />
               <rect x="100" y="400" width="1080" height="150" fill="#1a3f5c" stroke="#00ff88" stroke-width="2"/>
               <text x="50" y="50" font-size="16" fill="#ff00ff" font-family="monospace">VOICE RELAY | SIGNAL: STRONG</text>
               <text x="50" y="480" font-size="12" fill="#00ff88" font-family="monospace">TWO-WAY FIELD COMMUNICATIONS ACTIVE</text>`
              : `<rect width="1280" height="720" fill="#0f0f0f"/>
               <image href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1280' height='720'%3E%3Crect fill='%23111'/%3E%3C/svg%3E" width="1280" height="720"/>
               <text x="50" y="50" font-size="16" fill="#888" font-family="monospace">RGB MODE | LIVE STREAM</text>`
      }
        <rect width="1280" height="720" fill="url(#glow)" />
        <rect width="1280" height="720" fill="url(#noise)" opacity="0.03" />
      </svg>
    `;
    return `data:image/svg+xml;base64,${toBase64Utf8(svg)}`;
  };

  const getGeneratedPhotoSrc = (seed: string, label: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    const hueA = hash % 360;
    const hueB = (hueA + 40) % 360;
    const heatX = 180 + (hash % 700);
    const heatY = 140 + ((hash >> 3) % 360);
    const svg = `
      <svg width="800" height="600" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="hsl(${hueA}, 55%, 18%)"/>
            <stop offset="100%" stop-color="hsl(${hueB}, 65%, 12%)"/>
          </linearGradient>
        </defs>
        <rect width="800" height="600" fill="url(#bg)"/>
        <circle cx="${heatX}" cy="${heatY}" r="95" fill="rgba(239,68,68,0.45)"/>
        <circle cx="${heatX + 120}" cy="${heatY + 70}" r="55" fill="rgba(245,158,11,0.45)"/>
        <rect x="20" y="20" width="760" height="560" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>
        <text x="36" y="52" font-size="20" fill="#E2E8F0" font-family="monospace">RESCUE CAMERA SNAPSHOT</text>
        <text x="36" y="82" font-size="15" fill="#94A3B8" font-family="monospace">${label}</text>
      </svg>
    `;
    return `data:image/svg+xml;base64,${toBase64Utf8(svg)}`;
  };

  const getLiveFeedFallbackSrc = (cam: CameraSource) => {
    const quality = cam.signal ? `Signal ${Math.round(cam.signal)}%` : 'Signal Stable';
    return getGeneratedPhotoSrc(`${cam.id}-${cameraMode}-${Math.floor(Date.now() / 15000)}`, `${cam.name} | ${quality}`);
  };

  const getFeedContext = (cam: CameraSource) => {
    const nearbyTasks = tasks.filter((task) => distanceBetweenKm({ lat: cam.lat, lng: cam.lng }, { lat: task.lat, lng: task.lng }) <= 1.5);
    const nearbyHazards = hazardZones.filter((hazard) => distanceBetweenKm({ lat: cam.lat, lng: cam.lng }, { lat: hazard.lat, lng: hazard.lng }) <= 1.5);
    const linkedPhotos = capturedPhotos.filter((photo) => photo.source === cam.name).length;
    const priorityScore = { critical: 4, high: 3, medium: 2, low: 1 } as const;
    const topTask = nearbyTasks
      .slice()
      .sort((a, b) => priorityScore[b.priority] - priorityScore[a.priority])[0];

    return {
      nearbyTasks,
      nearbyHazards,
      linkedPhotos,
      topTask,
    };
  };

  const addNextFeed = () => {
    setActiveFeeds((prev) => {
      const next = cameras.find((camera) => !prev.includes(camera.id));
      if (!next || prev.length >= 4) return prev;
      return [...prev, next.id];
    });
  };

  const removeFeed = (cameraId: string) => {
    setActiveFeeds((prev) => prev.filter((id) => id !== cameraId));
    setSelectedCamera((prev) => (prev?.id === cameraId ? null : prev));
  };
  const selectedFeedContext = selectedCamera ? getFeedContext(selectedCamera) : null;


  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('lang', lang);
  }, [lang]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      // Simulate Drone Battery Drain and Movement
      setDrones(prev => prev.map(d => {
        const newBattery = Math.max(0, d.battery - 0.1);
        if (newBattery < 20 && d.battery >= 20) {
          pushNotification({ type: 'ALERT', message: `${d.name}: ${t.droneBatteryLow}` }, 7000);
        }
        return {
          ...d,
          battery: newBattery,
          lat: d.lat + (Math.random() - 0.5) * 0.001,
          lng: d.lng + (Math.random() - 0.5) * 0.001,
        };
      }));

      // Simulate Team Movement
      setTeams(prev => prev.map(team => {
        if (team.status === 'busy') {
          return {
            ...team,
            lat: team.lat + (Math.random() - 0.5) * 0.0005,
            lng: team.lng + (Math.random() - 0.5) * 0.0005,
          };
        }
        return team;
      }));
    }, 5000);
    return () => clearInterval(interval);
  }, [user, lang, pushNotification, t.droneBatteryLow]);

  useEffect(() => {
    if (!isReplaying) return;
    const interval = setInterval(() => {
      setReplayTime(prev => {
        if (prev >= 100) {
          setIsReplaying(false);
          pushNotification({ type: 'INFO', message: 'Mission Replay Completed' }, 5000);
          return 0;
        }
        return prev + 1;
      });
    }, 500);
    return () => clearInterval(interval);
  }, [isReplaying, pushNotification]);

  useEffect(() => {
    if (!autoCaptureEnabled || !user) return;
    const interval = setInterval(() => {
      if (Math.random() > 0.8) {
        const randomCam = cameras[Math.floor(Math.random() * cameras.length)];
        if (randomCam) capturePhoto(randomCam);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [autoCaptureEnabled, user, cameras]);

  useEffect(() => {
    if (!user) return;

    // Initial activities
    setActivities([
      { id: '1', type: 'system', title: 'System Booted', description: 'Disaster management system initialized successfully.', timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(), status: 'success', icon: 'Shield' },
      { id: '2', type: 'drone', title: 'Drone DR-101 Launched', description: 'Surveillance mission started in Salem North.', timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(), status: 'info', icon: 'PlaneTakeoff' },
      { id: '3', type: 'team', title: 'Team Alpha Dispatched', description: 'Heading to Flood Zone A for victim extraction.', timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(), status: 'warning', icon: 'Users' }
    ]);

    setMissionEvents([
      { id: '1', time: '08:00', event: 'Drone DR-101 Launched', type: 'launch' },
      { id: '2', time: '08:15', event: 'Victims Detected in Sector 4', type: 'detection' },
      { id: '3', time: '08:20', event: 'Rescue Team Alpha Dispatched', type: 'dispatch' }
    ]);

    setCameras([
      { id: 'c1', name: 'Drone DR-101', type: 'drone', url: 'https://www.youtube.com/embed/21X5lGlDOfg', status: 'online', lat: 11.6640, lng: 78.1450, battery: 85, signal: 92, location_name: 'Sector 4' },
      { id: 'c2', name: 'Team Alpha Bodycam', type: 'bodycam', url: 'https://www.youtube.com/embed/live_stream?channel=UC4R8DWoMoI7CAwX8_LjQHig', status: 'online', lat: 11.6620, lng: 78.1430, signal: 78, location_name: 'Flood Zone A' },
      { id: 'c3', name: 'CCTV Salem North', type: 'cctv', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', status: 'online', lat: 11.6680, lng: 78.1500, location_name: 'Main Junction' },
      { id: 'c4', name: 'Satellite View', type: 'satellite', url: 'https://www.youtube.com/embed/21X5lGlDOfg', status: 'online', lat: 11.6650, lng: 78.1480, location_name: 'Regional Overview' }
    ]);

    setCapturedPhotos([
      { id: 'p1', url: getGeneratedPhotoSrc('flood1', 'Flood Zone B'), location: { lat: 11.6640, lng: 78.1450 }, source: 'Drone DR-101', timestamp: '12:42 PM', zone: 'Flood Zone B', detectionLabel: 'Victim Detected', confidence: 92, droneId: 'DR-101' },
      { id: 'p2', url: getGeneratedPhotoSrc('fire1', 'Fire Area'), location: { lat: 11.6660, lng: 78.1470 }, source: 'Drone DR-102', timestamp: '12:50 PM', zone: 'Fire Area', detectionLabel: 'Fire Hotspot', confidence: 88, droneId: 'DR-102' },
      { id: 'p3', url: getGeneratedPhotoSrc('rescue1', 'Flood Zone A'), location: { lat: 11.6620, lng: 78.1430 }, source: 'Team Alpha Bodycam', timestamp: '01:05 PM', zone: 'Flood Zone A', detectionLabel: 'Rescue in Progress', confidence: 95, teamId: 'T1' }
    ]);

    setReplayEvents([
      { id: 'r1', timestamp: '10:05', type: 'launch', description: 'Drone DR-101 launched from base', location: { lat: 11.6643, lng: 78.1460 } },
      { id: 'r2', timestamp: '10:10', type: 'scan', description: 'Flood area Sector 4 scan initiated', location: { lat: 11.6640, lng: 78.1450 } },
      { id: 'r3', timestamp: '10:12', type: 'detection', description: 'Victim detected in Sector 4', location: { lat: 11.6640, lng: 78.1450 }, metadata: { confidence: 92 } },
      { id: 'r4', timestamp: '10:15', type: 'dispatch', description: 'Rescue Team Alpha dispatched', location: { lat: 11.6620, lng: 78.1430 } },
      { id: 'r5', timestamp: '10:25', type: 'rescue', description: 'Victim rescued successfully', location: { lat: 11.6640, lng: 78.1450 } }
    ]);

    setActiveFeeds(['c1', 'c2']);

    const interval = setInterval(() => {
      const types: Activity['type'][] = ['drone', 'team', 'system', 'battery'];
      const type = types[Math.floor(Math.random() * types.length)];

      let newActivity: Activity;
      const id = Math.random().toString(36).substr(2, 9);
      const now = new Date().toISOString();

      switch (type) {
        case 'drone':
          const droneEvents = [
            { title: 'Drone Detected Victims', desc: 'Drone DR-101 identified 4 victims in Sector 7.', status: 'critical' as const, icon: 'Users' },
            { title: 'Camera Mode Switched', desc: 'Drone DR-102 switched to Thermal Imaging.', status: 'info' as const, icon: 'Video' },
            { title: 'Drone Reached Waypoint', desc: 'Drone DR-103 arrived at target coordinates.', status: 'success' as const, icon: 'MapPin' }
          ];
          const dEv = droneEvents[Math.floor(Math.random() * droneEvents.length)];
          newActivity = { id, type, title: dEv.title, description: dEv.desc, timestamp: now, status: dEv.status, icon: dEv.icon };
          break;
        case 'team':
          const teamEvents = [
            { title: 'Team Reached Location', desc: 'Team Beta arrived at the extraction point.', status: 'success' as const, icon: 'Target' },
            { title: 'Rescue Mission Started', desc: 'Team Gamma initiated victim recovery.', status: 'info' as const, icon: 'ActivityIcon' },
            { title: 'Team Emergency Request', desc: 'Team Delta requires additional medical supplies.', status: 'critical' as const, icon: 'AlertTriangle' }
          ];
          const tEv = teamEvents[Math.floor(Math.random() * teamEvents.length)];
          newActivity = { id, type, title: tEv.title, description: tEv.desc, timestamp: now, status: tEv.status, icon: tEv.icon };
          break;
        case 'battery':
          const batEvents = [
            { title: 'Drone Battery Low', desc: 'Drone DR-101 battery at 18%. Returning to base.', status: 'warning' as const, icon: 'Battery' },
            { title: 'Drone Battery Critical', desc: 'Drone DR-104 battery at 5%. Emergency landing initiated.', status: 'critical' as const, icon: 'ZapOff' }
          ];
          const bEv = batEvents[Math.floor(Math.random() * batEvents.length)];
          newActivity = { id, type, title: bEv.title, description: bEv.desc, timestamp: now, status: bEv.status, icon: bEv.icon };
          break;
        default:
          const sysEvents = [
            { title: 'AI Analysis Completed', desc: 'Sector 4 scan finished. No new victims detected.', status: 'success' as const, icon: 'Shield' },
            { title: 'Route Calculated', desc: 'Safest path for Team Alpha updated.', status: 'info' as const, icon: 'Route' },
            { title: 'Weather Alert', desc: 'Wind speeds increasing. Caution advised for drone flight.', status: 'warning' as const, icon: 'AlertCircle' }
          ];
          const sEv = sysEvents[Math.floor(Math.random() * sysEvents.length)];
          newActivity = { id, type, title: sEv.title, description: sEv.desc, timestamp: now, status: sEv.status, icon: sEv.icon };
      }

      setActivities(prev => [newActivity, ...prev].slice(0, 50));
    }, 5000);

    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [mapRes, nRes] = await Promise.all([
        isOfflineMode ? Promise.resolve({ ok: true, json: () => ({}) } as any) : fetch(apiUrl('/api/map-data')),
        isOfflineMode ? Promise.resolve({ ok: true, json: () => [] } as any) : fetch(apiUrl('/api/notifications'))
      ]);

      if (isOfflineMode) return; // Skip updating from API if offline

      const mapData = await mapRes.json();
      setDrones(mapData.drones ?? []);
      setTeams(mapData.teams ?? []);
      setTasks(mapData.tasks ?? []);
      setHazardZones(mapData.hazards ?? []);
      setFacilities(mapData.facilities ?? []);
      const existing = await nRes.json();
      if (Array.isArray(existing)) {
        existing.slice(0, 5).forEach((n: NotificationPayload, idx: number) => {
          pushNotification({ type: n?.type, message: n?.message }, 8000 + idx * 500);
        });
      }
    };
    fetchData();

    if (!isOfflineMode) {
      socketRef.current = io(SOCKET_BASE, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000
      });
      socketRef.current.on('drones_update', (data: Drone[]) => setDrones(data));
      socketRef.current.on('teams_update', (data: RescueTeam[]) => setTeams(data));
      socketRef.current.on('tasks_update', (data: Task[]) => setTasks(data));
    }

    socketRef.current.on('task_updated', (task: Task) => {
      setTasks(prev => {
        const idx = prev.findIndex(t => t.id === task.id);
        return idx >= 0 ? prev.map(t => t.id === task.id ? task : t) : [task, ...prev];
      });
    });
    socketRef.current.on('notification', (n: NotificationPayload) => pushNotification(n, 7000));

    return () => { 
      if (socketRef.current) socketRef.current.disconnect(); 
    };
  }, [user, pushNotification, isOfflineMode]);

  // Fallback polling to keep live map tracking working even if websocket stalls.
  useEffect(() => {
    if (!user || isOfflineMode) return;
    const interval = setInterval(async () => {
      try {
        const [mapRes, healthRes] = await Promise.all([
          fetch(apiUrl('/api/map-data')),
          fetch(apiUrl('/api/system/health'))
        ]);
        if (!mapRes.ok) return;
        const mapData = await mapRes.json();
        setDrones(mapData.drones ?? []);
        setTeams(mapData.teams ?? []);
        setTasks(mapData.tasks ?? []);
        setHazardZones(mapData.hazards ?? []);
        setFacilities(mapData.facilities ?? []);
        
        if (healthRes.ok) {
          const health = await healthRes.json();
          setSystemHealth(health);
        }
      } catch {
        // Ignore transient polling failures.
      }
    }, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, [user, isOfflineMode]);

  useEffect(() => {
    if (activeTab !== 'map' || !mapContainerRef.current || mapInstanceRef.current) return;

    const salemCoords: [number, number] = [11.6643, 78.1460];
    const map = L.map(mapContainerRef.current, { zoomControl: false }).setView(salemCoords, 14);
    mapInstanceRef.current = map;

    L.control.zoom({ position: 'topright' }).addTo(map);

    // Initial tile layer
    const tileUrl = theme === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    L.tileLayer(tileUrl, {
      maxZoom: 19,
      attribution: theme === 'dark' ? '&copy; CartoDB' : '&copy; OpenStreetMap'
    }).addTo(map);

    // Initialize layer group for overlays (hazards/heatmap)
    const overlays = L.layerGroup().addTo(map);
    overlaysLayerRef.current = overlays;

    // Fix intermittent blank map when mounted inside a just-activated tab.
    setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      overlaysLayerRef.current = null;
      markersRef.current = {};
      polylineRef.current = null;
      routeWaypointRefs.current = [];
    };
  }, [activeTab]);

  // Handle Theme Changes (Tile Layer)
  useEffect(() => {
    if (activeTab !== 'map' || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    map.eachLayer(layer => {
      if (layer instanceof L.TileLayer) map.removeLayer(layer);
    });

    const tileUrl = theme === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    L.tileLayer(tileUrl, {
      maxZoom: 19,
      attribution: theme === 'dark' ? '&copy; CartoDB' : '&copy; OpenStreetMap'
    }).addTo(map);
  }, [activeTab, theme]);

  // Handle Overlays (Hazards & Heatmap)
  useEffect(() => {
    if (activeTab !== 'map' || !overlaysLayerRef.current) return;
    const overlays = overlaysLayerRef.current;

    overlays.clearLayers();

    // Heatmap
    const heatData: [number, number, number][] = tasks.map(tk => [tk.lat, tk.lng, tk.victim_count * 0.5]);
    if (heatData.length > 0 && mapLayers.heatmap) {
      (L as any).heatLayer(heatData, { radius: 25, blur: 15, max: 1.0 }).addTo(overlays);
    }

    // Hazard Zones
    if (mapLayers.floodAreas || mapLayers.fireZones) {
      hazardZones.forEach(zone => {
        if ((zone.type === 'flood' && !mapLayers.floodAreas) || (zone.type === 'fire' && !mapLayers.fireZones)) return;
        const color = zone.severity === 'critical' ? '#ef4444' : zone.severity === 'high' ? '#f59e0b' : '#3b82f6';
        L.circle([zone.lat, zone.lng], {
          radius: zone.radius,
          color: color,
          fillColor: color,
          fillOpacity: 0.2,
          dashArray: '5, 5'
        }).addTo(overlays).bindPopup(`<b>Hazard: ${zone.type.replace('_', ' ')}</b><br>Severity: ${zone.severity}`);
      });
    }
  }, [activeTab, tasks, hazardZones, mapLayers]);

  useEffect(() => {
    if (activeTab !== 'map' || !mapInstanceRef.current) return;
    setTimeout(() => mapInstanceRef.current?.invalidateSize(), 100);
  }, [activeTab]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Update Drones
    const activeDroneIds = new Set<string>();
    if (mapLayers.droneRoutes) {
      drones.forEach(drone => {
        activeDroneIds.add(drone.id);
        if (markersRef.current[drone.id]) {
          markersRef.current[drone.id].setLatLng([drone.lat, drone.lng]);
        } else {
          const icon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="width: 22px; height: 22px; border-radius: 9999px; background: #0b1220; border: 2px solid #3b82f6; box-shadow: 0 0 10px rgba(59,130,246,0.45); display: flex; align-items: center; justify-content: center;"><svg width="12" height="12" viewBox="0 0 24 24" fill="#3b82f6"><path d="M2 12L22 3l-8 19-2-7-10-3z"/></svg></div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11]
          });
          const marker = L.marker([drone.lat, drone.lng], { icon }).addTo(map)
            .bindPopup(`<b>${drone.name}</b><br>Battery: ${Math.round(drone.battery)}%`)
            .on('click', () => setSelectedDrone(drone));
          markersRef.current[drone.id] = marker;
        }
      });
    }
    Object.keys(markersRef.current)
      .filter(id => id.startsWith('DR-') && !activeDroneIds.has(id))
      .forEach(id => {
        map.removeLayer(markersRef.current[id]);
        delete markersRef.current[id];
      });

    // Update Teams
    const activeTeamIds = new Set<string>();
    if (mapLayers.rescueTeams) {
      teams.forEach(team => {
        activeTeamIds.add(team.id);
        if (markersRef.current[team.id]) {
          markersRef.current[team.id].setLatLng([team.lat, team.lng]);
        } else {
          const icon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="width: 22px; height: 22px; border-radius: 6px; background: #0f172a; border: 2px solid #10b981; box-shadow: 0 0 10px rgba(16,185,129,0.45); display: flex; align-items: center; justify-content: center;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.8" stroke-linecap="round"><path d="M12 4v16"/><path d="M4 12h16"/></svg></div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11]
          });
          const marker = L.marker([team.lat, team.lng], { icon }).addTo(map)
            .bindPopup(`<span style="font-size:13px;font-weight:600;">${team.name}</span><br>Status: ${team.status}`);
          markersRef.current[team.id] = marker;
        }
      });
    }
    Object.keys(markersRef.current)
      .filter(id => id.startsWith('T-') && !activeTeamIds.has(id))
      .forEach(id => {
        map.removeLayer(markersRef.current[id]);
        delete markersRef.current[id];
      });

    // Update Tasks
    const activeTaskIds = new Set<string>();
    if (mapLayers.victimLocations) {
      tasks.filter(t => t.status !== 'completed').forEach(task => {
        activeTaskIds.add(task.id);
        if (markersRef.current[task.id]) {
          markersRef.current[task.id]
            .setLatLng([task.lat, task.lng])
            .bindPopup(`<b>${task.type}</b><br>Victims: ${task.victim_count}<br>Status: ${task.status}`);
        } else {
          const color = task.priority === 'critical' ? '#ef4444' : task.priority === 'high' ? '#f59e0b' : '#3b82f6';
          const icon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="width: 26px; height: 34px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.4));"><svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg"><path d="M12 31C12 31 22 19.5 22 12C22 6.477 17.523 2 12 2C6.477 2 2 6.477 2 12C2 19.5 12 31 12 31Z" fill="${color}" stroke="#FFFFFF" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="#FFFFFF"/></svg></div>`,
            iconSize: [26, 34],
            iconAnchor: [13, 34]
          });
          const marker = L.marker([task.lat, task.lng], { icon }).addTo(map)
            .bindPopup(`<b>${task.type}</b><br>Victims: ${task.victim_count}`);
          markersRef.current[task.id] = marker;
        }
      });
    }
    Object.keys(markersRef.current)
      .filter(id => (id.startsWith('TASK-') || id.startsWith('SAMPLE-TASK-')) && !activeTaskIds.has(id))
      .forEach(id => {
        map.removeLayer(markersRef.current[id]);
        delete markersRef.current[id];
      });

    // Update Cameras
    cameras.forEach(cam => {
      const id = `cam-${cam.id}`;
      if (!markersRef.current[id]) {
        const color = cam.type === 'drone' ? '#3b82f6' : cam.type === 'bodycam' ? '#10b981' : cam.type === 'cctv' ? '#f59e0b' : '#8b5cf6';
        const icon = L.divIcon({
          className: 'custom-div-icon',
          html: `<div style="background-color: ${color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        });
        const marker = L.marker([cam.lat, cam.lng], { icon }).addTo(map)
          .bindPopup(`<b>Camera: ${cam.name}</b><br>Type: ${cam.type}<br>Status: ${cam.status}`)
          .on('click', () => setSelectedCamera(cam));
        markersRef.current[id] = marker;
      }
    });

    // Update Photos
    capturedPhotos.forEach(photo => {
      const id = `photo-${photo.id}`;
      if (!markersRef.current[id]) {
        const icon = L.divIcon({
          className: 'custom-div-icon',
          html: `<div style="background-color: #3b82f6; width: 16px; height: 16px; border-radius: 4px; border: 2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });
        const marker = L.marker([photo.location.lat, photo.location.lng], { icon }).addTo(map)
          .bindPopup(`<b>Photo: ${photo.source}</b><br>${photo.timestamp}<br><img src="${photo.url}" style="width: 100px; border-radius: 4px; margin-top: 4px;">`);
        markersRef.current[id] = marker;
      }
    });

    // Update Facilities
    if (mapLayers.facilities) {
      facilities.forEach(fac => {
        const id = `fac-${fac.id}`;
        if (!markersRef.current[id]) {
          const color = fac.type === 'hospital' ? '#ef4444' : '#3b82f6';
          const icon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="background-color: white; width: 20px; height: 20px; border-radius: 6px; border: 2px solid ${color}; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${fac.type === 'hospital' ? '<path d="M12 4v16M4 12h16"/>' : '<path d="M2 20h20"/><path d="M12 4l10 16H2z"/>'}</svg></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });
          const marker = L.marker([fac.lat, fac.lng], { icon }).addTo(map)
            .bindPopup(`<b>${fac.name}</b><br>Type: ${fac.type}<br>Capacity: ${fac.occupied}/${fac.capacity}`);
          markersRef.current[id] = marker;
        }
      });
    }
  }, [drones, teams, tasks, cameras, capturedPhotos, mapLayers]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      // Update Mission Timeline
      const events = [
        { event: 'Drone DR-102 switched to Thermal Camera', type: 'progress' as const },
        { event: 'AI Detection: 3 victims found in Sector 9', type: 'detection' as const },
        { event: 'Team Beta reached victim location', type: 'progress' as const },
        { event: 'Rescue Mission Alpha Completed', type: 'complete' as const }
      ];
      const ev = events[Math.floor(Math.random() * events.length)];
      setMissionEvents(prev => [{ id: Math.random().toString(), time: format(new Date(), 'HH:mm'), ...ev }, ...prev].slice(0, 10));

      // Update Camera Status/Positions
      setCameras(prev => prev.map(c => ({
        ...c,
        lat: c.lat + (Math.random() - 0.5) * 0.0002,
        lng: c.lng + (Math.random() - 0.5) * 0.0002,
        battery: c.battery !== undefined ? Math.max(0, c.battery - 0.05) : undefined,
        signal: Math.min(100, Math.max(0, (c.signal || 90) + (Math.random() - 0.5) * 5))
      })));
    }, 10000);
    return () => clearInterval(interval);
  }, [user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginForm.email.trim().toLowerCase(),
          password: loginForm.password.trim()
        })
      });

      if (res.ok) {
        const payload = await res.json() as LoginResponse;
        setAuthStep('analyzing');
        setTimeout(() => {
          setUser(payload.user);
          setAuthStep('credentials');
          pushNotification({ type: 'INFO', message: `Welcome back, Commander ${payload.user.name || ''}. AI Systems Online.` }, 5000);
        }, 2500);
        return;
      }

      if (res.status === 401) {
        alert("Invalid credentials. Try admin@test.com / 123456");
        return;
      }

      alert(`Login failed (${res.status}). Ensure backend is running on http://localhost:3001`);
    } catch {
      alert("Cannot reach backend. Ensure it is running on http://localhost:3001 via 'npm run dev:backend'");
    }
  };

  const handleAiSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!aiChatInput.trim() || isAiProcessing) return;

    const userMsg = aiChatInput;
    setAiChatInput('');
    setAiMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsAiProcessing(true);

    const context = JSON.stringify({
      activeDrones: drones.map(d => ({ name: d.name, battery: d.battery, status: d.status })),
      activeTeams: teams.map(t => ({ name: t.name, status: t.status, load: `${t.current_load}/${t.max_load}` })),
      pendingTasks: tasks.filter(t => t.status !== 'completed').map(t => ({ type: t.type, priority: t.priority, victims: t.victim_count })),
      hazards: hazardZones.map(h => ({ type: h.type, severity: h.severity })),
      recentAlerts: notifications.slice(0, 3).map(n => n.message)
    });

    const response = await chatWithAegis(context, userMsg);
    setAiMessages(prev => [...prev, { role: 'ai', text: response }]);
    setIsAiProcessing(false);
  };

  const generateMissionReport = async () => {
    setIsAiProcessing(true);
    const context = JSON.stringify({
      missionDuration: '4h 32m',
      tasksCompleted: tasks.filter(t => t.status === 'completed').length,
      activeIncidents: tasks.filter(t => t.status !== 'completed').length,
      drones: drones.length,
      teams: teams.length,
      majorEvents: missionEvents.slice(0, 10)
    });
    const response = await chatWithAegis(context, "Generate a formal tactical mission summary report based on these stats.");
    setAiReport(response);
    setIsAiProcessing(false);
  };

  const handleScanAndRescue = async () => {
    const drone = selectedDrone || drones.find(d => d.status === 'active') || drones[0];
    if (!drone) {
      pushNotification({ type: 'ALERT', message: 'No active drones available for scanning.' });
      return;
    }

    setIsSimulating(true);
    pushNotification({ type: 'INFO', message: `Scanning sector with ${drone.name}...` }, 2000);

    await fetch(apiUrl('/api/simulate/detection'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drone_id: drone.id })
    });
    setTimeout(() => {
      setIsSimulating(false);
      pushNotification({ type: 'SUCCESS', message: 'Victims detected! Calculating optimal path...' }, 3000);
      setTriggerRoute(true);
    }, 2000);
  };

  const completeTask = async (id: string) => {
    await fetch(apiUrl(`/api/tasks/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' })
    });
  };

  const capturePhoto = (source: CameraSource) => {
    const id = `p${Date.now()}`;
    const newPhoto: CapturedPhoto = {
      id,
      url: getGeneratedPhotoSrc(id, source.location_name),
      location: { lat: source.lat, lng: source.lng },
      source: source.name,
      timestamp: format(new Date(), 'hh:mm a'),
      zone: source.location_name,
      detectionLabel: Math.random() > 0.5 ? 'Victim Detected' : 'Flood Area',
      confidence: Math.floor(Math.random() * 20) + 80,
      droneId: source.type === 'drone' ? source.id : undefined,
      teamId: source.type === 'bodycam' ? source.id : undefined
    };
    setCapturedPhotos(prev => [newPhoto, ...prev]);
    pushNotification({ type: 'PHOTO', message: `Photo captured from ${source.name}` }, 6000);

    // Add to mission timeline
    setMissionEvents(prev => [{
      id: Math.random().toString(),
      time: format(new Date(), 'HH:mm'),
      event: `Photo captured from ${source.name}`,
      type: 'progress'
    }, ...prev]);
  };

  const exportElementToPDF = async (
    element: HTMLElement | null,
    filename: string,
    options?: {
      orientation?: 'p' | 'l';
      forceDark?: boolean;
      variant?: 'analytics' | 'default';
    }
  ) => {
    if (!element) {
      pushNotification({ type: 'ALERT', message: 'Nothing available to export' }, 5000);
      return;
    }

    try {
      const isAnalyticsExport = options?.variant === 'analytics';
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: options?.forceDark ? '#050505' : theme === 'dark' ? '#0A0A0B' : '#F8FAFC',
        windowWidth: Math.max(document.documentElement.clientWidth, element.scrollWidth),
        windowHeight: Math.max(document.documentElement.clientHeight, element.scrollHeight),
        onclone: (clonedDoc) => {
          if (options?.forceDark) {
            clonedDoc.documentElement.classList.add('dark');
          }

          if (isAnalyticsExport) {
            const analyticsRoot = clonedDoc.getElementById('analytics-dashboard');
            if (analyticsRoot) {
              analyticsRoot.style.background = '#050505';
              analyticsRoot.style.padding = '24px';
              analyticsRoot.style.borderRadius = '28px';
              analyticsRoot.style.color = '#ffffff';
              analyticsRoot.style.width = `${Math.max(element.scrollWidth, 1600)}px`;
            }

            clonedDoc.querySelectorAll<HTMLElement>('[data-export-card="analytics"]').forEach((card) => {
              card.style.background = '#050505';
              card.style.border = '1px solid rgba(255,255,255,0.08)';
              card.style.boxShadow = 'none';
              card.style.backdropFilter = 'none';
              card.style.color = '#ffffff';
            });
          }
        },
      });

      const pdf = new jsPDF(options?.orientation ?? 'p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(filename);
      pushNotification({ type: 'SUCCESS', message: 'PDF Export Complete' }, 5000);
    } catch (error) {
      console.error('Failed to export PDF:', error);
      pushNotification({ type: 'ALERT', message: 'Failed to export PDF' }, 5000);
    }
  };

  const exportAnalyticsToPDF = async () => {
    await exportElementToPDF(analyticsExportRef.current, 'aegis-analytics-report.pdf', {
      orientation: 'l',
      forceDark: true,
      variant: 'analytics',
    });
  };

  const exportAnalyticsToCSV = () => {
    try {
      const summaryRows = [
        ['section', 'metric', 'value'],
        ['summary', 'active_drones', drones.length],
        ['summary', 'teams_deployed', teams.filter((team) => team.status === 'busy').length],
        ['summary', 'victims_detected', tasks.reduce((acc, task) => acc + task.victim_count, 0)],
        ['summary', 'victims_rescued', tasks.filter((task) => task.status === 'completed').reduce((acc, task) => acc + task.victim_count, 0)],
      ];

      const droneRows = [
        ['section', 'id', 'name', 'status', 'battery', 'lat', 'lng', 'altitude', 'speed'],
        ...drones.map((drone) => [
          'drone',
          drone.id,
          drone.name,
          drone.status,
          Math.round(drone.battery),
          drone.lat,
          drone.lng,
          drone.altitude,
          drone.speed,
        ]),
      ];

      const teamRows = [
        ['section', 'id', 'name', 'status', 'specialty', 'current_load', 'max_load', 'lat', 'lng'],
        ...teams.map((team) => [
          'team',
          team.id,
          team.name,
          team.status,
          team.specialty,
          team.current_load,
          team.max_load,
          team.lat,
          team.lng,
        ]),
      ];

      const taskRows = [
        ['section', 'id', 'type', 'priority', 'status', 'victim_count', 'assigned_team_id', 'drone_id', 'created_at'],
        ...tasks.map((task) => [
          'task',
          task.id,
          task.type,
          task.priority,
          task.status,
          task.victim_count,
          task.assigned_team_id ?? '',
          task.drone_id,
          task.created_at,
        ]),
      ];

      const hazardRows = [
        ['section', 'id', 'type', 'severity', 'radius', 'lat', 'lng'],
        ...hazardZones.map((hazard) => [
          'hazard',
          hazard.id,
          hazard.type,
          hazard.severity,
          hazard.radius,
          hazard.lat,
          hazard.lng,
        ]),
      ];

      const allRows = [
        ...summaryRows,
        [],
        ...droneRows,
        [],
        ...teamRows,
        [],
        ...taskRows,
        [],
        ...hazardRows,
      ];

      const csv = allRows
        .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `aegis-analytics-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      pushNotification({ type: 'SUCCESS', message: 'Analytics CSV Downloaded' }, 5000);
    } catch (error) {
      console.error('Failed to export analytics CSV:', error);
      pushNotification({ type: 'ALERT', message: 'Failed to export analytics CSV' }, 5000);
    }
  };

  const exportReportSummaryToPDF = async () => {
    await exportElementToPDF(reportsExportRef.current, 'aegis-rescue-report.pdf');
  };

  const priorityRank = (priority: Task['priority']) => ({ critical: 4, high: 3, medium: 2, low: 1 }[priority] ?? 0);
  const severityWeight = (severity: HazardZone['severity']) => ({ critical: 4, high: 3, medium: 2, low: 1 }[severity] ?? 1);

  const segmentPointDistanceKm = (
    p: [number, number],
    a: [number, number],
    b: [number, number]
  ) => {
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
  };

  const routeDistanceKm = (route: [number, number][]) => {
    let km = 0;
    for (let i = 0; i < route.length - 1; i++) {
      const [aLat, aLng] = route[i];
      const [bLat, bLng] = route[i + 1];
      const dx = (bLng - aLng) * 111 * Math.cos(((aLat + bLat) / 2) * Math.PI / 180);
      const dy = (bLat - aLat) * 111;
      km += Math.sqrt(dx * dx + dy * dy);
    }
    return km;
  };

  const buildSafeRoute = (start: [number, number], end: [number, number]) => {
    const route: [number, number][] = [start, end];
    const sortedHazards = [...hazardZones].sort((a, b) => severityWeight(b.severity as HazardZone['severity']) - severityWeight(a.severity as HazardZone['severity']));
    const maxDetours = 3;
    let detours = 0;

    for (const hazard of sortedHazards) {
      if (detours >= maxDetours) break;
      const radiusKm = (hazard.radius / 1000) + 0.12;

      for (let i = 0; i < route.length - 1; i++) {
        const a = route[i];
        const b = route[i + 1];
        const riskDist = segmentPointDistanceKm([hazard.lat, hazard.lng], a, b);
        if (riskDist > radiusKm) continue;

        const midLat = (a[0] + b[0]) / 2;
        const midLng = (a[1] + b[1]) / 2;
        const avgLatRad = ((a[0] + b[0]) / 2) * Math.PI / 180;
        const kmLng = 111 * Math.cos(avgLatRad);
        const vx = (b[1] - a[1]) * kmLng;
        const vy = (b[0] - a[0]) * 111;
        const len = Math.sqrt(vx * vx + vy * vy) || 1;
        let px = -vy / len;
        let py = vx / len;

        const hx = (hazard.lng - midLng) * kmLng;
        const hy = (hazard.lat - midLat) * 111;
        if (hx * px + hy * py > 0) {
          px *= -1;
          py *= -1;
        }

        const detourKm = radiusKm + 0.2;
        const detourLat = midLat + (py * detourKm) / 111;
        const detourLng = midLng + (px * detourKm) / kmLng;
        route.splice(i + 1, 0, [detourLat, detourLng]);
        detours++;
        break;
      }
    }

    return route;
  };

  const routeHazardPenalty = (route: [number, number][]) => {
    let penalty = 0;
    for (let i = 0; i < route.length - 1; i++) {
      const a = route[i];
      const b = route[i + 1];
      for (const zone of hazardZones) {
        const dist = segmentPointDistanceKm([zone.lat, zone.lng], a, b);
        const radiusKm = zone.radius / 1000;
        if (dist < radiusKm * 1.4) {
          const overlap = Math.max(0, radiusKm * 1.4 - dist);
          penalty += overlap * 20 * severityWeight(zone.severity as HazardZone['severity']);
        }
      }
    }
    return penalty;
  };

  const dispatchTeamToTask = async (teamId: string, taskId: string) => {
    const res = await fetch(apiUrl(`/api/tasks/${taskId}/dispatch`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_id: teamId })
    });
    if (!res.ok) {
      pushNotification({ type: 'ALERT', message: 'Dispatch failed. Team may be at capacity.' }, 6000);
      return false;
    }
    pushNotification({ type: 'DISPATCH', message: 'Best team dispatched successfully.' }, 6000);
    return true;
  };

  const broadcastRescueAlert = () => {
    const pending = tasks.filter(task => task.status !== 'completed').length;
    pushNotification({ type: 'ALERT', message: `Mass rescue alert sent to all units. Open tasks: ${pending}` }, 7000);
    setMissionEvents(prev => [{
      id: Math.random().toString(),
      time: format(new Date(), 'HH:mm'),
      event: `Mass rescue alert broadcast (${pending} active tasks)`,
      type: 'dispatch'
    }, ...prev]);
  };

  const findSafestRescueRoute = async (autoDispatch = false) => {
    if (tasks.length === 0 || teams.length === 0 || !mapInstanceRef.current) return;

    const openTasks = tasks
      .filter(task => task.status !== 'completed')
      .sort((a, b) => b.victim_count - a.victim_count || priorityRank(b.priority) - priorityRank(a.priority));
    const targetTask = openTasks[0];
    if (!targetTask) return;

    const availableTeams = teams.filter(team => team.status !== 'offline' && team.current_load < team.max_load);
    if (availableTeams.length === 0) {
      pushNotification({ type: 'ALERT', message: 'No rescue teams currently available.' }, 6000);
      return;
    }

    const candidates: RouteCandidate[] = availableTeams.map(team => {
      const route = buildSafeRoute([team.lat, team.lng], [targetTask.lat, targetTask.lng]);
      const distanceKm = routeDistanceKm(route);
      const hazardPenalty = routeHazardPenalty(route);
      const loadPenalty = (team.current_load / Math.max(1, team.max_load)) * 4;
      const score = distanceKm + hazardPenalty + loadPenalty;
      const safetyScore = Math.max(0, Math.min(100, 100 - hazardPenalty * 4 - distanceKm * 2));
      return {
        teamId: team.id,
        teamName: team.name,
        taskId: targetTask.id,
        taskType: targetTask.type,
        distanceKm,
        timeMin: Math.max(2, Math.round(distanceKm * 3)),
        safetyScore,
        score,
        route
      };
    }).sort((a, b) => a.score - b.score);

    setRouteCandidates(candidates.slice(0, 3));

    const best = candidates[0];
    const safetyLevel = best.safetyScore >= 75 ? t.high : best.safetyScore >= 45 ? t.medium : t.low;
    setRoutingInfo({
      distance: `${best.distanceKm.toFixed(1)} km`,
      time: `${best.timeMin} minutes`,
      team: best.teamName,
      safety: safetyLevel,
      route: best.route,
      task: targetTask.type,
      victims: targetTask.victim_count
    });

    if (polylineRef.current) polylineRef.current.remove();
    routeWaypointRefs.current.forEach(marker => marker.remove());
    routeWaypointRefs.current = [];

    const polyline = L.polyline(best.route, {
      color: '#10b981',
      weight: 5,
      opacity: 0.92
    }).addTo(mapInstanceRef.current);

    if (best.route.length > 2) {
      best.route.slice(1, -1).forEach(point => {
        const wp = L.circleMarker(point, {
          radius: 5,
          color: '#f59e0b',
          fillColor: '#f59e0b',
          fillOpacity: 0.9,
          weight: 2
        }).addTo(mapInstanceRef.current!);
        routeWaypointRefs.current.push(wp);
      });
    }

    polyline.bindPopup(`
      <div class="text-xs text-white p-2">
        <b class="text-emerald-400">${best.teamName}</b> → <b>${targetTask.type}</b><br/>
        Distance: ${best.distanceKm.toFixed(1)} km<br/>
        Est. Time: ${best.timeMin} mins<br/>
        Safety Score: <span class="text-emerald-400 font-bold">${Math.round(best.safetyScore)}/100</span>
      </div>
    `).openPopup();

    polylineRef.current = polyline;
    mapInstanceRef.current.fitBounds(polyline.getBounds(), { padding: [80, 80] });

    setMissionEvents(prev => [{
      id: Math.random().toString(),
      time: format(new Date(), 'HH:mm'),
      event: `Shortest-safe route computed for ${best.teamName}`,
      type: 'dispatch'
    }, ...prev].slice(0, 12));

    if (autoDispatch) {
      await dispatchTeamToTask(best.teamId, best.taskId);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#050505] flex items-center justify-center p-4 transition-colors bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-500/20 via-slate-50 to-slate-100 dark:from-emerald-900/20 dark:via-[#050505] dark:to-[#050505]">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md bg-white/70 dark:bg-[#121214]/70 backdrop-blur-2xl border border-white/20 dark:border-white/10 rounded-[2rem] p-10 shadow-2xl shadow-emerald-500/10">
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-3xl flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/30 ring-4 ring-white/50 dark:ring-white/5">
              {authStep === 'credentials' && <Shield className="text-white" size={32} />}
              {authStep === 'analyzing' && <Scan className="text-white animate-pulse" size={32} />}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">AEGIS RESCUE</h1>
            <p className="text-gray-500 dark:text-white/40 text-sm font-medium uppercase tracking-widest text-[10px] mt-1">
              {authStep === 'credentials' ? 'Disaster Management System' : 'Verifying Biometrics...'}
            </p>
          </div>
          
          {authStep === 'credentials' && (
            <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs text-gray-500 dark:text-white/40 uppercase tracking-widest mb-1.5 block">{t.emailAddress}</label>
              <input type="email" value={loginForm.email} onChange={e => setLoginForm(prev => ({ ...prev, email: e.target.value }))} className="w-full bg-gray-50/50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-2xl px-5 py-4 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" placeholder="admin@test.com" required />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-white/40 uppercase tracking-widest mb-1.5 block">{t.passwordLabel}</label>
              <input type="password" value={loginForm.password} onChange={e => setLoginForm(prev => ({ ...prev, password: e.target.value }))} className="w-full bg-gray-50/50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-2xl px-5 py-4 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" placeholder="••••••••" required />
            </div>
            <button type="submit" className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-500/25 transition-all active:scale-[0.98] mt-2">{t.signInCommandCenter}</button>
            </form>
          )}

          {authStep === 'analyzing' && (
            <div className="space-y-6 text-center">
              <div className="relative h-2 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 2, ease: "easeInOut" }}
                  className="absolute h-full bg-emerald-500"
                />
              </div>
              <div className="flex flex-col gap-2 items-center">
                <p className="text-sm font-mono text-gray-600 dark:text-white/70">Scanning retinal patterns...</p>
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}/>
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}/>
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}/>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-white/5 text-center">
            <p className="text-xs text-gray-400 dark:text-white/20">{t.prototypeMode} • {t.noHardwareRequired}</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-main text-main font-sans selection:bg-emerald-500/30 transition-colors">
      <nav className="fixed left-0 top-0 bottom-0 w-24 bg-white/70 dark:bg-[#121214]/70 backdrop-blur-2xl border-r border-main flex flex-col items-center py-8 gap-8 z-50 transition-colors">
        <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20"><Shield className="text-white" size={24} /></div>
        <div className="flex flex-col gap-4">
          <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<BarChart3 size={20} />} label={t.dashboard} />
          <NavButton active={activeTab === 'drones'} onClick={() => setActiveTab('drones')} icon={<Navigation size={20} />} label={t.liveMonitoring} />
          <NavButton active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} icon={<ActivityIcon size={20} />} label={t.rescueOps} />
          <NavButton active={activeTab === 'map'} onClick={() => setActiveTab('map')} icon={<MapIcon size={20} />} label={t.mapTracking} />
          <NavButton active={activeTab === 'analytics'} onClick={() => setActiveTab('analytics')} icon={<PieChart size={20} />} label={t.analytics} />
          <NavButton active={activeTab === 'photos'} onClick={() => setActiveTab('photos')} icon={<Camera size={20} />} label={t.photoGallery} />
          <NavButton active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} icon={<Download size={20} />} label={t.reports} />
          <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings size={20} />} label={t.settings} />
        </div>
        <div className="mt-auto flex flex-col gap-4">
          <button onClick={() => setUser(null)} className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center hover:bg-red-500/20 hover:text-red-500 dark:hover:text-red-400 transition-colors text-gray-400 dark:text-white/40"><LogOut size={18} /></button>
        </div>
      </nav>

      <main className="pl-24 min-h-screen bg-main transition-colors">
        <header className="h-24 border-b border-main flex items-center justify-between px-10 bg-white/50 dark:bg-[#050505]/50 backdrop-blur-xl sticky top-0 z-40 transition-colors">
          <div>
            <h1 className="text-2xl font-bold tracking-tight uppercase bg-gradient-to-r from-gray-900 to-gray-500 dark:from-white dark:to-gray-500 bg-clip-text text-transparent">{t.appTitle}</h1>
            <p className="text-xs text-gray-500 dark:text-white/40 uppercase tracking-widest mt-0.5">{t.roleLabel}: {user.role} • {t.simulatedEnvironment}</p>
          </div>
          <div className="flex items-center gap-6">
            {isOfflineMode && (
              <div className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2 animate-pulse">
                <WifiOff size={14} className="text-amber-500" />
                <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Offline Mode</span>
              </div>
            )}
            <div className="flex items-center gap-2 bg-white/50 dark:bg-white/5 p-1.5 rounded-2xl border border-gray-200/50 dark:border-white/10 backdrop-blur-sm">
              <button onClick={() => setLang('en')} className={cn("px-2 py-1 text-[10px] rounded-lg transition-all", lang === 'en' ? "bg-emerald-500 text-white" : "text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white")}>EN</button>
              <button onClick={() => setLang('ta')} className={cn("px-2 py-1 text-[10px] rounded-lg transition-all", lang === 'ta' ? "bg-emerald-500 text-white" : "text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white")}>TA</button>
              <button onClick={() => setLang('hi')} className={cn("px-2 py-1 text-[10px] rounded-lg transition-all", lang === 'hi' ? "bg-emerald-500 text-white" : "text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white")}>HI</button>
            </div>
            <button
              onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
              className="w-12 h-12 rounded-2xl bg-white/50 dark:bg-white/5 border border-gray-200/50 dark:border-white/10 flex items-center justify-center hover:bg-white/80 dark:hover:bg-white/10 transition-all text-gray-500 dark:text-white/60 hover:text-gray-900 dark:hover:text-white backdrop-blur-sm"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="relative">
              <button
                onClick={() => setIsNotifOpen(prev => !prev)}
                className="relative p-2 text-gray-400 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition-colors"
                aria-label="Toggle notifications"
              >
                <Bell size={20} />
                {notifications.length > 0 && <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />}
              </button>
              <AnimatePresence>
                {isNotifOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    className="absolute right-0 mt-2 w-[360px] bg-white dark:bg-[#121214] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[120]"
                  >
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
                      <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-white/50">{t.notificationsTitle}</p>
                      <button onClick={() => setNotifications([])} className="text-[10px] text-gray-400 dark:text-white/40 hover:text-gray-900 dark:hover:text-white uppercase tracking-widest">{t.clearLabel}</button>
                    </div>

                    {/* Flight Controls & Diagnostics */}
                    <div className="grid grid-cols-1 gap-8 mb-8 xl:grid-cols-2">
                      <div className="space-y-4">
                        <h4 className="text-xs font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest">Flight Control</h4>
                        <div className="bg-white/50 dark:bg-white/5 p-6 rounded-3xl border border-gray-200 dark:border-white/5 grid grid-cols-2 gap-4">
                          <button onClick={() => pushNotification({ type: 'INFO', message: `${selectedDrone.name}: RTH Protocol Initiated` })} className="flex flex-col items-center justify-center p-4 rounded-2xl bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/10 hover:border-blue-500/30 transition-all group">
                            <Home size={24} className="text-blue-500 mb-2 group-hover:scale-110 transition-transform"/>
                            <span className="text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400">Return Home</span>
                          </button>
                          <button onClick={() => pushNotification({ type: 'INFO', message: `${selectedDrone.name}: Holding Position` })} className="flex flex-col items-center justify-center p-4 rounded-2xl bg-orange-500/5 hover:bg-orange-500/10 border border-orange-500/10 hover:border-orange-500/30 transition-all group">
                            <PauseCircle size={24} className="text-orange-500 mb-2 group-hover:scale-110 transition-transform"/>
                            <span className="text-[10px] font-bold uppercase text-orange-600 dark:text-orange-400">Hover</span>
                          </button>
                          <button onClick={() => pushNotification({ type: 'INFO', message: `${selectedDrone.name}: Resuming Waypoint Mission` })} className="flex flex-col items-center justify-center p-4 rounded-2xl bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 hover:border-emerald-500/30 transition-all group">
                            <PlayCircle size={24} className="text-emerald-500 mb-2 group-hover:scale-110 transition-transform"/>
                            <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">Resume</span>
                          </button>
                          <button onClick={() => pushNotification({ type: 'ALERT', message: `${selectedDrone.name}: Emergency Landing!` })} className="flex flex-col items-center justify-center p-4 rounded-2xl bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 hover:border-red-500/30 transition-all group">
                            <AlertOctagon size={24} className="text-red-500 mb-2 group-hover:scale-110 transition-transform"/>
                            <span className="text-[10px] font-bold uppercase text-red-600 dark:text-red-400">Land Now</span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-xs font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest">System Diagnostics</h4>
                        <div className="bg-white/50 dark:bg-white/5 p-6 rounded-3xl border border-gray-200 dark:border-white/5 space-y-3">
                          <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500"><Cpu size={16} /></div>
                              <div><p className="text-xs font-bold">Avionics Core</p><p className="text-[10px] text-gray-500 dark:text-white/40">CPU Load: {Math.floor(Math.random() * 20) + 10}%</p></div>
                            </div>
                            <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"/><span className="text-[10px] font-bold text-emerald-500 uppercase">Nominal</span></div>
                          </div>
                          <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500"><Gauge size={16} /></div>
                              <div><p className="text-xs font-bold">Propulsion</p><p className="text-[10px] text-gray-500 dark:text-white/40">RPM: 4200 Stable</p></div>
                            </div>
                            <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"/><span className="text-[10px] font-bold text-emerald-500 uppercase">Nominal</span></div>
                          </div>
                          <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500"><Navigation size={16} /></div>
                              <div><p className="text-xs font-bold">GPS / GNSS</p><p className="text-[10px] text-gray-500 dark:text-white/40">Satellites: {Math.floor(Math.random() * 5) + 12} Locked</p></div>
                            </div>
                            <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"/><span className="text-[10px] font-bold text-emerald-500 uppercase">Locked</span></div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <p className="px-4 py-6 text-sm text-gray-400 dark:text-white/40">{t.noNewNotifications}</p>
                      ) : (
                        notifications.slice(0, 8).map((n) => (
                          <div key={n.id} className="px-4 py-3 border-b border-gray-100 dark:border-white/5 last:border-b-0 flex items-start gap-3">
                            <div className={cn("mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center", n.type === 'ALERT' ? "bg-red-500/20 text-red-400" : "bg-emerald-500/20 text-emerald-400")}>
                              {n.type === 'ALERT' ? <AlertTriangle size={14} /> : <Bell size={14} />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-white/40">{n.type}</p>
                              <p className="text-sm text-gray-900 dark:text-white leading-snug break-words">{n.message}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="flex items-center gap-4 text-gray-500 dark:text-white/60 font-mono text-sm"><Clock size={16} /> {format(new Date(), 'HH:mm:ss')}</div>
          </div>
        </header>

        <div className="p-10">
          {activeTab === 'dashboard' && (
            <div className="grid grid-cols-12 gap-8">
              <div className="col-span-12 grid grid-cols-4 gap-6">
                <StatCard label="Total Rescues" value={tasks.filter(t => t.status === 'completed').length} icon={<CheckCircle2 className="text-emerald-400" />} trend="+12%" />
                <StatCard label="Active Tasks" value={tasks.filter(t => t.status !== 'completed').length} icon={<ActivityIcon className="text-orange-400" />} trend="-5%" />
                <StatCard label="Victims Detected" value={tasks.reduce((acc, t) => acc + t.victim_count, 0)} icon={<Users className="text-blue-400" />} trend="+24%" />
                <StatCard label="Active Drones" value={drones.filter(d => d.status === 'active').length} icon={<Navigation className="text-purple-400" />} trend="Stable" />
                <StatCard label="Security Level" value={securityStatus.level} icon={<ShieldCheck className="text-emerald-400" />} trend="Safe" />
              </div>

              <div className="col-span-8 flex flex-col gap-6">
                <div className="bg-white/60 dark:bg-[#121214]/60 backdrop-blur-xl rounded-[2rem] border border-white/20 dark:border-white/5 p-8 flex flex-col h-[600px] transition-colors shadow-xl shadow-slate-200/50 dark:shadow-black/50">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-bold">Recent Activity Feed</h3>
                      <div className="flex items-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-400 dark:text-white/40 uppercase font-bold">Drone Events:</span>
                          <span className="text-[10px] text-emerald-400 font-bold">{activities.filter(a => a.type === 'drone').length}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-400 dark:text-white/40 uppercase font-bold">Rescue Missions:</span>
                          <span className="text-[10px] text-blue-400 font-bold">{activities.filter(a => a.type === 'team').length}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-400 dark:text-white/40 uppercase font-bold">System Alerts:</span>
                          <span className="text-[10px] text-orange-400 font-bold">{activities.filter(a => a.type === 'system').length}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {(['all', 'drone', 'team', 'system', 'battery'] as const).map(f => (
                        <button
                          key={f}
                          onClick={() => setActivityFilter(f)}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all border",
                            activityFilter === f
                              ? "bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                              : "bg-white/50 dark:bg-white/5 border-gray-200 dark:border-white/5 text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/10"
                          )}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar relative">
                    <div className="absolute left-[21px] top-4 bottom-4 w-0.5 bg-gray-100 dark:bg-white/5" />
                    <AnimatePresence initial={false}>
                      {activities
                        .filter(a => activityFilter === 'all' || a.type === activityFilter)
                        .map((activity) => (
                          <motion.div
                            key={activity.id}
                            initial={{ opacity: 0, x: -20, height: 0 }}
                            animate={{ opacity: 1, x: 0, height: 'auto' }}
                            exit={{ opacity: 0, x: 20 }}
                            className={cn(
                              "relative pl-12 group",
                              activity.status === 'critical' && "animate-pulse"
                            )}
                          >
                            <div className={cn(
                              "absolute left-0 top-1 w-11 h-11 rounded-full border-4 border-white dark:border-[#121214] flex items-center justify-center z-10 transition-all",
                              activity.status === 'info' && "bg-blue-500/20 text-blue-400",
                              activity.status === 'success' && "bg-emerald-500/20 text-emerald-400",
                              activity.status === 'warning' && "bg-orange-500/20 text-orange-400",
                              activity.status === 'critical' && "bg-red-500/20 text-red-400 scale-110 shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                            )}>
                              {activity.icon === 'PlaneTakeoff' && <PlaneTakeoff size={18} />}
                              {activity.icon === 'Users' && <Users size={18} />}
                              {activity.icon === 'Video' && <Video size={18} />}
                              {activity.icon === 'MapPin' && <MapPin size={18} />}
                              {activity.icon === 'Target' && <Target size={18} />}
                              {activity.icon === 'ActivityIcon' && <ActivityIcon size={18} />}
                              {activity.icon === 'AlertTriangle' && <AlertTriangle size={18} />}
                              {activity.icon === 'Battery' && <Battery size={18} />}
                              {activity.icon === 'ZapOff' && <ZapOff size={18} />}
                              {activity.icon === 'Shield' && <Shield size={18} />}
                              {activity.icon === 'Route' && <Route size={18} />}
                              {activity.icon === 'AlertCircle' && <AlertCircle size={18} />}
                            </div>

                            <div className={cn(
                              "bg-white/50 dark:bg-[#1f2937] border rounded-2xl p-4 transition-all hover:bg-white/80 dark:hover:bg-[#2d3748]",
                              activity.status === 'critical' ? "border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.1)]" : "border-white/40 dark:border-white/5"
                            )}>
                              <div className="flex justify-between items-start mb-1">
                                <h4 className="text-sm font-bold text-gray-900 dark:text-white">{activity.title}</h4>
                                <span className="text-[10px] text-gray-400 dark:text-white/30 font-mono">{format(new Date(activity.timestamp), 'HH:mm:ss')}</span>
                              </div>
                              <p className="text-xs text-gray-600 dark:text-white/60 mb-3">{activity.description}</p>

                              <div className="flex gap-2">
                                <button onClick={() => setActiveTab('map')} className="px-3 py-1.5 bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm border border-gray-200 dark:border-transparent">
                                  <MapIcon size={12} /> View on Map
                                </button>
                                {activity.type === 'drone' && (
                                  <button onClick={() => { setActiveTab('drones'); setSelectedDrone(drones[0]); }} className="px-3 py-1.5 bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm border border-gray-200 dark:border-transparent">
                                    <Video size={12} /> Open Drone Feed
                                  </button>
                                )}
                                {activity.type === 'team' && (
                                  <button onClick={() => setActiveTab('tasks')} className="px-3 py-1.5 bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm border border-gray-200 dark:border-transparent">
                                    <ActivityIcon size={12} /> View Mission
                                  </button>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        ))}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              <div className="col-span-4 space-y-6 flex flex-col">
                <div className="bg-white/60 dark:bg-[#121214]/60 backdrop-blur-xl rounded-[2rem] border border-white/20 dark:border-white/5 p-8 transition-colors shadow-xl shadow-slate-200/50 dark:shadow-black/50">
                  <h3 className="text-lg font-bold mb-6">{t.systemStatus}</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500 dark:text-white/60">Drones Online</span>
                      <span className="text-sm font-bold text-emerald-400">{drones.length} / 6</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500 dark:text-white/60">Teams Active</span>
                      <span className="text-sm font-bold text-blue-400">{teams.filter(t => t.status === 'busy').length} / {teams.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500 dark:text-white/60">Network Latency</span>
                      <span className="text-sm font-bold text-emerald-400">24ms</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white/60 dark:bg-[#121214]/60 backdrop-blur-xl rounded-[2rem] border border-white/20 dark:border-white/5 p-8 transition-colors shadow-xl shadow-slate-200/50 dark:shadow-black/50">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2"><Server size={18} className="text-blue-400"/> Reliability Center</h3>
                  <div className="grid grid-cols-2 gap-4">
                     <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                       <p className="text-[10px] uppercase text-emerald-600 dark:text-emerald-400 font-bold">API Uptime</p>
                       <p className="text-xl font-bold text-gray-900 dark:text-white">99.98%</p>
                     </div>
                     <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
                       <p className="text-[10px] uppercase text-blue-600 dark:text-blue-400 font-bold">Latency</p>
                       <p className="text-xl font-bold text-gray-900 dark:text-white">{systemHealth.latency}ms</p>
                     </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-[2rem] p-8 text-white shadow-xl shadow-emerald-500/30 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:scale-150 transition-transform duration-700" />
                  <h3 className="text-lg font-bold mb-2">{t.readyForDeployment}</h3>
                  <p className="text-xs text-white/80 mb-4">All systems are operational. Rescue teams are on standby.</p>
                  <button onClick={() => setActiveTab('map')} className="w-full py-3 bg-white text-emerald-500 rounded-xl text-xs font-bold hover:bg-white/90 transition-all">
                    {t.goToMapTracking}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Floating AI Assistant Button */}
          <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-4">
            <AnimatePresence>
              {isAiChatOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="bg-white dark:bg-[#121214] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl w-[350px] overflow-hidden flex flex-col mb-2"
                >
                  <div className="bg-emerald-600 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white">
                      <Bot size={20} />
                      <span className="font-bold text-sm uppercase tracking-wider">Aegis AI Assistant</span>
                    </div>
                    <button onClick={() => setIsAiChatOpen(false)} className="text-white/80 hover:text-white"><X size={18} /></button>
                  </div>
                  <div className="h-[300px] overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-[#0A0A0B]">
                    {aiMessages.map((msg, idx) => (
                      <div key={idx} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                        <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed", msg.role === 'user' ? "bg-emerald-500 text-white rounded-tr-none" : "bg-white dark:bg-[#1f2937] text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-white/5 rounded-tl-none")}>
                          {msg.text}
                        </div>
                      </div>
                    ))}
                    {isAiProcessing && <div className="flex justify-start"><div className="bg-white dark:bg-[#1f2937] rounded-2xl rounded-tl-none px-4 py-2 text-xs text-gray-500 animate-pulse">Processing tactical data...</div></div>}
                    <div ref={messagesEndRef} />
                  </div>
                  <form onSubmit={handleAiSubmit} className="p-3 bg-white dark:bg-[#121214] border-t border-gray-200 dark:border-white/5 flex gap-2">
                    <input
                      value={aiChatInput}
                      onChange={e => setAiChatInput(e.target.value)}
                      placeholder="Ask status or tactical advice..."
                      className="flex-1 bg-gray-100 dark:bg-white/5 border-none rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 outline-none text-gray-900 dark:text-white"
                    />
                    <button type="submit" disabled={isAiProcessing} className="p-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 disabled:opacity-50"><Send size={16} /></button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
            <button onClick={() => setIsAiChatOpen(prev => !prev)} className="h-14 w-14 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 flex items-center justify-center transition-all hover:scale-105 active:scale-95">
              {isAiChatOpen ? <X size={28} /> : <MessageSquare size={28} />}
            </button>
          </div>

          {activeTab === 'map' && (
            <div className="flex flex-col gap-6 h-[calc(100vh-120px)]">
              {/* Map Statistics Dashboard */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white/60 dark:bg-[#121214]/60 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-2xl p-4 flex items-center gap-4 transition-colors shadow-lg shadow-slate-200/20 dark:shadow-black/20">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400"><Navigation size={20} /></div>
                  <div><p className="text-[10px] text-gray-500 dark:text-white/40 uppercase font-bold tracking-wider">Active Drones</p><p className="text-xl font-bold">{drones.length}</p></div>
                </div>
                <div className="bg-white/60 dark:bg-[#121214]/60 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-2xl p-4 flex items-center gap-4 transition-colors shadow-lg shadow-slate-200/20 dark:shadow-black/20">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400"><Users size={20} /></div>
                  <div><p className="text-[10px] text-gray-500 dark:text-white/40 uppercase font-bold tracking-wider">Teams Deployed</p><p className="text-xl font-bold">{teams.filter(t => t.status === 'busy').length}</p></div>
                </div>
                <div className="bg-white/60 dark:bg-[#121214]/60 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-2xl p-4 flex items-center gap-4 transition-colors shadow-lg shadow-slate-200/20 dark:shadow-black/20">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-400"><AlertTriangle size={20} /></div>
                  <div><p className="text-[10px] text-gray-500 dark:text-white/40 uppercase font-bold tracking-wider">Victims Detected</p><p className="text-xl font-bold">{tasks.reduce((acc, t) => acc + t.victim_count, 0)}</p></div>
                </div>
                <div className="bg-white/60 dark:bg-[#121214]/60 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-2xl p-4 flex items-center gap-4 transition-colors shadow-lg shadow-slate-200/20 dark:shadow-black/20">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400"><CheckCircle2 size={20} /></div>
                  <div><p className="text-[10px] text-gray-500 dark:text-white/40 uppercase font-bold tracking-wider">Victims Rescued</p><p className="text-xl font-bold">{tasks.filter(t => t.status === 'completed').reduce((acc, t) => acc + t.victim_count, 0)}</p></div>
                </div>
                <div className="bg-white/60 dark:bg-[#121214]/60 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-2xl p-4 flex items-center gap-4 transition-colors shadow-lg shadow-slate-200/20 dark:shadow-black/20 col-span-4 flex justify-between">
                   <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400"><Hospital size={20} /></div>
                    <div><p className="text-[10px] text-gray-500 dark:text-white/40 uppercase font-bold tracking-wider">Hospitals</p><p className="text-xl font-bold">{facilities.filter(f => f.type === 'hospital').length}</p></div>
                   </div>
                   <div className="w-px h-10 bg-gray-200 dark:bg-white/10"/>
                   <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400"><Tent size={20} /></div>
                    <div><p className="text-[10px] text-gray-500 dark:text-white/40 uppercase font-bold tracking-wider">Shelters</p><p className="text-xl font-bold">{facilities.filter(f => f.type === 'shelter').length}</p></div>
                   </div>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
                {/* Left: Map & Layer Controls */}
                <div className="col-span-8 flex flex-col gap-4">
                  {/* Video Monitoring Taskbar */}
                  <div className="bg-white/60 dark:bg-[#121214]/60 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-2xl p-2 flex items-center justify-between transition-colors">
                    <div className="flex gap-1">
                      {(['liveFeeds', 'droneCameras', 'cctvCameras', 'thermalCameras', 'satelliteView'] as const).map(cat => (
                        <button key={cat} className="px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/5 transition-all">
                          {t[cat]}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 px-3">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                      <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">System Online</span>
                    </div>
                  </div>

                  <div className="flex-1 bg-white/60 dark:bg-[#121214]/60 backdrop-blur-xl rounded-[2rem] border border-white/20 dark:border-white/5 overflow-hidden relative group transition-colors shadow-xl">
                    <div
                      ref={mapContainerRef}
                      className={cn(
                        "w-full h-full z-0 transition-all duration-1000",
                        mapLayers.terrain3D && "perspective-[1000px] rotate-x-[20deg] scale-[1.1]"
                      )}
                    />

                    {/* Map Style & Layer Toggles */}
                    <div className="absolute top-6 left-6 z-10 flex flex-col gap-3">
                      <div className="bg-white/90 dark:bg-[#121214]/90 backdrop-blur-md p-3 rounded-2xl border border-gray-200 dark:border-white/10 shadow-2xl">
                        <h3 className="text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest mb-2">Map Style</h3>
                        <div className="flex gap-1">
                          <button onClick={() => setMapStyle('roadmap')} className={cn("px-3 py-1 rounded-lg text-[10px] font-medium transition-all", mapStyle === 'roadmap' ? "bg-emerald-500 text-white" : "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-white/40 hover:bg-gray-200 dark:hover:bg-white/10")}>Road</button>
                          <button onClick={() => setMapStyle('satellite')} className={cn("px-3 py-1 rounded-lg text-[10px] font-medium transition-all", mapStyle === 'satellite' ? "bg-emerald-500 text-white" : "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-white/40 hover:bg-gray-200 dark:hover:bg-white/10")}>Sat</button>
                          <button onClick={() => setMapStyle('hybrid')} className={cn("px-3 py-1 rounded-lg text-[10px] font-medium transition-all", mapStyle === 'hybrid' ? "bg-emerald-500 text-white" : "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-white/40 hover:bg-gray-200 dark:hover:bg-white/10")}>Hybrid</button>
                        </div>
                      </div>

                      <div className="bg-white/90 dark:bg-[#121214]/90 backdrop-blur-md p-3 rounded-2xl border border-gray-200 dark:border-white/10 shadow-2xl">
                        <h3 className="text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest mb-2">Disaster Layers</h3>
                        <div className="flex flex-col gap-2">
                          {Object.entries(mapLayers).map(([key, value]) => (
                            <button
                              key={key}
                              onClick={() => setMapLayers(prev => ({ ...prev, [key]: !value }))}
                              className={cn(
                                "flex items-center justify-between px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all",
                                value ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-white/40 hover:bg-gray-200 dark:hover:bg-white/10"
                              )}
                            >
                              {t[key as keyof typeof t] || key}
                              <div className={cn("w-2 h-2 rounded-full", value ? "bg-emerald-500" : "bg-gray-300 dark:bg-white/10")} />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Drone Overlay */}
                    {selectedDrone && (
                      <div className="absolute top-6 right-6 z-10 w-64 bg-white/90 dark:bg-[#121214]/90 backdrop-blur-md rounded-2xl border border-gray-200 dark:border-white/10 shadow-2xl overflow-hidden">
                        <div className="aspect-video bg-black relative">
                          <iframe
                            src="https://www.youtube.com/embed/21X5lGlDOfg?autoplay=1&mute=1&controls=0"
                            className="w-full h-full opacity-60"
                            allow="autoplay"
                          />
                          <div className="absolute inset-0 pointer-events-none border-2 border-emerald-500/30" />
                          <div className="absolute top-2 left-2 flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                            <span className="text-[8px] font-bold text-white uppercase tracking-tighter">DR-101 LIVE</span>
                          </div>
                        </div>
                        <div className="p-3 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-gray-500 dark:text-white/40 uppercase font-bold">Altitude</span>
                            <span className="text-[10px] font-mono">{selectedDrone.altitude}m</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-gray-500 dark:text-white/40 uppercase font-bold">Speed</span>
                            <span className="text-[10px] font-mono">{selectedDrone.speed} km/h</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-gray-500 dark:text-white/40 uppercase font-bold">Battery</span>
                            <span className={cn("text-[10px] font-mono", selectedDrone.battery < 20 ? "text-red-500" : "text-emerald-400")}>{Math.round(selectedDrone.battery)}%</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="absolute bottom-6 left-6 z-10 flex gap-2">
                      <button onClick={() => openInNewTab(`/map_module?theme=${theme}`)} className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/20 flex items-center gap-2 hover:bg-emerald-600 transition-all">
                        <MapIcon size={14} /> Open GIS Module
                      </button>
                      <button onClick={handleScanAndRescue} disabled={isSimulating} className="px-4 py-2 bg-purple-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-500/20 flex items-center gap-2 hover:bg-purple-600 transition-all disabled:opacity-50">
                        <Target size={14} /> {isSimulating ? 'Scanning...' : 'Detect & Route'}
                      </button>
                      <button onClick={() => findSafestRescueRoute(true)} className="px-4 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-orange-500/20 flex items-center gap-2 hover:bg-orange-600 transition-all">
                        <Users size={14} /> Auto Dispatch
                      </button>
                      <button onClick={() => setIsReplaying(true)} className="px-4 py-2 bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/20 flex items-center gap-2 hover:bg-blue-600 transition-all">
                        <Play size={14} /> {t.replayMission}
                      </button>
                    </div>

                    {isReplaying && (
                      <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 w-full max-w-2xl bg-white/90 dark:bg-[#121214]/90 backdrop-blur-md p-6 rounded-3xl border border-gray-200 dark:border-white/10 shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-4">
                            <button onClick={() => setIsReplaying(false)} className="p-2 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all"><ZapOff size={20} /></button>
                            <div>
                              <h4 className="text-sm font-bold uppercase tracking-widest">Mission Replay Mode</h4>
                              <p className="text-[10px] text-gray-500 dark:text-white/40 uppercase font-mono">Mission ID: M-2026-03-07</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <button className="p-2 bg-gray-100 dark:bg-white/5 rounded-xl text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition-all"><Pause size={20} /></button>
                            <button className="p-2 bg-gray-100 dark:bg-white/5 rounded-xl text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition-all"><Play size={20} /></button>
                          </div>
                        </div>
                        <div className="relative h-2 bg-gray-200 dark:bg-white/5 rounded-full overflow-hidden mb-4">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${replayTime}%` }}
                            className="absolute inset-y-0 left-0 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                          />
                          {replayEvents.map((ev, idx) => (
                            <div
                              key={ev.id}
                              className="absolute top-0 w-2 h-full bg-gray-400 dark:bg-white/20 hover:bg-gray-600 dark:hover:bg-white transition-all cursor-pointer"
                              style={{ left: `${(idx / (replayEvents.length - 1)) * 100}%` }}
                              title={ev.description}
                            />
                          ))}
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-mono text-white/40">10:05:00</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Current Event:</span>
                            <span className="text-[10px] font-medium text-gray-600 dark:text-white/80">{replayEvents[Math.floor((replayTime / 100) * (replayEvents.length - 1))]?.description}</span>
                          </div>
                          <span className="text-[10px] font-mono text-white/40">10:25:00</span>
                        </div>
                      </div>
                    )}

                    {/* Weather Widget */}
                    <div className="absolute bottom-6 right-6 z-10 bg-white/90 dark:bg-[#121214]/90 backdrop-blur-md p-3 rounded-2xl border border-gray-200 dark:border-white/10 shadow-2xl flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Thermometer size={16} className="text-orange-400" />
                        <span className="text-xs font-bold">28°C</span>
                      </div>
                      <div className="w-px h-4 bg-white/10" />
                      <div className="flex items-center gap-2">
                        <Zap size={16} className="text-blue-400" />
                        <span className="text-xs font-bold">12 km/h NW</span>
                      </div>
                      <div className="w-px h-4 bg-gray-200 dark:bg-white/10" />
                      <div className="flex items-center gap-2">
                        <ActivityIcon size={16} className="text-emerald-400" />
                        <span className="text-xs font-bold tracking-tighter uppercase">Clear Skies</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Monitoring & Timeline */}
                <div className="col-span-4 flex flex-col gap-6 overflow-hidden">
                  {/* Rescue Planner */}
                  <div className="bg-white/60 dark:bg-[#121214]/60 backdrop-blur-xl rounded-[2rem] border border-white/20 dark:border-white/5 p-5 transition-colors shadow-lg">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-white/60 flex items-center gap-2">
                        <Route size={16} className="text-emerald-400" /> Rescue Planner
                      </h3>
                      <button onClick={broadcastRescueAlert} className="px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-500/30 text-[10px] font-bold uppercase tracking-wider text-red-300 hover:bg-red-500/25 transition-all">
                        SOS All Units
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                      <div className="rounded-xl border border-gray-200 dark:border-white/5 bg-white/50 dark:bg-white/5 p-2">
                        <p className="text-[9px] uppercase text-gray-400 dark:text-white/40 font-bold tracking-widest">Open</p>
                        <p className="text-lg font-bold">{tasks.filter(task => task.status !== 'completed').length}</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 dark:border-white/5 bg-white/50 dark:bg-white/5 p-2">
                        <p className="text-[9px] uppercase text-gray-400 dark:text-white/40 font-bold tracking-widest">Critical</p>
                        <p className="text-lg font-bold text-red-400">{tasks.filter(task => task.status !== 'completed' && task.priority === 'critical').length}</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 dark:border-white/5 bg-white/50 dark:bg-white/5 p-2">
                        <p className="text-[9px] uppercase text-gray-400 dark:text-white/40 font-bold tracking-widest">Team Slots</p>
                        <p className="text-lg font-bold text-emerald-400">{teams.reduce((acc, team) => acc + Math.max(0, team.max_load - team.current_load), 0)}</p>
                      </div>
                    </div>

                    <div className="flex gap-2 mb-4">
                      <button onClick={() => findSafestRescueRoute(false)} className="flex-1 px-3 py-2 rounded-xl bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-600 transition-all">
                        Find Safe Route
                      </button>
                      <button onClick={() => findSafestRescueRoute(true)} className="flex-1 px-3 py-2 rounded-xl bg-blue-500 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-blue-600 transition-all">
                        Auto Dispatch
                      </button>
                    </div>

                    {routingInfo && (
                      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-3 mb-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300/80 mb-1">Recommended Deployment</p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{routingInfo.team} → {routingInfo.task}</p>
                        <p className="text-[11px] text-gray-600 dark:text-white/70 mt-1">{routingInfo.distance} • {routingInfo.time} • Safety {routingInfo.safety} • {routingInfo.victims} victims</p>
                      </div>
                    )}

                    {routeCandidates.length > 0 && (
                      <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                        {routeCandidates.map((candidate, idx) => (
                          <div key={candidate.teamId} className="rounded-xl border border-gray-200 dark:border-white/5 bg-white/50 dark:bg-white/5 p-2.5 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate">{idx + 1}. {candidate.teamName}</p>
                              <p className="text-[10px] text-white/50">{candidate.distanceKm.toFixed(1)} km • {candidate.timeMin} min • Safety {Math.round(candidate.safetyScore)}/100</p>
                            </div>
                            <button onClick={() => dispatchTeamToTask(candidate.teamId, candidate.taskId)} className="px-2 py-1 rounded-lg bg-white dark:bg-white/10 hover:bg-gray-100 dark:hover:bg-white/20 text-[9px] font-bold uppercase tracking-wider shadow-sm">
                              Dispatch
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Multi-Camera Monitoring */}
                  <div className="bg-white/60 dark:bg-[#121214]/60 backdrop-blur-xl rounded-[2rem] border border-white/20 dark:border-white/5 p-6 flex flex-col h-[38%] min-h-0 transition-colors shadow-lg">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-white/60 flex items-center gap-2">
                        <Video size={16} className="text-emerald-400" /> {t.liveFeeds}
                      </h3>
                      <div className="flex gap-1">
                        <button className="p-1.5 rounded-lg bg-white/50 dark:bg-white/5 text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition-all"><Maximize2 size={14} /></button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 flex-1 overflow-y-auto pr-1 custom-scrollbar">
                      {activeFeeds.map(id => {
                        const cam = cameras.find(c => c.id === id);
                        if (!cam) return null;
                        const feedContext = getFeedContext(cam);
                        return (
                          <div key={id} className="bg-black rounded-xl border border-white/5 overflow-hidden relative group aspect-video">
                            <img
                              src={getLiveFeedFallbackSrc(cam)}
                              alt={`${cam.name} live feed`}
                              className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                            <div className="absolute top-2 left-2 flex items-center gap-1.5">
                              <span className="rounded-full bg-black/65 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-white">{cam.type}</span>
                              {feedContext.topTask && (
                                <span className={cn(
                                  "rounded-full px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-white",
                                  feedContext.topTask.priority === 'critical' ? "bg-red-500/90" :
                                    feedContext.topTask.priority === 'high' ? "bg-orange-500/90" :
                                      "bg-emerald-500/90"
                                )}>
                                  {feedContext.topTask.priority}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => removeFeed(cam.id)}
                              className="absolute top-2 right-2 rounded-full bg-black/55 p-1 text-white/70 opacity-0 transition-all hover:text-white group-hover:opacity-100"
                              aria-label={`Remove ${cam.name} feed`}
                            >
                              <X size={12} />
                            </button>
                            <div className="absolute left-2 right-2 top-9 flex gap-1.5">
                              <div className="rounded-lg bg-black/55 px-2 py-1 text-[8px] font-medium text-white/80">
                                {cam.location_name}
                              </div>
                              {cam.signal !== undefined && (
                                <div className="rounded-lg bg-black/55 px-2 py-1 text-[8px] font-medium text-cyan-300">
                                  {cam.signal}% link
                                </div>
                              )}
                            </div>
                            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                              <div className="min-w-0">
                                <span className="block text-[8px] font-bold text-white uppercase truncate">{cam.name}</span>
                                <div className="mt-1 flex items-center gap-2 text-[8px] text-white/70">
                                  <span>{feedContext.nearbyTasks.length} tasks</span>
                                  <span>{feedContext.nearbyHazards.length} hazards</span>
                                  <span>{feedContext.linkedPhotos} captures</span>
                                </div>
                              </div>
                              <div className={cn("h-1.5 w-1.5 rounded-full", cam.status === 'online' ? "bg-emerald-500" : "bg-red-500")} />
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 gap-2">
                              <button onClick={() => setSelectedCamera(cam)} className="p-2 bg-emerald-500 rounded-full text-white shadow-lg hover:scale-110 transition-transform"><Maximize2 size={16} /></button>
                              <button onClick={() => capturePhoto(cam)} className="p-2 bg-blue-500 rounded-full text-white shadow-lg hover:scale-110 transition-transform"><Camera size={16} /></button>
                            </div>
                          </div>
                        );
                      })}
                      <button onClick={addNextFeed} className="bg-white/30 dark:bg-white/5 border border-dashed border-gray-300 dark:border-white/10 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 dark:text-white/20 hover:text-gray-600 dark:hover:text-white/40 hover:bg-white/50 dark:hover:bg-white/10 transition-all aspect-video">
                        <Plus size={20} />
                        <span className="text-[8px] font-bold uppercase">Add Feed</span>
                      </button>
                    </div>
                  </div>

                  {/* Mission Timeline */}
                  <div className="bg-white/60 dark:bg-[#121214]/60 backdrop-blur-xl rounded-[2rem] border border-white/20 dark:border-white/5 p-6 flex-1 min-h-0 flex flex-col transition-colors shadow-lg">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-white/60 mb-6 flex items-center gap-2">
                      <Clock size={16} className="text-blue-400" /> {t.missionTimeline}
                    </h3>
                    <div className="flex-1 overflow-y-auto pr-2 space-y-6 custom-scrollbar relative">
                      <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gray-100 dark:bg-white/5" />
                      {missionEvents.map((event, i) => (
                        <div key={event.id} className="relative pl-8">
                          <div className={cn(
                            "absolute left-0 top-1 w-6 h-6 rounded-full border-4 border-white dark:border-[#121214] flex items-center justify-center z-10",
                            event.type === 'launch' && "bg-blue-500",
                            event.type === 'detection' && "bg-red-500 animate-pulse",
                            event.type === 'dispatch' && "bg-orange-500",
                            event.type === 'complete' && "bg-emerald-500"
                          )}>
                            <div className="w-1.5 h-1.5 bg-white rounded-full" />
                          </div>
                          <div>
                            <p className="text-[10px] font-mono text-gray-400 dark:text-white/30 mb-0.5">{event.time}</p>
                            <p className="text-xs font-medium text-gray-700 dark:text-white/80">{event.event}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Camera Popup Modal */}
              <AnimatePresence>
                {selectedCamera && selectedFeedContext && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-8"
                  >
                    <motion.div
                      initial={{ scale: 0.9, y: 20 }}
                      animate={{ scale: 1, y: 0 }}
                      className="bg-white dark:bg-[#121214] border border-gray-200 dark:border-white/10 rounded-3xl overflow-hidden w-full max-w-4xl shadow-2xl"
                    >
                      <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-white/5">
                        <div className="flex items-center gap-4">
                          <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", selectedCamera.type === 'drone' ? "bg-emerald-500/20 text-emerald-400" : "bg-blue-500/20 text-blue-400")}>
                            {selectedCamera.type === 'drone' ? <Navigation size={24} /> : <Video size={24} />}
                          </div>
                          <div>
                            <h2 className="text-xl font-bold">{selectedCamera.name}</h2>
                            <p className="text-xs text-gray-500 dark:text-white/40 uppercase tracking-widest">{selectedCamera.location_name} • {selectedCamera.status}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {selectedCamera.battery !== undefined && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10">
                              <Battery size={14} className={cn(selectedCamera.battery < 20 ? "text-red-500" : "text-emerald-400")} />
                              <span className="text-xs font-bold">{selectedCamera.battery}%</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10">
                            <Wifi size={14} className="text-emerald-400" />
                            <span className="text-xs font-bold">{selectedCamera.signal}%</span>
                          </div>
                          <button onClick={() => setSelectedCamera(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-colors text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white"><Plus className="rotate-45" size={24} /></button>
                        </div>
                      </div>
                      <div className="aspect-video bg-black relative">
                        <img
                          src={getLiveFeedFallbackSrc(selectedCamera)}
                          alt={`${selectedCamera.name} live feed`}
                          className="w-full h-full object-cover"
                        />
                        {/* AI Detection Overlay Simulation */}
                        <div className="absolute inset-0 pointer-events-none">
                          <motion.div
                            animate={{ scale: [1, 1.02, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="absolute top-1/4 left-1/3 w-32 h-48 border-2 border-red-500 rounded-lg"
                          >
                            <span className="absolute -top-6 left-0 bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">Victim Detected (94%)</span>
                          </motion.div>
                          <div className="absolute bottom-1/3 right-1/4 w-40 h-24 border-2 border-orange-500 rounded-lg">
                            <span className="absolute -top-6 left-0 bg-orange-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">Fire Hotspot</span>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-3 border-t border-gray-200 dark:border-white/5 bg-gray-100/80 dark:bg-black/30 px-6 py-4">
                        <div className="rounded-2xl border border-gray-200 dark:border-white/5 bg-white dark:bg-white/5 px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-white/40">Coordinates</p>
                          <p className="mt-1 text-sm font-semibold">{selectedCamera.lat.toFixed(4)}, {selectedCamera.lng.toFixed(4)}</p>
                        </div>
                        <div className="rounded-2xl border border-gray-200 dark:border-white/5 bg-white dark:bg-white/5 px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-white/40">Nearby Tasks</p>
                          <p className="mt-1 text-sm font-semibold">{selectedFeedContext.nearbyTasks.length}</p>
                        </div>
                        <div className="rounded-2xl border border-gray-200 dark:border-white/5 bg-white dark:bg-white/5 px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-white/40">Hazards</p>
                          <p className="mt-1 text-sm font-semibold">{selectedFeedContext.nearbyHazards.length}</p>
                        </div>
                        <div className="rounded-2xl border border-gray-200 dark:border-white/5 bg-white dark:bg-white/5 px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-white/40">Captures</p>
                          <p className="mt-1 text-sm font-semibold">{selectedFeedContext.linkedPhotos}</p>
                        </div>
                      </div>
                      <div className="p-6 bg-gray-50 dark:bg-white/5 flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-white/40">Field Insight</p>
                          <p className="mt-1 text-sm text-gray-700 dark:text-white/80">
                            {selectedFeedContext.topTask
                              ? `${selectedFeedContext.topTask.type} nearby with ${selectedFeedContext.topTask.victim_count} victims and ${selectedFeedContext.topTask.priority} priority.`
                              : `No active incident cluster within 1.5 km of ${selectedCamera.location_name}.`}
                          </p>
                        </div>
                        <div className="flex gap-4">
                          <button className="p-3 bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-all"><Play size={20} /></button>
                          <button className="p-3 bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-all"><Pause size={20} /></button>
                          <button onClick={() => capturePhoto(selectedCamera)} className="p-3 bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-all text-emerald-400"><Camera size={20} /></button>
                        </div>
                        <div className="flex gap-4">
                          <button onClick={() => capturePhoto(selectedCamera)} className="px-6 py-3 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2">
                            <Camera size={16} /> {t.capturePhoto}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {activeTab === 'drones' && (
            <div className="grid grid-cols-12 gap-8">
              <div className="col-span-4 flex flex-col gap-6">
                <div className="bg-white/60 dark:bg-[#121214]/60 backdrop-blur-xl rounded-[2rem] border border-white/20 dark:border-white/5 p-6 transition-colors shadow-lg">
                  <h3 className="text-xs font-medium text-gray-500 dark:text-white/40 uppercase tracking-widest mb-4">Simulated Drones</h3>
                  <div className="flex flex-col gap-2">
                    {drones.map(drone => (
                      <button key={drone.id} onClick={() => setSelectedDrone(drone)} className={cn("flex items-center justify-between p-3 rounded-xl border transition-all", selectedDrone?.id === drone.id ? "bg-emerald-500/10 border-emerald-500/40" : "bg-white/50 dark:bg-white/5 border-gray-200 dark:border-white/5 hover:bg-white/80 dark:hover:bg-white/10")}>
                        <div className="flex items-center gap-3"><div className={cn("w-2 h-2 rounded-full", drone.status === 'active' ? "bg-emerald-500" : "bg-yellow-500")} /><span className="text-sm font-medium">{drone.name}</span></div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-white/40"><div className="flex items-center gap-1"><Battery size={12} /><span>{Math.round(drone.battery)}%</span></div></div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="col-span-8">
                {selectedDrone && (
                  <div className="bg-white/60 dark:bg-[#121214]/60 backdrop-blur-xl rounded-[2rem] border border-white/20 dark:border-white/5 p-8 animate-in fade-in slide-in-from-right-4 transition-colors shadow-lg">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h2 className="text-2xl font-bold mb-1">{selectedDrone.name}</h2>
                        <p className="text-xs text-gray-500 dark:text-white/40 uppercase tracking-widest">ID: {selectedDrone.id} • {selectedDrone.model || 'RescueDrone X5'}</p>
                      </div>
                      <div className={cn("px-4 py-2 rounded-xl text-xs font-bold uppercase", selectedDrone.battery < 20 ? "bg-red-500 text-white animate-pulse" : "bg-emerald-500/20 text-emerald-400")}>
                        {selectedDrone.battery < 20 ? "⚠️ Battery Low" : "Status: Active"}
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-6 mb-8">
                      <DroneStat icon={<Navigation size={18} />} label={t.altitude} value={`${selectedDrone.altitude}m`} />
                      <DroneStat icon={<Zap size={18} />} label={t.speed} value={`${selectedDrone.speed} km/h`} />
                      <DroneStat icon={<Wifi size={18} />} label="Signal" value={`${selectedDrone.signal_strength}%`} />
                      <DroneStat icon={<Clock size={18} />} label={t.flightTime} value={`${Math.round(selectedDrone.battery * 0.25)} ${t.mins}`} />
                    </div>

                    <div className="grid grid-cols-1 gap-8 mb-8 xl:grid-cols-2">
                      <div className="space-y-4">
                        <h4 className="text-xs font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest">{t.battery} Health</h4>
                        <div className="bg-white/50 dark:bg-white/5 p-6 rounded-3xl border border-gray-200 dark:border-white/5">
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-sm font-medium">Charge Level</span>
                            <span className={cn("text-lg font-bold", selectedDrone.battery < 20 ? "text-red-500" : "text-emerald-400")}>{Math.round(selectedDrone.battery)}%</span>
                          </div>
                          <div className="h-3 bg-gray-200 dark:bg-white/5 rounded-full overflow-hidden mb-4">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${selectedDrone.battery}%` }}
                              className={cn("h-full transition-all", selectedDrone.battery < 20 ? "bg-red-500" : "bg-emerald-500")}
                            />
                          </div>
                          <p className="text-[10px] text-gray-400 dark:text-white/30 leading-relaxed">
                            {selectedDrone.battery < 20 ? `⚠️ ${t.droneBatteryLow}` : "Optimal: Battery levels are sufficient for continued mission operations."}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <h4 className="text-xs font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest">{t.capabilities}</h4>
                        <div className="rounded-3xl border border-emerald-500/15 bg-[linear-gradient(135deg,rgba(16,185,129,0.16),rgba(18,18,20,0.96)_42%,rgba(18,18,20,1))] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
                          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-300/70">Mission Profile</p>
                              <h5 className="mt-2 text-lg font-semibold text-white">Operational package active</h5>
                              <p className="mt-1 max-w-sm text-xs leading-relaxed text-white/45">
                                Sensor stack, field comms, and payload systems are available for the current sortie.
                              </p>
                            </div>
                            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-right">
                              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300/70">Readiness</p>
                              <p className="mt-1 text-2xl font-bold text-emerald-300">{selectedDrone.signal_strength}%</p>
                            </div>
                          </div>
                          <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/8 px-3 py-2.5">
                              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]" />
                              <div className="min-w-0">
                                <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-emerald-300/70">Payload</p>
                                <p className="truncate text-xs font-semibold text-white">Ready for deployment</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-400/8 px-3 py-2.5">
                              <span className="h-2 w-2 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.65)]" />
                              <div className="min-w-0">
                                <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-cyan-200/70">Comms</p>
                                <p className="truncate text-xs font-semibold text-white">Secure uplink stable</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 rounded-2xl border border-amber-300/20 bg-amber-300/8 px-3 py-2.5">
                              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.6)]" />
                              <div className="min-w-0">
                                <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-amber-200/70">Vision</p>
                                <p className="truncate text-xs font-semibold text-white">Night ops calibrated</p>
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <CapabilityItem icon={<Eye size={16} />} label="Thermal Imaging" detail="Heat signature sweep" active={cameraMode === 'thermal'} onClick={() => setCameraMode('thermal')} />
                            <CapabilityItem icon={<Mic size={16} />} label="Voice Relay" detail="Two-way field comms" active={cameraMode === 'voice'} onClick={() => setCameraMode('voice')} />
                            <CapabilityItem icon={<Package size={16} />} label="Supply Drop" detail="Rapid payload deployment" active={cameraMode === 'supply'} onClick={() => setCameraMode('supply')} />
                            <CapabilityItem icon={<AlertCircle size={16} />} label="Night Vision" detail="Low-light navigation" active={cameraMode === 'night'} onClick={() => setCameraMode('night')} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-black rounded-3xl border border-gray-800 dark:border-white/5 p-1 aspect-video relative overflow-hidden group">
                      <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className="absolute h-px w-px opacity-0 pointer-events-none"
                      />
                      {cameraStream && isCameraActive ? (
                        <>
                          <canvas
                            ref={canvasRef}
                            className="w-full h-full object-cover bg-black"
                          />
                        </>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-black">
                          <img
                            src={telemetryFallbackImg}
                            alt="Fallback telemetry feed"
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          {cameraError && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                              <div className="text-center">
                                <p className="text-white mb-2">📷 Camera Error</p>
                                <p className="text-xs text-white/60">{cameraError}</p>
                                <p className="text-xs text-white/40 mt-2">Using fallback mode</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

                      {/* Camera Mode Selector */}
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 p-4 bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-auto">
                        {(['thermal', 'night', 'supply', 'voice', 'rgb'] as const).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => setCameraMode(mode)}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 pointer-events-auto",
                              cameraMode === mode
                                ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/50"
                                : "bg-white/10 text-white/60 hover:bg-white/20"
                            )}
                          >
                            {mode === 'thermal' && '🔥 Thermal'}
                            {mode === 'night' && '🌙 Night'}
                            {mode === 'supply' && '📦 Supply'}
                            {mode === 'voice' && '🎙️ Voice'}
                            {mode === 'rgb' && '📷 RGB'}
                          </button>
                        ))}
                      </div>

                      <div className="absolute top-6 left-6 flex items-center gap-2 pointer-events-none">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-[10px] font-bold text-white uppercase tracking-widest">{cameraStream && isCameraActive ? 'LIVE' : 'FALLBACK'} TELEMETRY FEED</span>
                      </div>

                      {/* Camera Mode Label */}
                      <div className="absolute top-6 right-6 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur border border-white/10">
                        <span className={cn(
                          "text-[10px] font-bold uppercase tracking-widest",
                          cameraMode === 'thermal' ? 'text-orange-400' :
                            cameraMode === 'night' ? 'text-cyan-400' :
                              cameraMode === 'supply' ? 'text-blue-400' :
                                cameraMode === 'voice' ? 'text-purple-400' :
                                  'text-gray-400'
                        )}>
                          {cameraMode.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="grid grid-cols-12 gap-8">
              <div className="col-span-8 space-y-4">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold">Rescue Task Queue</h2>
                  <button onClick={() => openInNewTab(apiUrl('/api/reports/export'))} className="flex items-center gap-2 px-4 py-2 bg-white/60 dark:bg-white/5 border border-white/20 dark:border-white/10 rounded-xl text-xs hover:bg-white/80 dark:hover:bg-white/10 transition-colors backdrop-blur-sm"><Download size={14} /> {t.exportCsv}</button>
                </div>
                <div className="space-y-3">
                  {tasks.map(task => (
                    <motion.div layout key={task.id} className="bg-white/60 dark:bg-[#121214]/60 backdrop-blur-md border border-white/20 dark:border-white/5 rounded-2xl p-5 flex items-center justify-between group transition-colors shadow-sm">
                      <div className="flex items-center gap-6">
                        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", PRIORITY_COLORS[task.priority])}><AlertTriangle className="text-white" size={24} /></div>
                        <div>
                          <div className="flex items-center gap-3 mb-1"><h4 className="font-semibold">{task.type}</h4><span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider", task.status === 'completed' ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-white/40")}>{task.status}</span></div>
                          <p className="text-sm text-gray-600 dark:text-white/60">{task.description}</p>
                          {(task as any).ai_score !== undefined && task.status !== 'completed' && (
                            <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
                              <Bot size={10} className="text-indigo-500"/>
                              <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">AI Priority Score: {(task as any).ai_score}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-400 dark:text-white/30 font-mono">
                            <span className="flex items-center gap-1"><Users size={10} /> {task.victim_count} Victims</span>
                            <span className="flex items-center gap-1"><Clock size={10} /> {format(new Date(task.created_at), 'HH:mm')}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {task.team_name && <div className="text-right mr-4"><p className="text-[10px] text-gray-500 dark:text-white/40 uppercase tracking-widest">Assigned</p><p className="text-sm font-medium text-emerald-400">{task.team_name}</p></div>}
                        {task.status !== 'completed' && <button onClick={() => completeTask(task.id)} className="w-10 h-10 rounded-full bg-white dark:bg-white/5 flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all text-gray-400 dark:text-white/40 shadow-sm"><CheckCircle2 size={20} /></button>}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
              <div className="col-span-4 space-y-6">
                <div className="bg-white/60 dark:bg-[#121214]/60 backdrop-blur-xl rounded-[2rem] border border-white/20 dark:border-white/5 p-6 transition-colors shadow-lg">
                  <h3 className="text-xs font-medium text-gray-500 dark:text-white/40 uppercase tracking-widest mb-4">Rescue Teams</h3>
                  <div className="space-y-3">
                    {teams.map(team => (
                      <div key={team.id} className="p-4 rounded-2xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", team.status === 'busy' ? "bg-blue-500/20 text-blue-400" : "bg-emerald-500/20 text-emerald-400")}><Users size={20} /></div>
                          <div><p className="text-sm font-medium">{team.name}</p><p className="text-[10px] text-gray-500 dark:text-white/40 uppercase">{team.specialty}</p></div>
                        </div>
                        <div className="text-right">
                          <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold uppercase", team.status === 'available' ? "bg-emerald-500/20 text-emerald-400" : "bg-blue-500/20 text-blue-400")}>{team.status}</span>
                          {team.status === 'busy' && <p className="text-[8px] text-gray-400 dark:text-white/20 mt-1">{team.distance_to_target?.toFixed(1)}km to target</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div id="analytics-dashboard" ref={analyticsExportRef} className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">{t.analytics}</h2>
                  <p className="text-xs text-gray-500 dark:text-white/40 uppercase tracking-widest mt-1">Real-time Disaster Data & AI Insights</p>
                </div>
                <div className="flex gap-3" data-html2canvas-ignore="true">
                  <button onClick={exportAnalyticsToPDF} className="px-4 py-2 bg-white/60 dark:bg-white/5 border border-white/20 dark:border-white/10 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-white/80 dark:hover:bg-white/10 transition-all backdrop-blur-sm">
                    <Download size={14} /> {t.exportPDF}
                  </button>
                  <button onClick={exportAnalyticsToCSV} className="px-4 py-2 bg-white/60 dark:bg-white/5 border border-white/20 dark:border-white/10 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-white/80 dark:hover:bg-white/10 transition-all backdrop-blur-sm">
                    <Download size={14} /> {t.downloadCSV}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-6">
                <StatCard label={t.activeDrones} value={drones.length} icon={<Navigation className="text-emerald-400" />} trend="+2" exportVariant="analytics" />
                <StatCard label={t.teamsDeployed} value={teams.filter(team => team.status === 'busy').length} icon={<Users className="text-blue-400" />} trend="+1" exportVariant="analytics" />
                <StatCard label={t.victimsDetected} value={tasks.reduce((acc, task) => acc + task.victim_count, 0)} icon={<AlertTriangle className="text-orange-400" />} trend="+5" exportVariant="analytics" />
                <StatCard label={t.victimsRescued} value={tasks.filter(task => task.status === 'completed').reduce((acc, task) => acc + task.victim_count, 0)} icon={<CheckCircle2 className="text-emerald-400" />} trend="+8" exportVariant="analytics" />
              </div>

              <div className="grid grid-cols-12 gap-8">
                <div data-export-card="analytics" className="col-span-4 bg-white/70 dark:bg-[#121214]/70 rounded-3xl border border-gray-200/50 dark:border-white/5 p-8 backdrop-blur-xl">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-white/40 mb-8">{t.disasterDistribution}</h3>
                  <div className="h-[300px]">
                    <ReactECharts
                      option={{
                        backgroundColor: 'transparent',
                        tooltip: { trigger: 'item' },
                        series: [
                          {
                            name: 'Disaster Type',
                            type: 'pie',
                            radius: ['40%', '70%'],
                            avoidLabelOverlap: false,
                            itemStyle: { borderRadius: 10, borderColor: theme === 'dark' ? '#121214' : '#ffffff', borderWidth: 2 },
                            label: { show: false },
                            emphasis: {
                              label: { show: true, fontSize: 16, fontWeight: 'bold', color: theme === 'dark' ? '#fff' : '#111827' }
                            },
                            data: [
                              { value: 40, name: 'Flood', itemStyle: { color: '#3b82f6' } },
                              { value: 25, name: 'Fire', itemStyle: { color: '#ef4444' } },
                              { value: 20, name: 'Earthquake', itemStyle: { color: '#f59e0b' } },
                              { value: 15, name: 'Storm', itemStyle: { color: '#10b981' } }
                            ]
                          }
                        ]
                      }}
                      style={{ height: '100%', width: '100%' }}
                    />
                  </div>
                </div>

                <div data-export-card="analytics" className="col-span-8 bg-white/70 dark:bg-[#121214]/70 rounded-3xl border border-gray-200/50 dark:border-white/5 p-8 backdrop-blur-xl">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-white/40 mb-8">{t.rescueProgress}</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[{ name: 'Zone A', progress: 80 }, { name: 'Zone B', progress: 55 }, { name: 'Zone C', progress: 30 }, { name: 'Zone D', progress: 90 }]}>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#ffffff08' : '#e5e7eb'} vertical={false} />
                        <XAxis dataKey="name" stroke={theme === 'dark' ? '#ffffff20' : '#6b7280'} fontSize={10} />
                        <YAxis stroke={theme === 'dark' ? '#ffffff20' : '#6b7280'} fontSize={10} unit="%" />
                        <Tooltip
                          cursor={false}
                          contentStyle={{ backgroundColor: '#121214', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#ffffff' }}
                          itemStyle={{ color: '#ffffff' }}
                          labelStyle={{ color: '#9ca3af' }}
                        />
                        <Bar dataKey="progress" radius={[4, 4, 0, 0]}>
                          {Array.from({ length: 4 }).map((_, index) => (
                            <Cell key={index} fill={['#10b981', '#3b82f6', '#f59e0b', '#ef4444'][index]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div data-export-card="analytics" className="col-span-12 bg-white/70 dark:bg-[#121214]/70 rounded-3xl border border-gray-200/50 dark:border-white/5 p-8 backdrop-blur-xl">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-white/40 mb-8">{t.dronePerformance}</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={[{ time: '10:00', battery: 95, distance: 2, area: 10 }, { time: '10:10', battery: 85, distance: 5, area: 25 }, { time: '10:20', battery: 70, distance: 8, area: 45 }, { time: '10:30', battery: 55, distance: 12, area: 70 }, { time: '10:40', battery: 40, distance: 15, area: 95 }]}>
                        <defs>
                          <linearGradient id="colorPerf" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#ffffff08' : '#e5e7eb'} vertical={false} />
                        <XAxis dataKey="time" stroke={theme === 'dark' ? '#ffffff20' : '#6b7280'} fontSize={10} />
                        <YAxis stroke={theme === 'dark' ? '#ffffff20' : '#6b7280'} fontSize={10} />
                        <Tooltip
                          cursor={false}
                          contentStyle={{ backgroundColor: '#121214', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#ffffff' }}
                          itemStyle={{ color: '#ffffff' }}
                          labelStyle={{ color: '#9ca3af' }}
                        />
                        <Area type="monotone" dataKey="area" stroke="#10b981" fillOpacity={1} fill="url(#colorPerf)" />
                        <Area type="monotone" dataKey="battery" stroke="#ef4444" fillOpacity={0} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div data-export-card="analytics" className="col-span-6 bg-white/70 dark:bg-[#121214]/70 rounded-3xl border border-gray-200/50 dark:border-white/5 p-8 backdrop-blur-xl">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-white/40 mb-8">{t.batteryAnalytics}</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {drones.map(drone => (
                      <div key={drone.id} className="flex flex-col items-center gap-3">
                        <div className="relative flex h-32 w-32 items-center justify-center [perspective:900px]">
                          <div className="absolute inset-4 rounded-full bg-black/40 blur-xl" />
                          <div className="absolute inset-1 rounded-full bg-gradient-to-br from-white/10 via-white/0 to-black/30 dark:from-white/8 dark:to-black/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_18px_30px_rgba(0,0,0,0.35)]" />
                          <div
                            className="relative flex h-28 w-28 items-center justify-center rounded-full border border-white/10 shadow-[0_14px_24px_rgba(0,0,0,0.3)]"
                            style={{
                              transform: 'rotateX(18deg)',
                              background: `conic-gradient(${drone.battery < 20 ? '#ef4444' : '#10b981'} 0deg ${Math.max(3.6, drone.battery * 3.6)}deg, rgba(255,255,255,0.08) ${Math.max(3.6, drone.battery * 3.6)}deg 360deg)`,
                            }}
                          >
                            <div className="absolute inset-[8px] rounded-full bg-[#f8fafc] dark:bg-[#050505] shadow-[inset_0_8px_16px_rgba(255,255,255,0.06),inset_0_-10px_18px_rgba(0,0,0,0.45)]" />
                            <div
                              className={cn(
                                "absolute inset-[3px] rounded-full opacity-70 blur-[2px]",
                                drone.battery < 20 ? 'bg-red-500/10' : 'bg-emerald-400/10'
                              )}
                            />
                            <div className="relative z-10 flex flex-col items-center justify-center">
                              <span className="text-2xl font-bold tracking-tight">{Math.round(drone.battery)}%</span>
                              <span className="text-[9px] font-bold uppercase tracking-[0.35em] text-gray-500 dark:text-white/30">Charge</span>
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest">{drone.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div data-export-card="analytics" className="col-span-6 bg-white/70 dark:bg-[#121214]/70 rounded-3xl border border-gray-200/50 dark:border-white/5 p-8 backdrop-blur-xl">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-white/40 mb-8">{t.aiInsights}</h3>
                  <div className="space-y-4">
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                      <div className="flex items-center gap-2 mb-2">
                        <Bot size={14} className="text-emerald-400" />
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">AI Prediction</span>
                      </div>
                      <p className="text-xs text-gray-700 dark:text-white/80 leading-relaxed">High victim probability detected in Flood Zone B based on heat signature analysis.</p>
                    </div>
                    <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                      <div className="flex items-center gap-2 mb-2">
                        <Navigation size={14} className="text-blue-400" />
                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Efficiency Report</span>
                      </div>
                      <p className="text-xs text-gray-700 dark:text-white/80 leading-relaxed">Drone DR-101 covered 35% more area than average mission parameters.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'photos' && (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">{t.photoGallery}</h2>
                  <p className="text-xs text-gray-500 dark:text-white/40 uppercase tracking-widest mt-1">Rescue Evidence & AI Documentation</p>
                </div>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2 bg-white/60 dark:bg-white/5 px-4 py-2 rounded-xl border border-white/20 dark:border-white/10 backdrop-blur-sm">
                    <span className="text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase">Auto Capture</span>
                    <button
                      onClick={() => setAutoCaptureEnabled(!autoCaptureEnabled)}
                      className={cn("w-10 h-5 rounded-full relative transition-all", autoCaptureEnabled ? "bg-emerald-500" : "bg-gray-300 dark:bg-white/10")}
                    >
                      <div className={cn("absolute top-1 w-3 h-3 bg-white rounded-full transition-all", autoCaptureEnabled ? "left-6" : "left-1")} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-6">
                {capturedPhotos.map(photo => (
                  <motion.div
                    key={photo.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white/60 dark:bg-[#121214]/60 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-3xl overflow-hidden group hover:border-emerald-500/30 transition-all shadow-lg hover:shadow-xl hover:scale-[1.02] duration-300"
                  >
                    <div className="aspect-video relative overflow-hidden">
                      <img src={photo.url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      {photo.detectionLabel && (
                        <div className="absolute top-3 left-3 px-2 py-1 bg-red-500 text-white text-[8px] font-bold rounded uppercase tracking-tighter">
                          {photo.detectionLabel} ({photo.confidence}%)
                        </div>
                      )}
                      <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] font-mono text-white/60">{photo.timestamp}</span>
                        <button className="p-1.5 bg-white/10 rounded-lg text-white hover:bg-white/20 transition-all"><Maximize2 size={12} /></button>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                        <span className="text-[10px] font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest">{photo.source}</span>
                      </div>
                      <p className="text-sm font-bold mb-1">{photo.zone}</p>
                      <div className="flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-white/30">
                        <MapPin size={10} />
                        <span>{photo.location.lat.toFixed(4)}, {photo.location.lng.toFixed(4)}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="grid grid-cols-1 gap-8">
              <div ref={reportsExportRef} className="bg-white/60 dark:bg-[#121214]/60 backdrop-blur-xl rounded-[2rem] border border-white/20 dark:border-white/5 p-8 transition-colors shadow-lg">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold">{t.reports}</h2>
                  <div className="flex gap-3" data-html2canvas-ignore="true">
                    <button onClick={exportReportSummaryToPDF} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20">
                      <Download size={14} /> Export PDF Report
                    </button>
                    <button onClick={() => openInNewTab(apiUrl('/api/reports/export'))} className="flex items-center gap-2 px-4 py-2 bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-xs font-bold hover:bg-white/80 dark:hover:bg-white/10 transition-colors">
                      <Download size={14} /> {t.exportCsv}
                    </button>
                    <button onClick={generateMissionReport} disabled={isAiProcessing} className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-500/20">
                      <Bot size={14} /> {isAiProcessing ? 'Generating...' : 'Generate AI Summary'}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
                  <StatCard label={t.activeDrones} value={drones.filter(d => d.status === 'active').length} icon={<Navigation className="text-emerald-400" />} trend={`+${Math.max(1, drones.length > 0 ? 1 : 0)}`} />
                  <StatCard label={t.teamsDeployed} value={teams.filter(team => team.status === 'busy').length} icon={<Users className="text-blue-400" />} trend={`+${Math.max(1, teams.filter(team => team.status === 'busy').length)}`} />
                  <StatCard label={t.victimsDetected} value={tasks.reduce((acc, task) => acc + task.victim_count, 0)} icon={<AlertTriangle className="text-orange-400" />} trend={`+${Math.max(1, tasks.length)}`} />
                  <StatCard label={t.victimsRescued} value={tasks.filter(task => task.status === 'completed').reduce((acc, task) => acc + task.victim_count, 0)} icon={<CheckCircle2 className="text-emerald-400" />} trend={`+${Math.max(1, tasks.filter(task => task.status === 'completed').length)}`} />
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                  <div className="xl:col-span-2 rounded-3xl border border-gray-200 dark:border-white/5 bg-white/50 dark:bg-white/5 p-6">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-white/40 mb-4">{t.missionSummary}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="rounded-2xl bg-white/70 dark:bg-[#0A0A0B] border border-gray-200 dark:border-white/5 p-4">
                        <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-white/40 mb-2">{t.openTasksLabel}</p>
                        <p className="text-3xl font-bold">{tasks.filter(task => task.status !== 'completed').length}</p>
                      </div>
                      <div className="rounded-2xl bg-white/70 dark:bg-[#0A0A0B] border border-gray-200 dark:border-white/5 p-4">
                        <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-white/40 mb-2">Critical Hazards</p>
                        <p className="text-3xl font-bold">{hazardZones.filter(zone => zone.severity === 'critical').length}</p>
                      </div>
                      <div className="rounded-2xl bg-white/70 dark:bg-[#0A0A0B] border border-gray-200 dark:border-white/5 p-4">
                        <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-white/40 mb-2">Mission Events</p>
                        <p className="text-3xl font-bold">{missionEvents.length}</p>
                      </div>
                      <div className="rounded-2xl bg-white/70 dark:bg-[#0A0A0B] border border-gray-200 dark:border-white/5 p-4">
                        <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-white/40 mb-2">Captured Photos</p>
                        <p className="text-3xl font-bold">{capturedPhotos.length}</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-3xl border border-gray-200 dark:border-white/5 bg-white/50 dark:bg-white/5 p-6">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-white/40 mb-4">{t.generatedLabel}</h3>
                    <div className="space-y-3 text-sm text-gray-600 dark:text-white/70">
                      <p>{format(new Date(), 'PPP p')}</p>
                      <p>{tasks.length} total rescue tasks tracked in the current incident window.</p>
                      <p>{teams.filter(team => team.status !== 'offline').length} teams available for dispatch.</p>
                      <p>{drones.length} drones reporting telemetry.</p>
                    </div>
                  </div>
                </div>
                <div className="mt-6 rounded-3xl border border-gray-200 dark:border-white/5 bg-white/50 dark:bg-white/5 p-6">
                  {aiReport && (
                    <div className="mb-6 p-4 bg-white/70 dark:bg-[#0A0A0B] border border-indigo-500/30 rounded-2xl relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
                      <h4 className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-2 flex items-center gap-2"><Bot size={14} /> AI Tactical Summary</h4>
                      <p className="text-sm leading-relaxed whitespace-pre-line text-gray-700 dark:text-gray-300">{aiReport}</p>
                    </div>
                  )}
                  <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-white/40 mb-4">{t.recentIncidentQueue}</h3>
                  <div className="space-y-3">
                    {tasks.slice(0, 6).map((task) => (
                      <div key={task.id} className="flex items-center justify-between rounded-2xl border border-gray-200 dark:border-white/5 bg-white/70 dark:bg-[#0A0A0B] px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold">{task.type}</p>
                          <p className="text-xs text-gray-500 dark:text-white/40">{task.description}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-white/40">{task.priority}</p>
                          <p className="text-sm">{task.victim_count} victims</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="grid grid-cols-1 gap-8 max-w-2xl">
              <div className="bg-white/60 dark:bg-[#121214]/60 backdrop-blur-xl rounded-[2rem] border border-white/20 dark:border-white/5 p-8 transition-colors shadow-lg">
                <h2 className="text-2xl font-bold mb-8">{t.settings}</h2>
                <div className="space-y-8">
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest">{t.systemTheme}</h3>
                    <div className="flex gap-4">
                      <button onClick={() => setTheme('light')} className={cn("flex-1 p-4 rounded-2xl border flex items-center justify-center gap-3 transition-all", theme === 'light' ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400" : "bg-white/50 dark:bg-white/5 border-gray-200 dark:border-white/5 text-gray-500 dark:text-white/40 hover:bg-white/80 dark:hover:bg-white/10")}>
                        <Sun size={20} /> {t.lightMode}
                      </button>
                      <button onClick={() => setTheme('dark')} className={cn("flex-1 p-4 rounded-2xl border flex items-center justify-center gap-3 transition-all", theme === 'dark' ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400" : "bg-white/50 dark:bg-white/5 border-gray-200 dark:border-white/5 text-gray-500 dark:text-white/40 hover:bg-white/80 dark:hover:bg-white/10")}>
                        <Moon size={20} /> {t.darkMode}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest">Notifications</h3>
                    <div className="flex gap-4">
                      <button onClick={() => setSoundEnabled(true)} className={cn("flex-1 p-4 rounded-2xl border flex items-center justify-center gap-3 transition-all", soundEnabled ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400" : "bg-white/50 dark:bg-white/5 border-gray-200 dark:border-white/5 text-gray-500 dark:text-white/40 hover:bg-white/80 dark:hover:bg-white/10")}>
                        <Volume2 size={20} /> Sound On
                      </button>
                      <button onClick={() => setSoundEnabled(false)} className={cn("flex-1 p-4 rounded-2xl border flex items-center justify-center gap-3 transition-all", !soundEnabled ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400" : "bg-white/50 dark:bg-white/5 border-gray-200 dark:border-white/5 text-gray-500 dark:text-white/40 hover:bg-white/80 dark:hover:bg-white/10")}>
                        <VolumeX size={20} /> Sound Off
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest">Units</h3>
                    <div className="flex gap-4">
                      <button onClick={() => setUnits('metric')} className={cn("flex-1 p-4 rounded-2xl border flex items-center justify-center gap-3 transition-all", units === 'metric' ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400" : "bg-white/50 dark:bg-white/5 border-gray-200 dark:border-white/5 text-gray-500 dark:text-white/40 hover:bg-white/80 dark:hover:bg-white/10")}>
                        <Ruler size={20} /> Metric
                      </button>
                      <button onClick={() => setUnits('imperial')} className={cn("flex-1 p-4 rounded-2xl border flex items-center justify-center gap-3 transition-all", units === 'imperial' ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400" : "bg-white/50 dark:bg-white/5 border-gray-200 dark:border-white/5 text-gray-500 dark:text-white/40 hover:bg-white/80 dark:hover:bg-white/10")}>
                        <Ruler size={20} /> Imperial
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest">Field Operations</h3>
                    <div className="flex items-center justify-between p-4 rounded-2xl border border-gray-200 dark:border-white/5 bg-white/50 dark:bg-white/5">
                      <div className="flex items-center gap-3">
                        <WifiOff size={20} className={cn(isOfflineMode ? "text-amber-500" : "text-gray-400")} />
                        <span className="text-sm font-medium">Offline Mode</span>
                      </div>
                      <button onClick={() => setIsOfflineMode(!isOfflineMode)} className={cn("w-10 h-6 rounded-full relative transition-all", isOfflineMode ? "bg-amber-500" : "bg-gray-300 dark:bg-white/10")}>
                        <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all", isOfflineMode ? "left-5" : "left-1")} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest">AI Security</h3>
                    <div className="p-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                          <Fingerprint size={20} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900 dark:text-white">Biometric Verification</p>
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">Active • Last scan: Just now</p>
                        </div>
                      </div>
                      <button className="px-3 py-1.5 bg-emerald-500 text-white text-[10px] font-bold rounded-lg uppercase">Re-Calibrate</button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-gray-500 dark:text-white/40 uppercase tracking-widest">{t.systemLanguage}</h3>
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        { code: 'en', label: 'English' },
                        { code: 'ta', label: 'தமிழ்' },
                        { code: 'hi', label: 'हिन्दी' }
                      ].map(l => (
                        <button key={l.code} onClick={() => setLang(l.code as Language)} className={cn("p-4 rounded-2xl border flex items-center justify-center font-medium transition-all", lang === l.code ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400" : "bg-white/50 dark:bg-white/5 border-gray-200 dark:border-white/5 text-gray-500 dark:text-white/40 hover:bg-white/80 dark:hover:bg-white/10")}>
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-8 border-t border-gray-200 dark:border-white/5">
                    <button onClick={() => setUser(null)} className="w-full py-4 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2">
                      <LogOut size={18} /> {t.signOutCommandCenter}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

    </div>
  );
}

function DroneStat({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mouseX = useSpring(x, { stiffness: 500, damping: 30 });
  const mouseY = useSpring(y, { stiffness: 500, damping: 30 });
  const rotateX = useTransform(mouseY, [-0.5, 0.5], ["10deg", "-10deg"]);
  const rotateY = useTransform(mouseX, [-0.5, 0.5], ["-10deg", "10deg"]);

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const xPct = (mouseX / width) - 0.5;
    const yPct = (mouseY / height) - 0.5;
    x.set(xPct);
    y.set(yPct);
  }

  function handleMouseLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      initial={{ scale: 1 }}
      whileHover={{ scale: 1.05 }}
      className="bg-white/50 dark:bg-white/5 p-4 rounded-2xl border border-gray-200 dark:border-white/5 flex flex-col items-center justify-center text-center transition-colors shadow-sm cursor-default"
    >
      <div style={{ transform: "translateZ(20px)" }} className="text-gray-400 dark:text-white/40 mb-2">{icon}</div>
      <p style={{ transform: "translateZ(10px)" }} className="text-[8px] text-gray-400 dark:text-white/40 uppercase mb-1">{label}</p>
      <p style={{ transform: "translateZ(15px)" }} className="text-sm font-bold">{value}</p>
    </motion.div>
  );
}

function CapabilityItem({ icon, label, detail, active, onClick }: { icon: React.ReactNode, label: string, detail: string, active?: boolean, onClick?: () => void }) {
  return (
    <motion.div
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn("min-w-0 rounded-2xl border p-4 transition-all cursor-pointer", active ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "border-main bg-white/50 dark:bg-white/5 text-gray-500 dark:text-white/40 hover:bg-white/60 dark:hover:bg-white/10")}
    >
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border", active ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-600 dark:text-emerald-300" : "border-main bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-white/40")}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <span className="text-sm font-semibold leading-snug">{label}</span>
            {active && <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-300">Online</span>}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-gray-500 dark:text-white/45">{detail}</p>
        </div>
      </div>
    </motion.div>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("w-12 h-12 rounded-2xl flex items-center justify-center transition-all group relative hover:scale-105 active:scale-95", active ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 ring-2 ring-emerald-500/20" : "text-gray-400 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white")}>
      {icon}
      <span className="absolute left-full ml-4 px-3 py-1.5 bg-white/90 dark:bg-[#121214]/90 backdrop-blur-md border border-main rounded-xl text-[10px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 text-main shadow-xl">{label}</span>
    </button>
  );
}

function StatCard({ label, value, icon, trend, exportVariant }: { label: string, value: string | number, icon: React.ReactNode, trend: string, exportVariant?: 'analytics' }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mouseX = useSpring(x, { stiffness: 500, damping: 30 });
  const mouseY = useSpring(y, { stiffness: 500, damping: 30 });
  const rotateX = useTransform(mouseY, [-0.5, 0.5], ["7deg", "-7deg"]);
  const rotateY = useTransform(mouseX, [-0.5, 0.5], ["-7deg", "7deg"]);

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const xPct = (mouseX / width) - 0.5;
    const yPct = (mouseY / height) - 0.5;
    x.set(xPct);
    y.set(yPct);
  }

  function handleMouseLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      data-export-card={exportVariant}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      initial={{ scale: 1 }}
      whileHover={{ scale: 1.03, boxShadow: "0 20px 40px -10px rgba(0,0,0,0.1)" }}
      className="bg-white/60 dark:bg-[#121214]/60 backdrop-blur-xl border border-main rounded-[2rem] p-6 transition-colors shadow-lg shadow-slate-200/20 dark:shadow-black/20 group cursor-default"
    >
      <div style={{ transform: "translateZ(30px)" }} className="flex items-center justify-between mb-4"><div className="w-12 h-12 rounded-2xl bg-white/50 dark:bg-white/5 flex items-center justify-center shadow-inner">{icon}</div><span className={cn("text-xs font-bold px-2 py-1 rounded-lg bg-white/50 dark:bg-white/5", trend.startsWith('+') ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>{trend}</span></div>
      <p style={{ transform: "translateZ(20px)" }} className="text-2xl font-bold mb-1">{value}</p>
      <p style={{ transform: "translateZ(10px)" }} className="text-xs text-gray-500 dark:text-white/40 uppercase tracking-widest">{label}</p>
    </motion.div>
  );
}
