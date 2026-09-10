import { ClientInfo, THROTTLE_CONFIG, Message } from './shared/protocol.js';

export class Room {
  private clients: Map<string, ClientInfo> = new Map();
  private messageHistory: Message[] = [];
  private cleanupInterval: NodeJS.Timeout;

  constructor(public roomId: string) {
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleClients();
    }, THROTTLE_CONFIG.clientTimeoutMs);
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

  addToHistory(message: Message): void {
    this.messageHistory.push(message);
    if (this.messageHistory.length > THROTTLE_CONFIG.maxHistorySize) {
      this.messageHistory.shift();
    }
  }

  private cleanupStaleClients(): void {
    const now = Date.now();
    const staleIds: string[] = [];

    this.clients.forEach((client, id) => {
      if (now - client.lastSeen > THROTTLE_CONFIG.clientTimeoutMs) {
        staleIds.push(id);
      }
    });

    staleIds.forEach(id => this.clients.delete(id));
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.clients.clear();
    this.messageHistory = [];
  }
}
