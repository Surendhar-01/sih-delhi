export interface Drone {
  id: string;
  name: string;
  status: 'active' | 'standby' | 'maintenance' | 'emergency';
  battery: number;
  lat: number;
  lng: number;
  last_update: string;
  altitude: number;
  speed: number;
  signal_strength: number;
  model: string;
  camera: string;
  range: string;
  capabilities: string[];
}

export interface HazardZone {
  id: string;
  type: 'flood' | 'fire' | 'collapsed_building' | 'blocked_road';
  lat: number;
  lng: number;
  radius: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface Facility {
  id: string;
  type: 'hospital' | 'shelter';
  name: string;
  lat: number;
  lng: number;
  capacity: number;
  occupied: number;
  status: 'active' | 'full' | 'offline';
}

export interface RescueTeam {
  id: string;
  name: string;
  status: 'available' | 'busy' | 'offline';
  lat: number;
  lng: number;
  specialty: 'Medical' | 'Fire' | 'Search & Rescue' | 'Logistics';
  current_load: number;
  max_load: number;
}

export interface Task {
  id: string;
  type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'assigned' | 'in-progress' | 'completed';
  lat: number;
  lng: number;
  victim_count: number;
  description: string;
  assigned_team_id: string | null;
  team_name?: string;
  drone_id: string;
  created_at: string;
  completed_at?: string;
  priority_score: number;
  crowd_density: 'low' | 'medium' | 'high';
  detected_keywords: string[];
}

export interface WeatherData {
  temp: number;
  condition: string;
  wind_speed: number;
  visibility: number;
}

export interface Geofence {
  id: string;
  name: string;
  type: 'danger' | 'safe' | 'restricted';
  points: { lat: number, lng: number }[];
}

export interface Activity {
  id: string;
  type: 'drone' | 'team' | 'system' | 'battery';
  title: string;
  description: string;
  timestamp: string;
  status: 'info' | 'success' | 'warning' | 'critical';
  icon: string;
  metadata?: {
    droneId?: string;
    teamId?: string;
    taskId?: string;
    location?: { lat: number, lng: number };
  };
}

export interface CameraSource {
  id: string;
  name: string;
  type: 'drone' | 'bodycam' | 'cctv' | 'satellite';
  url: string;
  status: 'online' | 'weak' | 'offline';
  lat: number;
  lng: number;
  battery?: number;
  signal?: number;
  location_name: string;
}

export interface MissionEvent {
  id: string;
  time: string;
  event: string;
  type: 'launch' | 'scan' | 'detection' | 'dispatch' | 'rescue' | 'complete' | 'progress';
}

export interface CapturedPhoto {
  id: string;
  url: string;
  location: { lat: number, lng: number };
  source: string;
  timestamp: string;
  zone: string;
  detectionLabel: string;
  confidence: number;
  droneId?: string;
  teamId?: string;
}

export interface ReplayEvent {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  location: { lat: number, lng: number };
  metadata?: Record<string, unknown>;
}
