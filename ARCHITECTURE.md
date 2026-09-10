# 🏗️ Architecture — Real-Time Multiplayer Cursor/State Sync

This document describes the design, data flow, protocol, and scaling considerations for the real-time multiplayer sync system.

---

## 📐 System Overview

The system consists of three main components:

| Component | Role |
|-----------|------|
| **Server** | Node.js + `ws` — manages rooms, presence, message validation, and broadcasting |
| **Client** | React + TypeScript — renders UI, handles input, manages WebSocket connection |
| **Shared Protocol** | TypeScript message types + runtime validation used by both sides |

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

---

## 🔄 Message Flow

### 1. Join Flow

```
Client                          Server                         Other Clients
   │                              │                                │
   ├──── JOIN (username) ────────►│                                │
   │                              │                                │
   │                              ├───── PRESENCE (clients) ─────►│
   │                              │                                │
   │                              ├──────── JOIN (user) ─────────►│
   │                              │                                │
   │◄─── PRESENCE (clients) ──────┤                                │
   │                              │                                │
```

**Approach:** Full state snapshot — new clients receive the entire list of current participants via a `presence` message immediately after joining.

### 2. Cursor Flow (Throttled at 30Hz)

```
Client                          Server                         Other Clients
   │                              │                                │
   │ (33ms throttle)             │                                │
   │                              │                                │
   ├──── CURSOR (x,y) ──────────►│                                │
   │                              │                                │
   │                              ├──────── CURSOR (x,y) ────────►│
   │                              │                                │
   │          [Interpolation Engine on each client]                │
   │                              │                                │
```

### 3. Reaction Flow

```
Client                          Server                         Other Clients
   │                              │                                │
   ├──── REACTION (emoji,x,y) ──►│                                │
   │                              │                                │
   │                              ├──── REACTION (emoji,x,y) ────►│
   │                              │                                │
   │          [Emoji animation on all clients]                    │
```

### 4. Disconnect Flow

```
Client                          Server                         Other Clients
   │                              │                                │
   │ (Browser closes tab)        │                                │
   │                              │                                │
   │◄─────── WebSocket close ─────►                                │
   │                              │                                │
   │                              ├─────── LEAVE (user) ─────────►│
   │                              │                                │
   │                          [10s timeout for heartbeat]          │
   │                              │                                │
   │                          [Cleanup zombie clients]             │
```

---

## 📡 Protocol Design

### Why This Shape?

- **Minimal message types** — only 7 types cover all sync needs
- **Base fields on every message** — `type`, `clientId`, `timestamp`
- **TypeScript discriminated unions** — enables exhaustive `switch` checks
- **Runtime validation** — `isValidMessage()` prevents malformed payloads

### Message Types

| Type | Direction | Payload | Purpose |
|------|-----------|---------|---------|
| `join` | Client → Server | `{ username, color }` | Announce presence |
| `cursor` | Client ↔ Server | `{ x, y }` | Continuous cursor position |
| `reaction` | Client → Server | `{ emoji, x, y }` | One-shot emoji burst |
| `presence` | Server → Client | `{ clients[] }` | Full snapshot of room |
| `leave` | Client → Server | `{}` | Voluntary disconnect |
| `heartbeat` | Client ↔ Server | `{}` | Keep-alive signal |
| `error` | Server → Client | `{ message }` | Protocol violation |

### Message Validation

```typescript
export function isValidMessage(data: any): data is Message {
  // 1. Guard base fields
  if (!data || typeof data !== 'object') return false;
  if (!data.type || typeof data.type !== 'string') return false;
  if (!data.clientId || typeof data.clientId !== 'string') return false;
  if (typeof data.timestamp !== 'number') return false;

  // 2. Guard type-specific payloads
  switch (data.type) {
    case 'join':
      return typeof data.username === 'string' && typeof data.color === 'string';
    case 'cursor':
      return typeof data.x === 'number' && typeof data.y === 'number';
    case 'reaction':
      return typeof data.emoji === 'string' &&
             typeof data.x === 'number' &&
             typeof data.y === 'number';
    case 'presence':
      return Array.isArray(data.clients);
    case 'leave':
    case 'heartbeat':
      return true;
    case 'error':
      return typeof data.message === 'string';
    default:
      return false;
  }
}
```

**Malformed messages are rejected server-side with an `error` response — never silently accepted, never crash the client.**

### Throttling / Batching

| Event | Raw Rate | Throttled To | Method |
|-------|----------|--------------|--------|
| `mousemove` | 60–120 Hz | **30 Hz** | Client-side `setTimeout` gate (33ms) |
| Heartbeat | — | **0.2 Hz** | `setInterval` every 5s |
| Cleanup scan | — | **0.1 Hz** | `setInterval` every 10s |

**Why 30Hz?** Visual smoothness for cursor tracking requires ~24–30 fps minimum. Sending at raw mousemove rate would generate 2–4× more network traffic without any perceived smoothness improvement — especially since the receiving client interpolates anyway.

### Server vs Client State

| State | Lives On | Reason |
|-------|----------|--------|
| Room membership | Server | Authoritative source of who's connected |
| Client colors/usernames | Server | Assigned on join, broadcast to all |
| Cursor positions | **Client only** (relayed) | High-frequency, no server logic needed |
| Reaction events | **Client only** (relayed) | Fire-and-forget, no persistence |
| Interpolation history | Client only | Rendering concern, not sync concern |

**Key insight:** The server holds *presence* state, but cursor/reaction positions are **purely relayed** — the server doesn't need to store them.

---

## 🎯 Client-Side Reconciliation & Interpolation

### Interpolation Strategy

**Linear interpolation with a 50ms buffer.**

```typescript
getInterpolatedPosition(clientId: string, now: number): { x, y } | null {
  const history = this.history.get(clientId);
  if (!history || history.positions.length < 2) return null;

  const targetTime = now - this.config.bufferDelay; // 50ms ago

  // Binary search for bracketing positions
  const [p1, p2] = findBracket(history.positions, targetTime);

  // Linear interpolate
  const t = (targetTime - p1.timestamp) / (p2.timestamp - p1.timestamp);
  return {
    x: p1.x + (p2.x - p1.x) * t,
    y: p1.y + (p2.y - p1.y) * t,
  };
}
```

### Why 50ms Buffer?

| Buffer Delay | Smoothness | Latency | Verdict |
|--------------|------------|---------|---------|
| 0ms | Teleports on jitter | Best | ❌ Unusable |
| 25ms | Some jitter visible | Good | ⚠️ Borderline |
| **50ms** | **Perfectly smooth** | **Imperceptible** | ✅ **Chosen** |
| 100ms | Perfectly smooth | Noticeable lag | ❌ Feels sluggish |

**Tradeoff:** 50ms added latency for perfectly smooth movement. For cursor tracking (not gaming), this is invisible to the user.

### Memory Bounds

- Each client keeps a **rolling 50-position window** per remote client
- Positions older than 2 seconds are discarded
- No unbounded growth — memory per client is O(50) ≈ ~800 bytes

---

## 🖥️ Server Design

### Room Lifecycle

```
createRoom(roomId)
    ↓
[clients join over time]
    ↓
[clients leave / disconnect]
    ↓
clientCount === 0
    ↓
destroyRoom(roomId) + clearInterval(cleanupTimer)
```

### Broadcast Fan-out

```typescript
function broadcastToRoom(
  roomId: string,
  message: Message,
  excludeClientId?: string
): void {
  const serialized = JSON.stringify(message);
  clientSockets.forEach((ws, clientId) => {
    if (clientId !== excludeClientId && clientRooms.get(clientId) === roomId) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(serialized);
      }
    }
  });
}
```

**Correctness properties:**
- ✅ **No echo to sender** — `excludeClientId` prevents self-rebroadcast
- ✅ **No cross-room leakage** — `clientRooms.get(clientId) === roomId` filter
- ✅ **O(n) fan-out** — not O(n²), each message serialized once

### Heartbeat / Disconnect Handling

| Signal | When | Action |
|--------|------|--------|
| WebSocket `close` | Clean disconnect | Immediate client removal |
| WebSocket `error` | Network failure | Same as close |
| Heartbeat timeout | Zombie connection | Remove after 10s of silence |

The cleanup timer runs every 10s and removes any client whose `lastSeen` is older than 10s.

---

## 🏛️ Code Architecture

### Separation of Concerns

| Layer | File | Responsibility |
|-------|------|----------------|
| **Transport** | `connection.ts` (client), `server.ts` (server) | Raw WebSocket plumbing |
| **Protocol** | `shared/protocol.ts` | Message types, validation |
| **Rendering** | `App.tsx`, `interpolation.ts` | Canvas drawing, smoothing |

### Extensibility

**Adding a new action type requires zero changes to transport code.**

Example — adding a `highlight` action:

1. Add `HighlightMessage` interface to `shared/protocol.ts`
2. Add `'highlight'` to `MessageType` union
3. Add validation case in `isValidMessage()`
4. Add handler in client's `App.tsx` `onMessage` switch

**No changes needed** in `connection.ts`, `server.ts`, or `room.ts` — the transport and relay logic are message-type agnostic.

---

## 🚀 Scaling Considerations

### Current Architecture

```
┌─────────────────────────────┐
│      Single Server          │
│  ┌─────────────────────────┐│
│  │   Room 1 (10 clients)  ││
│  │   Room 2 (10 clients)  ││
│  │   Room 3 (10 clients)  ││
│  └─────────────────────────┘│
└─────────────────────────────┘
```

**Limits:**
- Memory grows with concurrent clients
- CPU bound by JSON serialization + fan-out
- Single point of failure

### Horizontal Scaling

```
                 ┌─────────────────┐
                 │   Load Balancer  │
                 └────────┬────────┘
                          │
            ┌─────────────┼─────────────┐
            │             │             │
      ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐
      │ Server 1  │ │ Server 2  │ │ Server 3  │
      │ (Room A)  │ │ (Room B)  │ │ (Room C)  │
      └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
            │             │             │
            └─────────────┼─────────────┘
                          │
                   ┌──────▼──────┐
                   │ Redis PubSub │
                   └─────────────┘
```

**Required changes:**

1. **Sticky sessions** — Load balancer routes each client to the same server for its room (via consistent hash of `roomId`)
2. **Redis Pub/Sub** — When a message arrives on Server 1 for Room A, it publishes to a Redis channel; all servers subscribed relay to their local members of Room A
3. **Shared presence state** — Room membership stored in Redis (`HSET room:A clients ...`) instead of in-memory Maps
4. **Health checks** — Load balancer monitors server health; failed servers are removed

### Edge WebSockets (Advanced)

For global low latency:
- Use **Cloudflare Durable Objects** — each room becomes a durable object
- Use **Fly.io regions** — deploy close to users
- Use **Ably / Pusher** — but the assignment forbids this for the sync work itself

### Load Estimates

| Metric | Per Client | At 1000 Clients |
|--------|-----------|-----------------|
| Cursor messages/sec | 30 | 30,000 |
| Average message size | ~80 bytes | — |
| Bandwidth per client | 2.4 KB/s | 2.4 MB/s |
| Memory per client | ~100 KB | 100 MB |

**Bottleneck at scale:** JSON serialization + fan-out CPU. Mitigations: binary protocol (msgpack), WebSocket compression, sharded rooms.

---

## 🔒 Security Considerations

| Concern | Current State | Improvement |
|---------|---------------|-------------|
| Authentication | None | JWT in `join` message |
| Rate limiting | None | Token bucket per IP |
| Input validation | TypeScript guards | Add schema validation (zod) |
| Room privacy | Public | Optional room password |
| DDoS | None | Cloudflare proxy |
| XSS via emoji | Constrained to fixed list | ✅ Already safe |
| XSS via username | Not sanitized | Sanitize on render |

---

## 📊 Performance Metrics

| Metric | Value |
|--------|-------|
| Cursor update rate | 30 Hz |
| Interpolation tick rate | 60 fps |
| Buffer delay | 50 ms |
| Heartbeat interval | 5 s |
| Client timeout | 10 s |
| Typical message latency | 20–50 ms |
| Tested concurrent clients | 10 |
| Memory per client | ~100 KB |

---

## 🛠️ Dependencies

### Server
- `ws` — WebSocket implementation (raw, no wrappers)
- No other runtime dependencies

### Client
- `react`, `react-dom` — UI
- `vite`, `typescript` — dev tooling
- No runtime sync libraries

### Explicitly NOT Used
- ❌ Socket.IO
- ❌ Yjs
- ❌ Liveblocks
- ❌ PartyKit
- ❌ Ably / Pusher
- ❌ Any state-sync framework

---

## 📝 Design Decisions Summary

| Decision | Alternative | Why We Chose This |
|----------|-------------|-------------------|
| Raw WebSocket | Socket.IO | Assignment requirement; understanding fundamentals |
| JSON messages | Binary (msgpack) | Simplicity + debuggability |
| 50ms interpolation buffer | Extrapolation | Simpler, no overshoot artifacts |
| Server relays, not stores | Server-authoritative state | Lower memory, simpler logic |
| 30Hz throttle | Raw 60–120Hz | 4× bandwidth savings, no visible diff |
| Heartbeat every 5s | TCP keepalive | Works through proxies reliably |
| Single process | Microservices | Assignment scope — correctness > distribution |

---

## 🔗 Related Documents

- [README.md](./README.md) — Setup, features, protocol overview
- [REQUIREMENTS.txt](./REQUIREMENTS.txt) — Dependencies and system requirements

---

**Built for the FlamAI Frontend R&D Assignment.**
