import { ... } from './shared/protocol.js';

export class Room {
  private clients: Map<string, ClientInfo> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(public roomId: string) {
    // Clean up stale clients every 10 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleClients();
    }, 10000);
  }

  addClient(clientId: string, username: string, color: string): ClientInfo {
    const client: ClientInfo = {
      id: clientId,
      username,
      color,
      lastSeen: Date.now(),
      isActive: true,
    };
    this.clients.set(clientId, client);
    return client;
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  getClient(clientId: string): ClientInfo | undefined {
    return this.clients.get(clientId);
  }

  getAllClients(): ClientInfo[] {
    return Array.from(this.clients.values());
  }

  updateClientActivity(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastSeen = Date.now();
      client.isActive = true;
    }
  }

  private cleanupStaleClients(): void {
    const now = Date.now();
    const staleIds: string[] = [];

    this.clients.forEach((client, id) => {
      if (now - client.lastSeen > 10000) {
        staleIds.push(id);
      }
    });

    staleIds.forEach(id => {
      console.log(`🧹 Removing stale client: ${id}`);
      this.clients.delete(id);
    });
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.clients.clear();
  }
}
