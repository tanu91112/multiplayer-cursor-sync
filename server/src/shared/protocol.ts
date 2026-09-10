// ============================================
// PROTOCOL DESIGN - All message types
// ============================================

export type MessageType = 
  | 'join' 
  | 'cursor' 
  | 'reaction' 
  | 'presence' 
  | 'leave'
  | 'heartbeat'
  | 'error';

export interface BaseMessage {
  type: MessageType;
  clientId: string;
  timestamp: number;
}

export interface JoinMessage extends BaseMessage {
  type: 'join';
  username: string;
  color: string;
}

export interface CursorMessage extends BaseMessage {
  type: 'cursor';
  x: number;
  y: number;
}

export interface ReactionMessage extends BaseMessage {
  type: 'reaction';
  emoji: string;
  x: number;
  y: number;
}

export interface PresenceMessage extends BaseMessage {
  type: 'presence';
  clients: ClientInfo[];
}

export interface LeaveMessage extends BaseMessage {
  type: 'leave';
}

export interface HeartbeatMessage extends BaseMessage {
  type: 'heartbeat';
}

export interface ErrorMessage extends BaseMessage {
  type: 'error';
  message: string;
}

export type Message = 
  | JoinMessage 
  | CursorMessage 
  | ReactionMessage 
  | PresenceMessage 
  | LeaveMessage 
  | HeartbeatMessage 
  | ErrorMessage;

export interface ClientInfo {
  id: string;
  username: string;
  color: string;
  lastSeen: number;
  cursor?: { x: number; y: number };
  isActive: boolean;
}

export const EMOJIS = ['🔥', '❤️', '🎉', '⭐', '🚀', '💯', '👏', '😱', '🤯', '🎊'];

export const THROTTLE_CONFIG = {
  cursorThrottleMs: 33,
  heartbeatIntervalMs: 5000,
  clientTimeoutMs: 10000,
  maxHistorySize: 1000,
};

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
    case 'presence':
      return Array.isArray(data.clients);
    case 'leave':
      return true;
    case 'heartbeat':
      return true;
    case 'error':
      return typeof data.message === 'string';
    default:
      return false;
  }
}
