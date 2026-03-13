<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Aegis Rescue - Monorepo Structure

This project has been separated into a monorepo with independent frontend and backend applications.

## Project Structure

```
rescue/
├── frontend/               # React + Vite frontend application
│   ├── src/
│   │   ├── App.tsx        # Main application component
│   │   ├── main.tsx       # Entry point
│   │   ├── types.ts       # TypeScript interfaces
│   │   ├── translations.ts # i18n translations
│   │   ├── index.css      # Global styles
│   │   ├── components/    # React components
│   │   └── services/      # API services
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── index.html
│
├── backend/                # Node.js/Express backend
│   ├── server.ts          # Main server file
│   ├── database.sql       # Database schema
│   └── package.json
│
├── package.json           # Monorepo root configuration
└── README.md
```

## Getting Started

### Installation

Install dependencies for all workspaces:
```bash
npm run install-all
```

Or individually:
```bash
# Frontend only
npm install --workspace=frontend

# Backend only
npm install --workspace=backend
```

### Development

**Start frontend dev server:**
```bash
npm run dev:frontend
```

**Start backend server:**
```bash
npm run dev:backend
```

**Run both simultaneously** (requires two terminal windows):
```bash
# Terminal 1
npm run dev:frontend

# Terminal 2
npm run dev:backend
```

### Building

**Build frontend:**
```bash
npm run build
```

**Build all packages:**
```bash
npm run build:all
```

## Frontend

- **Framework:** React 19
- **Build Tool:** Vite 6
- **Styling:** Tailwind CSS
- **Charts:** ECharts, Recharts
- **Maps:** Leaflet
- **UI Components:** Lucide React
- **Animations:** Motion/Framer

### Frontend Scripts

- `dev` - Start development server (port 5173)
- `build` - Build for production
- `preview` - Preview production build
- `lint` - Type check with TypeScript

**Environment Variables:**
Create `frontend/.env.local`:
```
VITE_API_URL=http://localhost:3001
VITE_GEMINI_API_KEY=your_api_key
```

## Backend

- **Framework:** Express.js
- **Database:** SQLite (better-sqlite3)
- **Real-time:** Socket.io
- **Runtime:** Node.js with TypeScript (tsx)

### Backend Scripts

- `start` - Start server (port 3001)
- `dev` - Start development server with auto-reload
- `build` - Type check with TypeScript

**Environment Variables:**
Create `backend/.env`:
```
PORT=3001
NODE_ENV=development
GEMINI_API_KEY=your_api_key
```

## Key Features

### Frontend
- Real-time disaster management dashboard
- Live drone monitoring with video feeds
- Interactive map with multiple layers
- Multi-language support (English, Tamil, Hindi)
- Dark/Light theme toggle
- AI-powered analysis (Gemini)
- Photo gallery with detection
- Mission replay system
- Analytics and reporting

### Backend
- RESTful API for drones, teams, tasks
- WebSocket support for real-time updates
- SQLite database for persistence
- Authentication system
- Disaster simulation endpoints

## API Endpoints

Base URL: `http://localhost:3001/api`

- `GET /drones` - List all drones
- `GET /teams` - List all rescue teams
- `GET /tasks` - List all tasks
- `POST /auth/login` - User authentication
- `GET /reports/export` - Export mishap reports

## Development Workflow

1. Ensure both frontend and backend are installed
2. Start backend server (`npm run dev:backend`)
3. Start frontend server (`npm run dev:frontend`)
4. Frontend will proxy API calls to backend
5. Access application at `http://localhost:5173`

## Build & Deployment

**Production Build:**
```bash
npm run build:all
```

Frontend builds to `frontend/dist/`
Backend runs from TypeScript files

**To run production frontend:**
```bash
npm run preview
```

## Troubleshooting

**Port Conflicts?**
- Frontend: Change Vite port in `frontend/vite.config.ts`
- Backend: Change PORT in `backend/.env`

**Missing Dependencies?**
```bash
npm run install-all
```

**Type Errors?**
```bash
npm run build:all
```

## License

MIT

## Run locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Set `GEMINI_API_KEY` in `.env.local` if needed by the frontend.
3. Start the backend:
   `npm run dev:backend`
4. In a second terminal, start the frontend:
   `npm run dev:frontend`

## Environment

- `PORT`: backend port. Defaults to `3001`.
- `FRONTEND_ORIGIN`: allowed frontend origin for backend CORS/socket connections. Defaults to `http://localhost:5173`.
- `VITE_API_URL`: optional frontend API base URL. Leave unset for local development with the Vite proxy.
