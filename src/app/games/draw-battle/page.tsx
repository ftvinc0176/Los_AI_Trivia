'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import io, { Socket } from 'socket.io-client';

interface Player {
  id: string;
  name: string;
  score: number;
  ready: boolean;
  hasDrawn?: boolean;
  hasGuessed?: boolean;
}

interface Drawing {
  playerId: string;
  playerName: string;
  prompt: string;
  imageData: string;
  enhancedImage?: string;
}

interface Lobby {
  id: string;
  name: string;
  host: string;
  players: Player[];
  isPrivate: boolean;
  maxPlayers: number;
  inGame: boolean;
  gameType: string;
}

type GameState = 'menu' | 'lobbies' | 'lobby' | 'drawing' | 'waiting' | 'guessing' | 'roundResults' | 'finalResults';

export default function DrawBattle() {
  const router = useRouter();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState>('menu');
  const [playerName, setPlayerName] = useState('');
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [currentLobby, setCurrentLobby] = useState<Lobby | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);
  const [currentRound, setCurrentRound] = useState(1);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [currentGuessIndex, setCurrentGuessIndex] = useState(0);
  const [myGuess, setMyGuess] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [guessResults, setGuessResults] = useState<{ playerId: string; correct: boolean; answer: string }[]>([]);
  const [roundScores, setRoundScores] = useState<{ [playerId: string]: number }>({});
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCanvasDrawing, setIsCanvasDrawing] = useState(false);

  useEffect(() => {
    const newSocket = io(process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000');
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setPlayerId(newSocket.id || '');
    });

    newSocket.on('lobbiesUpdate', (updatedLobbies: Lobby[]) => {
      setLobbies(updatedLobbies);
    });

    newSocket.on('lobbyUpdate', (lobby: Lobby) => {
      setCurrentLobby(lobby);
    });

    newSocket.on('gameStart', ({ round }: { round: number }) => {
      setCurrentRound(round);
      setGameState('drawing');
      setTimeLeft(60);
      loadDrawingPrompt();
    });

    newSocket.on('drawingPhaseEnd', () => {
      setGameState('waiting');
    });

    newSocket.on('allDrawingsReady', (allDrawings: Drawing[]) => {
      setDrawings(allDrawings);
      setGameState('guessing');
      setCurrentGuessIndex(0);
      setMyGuess('');
      setGuessResults([]);
    });

    newSocket.on('roundEnd', (scores: { [playerId: string]: number }) => {
      setRoundScores(scores);
      setGameState('roundResults');
    });

    newSocket.on('gameEnd', (finalScores: Player[]) => {
      setGameState('finalResults');
    });

    newSocket.on('playerLeft', ({ playerId }: { playerId: string }) => {
      console.log('Player left:', playerId);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    if (gameState === 'drawing' && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0 && gameState === 'drawing') {
      submitDrawing();
    }
  }, [timeLeft, gameState]);

  const loadDrawingPrompt = async () => {
    setLoadingPrompt(true);
    try {
      const response = await fetch('/api/generate-drawing-prompt');
      const data = await response.json();
      setCurrentPrompt(data.prompt);
    } catch (error) {
      console.error('Error loading prompt:', error);
      setCurrentPrompt('a cat riding a skateboard');
    }
    setLoadingPrompt(false);
  };

  const createLobby = (isPrivate: boolean) => {
    if (!playerName.trim()) {
      alert('Please enter your name!');
      return;
    }
    socket?.emit('createLobby', {
      playerName: playerName.trim(),
      isPrivate,
      gameType: 'drawBattle'
    });
    setGameState('lobby');
  };

  const joinLobby = (lobbyId: string) => {
    if (!playerName.trim()) {
      alert('Please enter your name!');
      return;
    }
    socket?.emit('joinLobby', {
      lobbyId,
      playerName: playerName.trim(),
      gameType: 'drawBattle'
    });
    setGameState('lobby');
  };

  const leaveLobby = () => {
    socket?.emit('leaveLobby');
    setCurrentLobby(null);
    setGameState('menu');
  };

  const toggleReady = () => {
    socket?.emit('toggleReady');
  };

  const startGame = () => {
    socket?.emit('startGame');
  };

  const startCanvasDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    setIsCanvasDrawing(true);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isCanvasDrawing) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
  };

  const stopCanvasDrawing = () => {
    setIsCanvasDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const submitDrawing = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setEnhancing(true);
    const imageData = canvas.toDataURL('image/png');

    try {
      const response = await fetch('/api/enhance-drawing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData, prompt: currentPrompt }),
      });

      const data = await response.json();
      
      socket?.emit('submitDrawing', {
        imageData,
        enhancedImage: data.enhancedImage,
        prompt: currentPrompt,
      });

      setGameState('waiting');
    } catch (error) {
      console.error('Error enhancing drawing:', error);
      socket?.emit('submitDrawing', {
        imageData,
        enhancedImage: imageData,
        prompt: currentPrompt,
      });
      setGameState('waiting');
    }
    setEnhancing(false);
  };

  const submitGuess = () => {
    if (!myGuess.trim()) {
      alert('Please enter your guess!');
      return;
    }

    const currentDrawing = drawings.filter(d => d.playerId !== playerId)[currentGuessIndex];
    const isCorrect = myGuess.trim().toLowerCase() === currentDrawing.prompt.toLowerCase();

    setGuessResults([...guessResults, {
      playerId: currentDrawing.playerId,
      correct: isCorrect,
      answer: currentDrawing.prompt
    }]);

    socket?.emit('submitGuess', {
      drawingPlayerId: currentDrawing.playerId,
      correct: isCorrect,
    });

    const otherDrawings = drawings.filter(d => d.playerId !== playerId);
    if (currentGuessIndex + 1 < otherDrawings.length) {
      setCurrentGuessIndex(currentGuessIndex + 1);
      setMyGuess('');
    } else {
      socket?.emit('finishGuessing');
    }
  };

  // MENU SCREEN
  if (gameState === 'menu') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-12 border border-white/20">
          <h1 className="text-6xl font-bold text-white mb-4 text-center bg-gradient-to-r from-pink-400 to-purple-500 bg-clip-text text-transparent">
            AI Draw Battle 🎨⚔️
          </h1>
          <p className="text-white/80 text-center mb-8 text-lg">
            Draw funny prompts, let AI enhance them, and guess what others drew!
          </p>

          <input
            type="text"
            placeholder="Enter your name..."
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="w-full px-6 py-4 bg-white/20 text-white rounded-xl mb-6 text-lg placeholder-white/50 border border-white/30"
          />

          <div className="space-y-4">
            <button
              onClick={() => setGameState('lobbies')}
              className="w-full px-8 py-4 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all text-xl font-bold"
            >
              🌐 Public Lobbies
            </button>
            <button
              onClick={() => createLobby(false)}
              className="w-full px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all text-xl font-bold"
            >
              ➕ Create Public Lobby
            </button>
            <button
              onClick={() => createLobby(true)}
              className="w-full px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all text-xl font-bold"
            >
              🔒 Create Private Lobby
            </button>
            <button
              onClick={() => router.push('/')}
              className="w-full px-8 py-4 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-all text-lg font-medium"
            >
              ← Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // LOBBIES LIST
  if (gameState === 'lobbies') {
    const publicLobbies = lobbies.filter(l => !l.isPrivate && !l.inGame && l.gameType === 'drawBattle');
    
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-4xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-12 border border-white/20">
          <h1 className="text-5xl font-bold text-white mb-8 text-center">
            Public Draw Battle Lobbies 🎨
          </h1>

          {publicLobbies.length === 0 ? (
            <div className="text-center text-white/60 text-xl py-12">
              No public lobbies available. Create one!
            </div>
          ) : (
            <div className="space-y-4 mb-8">
              {publicLobbies.map((lobby) => (
                <div
                  key={lobby.id}
                  className="bg-white/20 rounded-xl p-6 flex justify-between items-center"
                >
                  <div>
                    <h3 className="text-white font-bold text-xl">{lobby.name}</h3>
                    <p className="text-white/70">
                      {lobby.players.length}/{lobby.maxPlayers} players
                    </p>
                  </div>
                  <button
                    onClick={() => joinLobby(lobby.id)}
                    disabled={lobby.players.length >= lobby.maxPlayers}
                    className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all font-bold disabled:opacity-50"
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => setGameState('menu')}
            className="w-full px-8 py-4 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-all text-lg font-bold"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // LOBBY SCREEN
  if (gameState === 'lobby' && currentLobby) {
    const isHost = currentLobby.host === playerId;
    const allReady = currentLobby.players.every(p => p.ready || p.id === currentLobby.host);
    const canStart = currentLobby.players.length >= 2 && allReady;

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-3xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-12 border border-white/20">
          <h1 className="text-4xl font-bold text-white mb-2 text-center">
            {currentLobby.name}
          </h1>
          <p className="text-white/60 text-center mb-8">
            {currentLobby.isPrivate ? '🔒 Private' : '🌐 Public'} • Lobby Code: {currentLobby.id}
          </p>

          <div className="bg-white/10 rounded-2xl p-6 mb-8">
            <h3 className="text-white font-bold text-xl mb-4">
              Players ({currentLobby.players.length}/{currentLobby.maxPlayers})
            </h3>
            <div className="space-y-3">
              {currentLobby.players.map((player) => (
                <div
                  key={player.id}
                  className="flex justify-between items-center bg-white/10 rounded-xl p-4"
                >
                  <span className="text-white font-medium">
                    {player.name} {player.id === currentLobby.host && '👑'}
                  </span>
                  <span className={`font-bold ${player.ready || player.id === currentLobby.host ? 'text-green-400' : 'text-yellow-400'}`}>
                    {player.id === currentLobby.host ? 'Host' : player.ready ? '✓ Ready' : 'Not Ready'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {!isHost && (
              <button
                onClick={toggleReady}
                className={`w-full px-8 py-4 rounded-xl transition-all text-xl font-bold ${
                  currentLobby.players.find(p => p.id === playerId)?.ready
                    ? 'bg-yellow-500 hover:bg-yellow-600'
                    : 'bg-green-500 hover:bg-green-600'
                } text-white`}
              >
                {currentLobby.players.find(p => p.id === playerId)?.ready ? 'Not Ready' : 'Ready Up!'}
              </button>
            )}
            
            {isHost && (
              <button
                onClick={startGame}
                disabled={!canStart}
                className="w-full px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all text-xl font-bold disabled:opacity-50"
              >
                {canStart ? 'Start Game!' : 'Waiting for players...'}
              </button>
            )}

            <button
              onClick={leaveLobby}
              className="w-full px-8 py-4 bg-red-500/80 text-white rounded-xl hover:bg-red-600 transition-all text-lg font-bold"
            >
              Leave Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  // DRAWING PHASE
  if (gameState === 'drawing') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-5xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-white">
              Round {currentRound}/3 - Draw Phase 🎨
            </h1>
            <div className={`text-3xl font-bold ${timeLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-yellow-400'}`}>
              ⏱️ {timeLeft}s
            </div>
          </div>

          <div className="bg-yellow-400/20 border-4 border-yellow-400 rounded-2xl p-6 mb-6">
            <p className="text-center text-white font-bold text-4xl">
              {loadingPrompt ? 'Loading prompt...' : currentPrompt}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 mb-4">
            <canvas
              ref={canvasRef}
              width={800}
              height={600}
              onMouseDown={startCanvasDrawing}
              onMouseMove={draw}
              onMouseUp={stopCanvasDrawing}
              onMouseLeave={stopCanvasDrawing}
              className="w-full border-2 border-gray-300 cursor-crosshair"
              style={{ 
                backgroundImage: 'repeating-linear-gradient(transparent, transparent 29px, #e5e5e5 29px, #e5e5e5 30px)',
                backgroundColor: '#fff'
              }}
            />
          </div>

          <div className="flex gap-4">
            <button
              onClick={clearCanvas}
              className="flex-1 px-6 py-3 bg-gray-500 text-white rounded-xl hover:bg-gray-600 transition-all font-bold"
            >
              Clear Canvas
            </button>
            <button
              onClick={submitDrawing}
              disabled={enhancing}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all font-bold disabled:opacity-50"
            >
              {enhancing ? 'Enhancing...' : 'Submit Drawing'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // WAITING ROOM
  if (gameState === 'waiting' && currentLobby) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-3xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-12 border border-white/20">
          <h1 className="text-5xl font-bold text-white mb-8 text-center">
            Waiting for other players... ⏳
          </h1>

          <div className="space-y-4">
            {currentLobby.players.map((player) => (
              <div
                key={player.id}
                className="bg-white/20 rounded-xl p-6 flex justify-between items-center"
              >
                <span className="text-white font-bold text-xl">{player.name}</span>
                <span className={`font-bold text-lg ${player.hasDrawn ? 'text-green-400' : 'text-yellow-400'}`}>
                  {player.hasDrawn ? '✓ Finished' : '🎨 Drawing...'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // GUESSING PHASE
  if (gameState === 'guessing') {
    const otherDrawings = drawings.filter(d => d.playerId !== playerId);
    
    if (currentGuessIndex >= otherDrawings.length) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-12 border border-white/20">
            <h1 className="text-4xl font-bold text-white text-center">
              Waiting for other players to finish guessing...
            </h1>
          </div>
        </div>
      );
    }

    const currentDrawing = otherDrawings[currentGuessIndex];
    const lastResult = guessResults[guessResults.length - 1];

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-4xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20">
          <h1 className="text-3xl font-bold text-white mb-6 text-center">
            Guess Drawing {currentGuessIndex + 1}/{otherDrawings.length} by {currentDrawing.playerName}
          </h1>

          {lastResult && (
            <div className={`mb-6 p-6 rounded-xl ${lastResult.correct ? 'bg-green-500/20 border-2 border-green-400' : 'bg-red-500/20 border-2 border-red-400'}`}>
              <p className={`text-center font-bold text-2xl ${lastResult.correct ? 'text-green-300' : 'text-red-300'}`}>
                {lastResult.correct ? '✓ Correct!' : '✗ Wrong!'} The answer was: {lastResult.answer}
              </p>
            </div>
          )}

          <div className="bg-white rounded-2xl p-6 mb-6">
            <img
              src={currentDrawing.enhancedImage || currentDrawing.imageData}
              alt="Drawing to guess"
              className="w-full h-auto rounded-xl"
            />
          </div>

          <input
            type="text"
            placeholder="What is it? Type your guess..."
            value={myGuess}
            onChange={(e) => setMyGuess(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && submitGuess()}
            className="w-full px-6 py-4 bg-white/20 text-white rounded-xl mb-4 text-lg placeholder-white/50 border border-white/30"
          />

          <button
            onClick={submitGuess}
            className="w-full px-8 py-4 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all text-xl font-bold"
          >
            Submit Guess
          </button>
        </div>
      </div>
    );
  }

  // ROUND RESULTS
  if (gameState === 'roundResults' && currentLobby) {
    const sortedPlayers = [...currentLobby.players].sort((a, b) => (roundScores[b.id] || 0) - (roundScores[a.id] || 0));

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-3xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-12 border border-white/20">
          <h1 className="text-5xl font-bold text-white mb-8 text-center">
            Round {currentRound} Results! 🎉
          </h1>

          <div className="space-y-4 mb-8">
            {sortedPlayers.map((player, index) => (
              <div
                key={player.id}
                className={`rounded-xl p-6 flex justify-between items-center ${
                  index === 0 ? 'bg-gradient-to-r from-yellow-500 to-orange-500' : 'bg-white/20'
                }`}
              >
                <span className="text-white font-bold text-xl">
                  #{index + 1} {player.name}
                </span>
                <span className="text-white font-bold text-2xl">
                  +{roundScores[player.id] || 0} pts
                </span>
              </div>
            ))}
          </div>

          <p className="text-white/80 text-center text-lg">
            {currentRound < 3 ? 'Next round starting soon...' : 'Final results coming up!'}
          </p>
        </div>
      </div>
    );
  }

  // FINAL RESULTS
  if (gameState === 'finalResults' && currentLobby) {
    const sortedPlayers = [...currentLobby.players].sort((a, b) => b.score - a.score);
    const winner = sortedPlayers[0];

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-3xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-12 border border-white/20">
          <h1 className="text-6xl font-bold text-center mb-4 bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
            🏆 {winner.name} Wins! 🏆
          </h1>
          <p className="text-white text-center text-2xl mb-8">
            Final Score: {winner.score} points
          </p>

          <div className="space-y-4 mb-8">
            {sortedPlayers.map((player, index) => (
              <div
                key={player.id}
                className={`rounded-xl p-6 flex justify-between items-center ${
                  index === 0
                    ? 'bg-gradient-to-r from-yellow-500 to-orange-500'
                    : index === 1
                    ? 'bg-gradient-to-r from-gray-400 to-gray-500'
                    : index === 2
                    ? 'bg-gradient-to-r from-orange-600 to-orange-700'
                    : 'bg-white/20'
                }`}
              >
                <span className="text-white font-bold text-xl">
                  #{index + 1} {player.name}
                </span>
                <span className="text-white font-bold text-2xl">{player.score} pts</span>
              </div>
            ))}
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setGameState('menu')}
              className="flex-1 px-8 py-4 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-all text-lg font-bold"
            >
              Main Menu
            </button>
            <button
              onClick={() => router.push('/')}
              className="flex-1 px-8 py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-xl hover:from-yellow-500 hover:to-orange-600 transition-all text-lg font-bold"
            >
              Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
