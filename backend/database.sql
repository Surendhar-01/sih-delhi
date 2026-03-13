CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  password TEXT,
  role TEXT DEFAULT 'admin',
  name TEXT
);

CREATE TABLE IF NOT EXISTS drones (
  id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT,
  battery REAL,
  lat REAL,
  lng REAL,
  altitude REAL DEFAULT 0,
  speed REAL DEFAULT 0,
  signal_strength REAL DEFAULT 100,
  model TEXT,
  camera TEXT,
  range TEXT,
  capabilities TEXT,
  last_update DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rescue_teams (
  id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT,
  lat REAL,
  lng REAL,
  specialty TEXT,
  current_load INTEGER DEFAULT 0,
  max_load INTEGER DEFAULT 1,
  distance_to_target REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  type TEXT,
  priority TEXT,
  status TEXT,
  lat REAL,
  lng REAL,
  victim_count INTEGER,
  description TEXT,
  assigned_team_id TEXT,
  drone_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

CREATE TABLE IF NOT EXISTS hazard_zones (
  id TEXT PRIMARY KEY,
  type TEXT,
  lat REAL,
  lng REAL,
  radius REAL,
  severity TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT,
  message TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS facilities (
  id TEXT PRIMARY KEY,
  type TEXT,
  name TEXT,
  lat REAL,
  lng REAL,
  capacity INTEGER,
  occupied INTEGER,
  status TEXT
);

-- Initial Seed Data
INSERT OR IGNORE INTO users (email, password, role, name) VALUES ('admin@test.com', '123456', 'Commander', 'Admin');
INSERT OR IGNORE INTO drones (id, name, status, battery, lat, lng, model, capabilities) VALUES 
('DR-101', 'Alpha Hawk', 'active', 88.0, 11.6643, 78.1460, 'Sentinel X1', '["thermal","zoom"]'),
('DR-102', 'Beta Wing', 'standby', 100.0, 11.6655, 78.1475, 'Sentinel X1', '["optical"]'),
('DR-103', 'Gamma Ray', 'active', 74.5, 11.6610, 78.1445, 'Sentinel X2', '["thermal","lidar"]'),
('DR-104', 'Delta Force', 'standby', 98.0, 11.6660, 78.1490, 'Guardian Pro', '["zoom","supply"]'),
('DR-105', 'Epsilon Eye', 'returning', 18.0, 11.6630, 78.1420, 'Scout Mini', '["optical","night"]');
INSERT OR IGNORE INTO rescue_teams (id, name, status, lat, lng, specialty, max_load) VALUES
('T-01', 'Alpha Team', 'available', 11.6620, 78.1430, 'Medical', 5),
('T-02', 'Bravo Team', 'available', 11.6680, 78.1500, 'Search & Rescue', 6),
('T-03', 'Charlie Team', 'busy', 11.6635, 78.1465, 'Fire Response', 4),
('T-04', 'Delta Team', 'available', 11.6690, 78.1425, 'Logistics', 8);
INSERT OR IGNORE INTO hazard_zones (id, type, lat, lng, radius, severity) VALUES
('HZ-01', 'flood', 11.6650, 78.1480, 400, 'high');
INSERT OR IGNORE INTO facilities (id, type, name, lat, lng, capacity, occupied, status) VALUES
('FAC-01', 'hospital', 'General Hospital', 11.6600, 78.1400, 200, 145, 'open'),
('FAC-02', 'shelter', 'City Community Center', 11.6700, 78.1550, 500, 42, 'open'),
('FAC-03', 'hospital', 'Mobile Field Unit', 11.6625, 78.1490, 50, 12, 'open');