# GrowthPilot OS Command Center

GrowthPilot OS Command Center is an enterprise-grade agentic operations cockpit built on **Next.js 15+**, **React 19**, **Prisma**, **TypeScript**, and **Tailwind CSS**. It serves as the primary orchestration and synchronization layer between human operators, local system databases, and **Supervity AI Workflow Engines**.

---

## Key Core Architectures

### 1. Closed-Loop Orchestration
Operates with perfect parity between the **Live Operations Dashboard** (system telemetry, streaming node status) and the **AI Workbench** (Human-in-the-Loop approval queue).
- **Trigger Phase**: Operations triggered manually or automatically call the `/api/agents/trigger` endpoint which routes payloads to the Supervity `execute/stream` service.
- **Human Intercept (`pending_human` / `node-paused` / `human-input-required`)**: The incoming Server-Sent Events (SSE) stream is parsed live. If a manual authorization node is hit, a task is instantly persisted in the local Prisma SQLite DB.
- **Polling & Action**: The AI Workbench polls the Prisma queue every 3 seconds. When a human hits "Approve" or "Reject", the action executes a resolution request `/api/agents/workbench-resolve` to unpause the pipeline.

### 2. High-Performance Stream Draining (Anti-Socket Exhaustion)
To prevent Severe TCP connection leaks and serverless memory bloat, `workbench-resolve` handles Supervity's long-running SSE responses asynchronously:
- **Instant UI Response**: The user interface immediately receives an `HTTP 200 OK` on clicking "Approve", instantly unblocking the dashboard.
- **Fire-and-Forget Server Drainage**: In the background, the Next.js backend asynchronously reads and decodes the active stream to completion so that underlying connections are cleanly garbage-collected, preventing 502/504 gateway failures.

### 3. Server-Side Log Persistence & Telemetry Sync
Previously, actions triggered via the Workbench executed in complete darkness. The latest architecture integrates a full SSE background parser inside `workbench-resolve/route.ts`:
- **Real-Time Data Extraction**: The background task decodes the incoming stream buffer, maps node-specific payloads (`node_name`, `operator`, `output`), and extracts state messages.
- **Unified Schema Mapping**: Every event is instantly stored directly to the SQLite database via `prisma.logEntry.create()`, keeping post-approval telemetry fully synchronized with the client log viewer.

---

## Getting Started

### Prerequisites

Create a `.env.local` file in the root directory:
```env
DATABASE_URL="file:./dev.db"
SUPERVITY_BEARER_TOKEN="your_production_token"
```

### Installation

1. Install system dependencies:
```bash
npm install
```

2. Run Database migrations and seed the Prisma store:
```bash
npx prisma db push
```

3. Run the development server with Turbopack optimization:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to launch the Command Center.

---

## Project Structure

```
AutoPilot-Template/frontend/
├── prisma/             # Schema definitions and SQLite db files
├── src/
│   ├── app/            # App Router pages and API routes
│   │   ├── api/        # Dashboard stats, agents triggers, and resolve endpoints
│   │   └── page.tsx    # Live Operations entry point
│   ├── components/     # High-fidelity dashboard widgets
│   │   ├── LiveOperationsDashboard.tsx  # Central monitoring UI & SSE reader
│   │   ├── AIWorkbench.tsx              # Human-in-the-loop task manager
│   │   └── ui/         # Modern premium developer elements
│   ├── lib/            # Shared libraries (Prisma client, Supervity mapper)
│   └── types/          # Strict TypeScript interface declarations
└── README.md
```

---

## Developer Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Starts development server with Next.js Turbopack |
| `npm run build` | Builds highly optimized static and server-side production pages |
| `npm start` | Launches Next.js production server |
| `npm run lint` | Runs static analysis with strict ESLint policies |
| `npm run format` | Standardizes codebase spacing and style formatting |
