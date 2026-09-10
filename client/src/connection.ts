import { 
  Message, 
  CursorMessage, 
  ReactionMessage, 
  JoinMessage,
  isValidMessage,
  THROTTLE_CONFIG
} from '../../shared/protocol';

type MessageHandler = (message: Message) => void;

export class Connection {
  private ws: WebSocket | null = null;
  private clientId: string = '';
  private roomId: string = '';
  private username: string = '';
  private color: string = '';
  private messageHandlers: MessageHandler[] = [];
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private isConnecting: boolean = false;

  connect(roomId: string, username: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnecting) {
        reject(new Error('Already connecting'));
        return;
      }

      this.isConnecting = true;
      this.roomId = roomId;
      this.username = username || `User_${Math.random().toString(36).slice(2, 6)}`;
      this.color = this.generateColor();

      const wsUrl = `wss://multiplayer-cursor-sync.onrender.com`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        this.isConnecting = false;

        const joinMessage: JoinMessage = {
          type: 'join',
          clientId: roomId,
          timestamp: Date.now(),
          username: this.username,
          color: this.color,
        };
        this.send(joinMessage);
        this.startHeartbeat();
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (isValidMessage(data)) {
            this.handleMessage(data);
          }
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.isConnecting = false;
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket closed');
        this.isConnecting = false;
        this.stopHeartbeat();
      };
    });
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.send({
        type: 'heartbeat',
        clientId: 'client',
        timestamp: Date.now(),
      });
    }, THROTTLE_CONFIG.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  send(message: Message): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  sendCursor(x: number, y: number): void {
    const message: CursorMessage = {
      type: 'cursor',
      clientId: this.clientId || 'client',
      timestamp: Date.now(),
      x,
      y,
    };
    this.send(message);
  }

  sendReaction(emoji: string, x: number, y: number): void {
    const message: ReactionMessage = {
      type: 'reaction',
      clientId: this.clientId || 'client',
      timestamp: Date.now(),
      emoji,
      x,
      y,
    };
    this.send(message);
  }

  private handleMessage(message: Message): void {
    if (message.clientId && message.clientId !== 'server') {
      this.clientId = message.clientId;
    }
    this.messageHandlers.forEach(handler => handler(message));
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  private generateColor(): string {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  getUsername(): string { return this.username; }
  getColor(): string { return this.color; }
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
