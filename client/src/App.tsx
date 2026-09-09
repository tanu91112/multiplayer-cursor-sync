import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Connection } from './connection';
import { InterpolationEngine } from './interpolation';
import { ClientInfo, Message, EMOJIS } from '../../shared/protocol';
import './App.css';

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [username, setUsername] = useState(`User_${Math.random().toString(36).slice(2, 6)}`);
  const [roomId] = useState('watch-party-42');
  const [joined, setJoined] = useState(false);
  const [reactions, setReactions] = useState<{ id: string; emoji: string; x: number; y: number }[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const connectionRef = useRef<Connection | null>(null);
  const interpolationRef = useRef<InterpolationEngine | null>(null);
  const remoteCursorsRef = useRef<Map<string, { x: number; y: number; color: string; username: string }>>(
    new Map()
  );
  const lastCursorUpdateRef = useRef<number>(0);
  const localCursorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const animationFrameRef = useRef<number | null>(null);

  // ============================================
  // CONNECTION
  // ============================================

  const connect = useCallback(() => {
    const connection = new Connection();
    connectionRef.current = connection;

    connection.connect(roomId, username)
      .then(() => {
        setIsConnected(true);
        console.log('✅ Connected to room:', roomId);
      })
      .catch((error) => {
        console.error('❌ Connection failed:', error);
      });

    connection.onMessage((message: Message) => {
      switch (message.type) {
        case 'presence':
          setClients(message.clients || []);
          break;
        
        case 'join':
          setClients(prev => {
            const newClient: ClientInfo = {
              id: message.clientId,
              username: message.username || 'Unknown',
              color: message.color || '#000000',
              lastSeen: Date.now(),
              isActive: true,
            };
            const filtered = prev.filter(c => c.id !== message.clientId);
            return [...filtered, newClient];
          });
          break;
        
        case 'leave':
          setClients(prev => prev.filter(c => c.id !== message.clientId));
          interpolationRef.current?.removeClient(message.clientId);
          remoteCursorsRef.current.delete(message.clientId);
          break;
        
        case 'cursor':
          const cursorMsg = message as any;
          interpolationRef.current?.updatePosition(
            message.clientId,
            cursorMsg.x,
            cursorMsg.y,
            message.timestamp
          );
          break;
        
        case 'reaction':
          const reactionMsg = message as any;
          const id = `reaction_${Date.now()}_${Math.random()}`;
          setReactions(prev => [...prev, { id, emoji: reactionMsg.emoji, x: reactionMsg.x, y: reactionMsg.y }]);
          setTimeout(() => {
            setReactions(prev => prev.filter(r => r.id !== id));
          }, 1200);
          break;
      }
    });

    // Start interpolation
    const interpolation = new InterpolationEngine();
    interpolationRef.current = interpolation;
    interpolation.onTick((clientId: string, x: number, y: number) => {
      const client = clients.find(c => c.id === clientId);
      if (client) {
        remoteCursorsRef.current.set(clientId, {
          x,
          y,
          color: client.color,
          username: client.username,
        });
      }
    });
    interpolation.startTickLoop();
  }, [roomId, username, clients]);

  // ============================================
  // CANVAS RENDER LOOP
  // ============================================

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      // Set canvas size to match container
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw local cursor
      if (isConnected) {
        ctx.beginPath();
        ctx.arc(localCursorRef.current.x, localCursorRef.current.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#4F46E5';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#1e293b';
        ctx.font = '12px Arial';
        ctx.fillText('You', localCursorRef.current.x - 12, localCursorRef.current.y - 15);
      }

      // Draw remote cursors
      remoteCursorsRef.current.forEach((cursor) => {
        ctx.beginPath();
        ctx.arc(cursor.x, cursor.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = cursor.color;
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#1e293b';
        ctx.font = '12px Arial';
        ctx.fillText(cursor.username, cursor.x - 15, cursor.y - 15);
      });

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isConnected]);

  // ============================================
  // MOUSE HANDLERS
  // ============================================

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isConnected) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    localCursorRef.current = { x, y };
    
    // Throttle cursor updates to 30fps
    if (Date.now() - lastCursorUpdateRef.current > 33) {
      connectionRef.current?.sendCursor(x, y);
      lastCursorUpdateRef.current = Date.now();
    }
  }, [isConnected]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isConnected) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    connectionRef.current?.sendReaction(emoji, x, y);
    
    // Add local reaction
    const id = `reaction_${Date.now()}_${Math.random()}`;
    setReactions(prev => [...prev, { id, emoji, x, y }]);
    setTimeout(() => {
      setReactions(prev => prev.filter(r => r.id !== id));
    }, 1200);
  }, [isConnected]);

  // ============================================
  // JOIN SCREEN
  // ============================================

  if (!joined) {
    return (
      <div className="join-screen">
        <div className="join-container">
          <h1>🎨 Multiplayer Sync</h1>
          <p>Move your cursor together with others!</p>
          <div className="join-form">
            <input
              type="text"
              placeholder="Enter your name..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <button onClick={() => { connect(); setJoined(true); }}>
              🚀 Join Session
            </button>
          </div>
          <div className="emoji-bar">
            {EMOJIS.map((emoji) => (
              <span key={emoji}>{emoji}</span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // MAIN APP
  // ============================================

  return (
    <div className="app">
      <header className="header">
        <h1>🎯 Multiplayer Cursor Sync</h1>
        <div className="header-right">
          <div className="status">
            <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
          <span>👤 {clients.length} online</span>
        </div>
      </header>
      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onClick={handleCanvasClick}
        />
        {reactions.map((reaction) => (
          <div
            key={reaction.id}
            className="reaction-item"
            style={{ left: reaction.x, top: reaction.y }}
          >
            {reaction.emoji}
          </div>
        ))}
      </div>
      <div className="footer">
        <span>💡 Move mouse to share cursor • Click to react</span>
        <span>Room: {roomId}</span>
      </div>
    </div>
  );
}