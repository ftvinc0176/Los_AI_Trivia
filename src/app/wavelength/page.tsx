'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ==================== TYPES ====================
interface GameState {
  phase: 'lobby' | 'psychic' | 'guessing' | 'reveal' | 'results';
  targetAngle: number; // 0-180 degrees
  needleAngle: number; // 0-180 degrees
  clue: string;
  leftConcept: string;
  rightConcept: string;
  score: number;
  round: number;
  maxRounds: number;
  isPsychic: boolean;
  players: string[];
}

// ==================== CONCEPTS ====================
const CONCEPT_PAIRS = [
  ['Hot', 'Cold'],
  ['Good', 'Bad'],
  ['Old', 'New'],
  ['Big', 'Small'],
  ['Fast', 'Slow'],
  ['Loud', 'Quiet'],
  ['Easy', 'Hard'],
  ['Cheap', 'Expensive'],
  ['Famous', 'Unknown'],
  ['Healthy', 'Unhealthy'],
  ['Beautiful', 'Ugly'],
  ['Smart', 'Dumb'],
  ['Dangerous', 'Safe'],
  ['Common', 'Rare'],
  ['Boring', 'Exciting'],
  ['Real', 'Fictional'],
  ['Ancient', 'Modern'],
  ['Natural', 'Artificial'],
  ['Light', 'Heavy'],
  ['Simple', 'Complex'],
];

// ==================== CONTROLLER (WebSocket placeholders) ====================
const GameController = {
  emit: (event: string, data?: unknown) => {
    console.log(`[EMIT] ${event}`, data);
    // Placeholder: socket.emit(event, data);
  },
  on: (event: string, callback: (data: unknown) => void) => {
    console.log(`[LISTEN] ${event}`);
    // Placeholder: socket.on(event, callback);
    return () => {}; // cleanup
  },
};

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
        setVelocity(v => v * 0.92); // friction
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
    GameController.emit('UPDATE_NEEDLE_POSITION', { angle: newAngle });
  };

  const handleEnd = () => {
    setIsDragging(false);
  };

  // Calculate score zone (2, 3, 4, 3, 2)
  const getScoreAtAngle = (angle: number): number => {
    const diff = Math.abs(angle - targetAngle);
    if (diff <= 9) return 4;
    if (diff <= 18) return 3;
    if (diff <= 27) return 2;
    return 0;
  };

  // Target wedge position and size
  const targetWedgeStart = targetAngle - 27;
  const targetWedgeEnd = targetAngle + 27;

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

      {/* Score Zones */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 100" preserveAspectRatio="xMidYMax meet">
        {/* Zone gradients for scoring areas */}
        <defs>
          <radialGradient id="zone4" cx="50%" cy="100%" r="50%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.3" />
          </radialGradient>
          <radialGradient id="zone3" cx="50%" cy="100%" r="50%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.2" />
          </radialGradient>
          <radialGradient id="zone2" cx="50%" cy="100%" r="50%">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.1" />
          </radialGradient>
        </defs>
      </svg>

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
          {/* Target zone wedge */}
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[300px] h-[150px] origin-bottom"
            style={{
              background: `conic-gradient(from ${270 + targetWedgeStart}deg at 50% 100%, 
                transparent 0deg,
                rgba(239, 68, 68, 0.2) 0deg,
                rgba(251, 146, 60, 0.3) ${(targetAngle - targetWedgeStart - 18)}deg,
                rgba(34, 197, 94, 0.5) ${(targetAngle - targetWedgeStart - 9)}deg,
                rgba(34, 197, 94, 0.5) ${(targetAngle - targetWedgeStart + 9)}deg,
                rgba(251, 146, 60, 0.3) ${(targetAngle - targetWedgeStart + 18)}deg,
                rgba(239, 68, 68, 0.2) ${54}deg,
                transparent ${54}deg
              )`,
              clipPath: 'polygon(50% 100%, 0% 0%, 100% 0%)',
            }}
          />
          {/* Center line marker */}
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
        className={`absolute bottom-0 left-1/2 origin-bottom transition-transform ${isDragging ? 'duration-0' : 'duration-150'} cursor-grab active:cursor-grabbing`}
        style={{
          width: '8px',
          height: '45%',
          marginLeft: '-4px',
          transform: `rotate(${90 - needleAngle}deg)`,
          filter: 'drop-shadow(0 0 10px rgba(236, 72, 153, 0.8))',
        }}
      >
        <div className="w-full h-full bg-gradient-to-t from-pink-500 via-coral-400 to-white rounded-full" />
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
  const [gameState, setGameState] = useState<GameState>({
    phase: 'lobby',
    targetAngle: 90,
    needleAngle: 90,
    clue: '',
    leftConcept: 'Hot',
    rightConcept: 'Cold',
    score: 0,
    round: 1,
    maxRounds: 5,
    isPsychic: true,
    players: ['You'],
  });
  const [clueInput, setClueInput] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');

  // Generate new round
  const startNewRound = useCallback(() => {
    const pair = CONCEPT_PAIRS[Math.floor(Math.random() * CONCEPT_PAIRS.length)];
    const randomSwap = Math.random() > 0.5;
    const newTarget = Math.floor(Math.random() * 160) + 10; // 10-170 degrees

    setGameState(prev => ({
      ...prev,
      phase: 'psychic',
      targetAngle: newTarget,
      needleAngle: 90,
      clue: '',
      leftConcept: randomSwap ? pair[1] : pair[0],
      rightConcept: randomSwap ? pair[0] : pair[1],
    }));
  }, []);

  // Handle clue submission
  const submitClue = () => {
    if (!clueInput.trim()) return;
    setGameState(prev => ({
      ...prev,
      phase: 'guessing',
      clue: clueInput.trim(),
    }));
    setClueInput('');
    GameController.emit('SEND_CLUE', { clue: clueInput.trim() });
  };

  // Handle reveal
  const revealTarget = () => {
    const diff = Math.abs(gameState.needleAngle - gameState.targetAngle);
    let points = 0;
    if (diff <= 9) points = 4;
    else if (diff <= 18) points = 3;
    else if (diff <= 27) points = 2;

    setGameState(prev => ({
      ...prev,
      phase: 'reveal',
      score: prev.score + points,
    }));
    GameController.emit('REVEAL_TARGET', { score: points });
  };

  // Next round or end game
  const nextRound = () => {
    if (gameState.round >= gameState.maxRounds) {
      setGameState(prev => ({ ...prev, phase: 'results' }));
    } else {
      setGameState(prev => ({
        ...prev,
        round: prev.round + 1,
        isPsychic: !prev.isPsychic, // rotate psychic role
      }));
      startNewRound();
    }
  };

  // Start game
  const startGame = () => {
    if (!playerName.trim()) return;
    startNewRound();
  };

  // Update needle position
  const handleNeedleChange = (angle: number) => {
    setGameState(prev => ({ ...prev, needleAngle: angle }));
  };

  // ==================== LOBBY PHASE ====================
  if (gameState.phase === 'lobby') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-slate-900 to-teal-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-xl rounded-3xl p-8 border border-white/20 shadow-2xl">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">📡</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-teal-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
              Wavelength
            </h1>
            <p className="text-white/60">Tune into the same wavelength!</p>
          </div>

          <div className="space-y-4">
            <input
              type="text"
              placeholder="Your Name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-teal-400 transition-all"
            />
            <input
              type="text"
              placeholder="Room Code (optional)"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-teal-400 transition-all"
            />
            <button
              onClick={startGame}
              disabled={!playerName.trim()}
              className="w-full py-4 bg-gradient-to-r from-teal-500 to-purple-600 text-white font-bold text-xl rounded-xl hover:from-teal-400 hover:to-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/30"
            >
              Start Game
            </button>
            <button
              onClick={() => router.push('/')}
              className="w-full py-3 bg-white/10 text-white/70 rounded-xl hover:bg-white/20 transition-all"
            >
              ← Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== PSYCHIC PHASE ====================
  if (gameState.phase === 'psychic') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-slate-900 to-teal-950 p-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div className="text-white/60">
              Round {gameState.round}/{gameState.maxRounds}
            </div>
            <div className="text-2xl font-bold text-teal-400">
              Score: {gameState.score}
            </div>
          </div>

          {/* Role indicator */}
          <div className="text-center mb-6">
            <div className="inline-block px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full text-white font-bold text-lg shadow-lg shadow-purple-500/30">
              🔮 You are the Psychic!
            </div>
          </div>

          {/* Concept labels */}
          <div className="flex justify-between items-center mb-4 px-8">
            <div className="text-2xl font-bold text-teal-400">{gameState.leftConcept}</div>
            <div className="text-white/40">◄ spectrum ►</div>
            <div className="text-2xl font-bold text-coral-400">{gameState.rightConcept}</div>
          </div>

          {/* Dial */}
          <Dial
            targetAngle={gameState.targetAngle}
            needleAngle={gameState.needleAngle}
            showTarget={false}
            isPsychic={true}
            onNeedleChange={handleNeedleChange}
            disabled={true}
          />

          {/* Clue input */}
          <div className="mt-8 max-w-md mx-auto">
            <p className="text-white/60 text-center mb-4">
              Give a one-word clue that hints where the target is on the spectrum!
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
        </div>
      </div>
    );
  }

  // ==================== GUESSING PHASE ====================
  if (gameState.phase === 'guessing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-slate-900 to-teal-950 p-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div className="text-white/60">
              Round {gameState.round}/{gameState.maxRounds}
            </div>
            <div className="text-2xl font-bold text-teal-400">
              Score: {gameState.score}
            </div>
          </div>

          {/* Clue display */}
          <div className="text-center mb-6">
            <div className="text-white/60 mb-2">The clue is:</div>
            <div className="text-5xl font-bold bg-gradient-to-r from-teal-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              &quot;{gameState.clue}&quot;
            </div>
          </div>

          {/* Concept labels */}
          <div className="flex justify-between items-center mb-4 px-8">
            <div className="text-2xl font-bold text-teal-400">{gameState.leftConcept}</div>
            <div className="text-white/40">◄ spectrum ►</div>
            <div className="text-2xl font-bold text-pink-400">{gameState.rightConcept}</div>
          </div>

          {/* Dial */}
          <Dial
            targetAngle={gameState.targetAngle}
            needleAngle={gameState.needleAngle}
            showTarget={false}
            isPsychic={false}
            onNeedleChange={handleNeedleChange}
            disabled={false}
          />

          {/* Instructions */}
          <div className="mt-8 text-center">
            <p className="text-white/60 mb-4">
              Drag the needle to where you think the target is!
            </p>
            <button
              onClick={revealTarget}
              className="px-12 py-4 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold text-xl rounded-xl hover:from-pink-400 hover:to-purple-500 transition-all shadow-lg shadow-purple-500/30"
            >
              🎯 Lock In Guess
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== REVEAL PHASE ====================
  if (gameState.phase === 'reveal') {
    const diff = Math.abs(gameState.needleAngle - gameState.targetAngle);
    let points = 0;
    let message = '';
    if (diff <= 9) { points = 4; message = 'BULLSEYE! 🎯'; }
    else if (diff <= 18) { points = 3; message = 'Great guess! 🌟'; }
    else if (diff <= 27) { points = 2; message = 'Close! 👍'; }
    else { points = 0; message = 'Missed it! 😅'; }

    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-slate-900 to-teal-950 p-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div className="text-white/60">
              Round {gameState.round}/{gameState.maxRounds}
            </div>
            <div className="text-2xl font-bold text-teal-400">
              Score: {gameState.score}
            </div>
          </div>

          {/* Result message */}
          <div className="text-center mb-6">
            <div className="text-5xl font-bold text-white mb-2">{message}</div>
            <div className="text-3xl text-teal-400">+{points} points</div>
          </div>

          {/* Concept labels */}
          <div className="flex justify-between items-center mb-4 px-8">
            <div className="text-2xl font-bold text-teal-400">{gameState.leftConcept}</div>
            <div className="text-white/40">&quot;{gameState.clue}&quot;</div>
            <div className="text-2xl font-bold text-pink-400">{gameState.rightConcept}</div>
          </div>

          {/* Dial with revealed target */}
          <Dial
            targetAngle={gameState.targetAngle}
            needleAngle={gameState.needleAngle}
            showTarget={true}
            isPsychic={false}
            onNeedleChange={() => {}}
            disabled={true}
          />

          {/* Next button */}
          <div className="mt-8 text-center">
            <button
              onClick={nextRound}
              className="px-12 py-4 bg-gradient-to-r from-teal-500 to-purple-600 text-white font-bold text-xl rounded-xl hover:from-teal-400 hover:to-purple-500 transition-all shadow-lg shadow-purple-500/30"
            >
              {gameState.round >= gameState.maxRounds ? '🏆 See Results' : '➡️ Next Round'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== RESULTS PHASE ====================
  if (gameState.phase === 'results') {
    const maxPossible = gameState.maxRounds * 4;
    const percentage = Math.round((gameState.score / maxPossible) * 100);
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
              {gameState.score}
            </div>
            <div className="text-white/60">
              out of {maxPossible} points ({percentage}%)
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => {
                setGameState(prev => ({
                  ...prev,
                  phase: 'lobby',
                  score: 0,
                  round: 1,
                }));
              }}
              className="w-full py-4 bg-gradient-to-r from-teal-500 to-purple-600 text-white font-bold text-xl rounded-xl hover:from-teal-400 hover:to-purple-500 transition-all shadow-lg"
            >
              Play Again
            </button>
            <button
              onClick={() => router.push('/')}
              className="w-full py-3 bg-white/10 text-white/70 rounded-xl hover:bg-white/20 transition-all"
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
