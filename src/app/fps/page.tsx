'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

interface Player {
  id: string;
  name: string;
  x: number;
  y: number;
  angle: number;
  health: number;
  kills: number;
  deaths: number;
  color: string;
}

interface GameState {
  players: Player[];
  host: string;
  started: boolean;
  timeLeft: number;
  gameTime: number;
}

export default function FPS() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [playerName, setPlayerName] = useState<string>('');
  const [roomId, setRoomId] = useState<string>('');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [joined, setJoined] = useState(false);
  const [myId, setMyId] = useState<string>('');
  const [keys, setKeys] = useState<{[key: string]: boolean}>({});
  const [mouseAngle, setMouseAngle] = useState(0);
  const [isPublic, setIsPublic] = useState(true);
  const [showLobbyBrowser, setShowLobbyBrowser] = useState(false);
  const [publicLobbies, setPublicLobbies] = useState<Array<{roomId: string; hostName: string; playerCount: number}>>([]);

  // Socket.io connection
  useEffect(() => {
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
    const newSocket = io(serverUrl);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setMyId(newSocket.id || '');
    });

    newSocket.on('fpsGameState', (state: GameState) => {
      setGameState(state);
    });

    newSocket.on('publicFpsLobbies', (lobbies: Array<{roomId: string; hostName: string; playerCount: number}>) => {
      setPublicLobbies(lobbies);
    });

    newSocket.on('playerHit', ({ targetId }: { targetId: string }) => {
      if (targetId === newSocket.id) {
        // Flash red when hit
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
        }
      }
    });

    return () => {
      newSocket.close();
    };
  }, []);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      setKeys(prev => ({ ...prev, [e.key.toLowerCase()]: true }));
      
      // Shoot on Space
      if (e.key === ' ' && socket && roomId && gameState?.started) {
        socket.emit('fpsShoot', { roomId, angle: mouseAngle });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      setKeys(prev => ({ ...prev, [e.key.toLowerCase()]: false }));
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [socket, roomId, gameState, mouseAngle]);

  // Mouse controls for aiming
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const rect = canvas.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const angle = Math.atan2(mouseY - centerY, mouseX - centerX);
      setMouseAngle(angle);
    };

    const handleClick = () => {
      if (socket && roomId && gameState?.started) {
        socket.emit('fpsShoot', { roomId, angle: mouseAngle });
      }
    };

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('click', handleClick);
      
      return () => {
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('click', handleClick);
      };
    }
  }, [socket, roomId, gameState, mouseAngle]);

  // Send movement to server
  useEffect(() => {
    if (!socket || !roomId || !gameState?.started) return;

    const interval = setInterval(() => {
      const movement = {
        forward: keys['w'] || keys['arrowup'],
        backward: keys['s'] || keys['arrowdown'],
        left: keys['a'] || keys['arrowleft'],
        right: keys['d'] || keys['arrowright'],
        angle: mouseAngle,
      };

      socket.emit('fpsMove', { roomId, movement });
    }, 50);

    return () => clearInterval(interval);
  }, [socket, roomId, gameState, keys, mouseAngle]);

  // Render game
  useEffect(() => {
    if (!gameState || !gameState.started) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const render = () => {
      const myPlayer = gameState.players.find(p => p.id === myId);
      if (!myPlayer) return;

      // Clear canvas
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw grid floor
      ctx.strokeStyle = '#2a2a4e';
      ctx.lineWidth = 1;
      for (let i = 0; i < canvas.width; i += 50) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
      }
      for (let i = 0; i < canvas.height; i += 50) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
      }

      // Draw all players
      gameState.players.forEach(player => {
        if (player.health <= 0) return;

        const screenX = canvas.width / 2 + (player.x - myPlayer.x);
        const screenY = canvas.height / 2 + (player.y - myPlayer.y);

        // Draw player circle
        ctx.fillStyle = player.id === myId ? '#00ff00' : player.color;
        ctx.beginPath();
        ctx.arc(screenX, screenY, 20, 0, Math.PI * 2);
        ctx.fill();

        // Draw player direction
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(
          screenX + Math.cos(player.angle) * 30,
          screenY + Math.sin(player.angle) * 30
        );
        ctx.stroke();

        // Draw player name
        ctx.fillStyle = '#ffffff';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.name, screenX, screenY - 30);

        // Draw health bar
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(screenX - 25, screenY - 40, 50, 5);
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(screenX - 25, screenY - 40, (player.health / 100) * 50, 5);
      });

      // Draw crosshair
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2 - 10, canvas.height / 2);
      ctx.lineTo(canvas.width / 2 + 10, canvas.height / 2);
      ctx.moveTo(canvas.width / 2, canvas.height / 2 - 10);
      ctx.lineTo(canvas.width / 2, canvas.height / 2 + 10);
      ctx.stroke();

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [gameState, myId]);

  const joinRoom = () => {
    if (socket && playerName.trim() && roomId.trim()) {
      socket.emit('fpsJoinRoom', { roomId, playerName });
      setJoined(true);
    }
  };

  const createRoom = () => {
    if (socket && playerName.trim()) {
      const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      setRoomId(newRoomId);
      socket.emit('fpsJoinRoom', { roomId: newRoomId, playerName, isPublic });
      setJoined(true);
    }
  };
  const requestPublicLobbies = () => {
    if (socket) {
      socket.emit('getPublicFpsLobbies');
      setShowLobbyBrowser(true);
    }
  };

  const joinPublicLobby = (lobbyRoomId: string) => {
    if (socket && playerName.trim()) {
      setRoomId(lobbyRoomId);
      socket.emit('fpsJoinRoom', { roomId: lobbyRoomId, playerName });
      setJoined(true);
      setShowLobbyBrowser(false);
    }
  };
  const startGame = () => {
    if (socket && roomId) {
      socket.emit('fpsStartGame', { roomId });
    }
  };

  if (!joined || !gameState) {
    if (showLobbyBrowser) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-12 border border-white/20">
            <h1 className="text-5xl font-bold text-white mb-8 text-center">🎯 Public FPS Lobbies</h1>
            
            {publicLobbies.length === 0 ? (
              <div className="bg-white/10 rounded-xl p-8 mb-6 text-center">
                <p className="text-white text-lg">No public lobbies available</p>
                <p className="text-purple-200 text-sm mt-2">Create your own or try again later</p>
              </div>
            ) : (
              <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
                {publicLobbies.map((lobby) => (
                  <div
                    key={lobby.roomId}
                    onClick={() => joinPublicLobby(lobby.roomId)}
                    className="bg-white/10 hover:bg-white/20 rounded-xl p-4 cursor-pointer transition-all border border-white/20 hover:border-white/40"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-white font-bold text-lg">{lobby.hostName}&apos;s Room</p>
                        <p className="text-purple-200 text-sm">Code: {lobby.roomId}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-green-400 font-bold">{lobby.playerCount}/4 Players</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowLobbyBrowser(false)}
              className="w-full px-8 py-4 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-all text-lg font-medium"
            >
              Back
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-3xl p-12 border border-white/20">
          <h1 className="text-5xl font-bold text-white mb-8 text-center">FPS Arena 🎯</h1>
          
          <div className="space-y-6">
            <div>
              <label className="block text-white text-lg mb-3 font-medium">Your Name</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                className="w-full p-4 rounded-xl bg-white/20 text-white border border-white/30 focus:outline-none focus:border-white/50 text-lg placeholder-white/50"
                maxLength={20}
              />
            </div>

            <div>
              <label className="block text-white text-lg mb-3 font-medium">Room Code (optional)</label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                placeholder="Enter to join existing"
                className="w-full p-4 rounded-xl bg-white/20 text-white border border-white/30 focus:outline-none focus:border-white/50 text-lg placeholder-white/50 uppercase"
                maxLength={6}
              />
            </div>

            {!roomId.trim() && (
              <div className="bg-white/10 rounded-xl p-4">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-white font-medium">Public Lobby</span>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-14 h-8 rounded-full transition-colors ${
                      isPublic ? 'bg-green-500' : 'bg-gray-600'
                    }`}>
                      <div className={`w-6 h-6 bg-white rounded-full mt-1 transition-transform ${
                        isPublic ? 'ml-7' : 'ml-1'
                      }`}></div>
                    </div>
                  </div>
                </label>
                <p className="text-purple-200 text-xs mt-2">
                  {isPublic ? 'Others can see and join your lobby' : 'Only players with code can join'}
                </p>
              </div>
            )}

            <div className="flex gap-4">
              {roomId.trim() ? (
                <button
                  onClick={joinRoom}
                  disabled={!playerName.trim()}
                  className="flex-1 px-8 py-4 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-all text-lg font-bold disabled:opacity-50"
                >
                  Join Room
                </button>
              ) : (
                <button
                  onClick={createRoom}
                  disabled={!playerName.trim()}
                  className="flex-1 px-8 py-4 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all text-lg font-bold disabled:opacity-50"
                >
                  Create Room
                </button>
              )}
            </div>

            <button
              onClick={requestPublicLobbies}
              disabled={!playerName.trim()}
              className="w-full px-8 py-4 bg-purple-500 text-white rounded-xl hover:bg-purple-600 transition-all text-lg font-bold disabled:opacity-50"
            >
              Browse Public Lobbies
            </button>

            <button
              onClick={() => router.push('/')}
              className="w-full px-8 py-4 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-all text-lg font-medium"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isHost = gameState.host === myId;

  if (!gameState.started) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-12 border border-white/20">
          <h1 className="text-4xl font-bold text-white mb-4 text-center">Waiting Room</h1>
          <p className="text-purple-200 text-center mb-8">Room Code: <span className="font-bold text-2xl">{roomId}</span></p>

          <div className="bg-white/10 rounded-2xl p-6 mb-8">
            <h3 className="text-white font-bold text-xl mb-4">Players ({gameState.players.length})</h3>
            <div className="space-y-3">
              {gameState.players.map(player => (
                <div key={player.id} className="flex items-center gap-3 bg-white/10 rounded-xl p-3">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: player.color }}></div>
                  <span className="text-white font-medium">{player.name}</span>
                  {player.id === gameState.host && <span className="ml-auto text-yellow-400">👑 Host</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-blue-500/20 border border-blue-400 rounded-xl p-4 mb-6">
            <p className="text-blue-200 text-sm">
              <strong>Controls:</strong> WASD to move, Mouse to aim, Click to shoot
            </p>
          </div>

          {isHost && (
            <button
              onClick={startGame}
              disabled={gameState.players.length < 2}
              className="w-full px-8 py-4 bg-gradient-to-r from-green-400 to-blue-500 text-white rounded-xl hover:from-green-500 hover:to-blue-600 transition-all text-xl font-bold disabled:opacity-50"
            >
              Start Game
            </button>
          )}

          {!isHost && (
            <p className="text-center text-purple-200">Waiting for host to start the game...</p>
          )}
        </div>
      </div>
    );
  }

  const myPlayer = gameState.players.find(p => p.id === myId);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-900">
      {/* HUD */}
      <div className="w-full max-w-6xl mb-4 flex justify-between items-center text-white">
        <div className="bg-black/50 rounded-xl p-4">
          <p className="text-sm">Health</p>
          <div className="w-48 h-6 bg-red-900 rounded">
            <div 
              className="h-full bg-green-500 rounded transition-all"
              style={{ width: `${myPlayer?.health || 0}%` }}
            ></div>
          </div>
        </div>
        
        <div className="bg-black/50 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold">⏱️ {gameState.timeLeft}s</p>
        </div>

        <div className="bg-black/50 rounded-xl p-4 text-right">
          <p className="text-lg">Kills: <span className="font-bold text-green-400">{myPlayer?.kills || 0}</span></p>
          <p className="text-lg">Deaths: <span className="font-bold text-red-400">{myPlayer?.deaths || 0}</span></p>
        </div>
      </div>

      {/* Game Canvas */}
      <canvas
        ref={canvasRef}
        width={1200}
        height={700}
        className="border-4 border-white/20 rounded-xl cursor-crosshair"
      />

      {/* Scoreboard */}
      <div className="w-full max-w-6xl mt-4 bg-black/50 rounded-xl p-4">
        <div className="grid grid-cols-4 gap-4 text-white">
          {gameState.players.sort((a, b) => b.kills - a.kills).map((player, idx) => (
            <div key={player.id} className="bg-white/10 rounded-lg p-3">
              <p className="font-bold">{idx + 1}. {player.name}</p>
              <p className="text-sm">K/D: {player.kills}/{player.deaths}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
