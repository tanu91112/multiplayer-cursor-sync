# 🎯 Real-Time Multiplayer Cursor/State Sync

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://multiplayer-cursor-sync.vercel.app/)
[![GitHub](https://img.shields.io/badge/github-repo-blue)](https://github.com/tanu91112/multiplayer-cursor-sync)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org/)

A production-quality, real-time multiplayer cursor tracking system built from scratch using **raw WebSockets**, **TypeScript**, and **React** — no Socket.IO, no Yjs, no Liveblocks, no state-sync libraries.

Built for the **FlamAI Frontend R&D Assignment**.

---

## 🌐 Live Demo

| Service | URL |
|---------|-----|
| **Client (Vercel)** | [https://multiplayer-cursor-sync.vercel.app/](https://multiplayer-cursor-sync.vercel.app/) |
| **Server (Render)** | [https://multiplayer-cursor-sync.onrender.com](https://multiplayer-cursor-sync.onrender.com) |
| **GitHub Repo** | [https://github.com/tanu91112/multiplayer-cursor-sync](https://github.com/tanu91112/multiplayer-cursor-sync) |

> ⚠️ **Note:** The Render free tier spins down after 15 minutes of inactivity. The first connection may take 30–60 seconds to wake the server. Subsequent connections are instant.

---

## ✨ Features

- 🖱️ **Real-time cursor tracking** across multiple clients
- ✨ **Smooth interpolation** — 50ms buffer at 60fps (no teleporting)
- 💥 **Emoji reactions** — tap anywhere on canvas to emit an emoji burst
- 👥 **Presence list** — live count of connected users
- 🔄 **Auto-reconnect** with exponential backoff
- 🧹 **Automatic cleanup** of disconnected clients (10s heartbeat timeout)
- 🛡️ **Type-safe protocol** — every message validated with TypeScript guards
- ⚡ **Throttled cursor updates** — 30Hz (not raw 60–120Hz mousemove)
- 📱 **Responsive** — works on desktop, tablet, and mobile
- 🎨 **Emoji reactions visible to all participants**

---

## 🚀 Quick Start

### Prerequisites
- Node.js **v18+**
- npm **v9+**

### 1. Clone the repository

```bash
git clone https://github.com/tanu91112/multiplayer-cursor-sync.git
cd multiplayer-cursor-sync
```

### 2. Install dependencies

```bash
# Root
npm install

# Server
cd server && npm install && cd ..

# Client
cd client && npm install && cd ..
```

### 3. Run in development

**Terminal 1 — Server:**
```bash
cd server
npm run dev
```

**Terminal 2 — Client:**
```bash
cd client
npm run dev
```

### 4. Open multiple clients

Open [http://localhost:5173](http://localhost:5173) in **3–5 browser tabs**, join with different names, and move your mouse to see real-time sync.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Multiplayer Sync System                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    WebSocket    ┌──────────────────────────────┐  │
│  │   Client 1   │ ◄─────────────► │                              │  │
│  └──────────────┘                 │                              │  │
│  ┌──────────────┐    WebSocket    │    Server (Node.js)          │  │
│  │   Client 2   │ ◄─────────────► │    ┌──────────────────────┐  │  │
│  └──────────────┘                 │    │   Room Manager       │  │  │
│  ┌──────────────┐    WebSocket    │    │  ┌────────────────┐  │  │  │
│  │   Client 3   │ ◄─────────────► │    │  │  Clients Map   │  │  │  │
│  └──────────────┘                 │    │  ├────────────────┤  │  │  │
│                                   │    │  │  Cleanup Timer │  │  │  │
│                                   │    │  └────────────────┘  │  │  │
│                                   │    └──────────────────────┘  │  │
│                                   └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User moves mouse
       ↓
Client creates CursorMessage (throttled to 30Hz)
       ↓
WebSocket sends to server
       ↓
Server validates message with isValidMessage()
       ↓
Server broadcasts to all OTHER clients in room
       ↓
Other clients receive cursor update
       ↓
Interpolation engine buffers + smooths at 60fps
       ↓
Canvas renders interpolated position
```

---

## 📡 Protocol Design

### Message Types

| Type | Direction | Payload | Description |
|------|-----------|---------|-------------|
| `join` | Client → Server | `{ username, color }` | Join a room |
| `cursor` | Client ↔ Server | `{ x, y }` | Cursor position update |
| `reaction` | Client → Server | `{ emoji, x, y }` | Emoji reaction |
| `presence` | Server → Client | `{ clients: ClientInfo[] }` | List of online users |
| `leave` | Client → Server | `{}` | Leave room |
| `heartbeat` | Client ↔ Server | `{}` | Keep connection alive |
| `error` | Server → Client | `{ message }` | Error notification |

### Message Validation

Every message is validated using a **TypeScript type guard** before processing:

```typescript
export function isValidMessage(data: any): data is Message {
  if (!data || typeof data !== 'object') return false;
  if (!data.type || typeof data.type !== 'string') return false;
  if (!data.clientId || typeof data.clientId !== 'string') return false;
  if (typeof data.timestamp !== 'number') return false;

  switch (data.type) {
    case 'join':
      return typeof data.username === 'string' && typeof data.color === 'string';
    case 'cursor':
      return typeof data.x === 'number' && typeof data.y === 'number';
    case 'reaction':
      return typeof data.emoji === 'string' &&
             typeof data.x === 'number' &&
             typeof data.y === 'number';
    // ...
  }
}
```

Malformed messages are **rejected** — never silently accepted, never crash the client.

### Throttling Strategy

| Action | Frequency | Rationale |
|--------|-----------|-----------|
| **Cursor updates** | 30Hz (33ms) | Balances smoothness with bandwidth (mousemove is 60–120Hz raw) |
| **Heartbeat** | 5s | Keeps connections alive through proxies/load balancers |
| **Client timeout** | 10s | Removes stale clients (no zombie cursors) |

---

## 🎯 Interpolation Strategy

**Linear Interpolation with 50ms Buffer**

```
Buffer Delay: 50ms (adds 50ms latency for smoothness)
Tick Rate:    60fps
Algorithm:
  1. Buffer incoming positions with timestamps
  2. Find two positions bracketing (current time − 50ms)
  3. Linearly interpolate between them
  4. Render the interpolated position every frame
```

### Tradeoffs

| ✅ Advantages | ❌ Disadvantages |
|---------------|------------------|
| Smooth movement — no teleporting | ~50ms added latency |
| Handles network jitter gracefully | Requires buffering memory |
| Predictable frame timing | Slightly delayed compared to raw updates |

**Why 50ms?** Empirically, 50ms is enough to absorb typical network jitter (10–40ms variance) while keeping perceived latency imperceptible during cursor tracking.

---

## 🔄 Failure Handling

### Disconnect Detection

- WebSocket `close` and `error` events trigger immediate cleanup
- **Heartbeat timeout** (10s without heartbeat) removes stale clients
- Cursor is removed from **all** connected clients

### Reconnection

- **Exponential backoff:** 1s → 1.5s → 2.25s → 3.37s → 5.06s
- Max **5 attempts**
- Client automatically re-joins the room on success

### Out-of-Order Messages

- Every message includes a `timestamp` field
- Client discards stale cursor updates (older than last applied)
- Interpolation uses timestamps to maintain correct ordering

### Malformed Messages

- `isValidMessage()` rejects invalid payloads
- Server sends an `error` message back to the offending client
- No crash — the room continues functioning normally

---

## 📁 Project Structure

```
multiplayer-cursor-sync/
├── server/
│   ├── src/
│   │   ├── server.ts              # WebSocket server + room manager
│   │   ├── room.ts                # Room class + client lifecycle
│   │   └── shared/
│   │       └── protocol.ts        # Shared message types (server copy)
│   ├── package.json
│   └── tsconfig.json
├── client/
│   ├── src/
│   │   ├── App.tsx                # Main React component
│   │   ├── App.css                # Global styling
│   │   ├── connection.ts          # WebSocket client
│   │   ├── interpolation.ts       # Smooth cursor engine
│   │   └── main.tsx               # React entry point
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── shared/
│   └── protocol.ts                # Shared message types (canonical)
├── README.md
├── ARCHITECTURE.md
├── REQUIREMENTS.txt
└── .gitignore
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18 + TypeScript + Vite |
| **Backend** | Node.js + TypeScript + `ws` |
| **Transport** | Raw WebSocket API |
| **Rendering** | HTML5 Canvas |
| **Styling** | Vanilla CSS |
| **Deployment** | Vercel (client) + Render (server) |

**No Socket.IO. No Yjs. No Liveblocks. No state-sync frameworks.**

---

## 🚫 Known Limitations

| Limitation | Impact |
|------------|--------|
| No persistence across server restarts | In-memory state only |
| No horizontal scaling | Single server instance |
| No authentication | Anyone can join any room |
| No message history | No replay for late joiners |
| Render free tier | 15-min spin-down after inactivity |
| No rate limiting | Potential for abuse |

---

## 🔭 Scaling Strategy (Bonus)

To scale beyond a single process:

1. **Horizontal scaling** — Run multiple Node.js instances behind a load balancer
2. **Redis Pub/Sub** — Broadcast messages across server instances
3. **Sticky sessions** — Route a client to the same server for its room
4. **Room sharding** — Assign rooms to specific servers by hash
5. **Edge WebSockets** — Use Cloudflare Durable Objects for global low-latency

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full discussion.

---

## ⏱️ Time Spent

| Phase | Hours |
|-------|-------|
| Project setup & protocol design | 2 |
| Server implementation | 3 |
| Client implementation | 4 |
| Interpolation engine | 2 |
| Deployment & debugging | 3 |
| Documentation | 2 |
| **Total** | **~16 hours** |

---

## 🤖 AI Tools Disclosure

AI assistance was used for:
- Initial project scaffolding and boilerplate
- Debugging deployment issues (Render `rootDir` / Vercel build scripts)
- Documentation formatting

**All architectural decisions, protocol design, and interpolation logic were reviewed and are fully understood by the author.**

---

## 📄 License

MIT © 2026 Tanu Chandravanshi

---

## 🙏 Acknowledgments

Built for the **FlamAI Frontend R&D Assignment** — Real-Time Multiplayer Cursor/State Sync.
