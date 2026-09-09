import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { randomBytes } from 'crypto';
import { Room } from './room.js';
import { 
  Message, 
  JoinMessage, 
  isValidMessage 
} from '../../shared/protocol.js';

const PORT = process.env.PORT || 3001;
const server = createServer();
const wss = new WebSocketServer({ server });

const rooms = new Map<string, Room>();
const clientRooms = new Map<string, string>();
const clientSockets = new Map<string, WebSocket>();

function getOrCreateRoom(roomId: string): Room {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Room(roomId));
    console.log(`📦 Room created: ${roomId}`);
  }
  return rooms.get(roomId)!;
}

function generateClientId(): string {
  return `client_${randomBytes(4).toString('hex')}`;
}

function generateColor(): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

function broadcastToRoom(roomId: string, message: Message, excludeClientId?: string): void {
  const serialized = JSON.stringify(message);
  clientSockets.forEach((ws, clientId) => {
    if (clientId !== excludeClientId && clientRooms.get(clientId) === roomId) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(serialized);
      }
    }
  });
}

function handleDisconnect(clientId: string): void {
  const roomId = clientRooms.get(clientId);
  if (roomId) {
    const room = rooms.get(roomId);
    if (room) {
      room.removeClient(clientId);
      const leaveMessage: Message = {
        type: 'leave',
        clientId: clientId,
        timestamp: Date.now(),
      };
      broadcastToRoom(roomId, leaveMessage);
      console.log(`👋 Client ${clientId} left`);
    }
    if (room?.getAllClients().length === 0) {
      room.destroy();
      rooms.delete(roomId);
      console.log(`🗑️ Room ${roomId} destroyed`);
    }
  }
  clientRooms.delete(clientId);
  clientSockets.delete(clientId);
}

wss.on('connection', (ws: WebSocket) => {
  const clientId = generateClientId();
  let roomId: string | null = null;
  
  console.log(`🟢 Client connected: ${clientId}`);
  clientSockets.set(clientId, ws);

  ws.on('message', (data: Buffer) => {
    try {
      const raw = data.toString();
      const message = JSON.parse(raw) as Message;

      if (!isValidMessage(message)) {
        ws.send(JSON.stringify({
          type: 'error',
          clientId: 'server',
          timestamp: Date.now(),
          message: 'Invalid message format'
        }));
        return;
      }

      if (message.type === 'join') {
        const joinMsg = message as JoinMessage;
        roomId = message.clientId;
        const room = getOrCreateRoom(roomId);
        clientRooms.set(clientId, roomId);
        
        const clientInfo = room.addClient(
          clientId,
          joinMsg.username || `User_${clientId.slice(0, 4)}`,
          generateColor()
        );

        const presenceMessage: Message = {
          type: 'presence',
          clientId: 'server',
          timestamp: Date.now(),
          clients: room.getAllClients(),
        };
        ws.send(JSON.stringify(presenceMessage));

        const joinBroadcast: Message = {
          type: 'join',
          clientId: clientId,
          timestamp: Date.now(),
          username: clientInfo.username,
          color: clientInfo.color,
        };
        broadcastToRoom(roomId, joinBroadcast, clientId);
        console.log(`👤 ${clientInfo.username} joined ${roomId}`);
        return;
      }

      if (message.type === 'cursor' || message.type === 'reaction') {
        if (roomId) {
          const room = rooms.get(roomId);
          room?.updateClientActivity(clientId);
          broadcastToRoom(roomId, message, clientId);
        }
        return;
      }

      if (message.type === 'heartbeat') {
        if (roomId) {
          const room = rooms.get(roomId);
          room?.updateClientActivity(clientId);
        }
        ws.send(JSON.stringify({
          type: 'heartbeat',
          clientId: 'server',
          timestamp: Date.now(),
        }));
        return;
      }

      if (message.type === 'leave') {
        handleDisconnect(clientId);
      }

    } catch (error) {
      console.error('Error:', error);
    }
  });

  ws.on('close', () => {
    console.log(`🔴 Client disconnected: ${clientId}`);
    handleDisconnect(clientId);
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error:`, error);
    handleDisconnect(clientId);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket server ready`);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  wss.close(() => {
    rooms.forEach(room => room.destroy());
    rooms.clear();
    process.exit(0);
  });
});