interface Position {
  x: number;
  y: number;
  timestamp: number;
}

interface CursorHistory {
  positions: Position[];
  lastUpdate: number;
}

export class InterpolationEngine {
  private history: Map<string, CursorHistory> = new Map();
  private frameId: number | null = null;
  private tickListeners: ((clientId: string, x: number, y: number) => void)[] = [];

  updatePosition(clientId: string, x: number, y: number, timestamp: number): void {
    if (!this.history.has(clientId)) {
      this.history.set(clientId, {
        positions: [],
        lastUpdate: timestamp,
      });
    }

    const history = this.history.get(clientId)!;
    history.positions.push({ x, y, timestamp });
    history.lastUpdate = timestamp;
    
    // Keep only last 50 positions
    if (history.positions.length > 50) {
      history.positions = history.positions.slice(-50);
    }
  }

  removeClient(clientId: string): void {
    this.history.delete(clientId);
  }

  getInterpolatedPosition(clientId: string, now: number): { x: number; y: number } | null {
    const history = this.history.get(clientId);
    if (!history || history.positions.length < 2) {
      if (history && history.positions.length === 1) {
        return history.positions[0];
      }
      return null;
    }

    const positions = history.positions;
    const targetTime = now - 50; // 50ms buffer
    
    let left = 0;
    let right = positions.length - 1;
    let index = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (positions[mid].timestamp <= targetTime) {
        index = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    if (index === -1) return positions[0];
    if (index >= positions.length - 1) return positions[positions.length - 1];

    const p1 = positions[index];
    const p2 = positions[index + 1];
    
    if (p2.timestamp === p1.timestamp) return p2;

    const t = (targetTime - p1.timestamp) / (p2.timestamp - p1.timestamp);
    const clampedT = Math.max(0, Math.min(1, t));

    return {
      x: p1.x + (p2.x - p1.x) * clampedT,
      y: p1.y + (p2.y - p1.y) * clampedT,
    };
  }

  startTickLoop(): void {
    if (this.frameId !== null) return;

    const tick = () => {
      const now = Date.now();
      this.history.forEach((_, clientId) => {
        const pos = this.getInterpolatedPosition(clientId, now);
        if (pos) {
          this.tickListeners.forEach(listener => {
            listener(clientId, pos.x, pos.y);
          });
        }
      });
      this.frameId = requestAnimationFrame(tick);
    };

    this.frameId = requestAnimationFrame(tick);
  }

  stopTickLoop(): void {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  onTick(listener: (clientId: string, x: number, y: number) => void): void {
    this.tickListeners.push(listener);
  }

  destroy(): void {
    this.stopTickLoop();
    this.history.clear();
    this.tickListeners = [];
  }
}