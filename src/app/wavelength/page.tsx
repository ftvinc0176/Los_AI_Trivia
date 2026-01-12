'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

// ==================== TYPES ====================
interface Player {
  id: string;
  name: string;
  score: number;
}

interface LobbyState {
  id: string;
  host: string;
  players: Player[];
  isPrivate: boolean;
  phase: 'waiting' | 'psychic' | 'guessing' | 'reveal' | 'results';
  round: number;
  maxRounds: number;
  psychicId: string;
  targetAngle: number;
  needleAngle: number;
  clue: string;
  leftConcept: string;
  rightConcept: string;
  lastPoints?: number;
}

interface PublicLobby {
  id: string;
  host: string;
  players: Player[];
  isPrivate: boolean;
  phase: string;
}

// ==================== DIAL COMPONENT ====================
function Dial({
  targetAngle,
  needleAngle,
  showTarget,
  isPsychic,
  onNeedleChange,
  disabled,
}: {
  targetAngle: number;
  needleAngle: number;
  showTarget: boolean;
  isPsychic: boolean;
  onNeedleChange: (angle: number) => void;
  disabled: boolean;
}) {
  const dialRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [velocity, setVelocity] = useState(0);
  const lastAngleRef = useRef(needleAngle);
  const animationRef = useRef<number | null>(null);

  // Physics-based inertia
  useEffect(() => {
    if (!isDragging && Math.abs(velocity) > 0.1) {
      animationRef.current = requestAnimationFrame(() => {
        const newAngle = Math.max(0, Math.min(180, needleAngle + velocity));
        onNeedleChange(newAngle);
        setVelocity(v => v * 0.92);
      });
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isDragging, velocity, needleAngle, onNeedleChange]);

  const calculateAngle = useCallback((clientX: number, clientY: number) => {
    if (!dialRef.current) return needleAngle;
    const rect = dialRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.bottom;
    const dx = clientX - centerX;
    const dy = centerY - clientY;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    angle = Math.max(0, Math.min(180, angle));
    return angle;
  }, [needleAngle]);

  const handleStart = (clientX: number, clientY: number) => {
    if (disabled) return;
    setIsDragging(true);
    setVelocity(0);
    lastAngleRef.current = calculateAngle(clientX, clientY);
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!isDragging || disabled) return;
    const newAngle = calculateAngle(clientX, clientY);
    const delta = newAngle - lastAngleRef.current;
    setVelocity(delta * 0.5);
    lastAngleRef.current = newAngle;
    onNeedleChange(newAngle);
  };

  const handleEnd = () => {
    setIsDragging(false);
  };

  const getScoreAtAngle = (angle: number): number => {
    const diff = Math.abs(angle - targetAngle);
    if (diff <= 9) return 4;
    if (diff <= 18) return 3;
    if (diff <= 27) return 2;
    return 0;
  };

  return (
    <div
      ref={dialRef}
      className="relative w-full max-w-lg mx-auto aspect-[2/1] select-none touch-none"
      onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
      onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchEnd={handleEnd}
    >
      {/* Dial Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full aspect-square rounded-full"
          style={{
            background: 'conic-gradient(from 270deg, #1e1b4b 0deg, #312e81 45deg, #4c1d95 90deg, #312e81 135deg, #1e1b4b 180deg)',
          }}
        />
      </div>

      {/* Target Area (Hidden unless showTarget or isPsychic) */}
      {(showTarget || isPsychic) && (
        <div
          className="absolute bottom-0 left-1/2 origin-bottom transition-opacity duration-700"
          style={{
            width: '4px',
            height: '50%',
            marginLeft: '-2px',
            transform: `rotate(${90 - targetAngle}deg)`,
          }}
        >
          {/* Target zone wedge visual */}
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[300px] h-[150px] origin-bottom"
            style={{
              background: `conic-gradient(from ${270 + targetAngle - 27}deg at 50% 100%, 
                transparent 0deg,
                rgba(239, 68, 68, 0.3) 0deg,
                rgba(251, 146, 60, 0.4) 18deg,
                rgba(34, 197, 94, 0.6) 27deg,
                rgba(34, 197, 94, 0.6) 27deg,
                rgba(251, 146, 60, 0.4) 36deg,
                rgba(239, 68, 68, 0.3) 54deg,
                transparent 54deg
              )`,
              clipPath: 'polygon(50% 100%, 0% 0%, 100% 0%)',
            }}
          />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-full bg-gradient-to-t from-green-400 to-green-200 rounded-full shadow-lg shadow-green-500/50" />
        </div>
      )}

      {/* Shutter Overlay */}
      {!showTarget && !isPsychic && (
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/95 via-slate-800/90 to-transparent backdrop-blur-sm transition-all duration-700 flex items-center justify-center">
          <div className="text-white/60 text-xl font-light tracking-wider">
            🔒 Target Hidden
          </div>
        </div>
      )}

      {/* Needle */}
      <div
        className={`absolute bottom-0 left-1/2 origin-bottom transition-transform ${isDragging ? 'duration-0' : 'duration-150'} ${!disabled ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{
          width: '8px',
          height: '45%',
          marginLeft: '-4px',
          transform: `rotate(${90 - needleAngle}deg)`,
          filter: 'drop-shadow(0 0 10px rgba(236, 72, 153, 0.8))',
        }}
      >
        <div className="w-full h-full bg-gradient-to-t from-pink-500 via-pink-400 to-white rounded-full" />
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-white rounded-full border-4 border-pink-500 shadow-lg shadow-pink-500/50" />
      </div>

      {/* Center pivot */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-8 h-8 bg-gradient-to-br from-teal-400 to-purple-600 rounded-full border-4 border-white shadow-xl" />

      {/* Score indicator */}
      {showTarget && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-2 bg-black/60 backdrop-blur rounded-full">
          <span className="text-2xl font-bold text-white">
            +{getScoreAtAngle(needleAngle)} points
          </span>
        </div>
      )}
    </div>
  );
}

// ==================== MAIN GAME COMPONENT ====================
export default function WavelengthGame() {
  const router = useRouter();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [playerId, setPlayerId] = useState<string>('');
  const [playerName, setPlayerName] = useState<string>('');
  const [lobbyCode, setLobbyCode] = useState<string>('');
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [publicLobbies, setPublicLobbies] = useState<PublicLobby[]>([]);
  const [showLobbyBrowser, setShowLobbyBrowser] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [clueInput, setClueInput] = useState('');
  const [localNeedleAngle, setLocalNeedleAngle] = useState(90);

  // Initialize socket
  useEffect(() => {
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
    const newSocket = io(serverUrl);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setPlayerId(newSocket.id || '');
    });

    newSocket.on('wavelength:lobbyUpdate', (lobbyData: LobbyState) => {
      setLobby(lobbyData);
      setLocalNeedleAngle(lobbyData.needleAngle);
    });

    newSocket.on('wavelength:needleUpdate', ({ angle }: { angle: number }) => {
      setLocalNeedleAngle(angle);
    });

    newSocket.on('wavelength:lobbiesUpdate', (lobbies: PublicLobby[]) => {
      setPublicLobbies(lobbies);
    });

    newSocket.on('wavelength:error', ({ message }: { message: string }) => {
      alert(message);
    });

    newSocket.on('wavelength:playerLeft', () => {
      // Player left during game
    });

    return () => {
      newSocket.close();
    };
  }, []);

  // Create lobby
  const createLobby = () => {
    if (!socket || !playerName.trim()) return;
    socket.emit('wavelength:createLobby', { playerName, isPrivate });
  };

  // Join lobby
  const joinLobby = (targetLobbyId?: string) => {
    const finalLobbyId = targetLobbyId || lobbyCode;
    if (!socket || !playerName.trim() || !finalLobbyId.trim()) return;
    socket.emit('wavelength:joinLobby', { lobbyId: finalLobbyId.toUpperCase(), playerName });
    setShowLobbyBrowser(false);
  };

  // Request public lobbies
  const requestLobbies = () => {
    if (socket) {
      socket.emit('wavelength:getLobbies');
      setShowLobbyBrowser(true);
    }
  };

  // Start game
  const startGame = () => {
    if (!socket || !lobby) return;
    socket.emit('wavelength:startGame', { lobbyId: lobby.id });
  };

  // Submit clue
  const submitClue = () => {
    if (!socket || !lobby || !clueInput.trim()) return;
    socket.emit('wavelength:submitClue', { lobbyId: lobby.id, clue: clueInput.trim() });
    setClueInput('');
  };

  // Update needle position
  const handleNeedleChange = (angle: number) => {
    setLocalNeedleAngle(angle);
    if (socket && lobby) {
      socket.emit('wavelength:updateNeedle', { lobbyId: lobby.id, angle });
    }
  };

  // Lock in guess
  const lockGuess = () => {
    if (!socket || !lobby) return;
    socket.emit('wavelength:lockGuess', { lobbyId: lobby.id });
  };

  // Next round
  const nextRound = () => {
    if (!socket || !lobby) return;
    socket.emit('wavelength:nextRound', { lobbyId: lobby.id });
  };

  // Play again
  const playAgain = () => {
    if (!socket || !lobby) return;
    socket.emit('wavelength:playAgain', { lobbyId: lobby.id });
  };

  // Leave lobby
  const leaveLobby = () => {
    if (socket) {
      socket.emit('wavelength:leaveLobby');
    }
    setLobby(null);
  };

  // Computed values
  const isPsychic = lobby?.psychicId === playerId;
  const isHost = lobby?.host === playerId;
  const otherPlayer = lobby?.players.find(p => p.id !== playerId);
  const myPlayer = lobby?.players.find(p => p.id === playerId);

  // ==================== LOBBY SCREEN ====================
  if (!lobby) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-slate-900 to-teal-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-xl rounded-3xl p-8 border border-white/20 shadow-2xl">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">📡</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-teal-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
              Wavelength
            </h1>
            <p className="text-white/60">2-Player Online Mind-Reading Game!</p>
          </div>

          {!showLobbyBrowser ? (
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Your Name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-teal-400 transition-all"
              />
              
              <div className="flex items-center gap-3 px-2">
                <input
                  type="checkbox"
                  id="private"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="w-5 h-5 rounded"
                />
                <label htmlFor="private" className="text-white/70">Private Lobby</label>
              </div>

              <button
                onClick={createLobby}
                disabled={!playerName.trim()}
                className="w-full py-4 bg-gradient-to-r from-teal-500 to-purple-600 text-white font-bold text-xl rounded-xl hover:from-teal-400 hover:to-purple-500 transition-all disabled:opacity-50 shadow-lg shadow-purple-500/30"
              >
                Create Lobby
              </button>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Lobby Code"
                  value={lobbyCode}
                  onChange={(e) => setLobbyCode(e.target.value.toUpperCase())}
                  className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-teal-400 transition-all uppercase"
                />
                <button
                  onClick={() => joinLobby()}
                  disabled={!playerName.trim() || !lobbyCode.trim()}
                  className="px-6 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-500 transition-all disabled:opacity-50"
                >
                  Join
                </button>
              </div>

              <button
                onClick={requestLobbies}
                disabled={!playerName.trim()}
                className="w-full py-3 bg-white/10 text-white/70 rounded-xl hover:bg-white/20 transition-all disabled:opacity-50"
              >
                🔍 Browse Public Lobbies
              </button>

              <button
                onClick={() => router.push('/')}
                className="w-full py-3 bg-white/5 text-white/50 rounded-xl hover:bg-white/10 transition-all"
              >
                ← Back to Home
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">Public Lobbies</h3>
              {publicLobbies.length === 0 ? (
                <p className="text-white/50 text-center py-4">No public lobbies available</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {publicLobbies.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => joinLobby(l.id)}
                      className="w-full p-4 bg-white/10 hover:bg-white/20 rounded-xl text-left transition-all"
                    >
                      <div className="text-white font-bold">{l.players[0]?.name}&apos;s Lobby</div>
                      <div className="text-white/50 text-sm">Code: {l.id} • {l.players.length}/2 players</div>
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setShowLobbyBrowser(false)}
                className="w-full py-3 bg-white/10 text-white/70 rounded-xl hover:bg-white/20 transition-all"
              >
                ← Back
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==================== WAITING FOR PLAYERS ====================
  if (lobby.phase === 'waiting') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-slate-900 to-teal-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-xl rounded-3xl p-8 border border-white/20 shadow-2xl">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-white mb-2">Lobby: {lobby.id}</h1>
            <p className="text-white/60">Share this code with a friend!</p>
          </div>

          <div className="space-y-3 mb-6">
            <h3 className="text-white/70 text-sm uppercase tracking-wider">Players ({lobby.players.length}/2)</h3>
            {lobby.players.map((p) => (
              <div key={p.id} className={`p-4 rounded-xl ${p.id === playerId ? 'bg-teal-500/30 border border-teal-400' : 'bg-white/10'}`}>
                <span className="text-white font-bold">{p.name}</span>
                {p.id === lobby.host && <span className="ml-2 text-yellow-400">👑 Host</span>}
                {p.id === playerId && <span className="ml-2 text-teal-300">(You)</span>}
              </div>
            ))}
            {lobby.players.length < 2 && (
              <div className="p-4 rounded-xl bg-white/5 border-2 border-dashed border-white/20 text-center">
                <span className="text-white/40">Waiting for player...</span>
              </div>
            )}
          </div>

          {isHost && lobby.players.length >= 2 && (
            <button
              onClick={startGame}
              className="w-full py-4 bg-gradient-to-r from-teal-500 to-purple-600 text-white font-bold text-xl rounded-xl hover:from-teal-400 hover:to-purple-500 transition-all shadow-lg"
            >
              🚀 Start Game
            </button>
          )}

          {isHost && lobby.players.length < 2 && (
            <p className="text-center text-white/50">Waiting for another player to join...</p>
          )}

          {!isHost && (
            <p className="text-center text-white/50">Waiting for host to start the game...</p>
          )}

          <button
            onClick={leaveLobby}
            className="w-full mt-4 py-3 bg-white/10 text-white/70 rounded-xl hover:bg-white/20 transition-all"
          >
            Leave Lobby
          </button>
        </div>
      </div>
    );
  }

  // ==================== PSYCHIC PHASE ====================
  if (lobby.phase === 'psychic') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-slate-900 to-teal-950 p-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <div className="text-white/60">Round {lobby.round}/{lobby.maxRounds}</div>
            <div className="flex gap-4">
              {lobby.players.map(p => (
                <div key={p.id} className={`px-4 py-2 rounded-xl ${p.id === playerId ? 'bg-teal-500/30' : 'bg-white/10'}`}>
                  <span className="text-white">{p.name}: <span className="font-bold text-teal-400">{p.score}</span></span>
                </div>
              ))}
            </div>
          </div>

          {/* Role indicator */}
          <div className="text-center mb-6">
            <div className={`inline-block px-6 py-2 rounded-full text-white font-bold text-lg shadow-lg ${isPsychic ? 'bg-gradient-to-r from-purple-600 to-pink-600' : 'bg-gradient-to-r from-teal-600 to-blue-600'}`}>
              {isPsychic ? '🔮 You are the Psychic!' : '👀 Waiting for Psychic\'s clue...'}
            </div>
          </div>

          {/* Concept labels */}
          <div className="flex justify-between items-center mb-4 px-8">
            <div className="text-2xl font-bold text-teal-400">{lobby.leftConcept}</div>
            <div className="text-white/40">◄ spectrum ►</div>
            <div className="text-2xl font-bold text-pink-400">{lobby.rightConcept}</div>
          </div>

          {/* Dial */}
          <Dial
            targetAngle={lobby.targetAngle}
            needleAngle={localNeedleAngle}
            showTarget={false}
            isPsychic={isPsychic}
            onNeedleChange={() => {}}
            disabled={true}
          />

          {/* Psychic clue input */}
          {isPsychic && (
            <div className="mt-8 max-w-md mx-auto">
              <p className="text-white/60 text-center mb-4">
                Give a one-word clue that hints where the target is!
              </p>
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Enter your clue..."
                  value={clueInput}
                  onChange={(e) => setClueInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitClue()}
                  className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-teal-400 transition-all text-lg"
                />
                <button
                  onClick={submitClue}
                  disabled={!clueInput.trim()}
                  className="px-8 py-3 bg-gradient-to-r from-teal-500 to-purple-600 text-white font-bold rounded-xl hover:from-teal-400 hover:to-purple-500 transition-all disabled:opacity-50 shadow-lg"
                >
                  Submit
                </button>
              </div>
            </div>
          )}

          {!isPsychic && (
            <div className="mt-8 text-center">
              <div className="inline-block px-6 py-4 bg-white/10 rounded-xl">
                <p className="text-white/70">Waiting for <span className="text-purple-400 font-bold">{otherPlayer?.name}</span> to give a clue...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==================== GUESSING PHASE ====================
  if (lobby.phase === 'guessing') {
    const isGuesser = !isPsychic;
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-slate-900 to-teal-950 p-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <div className="text-white/60">Round {lobby.round}/{lobby.maxRounds}</div>
            <div className="flex gap-4">
              {lobby.players.map(p => (
                <div key={p.id} className={`px-4 py-2 rounded-xl ${p.id === playerId ? 'bg-teal-500/30' : 'bg-white/10'}`}>
                  <span className="text-white">{p.name}: <span className="font-bold text-teal-400">{p.score}</span></span>
                </div>
              ))}
            </div>
          </div>

          {/* Clue display */}
          <div className="text-center mb-6">
            <div className="text-white/60 mb-2">The clue is:</div>
            <div className="text-5xl font-bold bg-gradient-to-r from-teal-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              &quot;{lobby.clue}&quot;
            </div>
          </div>

          {/* Role indicator */}
          <div className="text-center mb-4">
            <div className={`inline-block px-4 py-1 rounded-full text-white text-sm ${isGuesser ? 'bg-teal-600' : 'bg-purple-600'}`}>
              {isGuesser ? '🎯 Drag the needle to guess!' : '🔮 Watch your teammate guess...'}
            </div>
          </div>

          {/* Concept labels */}
          <div className="flex justify-between items-center mb-4 px-8">
            <div className="text-2xl font-bold text-teal-400">{lobby.leftConcept}</div>
            <div className="text-white/40">◄ spectrum ►</div>
            <div className="text-2xl font-bold text-pink-400">{lobby.rightConcept}</div>
          </div>

          {/* Dial */}
          <Dial
            targetAngle={lobby.targetAngle}
            needleAngle={localNeedleAngle}
            showTarget={false}
            isPsychic={isPsychic}
            onNeedleChange={handleNeedleChange}
            disabled={!isGuesser}
          />

          {/* Lock in button for guesser */}
          {isGuesser && (
            <div className="mt-8 text-center">
              <button
                onClick={lockGuess}
                className="px-12 py-4 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold text-xl rounded-xl hover:from-pink-400 hover:to-purple-500 transition-all shadow-lg shadow-purple-500/30"
              >
                🎯 Lock In Guess
              </button>
            </div>
          )}

          {isPsychic && (
            <div className="mt-8 text-center">
              <p className="text-white/60">Watch {otherPlayer?.name} make their guess...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==================== REVEAL PHASE ====================
  if (lobby.phase === 'reveal') {
    const points = lobby.lastPoints || 0;
    let message = '';
    if (points === 4) message = 'BULLSEYE! 🎯';
    else if (points === 3) message = 'Great guess! 🌟';
    else if (points === 2) message = 'Close! 👍';
    else message = 'Missed it! 😅';

    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-slate-900 to-teal-950 p-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <div className="text-white/60">Round {lobby.round}/{lobby.maxRounds}</div>
            <div className="flex gap-4">
              {lobby.players.map(p => (
                <div key={p.id} className={`px-4 py-2 rounded-xl ${p.id === playerId ? 'bg-teal-500/30' : 'bg-white/10'}`}>
                  <span className="text-white">{p.name}: <span className="font-bold text-teal-400">{p.score}</span></span>
                </div>
              ))}
            </div>
          </div>

          {/* Result message */}
          <div className="text-center mb-6">
            <div className="text-5xl font-bold text-white mb-2">{message}</div>
            <div className="text-3xl text-teal-400">+{points} points each!</div>
          </div>

          {/* Concept labels */}
          <div className="flex justify-between items-center mb-4 px-8">
            <div className="text-2xl font-bold text-teal-400">{lobby.leftConcept}</div>
            <div className="text-white/40">&quot;{lobby.clue}&quot;</div>
            <div className="text-2xl font-bold text-pink-400">{lobby.rightConcept}</div>
          </div>

          {/* Dial with revealed target */}
          <Dial
            targetAngle={lobby.targetAngle}
            needleAngle={localNeedleAngle}
            showTarget={true}
            isPsychic={false}
            onNeedleChange={() => {}}
            disabled={true}
          />

          {/* Next button (host only) */}
          <div className="mt-8 text-center">
            {isHost ? (
              <button
                onClick={nextRound}
                className="px-12 py-4 bg-gradient-to-r from-teal-500 to-purple-600 text-white font-bold text-xl rounded-xl hover:from-teal-400 hover:to-purple-500 transition-all shadow-lg shadow-purple-500/30"
              >
                {lobby.round >= lobby.maxRounds ? '🏆 See Results' : '➡️ Next Round'}
              </button>
            ) : (
              <p className="text-white/60">Waiting for host to continue...</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==================== RESULTS PHASE ====================
  if (lobby.phase === 'results') {
    const maxPossible = lobby.maxRounds * 4;
    const teamScore = myPlayer?.score || 0;
    const percentage = Math.round((teamScore / maxPossible) * 100);
    let rating = '';
    if (percentage >= 90) rating = 'Perfect Sync! 🌟';
    else if (percentage >= 70) rating = 'Great Wavelength! 📡';
    else if (percentage >= 50) rating = 'Getting There! 🎯';
    else rating = 'Keep Practicing! 💪';

    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-slate-900 to-teal-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-xl rounded-3xl p-8 border border-white/20 shadow-2xl text-center">
          <div className="text-6xl mb-4">🏆</div>
          <h1 className="text-4xl font-bold text-white mb-2">Game Over!</h1>
          <p className="text-2xl text-teal-400 mb-6">{rating}</p>

          <div className="bg-white/10 rounded-2xl p-6 mb-6">
            <div className="text-6xl font-bold bg-gradient-to-r from-teal-400 to-purple-400 bg-clip-text text-transparent mb-2">
              {teamScore}
            </div>
            <div className="text-white/60">
              out of {maxPossible} points ({percentage}%)
            </div>
          </div>

          <div className="space-y-2 mb-6">
            {lobby.players.map(p => (
              <div key={p.id} className="flex justify-between px-4 py-2 bg-white/10 rounded-xl">
                <span className="text-white">{p.name}</span>
                <span className="text-teal-400 font-bold">{p.score} pts</span>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {isHost && (
              <button
                onClick={playAgain}
                className="w-full py-4 bg-gradient-to-r from-teal-500 to-purple-600 text-white font-bold text-xl rounded-xl hover:from-teal-400 hover:to-purple-500 transition-all shadow-lg"
              >
                Play Again
              </button>
            )}
            {!isHost && (
              <p className="text-white/60 py-2">Waiting for host...</p>
            )}
            <button
              onClick={leaveLobby}
              className="w-full py-3 bg-white/10 text-white/70 rounded-xl hover:bg-white/20 transition-all"
            >
              Leave Lobby
            </button>
            <button
              onClick={() => {
                leaveLobby();
                router.push('/');
              }}
              className="w-full py-3 bg-white/5 text-white/50 rounded-xl hover:bg-white/10 transition-all"
            >
              ← Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
