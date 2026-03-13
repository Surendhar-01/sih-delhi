import express from "express";
import fs from "fs";
import { createServer } from "http";
import { Server } from "socket.io";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const PORT = Number(process.env.PORT ?? 3001);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";
const ALLOWED_ORIGINS = [
  FRONTEND_ORIGIN,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:5174",
  "http://localhost:5175",
];

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow Vercel preview URLs
  if (origin.endsWith(".vercel.app")) return true;
  return false;
}
const dbPath = path.resolve(process.cwd(), "rescue_prototype.db");
const backendDir = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.resolve(backendDir, "database.sql");
const db = new Database(dbPath);
db.exec(fs.readFileSync(sqlPath, "utf8"));

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin not allowed: ${origin}`));
      },
    },
  });
  const openApiSpec = {
    openapi: "3.0.3",
    info: {
      title: "Aegis Rescue API",
      version: "1.0.0",
      description: "Disaster rescue backend API",
    },
    servers: [{ url: `http://localhost:${PORT}` }],
    paths: {
      "/health": {
        get: {
          summary: "Health check",
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/auth/login": {
        post: {
          summary: "Login",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email: { type: "string", example: "admin@test.com" },
                    password: { type: "string", example: "123456" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Success" },
            "401": { description: "Invalid credentials" },
          },
        },
      },
      "/api/drones": {
        get: {
          summary: "List drones",
          responses: { "200": { description: "Drones" } },
        },
        post: {
          summary: "Register new drone",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "model"],
                  properties: {
                    name: { type: "string" },
                    model: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Created" } },
        },
      },
      "/api/drones/{id}": {
        patch: {
          summary: "Update drone status",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { status: { type: "string" } },
                },
              },
            },
          },
          responses: { "200": { description: "Updated" } },
        },
      },
      "/api/teams": {
        get: {
          summary: "List rescue teams",
          responses: { "200": { description: "Teams" } },
        },
      },
      "/api/tasks": {
        get: {
          summary: "List tasks",
          responses: { "200": { description: "Tasks" } },
        },
      },
      "/api/hazards": {
        get: {
          summary: "List hazard zones",
          responses: { "200": { description: "Hazards" } },
        },
        post: {
          summary: "Report hazard",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["type", "lat", "lng"],
                  properties: { type: "string" },
                  lat: { type: "number" },
                  lng: { type: "number" },
                },
              },
            },
          },
          responses: { "200": { description: "Created" } },
        },
      },
      "/api/hazards/{id}": {
        delete: {
          summary: "Remove hazard",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { "200": { description: "Deleted" } },
        },
      },
      "/api/stats": {
        get: {
          summary: "Dashboard statistics",
          responses: { "200": { description: "Statistics" } },
        },
      },
      "/api/map-data": {
        get: {
          summary: "Combined map data",
          responses: { "200": { description: "Map data payload" } },
        },
      },
      "/api/notifications": {
        get: {
          summary: "Latest notifications",
          responses: { "200": { description: "Notifications" } },
        },
      },
      "/api/simulate/detection": {
        post: {
          summary: "Create simulated task from drone detection",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["drone_id"],
                  properties: {
                    drone_id: { type: "string", example: "DR-101" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Created" } },
        },
      },
      "/api/tasks/{id}": {
        patch: {
          summary: "Update task status",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              example: "SAMPLE-TASK-001",
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status"],
                  properties: {
                    status: {
                      type: "string",
                      enum: ["pending", "assigned", "in-progress", "completed"],
                      example: "completed",
                    },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Updated" } },
        },
      },
      "/api/tasks/{id}/dispatch": {
        post: {
          summary: "Dispatch team to task",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              example: "SAMPLE-TASK-001",
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["team_id"],
                  properties: {
                    team_id: { type: "string", example: "T-01" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Dispatched" } },
        },
      },
      "/api/reports/export": {
        get: {
          summary: "Export CSV report",
          responses: { "200": { description: "CSV" } },
        },
      },
      "/api/facilities": {
        get: {
          summary: "List facilities",
          responses: { "200": { description: "Facilities" } },
        },
      },
      "/api/system/health": {
        get: {
          summary: "System reliability metrics",
          responses: { "200": { description: "Health metrics" } },
        },
      },
    },
  };

  app.use((req, res, next) => {
    const reqOrigin = req.headers.origin;
    const allowOrigin = isOriginAllowed(reqOrigin) ? reqOrigin : FRONTEND_ORIGIN;
    res.header("Access-Control-Allow-Origin", allowOrigin || FRONTEND_ORIGIN);
    res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));

  app.get("/", (req, res) => {
    res.json({
      service: "rescue-backend",
      status: "ok",
      frontend: FRONTEND_ORIGIN,
      api: "/api",
      health: "/health",
    });
  });

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/swagger.json", (req, res) => {
    res.json(openApiSpec);
  });

  app.get("/docs", (req, res) => {
    res.type("html").send(`
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Aegis Rescue API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>body{margin:0;background:#f4f5f6}#swagger-ui{max-width:1200px;margin:0 auto}</style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '/swagger.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis]
      });
    </script>
  </body>
</html>`);
  });

  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    const user = db
      .prepare("SELECT * FROM users WHERE email = ? AND password = ?")
      .get(email, password) as any;

    if (user) {
      // Simulate AI Risk Assessment & Context
      const riskScore = Math.random() > 0.95 ? "MEDIUM" : "LOW";
      const authContext = {
        risk_score: riskScore,
        biometric_required: true,
        last_login_location: "Command Center Alpha",
        ai_token: `ai-verify-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      };
      res.json({ success: true, user, authContext });
    } else {
      res.status(401).json({ success: false });
    }
  });

  app.get("/api/drones", (req, res) =>
    res.json(db.prepare("SELECT * FROM drones").all()),
  );
  app.post("/api/drones", (req, res) => {
    const { name, model, lat, lng, capabilities } = req.body;
    const id = `DR-${Date.now()}`;
    db.prepare(
      "INSERT INTO drones (id, name, status, battery, lat, lng, altitude, speed, signal_strength, model, camera, range, capabilities) VALUES (?, ?, 'standby', 100, ?, ?, 0, 0, 100, ?, 'Standard', '10km', ?)",
    ).run(
      id,
      name,
      lat || 11.6643,
      lng || 78.146,
      model || "Generic",
      JSON.stringify(capabilities || []),
    );
    io.emit("drones_update", db.prepare("SELECT * FROM drones").all());
    res.json({ success: true, id });
  });
  app.patch("/api/drones/:id", (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    db.prepare("UPDATE drones SET status = ? WHERE id = ?").run(status, id);
    io.emit("drones_update", db.prepare("SELECT * FROM drones").all());
    res.json({ success: true });
  });

  app.get("/api/teams", (req, res) =>
    res.json(db.prepare("SELECT * FROM rescue_teams").all()),
  );
  app.get("/api/tasks", (req, res) =>
    res.json(
      db
        .prepare(
          "SELECT t.*, rt.name as team_name FROM tasks t LEFT JOIN rescue_teams rt ON t.assigned_team_id = rt.id ORDER BY created_at DESC",
        )
        .all(),
    ),
  );
  app.get("/api/hazards", (req, res) =>
    res.json(db.prepare("SELECT * FROM hazard_zones").all()),
  );
  app.post("/api/hazards", (req, res) => {
    const { type, lat, lng, radius, severity } = req.body;
    const id = `HZ-${Date.now()}`;
    db.prepare(
      "INSERT INTO hazard_zones (id, type, lat, lng, radius, severity) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(id, type, lat, lng, radius || 500, severity || "medium");
    res.json({ success: true, id });
  });
  app.delete("/api/hazards/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM hazard_zones WHERE id = ?").run(id);
    res.json({ success: true });
  });

  app.get("/api/facilities", (req, res) =>
    res.json(db.prepare("SELECT * FROM facilities").all()),
  );

  app.get("/api/system/health", (req, res) => {
    res.json({
      uptime: process.uptime(),
      status: "operational",
      latency: Math.floor(Math.random() * 20) + 10,
      active_connections: io.engine.clientsCount,
    });
  });

  app.get("/api/stats", (req, res) => {
    const drones = db
      .prepare(
        "SELECT COUNT(*) as total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active FROM drones",
      )
      .get() as any;
    const teams = db
      .prepare(
        "SELECT COUNT(*) as total, SUM(CASE WHEN status='busy' THEN 1 ELSE 0 END) as deployed FROM rescue_teams",
      )
      .get() as any;
    const tasks = db
      .prepare(
        "SELECT COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed FROM tasks",
      )
      .get() as any;
    res.json({ drones, teams, tasks });
  });

  app.get("/api/map-data", (req, res) => {
    res.json({
      drones: db.prepare("SELECT * FROM drones").all(),
      teams: db.prepare("SELECT * FROM rescue_teams").all(),
      tasks: db
        .prepare(
          "SELECT t.*, rt.name as team_name FROM tasks t LEFT JOIN rescue_teams rt ON t.assigned_team_id = rt.id ORDER BY created_at DESC",
        )
        .all(),
      hazards: db.prepare("SELECT * FROM hazard_zones").all(),
      facilities: db.prepare("SELECT * FROM facilities").all(),
    });
  });
  app.get("/api/notifications", (req, res) =>
    res.json(
      db
        .prepare("SELECT * FROM notifications ORDER BY timestamp DESC LIMIT 20")
        .all(),
    ),
  );

  app.post("/api/simulate/detection", (req, res) => {
    const { drone_id } = req.body;
    const drone = db
      .prepare("SELECT * FROM drones WHERE id = ?")
      .get(drone_id) as any;
    if (!drone) return res.status(404).json({ error: "Drone not found" });

    const types = ["Flood Zone A", "Earthquake Zone B", "Landslide Area"];
    const priorities = ["low", "medium", "high", "critical"];
    const type = types[Math.floor(Math.random() * types.length)];
    const priority = priorities[Math.floor(Math.random() * priorities.length)];
    const victim_count = 5 + Math.floor(Math.random() * 11); // Generates between 5 and 15 victims
    const id = `TASK-${Date.now()}`;

    const teams = db
      .prepare(
        "SELECT * FROM rescue_teams WHERE status != 'offline' AND current_load < max_load",
      )
      .all() as any[];
    const assignedTeamId = teams.length > 0 ? teams[0].id : null;

    db.prepare(
      "INSERT INTO tasks (id, type, priority, status, lat, lng, victim_count, description, assigned_team_id, drone_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      type,
      priority,
      assignedTeamId ? "assigned" : "pending",
      drone.lat,
      drone.lng,
      victim_count,
      `Simulated detection at ${type}`,
      assignedTeamId,
      drone_id,
    );
    if (assignedTeamId) {
      db.prepare(
        "UPDATE rescue_teams SET current_load = current_load + 1, status = 'busy' WHERE id = ?",
      ).run(assignedTeamId);
    }

    io.emit(
      "task_updated",
      db.prepare("SELECT * FROM tasks WHERE id = ?").get(id),
    );
    io.emit("notification", {
      type: "ALERT",
      message: `Priority ${priority.toUpperCase()} victim detected at ${type}`,
    });
    res.json({ success: true });
  });

  app.patch("/api/tasks/:id", (req, res) => {
    const { status } = req.body;
    const { id } = req.params;
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
    if (status === "completed" && task.assigned_team_id) {
      db.prepare(
        "UPDATE rescue_teams SET current_load = MAX(0, current_load - 1), status = 'available' WHERE id = ?",
      ).run(task.assigned_team_id);
      db.prepare(
        "UPDATE tasks SET completed_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).run(id);
    }
    db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run(status, id);
    io.emit(
      "task_updated",
      db.prepare("SELECT * FROM tasks WHERE id = ?").get(id),
    );
    res.json({ success: true });
  });

  app.post("/api/tasks/:id/dispatch", (req, res) => {
    const { id } = req.params;
    const { team_id } = req.body as { team_id?: string };

    if (!team_id) {
      res.status(400).json({ success: false, error: "team_id is required" });
      return;
    }

    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
    const team = db
      .prepare("SELECT * FROM rescue_teams WHERE id = ?")
      .get(team_id) as any;

    if (!task) {
      res.status(404).json({ success: false, error: "Task not found" });
      return;
    }
    if (!team) {
      res.status(404).json({ success: false, error: "Team not found" });
      return;
    }
    if (team.current_load >= team.max_load) {
      res
        .status(409)
        .json({ success: false, error: "Team is at max capacity" });
      return;
    }

    const tx = db.transaction(() => {
      db.prepare(
        "UPDATE tasks SET assigned_team_id = ?, status = 'assigned' WHERE id = ?",
      ).run(team_id, id);
      db.prepare(
        "UPDATE rescue_teams SET current_load = current_load + 1, status = 'busy' WHERE id = ?",
      ).run(team_id);
    });
    tx();

    const updatedTask = db
      .prepare(
        "SELECT t.*, rt.name as team_name FROM tasks t LEFT JOIN rescue_teams rt ON t.assigned_team_id = rt.id WHERE t.id = ?",
      )
      .get(id);
    io.emit("task_updated", updatedTask);
    io.emit("teams_update", db.prepare("SELECT * FROM rescue_teams").all());
    io.emit("notification", {
      type: "DISPATCH",
      message: `Team ${team.name} dispatched to ${task.type}`,
    });

    res.json({ success: true, task: updatedTask, team_id });
  });

  app.post("/api/tasks/:id/supply-drop", (req, res) => {
    const { id } = req.params;
    const { drone_id } = req.body as { drone_id?: string };

    if (!drone_id) {
      res.status(400).json({ success: false, error: "drone_id is required" });
      return;
    }

    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
    const drone = db
      .prepare("SELECT * FROM drones WHERE id = ?")
      .get(drone_id) as any;

    if (!task) {
      res.status(404).json({ success: false, error: "Task not found" });
      return;
    }
    if (!drone) {
      res.status(404).json({ success: false, error: "Drone not found" });
      return;
    }

    let caps = [];
    try {
      caps = JSON.parse(drone.capabilities || "[]");
    } catch (e) {}

    if (!caps.includes("supply")) {
      res
        .status(400)
        .json({ success: false, error: "Drone lacks supply capabilities" });
      return;
    }

    if (drone.status !== "standby" && drone.status !== "active") {
      res.status(400).json({ success: false, error: "Drone is not available" });
      return;
    }

    const tx = db.transaction(() => {
      // Mark drone as delivering
      db.prepare(
        "UPDATE drones SET status = 'delivering', speed = 60 WHERE id = ?",
      ).run(drone_id);
    });
    tx();

    io.emit("drones_update", db.prepare("SELECT * FROM drones").all());
    io.emit("notification", {
      type: "DISPATCH",
      message: `Drone ${drone.name} dispatched for supply drop at ${task.type}`,
    });

    res.json({ success: true, task_id: id, drone_id });
  });

  app.get("/api/reports/export", (req, res) => {
    const tasks = db.prepare("SELECT * FROM tasks").all() as any[];
    const csv = [
      "ID,Type,Priority,Status,Victims,Lat,Lng,Created",
      ...tasks.map(
        (t) =>
          `${t.id},${t.type},${t.priority},${t.status},${t.victim_count},${t.lat},${t.lng},${t.created_at}`,
      ),
    ].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=rescue_report.csv",
    );
    res.send(csv);
  });

  const startServerWithRetries = (maxRetries = 5, retryDelay = 1000) => {
    let retryCount = 0;

    const tryListen = () => {
      // Detach any previous error handlers to prevent memory leaks from recursion
      httpServer.removeAllListeners("error");

      httpServer.listen(PORT, "0.0.0.0");

      httpServer.once("listening", () => {
        console.log(`Backend API running on http://localhost:${PORT}`);
      });

      httpServer.once("error", (err: any) => {
        if (err.code === "EADDRINUSE") {
          if (retryCount < maxRetries) {
            retryCount++;
            console.log(
              `Port ${PORT} is busy, retrying in ${retryDelay}ms... (${retryCount}/${maxRetries})`,
            );
            setTimeout(tryListen, retryDelay);
          } else {
            console.error(
              `\n❌ Error: Port ${PORT} is still in use after ${maxRetries} retries.`,
            );
            console.error(`Another process is likely holding the port.`);
            console.error(`To fix this, run: npx kill-port ${PORT}`);
            process.exit(1);
          }
        } else {
          throw err;
        }
      });
    };

    tryListen();
  };

  startServerWithRetries();

  // Simulation loop - runs once globally, not per connection
  setInterval(() => {
    const drones = db.prepare("SELECT * FROM drones").all() as any[];
    drones.forEach((drone) => {
      if (drone.status === "active") {
        const newLat = drone.lat + (Math.random() - 0.5) * 0.0002;
        const newLng = drone.lng + (Math.random() - 0.5) * 0.0002;
        db.prepare(
          "UPDATE drones SET lat = ?, lng = ?, battery = MAX(0, battery - 0.01) WHERE id = ?",
        ).run(newLat, newLng, drone.id);
      } else if (drone.status === "delivering") {
        // Drone is performing a supply drop, find the task it's heading to (a pending task matching drone lat/lng approximately)
        // For simplicity, we just find the highest priority pending task and move towards it
        const targetTask = db
          .prepare(
            "SELECT * FROM tasks WHERE status = 'pending' ORDER BY victim_count DESC LIMIT 1",
          )
          .get() as any;
        if (targetTask) {
          const dLat = targetTask.lat - drone.lat;
          const dLng = targetTask.lng - drone.lng;
          const dist = Math.sqrt(dLat * dLat + dLng * dLng);

          if (dist > 0.0005) {
            const step = Math.min(0.0008, dist * 0.8); // Drones move fast
            db.prepare(
              "UPDATE drones SET lat = ?, lng = ?, battery = MAX(0, battery - 0.05) WHERE id = ?",
            ).run(
              drone.lat + (dLat / dist) * step,
              drone.lng + (dLng / dist) * step,
              drone.id,
            );
          } else {
            // Arrived at drop zone
            db.prepare(
              "UPDATE drones SET status = 'returning' WHERE id = ?",
            ).run(drone.id);
            io.emit("notification", {
              type: "SUCCESS",
              message: `Supply package delivered by ${drone.name} at ${targetTask.type}`,
            });
            // Mark task as having received supplies (could add a new column, using description for now)
            db.prepare(
              "UPDATE tasks SET description = description || ' [SUPPLIES DELIVERED]' WHERE id = ?",
            ).run(targetTask.id);
            io.emit(
              "task_updated",
              db.prepare("SELECT * FROM tasks WHERE id = ?").get(targetTask.id),
            );
          }
        } else {
          db.prepare("UPDATE drones SET status = 'active' WHERE id = ?").run(
            drone.id,
          );
        }
      } else if (drone.status === "returning") {
        // Return to base (hardcoded center)
        const baseLat = 11.664;
        const baseLng = 78.145;
        const dLat = baseLat - drone.lat;
        const dLng = baseLng - drone.lng;
        const dist = Math.sqrt(dLat * dLat + dLng * dLng);

        if (dist > 0.0002) {
          const step = Math.min(0.0008, dist * 0.8);
          db.prepare(
            "UPDATE drones SET lat = ?, lng = ?, battery = MAX(0, battery - 0.05) WHERE id = ?",
          ).run(
            drone.lat + (dLat / dist) * step,
            drone.lng + (dLng / dist) * step,
            drone.id,
          );
        } else {
          db.prepare(
            "UPDATE drones SET status = 'standby', battery = 100 WHERE id = ?",
          ).run(drone.id);
        }
      }
    });

    const teams = db
      .prepare("SELECT * FROM rescue_teams WHERE status = 'busy'")
      .all() as any[];
    teams.forEach((team) => {
      const activeTask = db
        .prepare(
          "SELECT * FROM tasks WHERE assigned_team_id = ? AND status = 'assigned'",
        )
        .get(team.id) as any;
      if (activeTask) {
        const dLat = activeTask.lat - team.lat;
        const dLng = activeTask.lng - team.lng;
        const dist = Math.sqrt(dLat * dLat + dLng * dLng);
        const createdMs = Date.parse(
          String(activeTask.created_at || "").replace(" ", "T") + "Z",
        );
        const assignedForMs = Number.isFinite(createdMs)
          ? Date.now() - createdMs
          : 0;
        const forceStart = assignedForMs > 18000; // Avoid long "assigned" stalls in demo mode.

        if (dist > 0.0003 && !forceStart) {
          const step = Math.min(0.00035, dist * 0.8);
          db.prepare(
            "UPDATE rescue_teams SET lat = ?, lng = ?, distance_to_target = ? WHERE id = ?",
          ).run(
            team.lat + (dLat / dist) * step,
            team.lng + (dLng / dist) * step,
            dist * 111,
            team.id,
          );
        } else {
          db.prepare(
            "UPDATE tasks SET status = 'in-progress' WHERE id = ?",
          ).run(activeTask.id);
          const started = db
            .prepare(
              "SELECT t.*, rt.name as team_name FROM tasks t LEFT JOIN rescue_teams rt ON t.assigned_team_id = rt.id WHERE t.id = ?",
            )
            .get(activeTask.id);
          io.emit("task_updated", started);
          io.emit("notification", {
            type: "RESCUE",
            message: `${team.name} started rescue at ${activeTask.type}`,
          });
        }
      }
    });

    // Auto-complete active rescues and free team capacity.
    const inProgressTasks = db
      .prepare("SELECT * FROM tasks WHERE status = 'in-progress'")
      .all() as any[];
    inProgressTasks.forEach((task) => {
      if (Math.random() < 0.3) {
        const tx = db.transaction(() => {
          db.prepare(
            "UPDATE tasks SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(task.id);
          if (task.assigned_team_id) {
            db.prepare(
              "UPDATE rescue_teams SET current_load = MAX(0, current_load - 1), distance_to_target = 0 WHERE id = ?",
            ).run(task.assigned_team_id);
            db.prepare(
              "UPDATE rescue_teams SET status = CASE WHEN current_load <= 1 THEN 'available' ELSE 'busy' END WHERE id = ?",
            ).run(task.assigned_team_id);
          }
        });
        tx();

        const completed = db
          .prepare(
            "SELECT t.*, rt.name as team_name FROM tasks t LEFT JOIN rescue_teams rt ON t.assigned_team_id = rt.id WHERE t.id = ?",
          )
          .get(task.id);
        io.emit("task_updated", completed);
        io.emit("notification", {
          type: "SUCCESS",
          message: `Rescue completed: ${task.type}`,
        });
      }
    });

    io.emit("drones_update", db.prepare("SELECT * FROM drones").all());
    io.emit("teams_update", db.prepare("SELECT * FROM rescue_teams").all());
    io.emit(
      "tasks_update",
      db
        .prepare(
          "SELECT t.*, rt.name as team_name FROM tasks t LEFT JOIN rescue_teams rt ON t.assigned_team_id = rt.id ORDER BY created_at DESC",
        )
        .all(),
    );
  }, 3000);

  io.on("connection", (socket) => {
    // Send initial data immediately upon connection
    socket.emit("drones_update", db.prepare("SELECT * FROM drones").all());
    socket.emit("teams_update", db.prepare("SELECT * FROM rescue_teams").all());
    socket.emit(
      "tasks_update",
      db
        .prepare(
          "SELECT t.*, rt.name as team_name FROM tasks t LEFT JOIN rescue_teams rt ON t.assigned_team_id = rt.id ORDER BY created_at DESC",
        )
        .all(),
    );
  });
}

startServer();
