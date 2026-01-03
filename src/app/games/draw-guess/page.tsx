'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import io, { Socket } from 'socket.io-client';

interface Player {
  id: string;
  name: string;
  prompt: string;
  drawing: string; // base64 image
  enhancedImage: string; // URL from AI API
  guess: string;
  score: number;
}

export default function DrawAndGuess() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<'menu' | 'lobby' | 'drawing' | 'enhancing' | 'guessing' | 'results'>('menu');
  const [mode, setMode] = useState<'single' | 'multiplayer'>('single');
  const [roomId, setRoomId] = useState('');
  const [myPlayerId, setMyPlayerId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [myPrompt, setMyPrompt] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(60);
  const [currentGuessIndex, setCurrentGuessIndex] = useState(0);
  const [myGuess, setMyGuess] = useState('');

  // Drawing state
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('drawGuessLobbyCreated', ({ roomId, players }) => {
      setRoomId(roomId);
      setPlayers(players);
    });

    socket.on('drawGuessPlayerJoined', ({ players }) => {
      setPlayers(players);
    });

    socket.on('drawGuessJoinedLobby', ({ roomId, players }) => {
      setRoomId(roomId);
      setPlayers(players);
    });

    socket.on('drawGuessYourPrompt', ({ prompt }) => {
      setMyPrompt(prompt);
      setGameState('drawing');
      setTimeRemaining(60);
    });

    socket.on('drawGuessGameStarted', ({ state }) => {
      setGameState(state);
    });

    socket.on('drawGuessTimerUpdate', ({ timeRemaining }) => {
      setTimeRemaining(timeRemaining);
    });

    socket.on('drawGuessPhaseChange', ({ state }) => {
      setGameState(state);
    });

    socket.on('drawGuessAllSubmitted', ({ players, state }) => {
      setPlayers(players);
      setGameState(state);
      setCurrentGuessIndex(0);
    });

    socket.on('drawGuessResults', ({ players, state }) => {
      setPlayers(players);
      setGameState(state);
    });

    socket.on('drawGuessReset', ({ players, state }) => {
      setPlayers(players);
      setGameState(state);
      setMyPrompt('');
      setCurrentGuessIndex(0);
      setMyGuess('');
    });

    return () => {
      socket.off('drawGuessLobbyCreated');
      socket.off('drawGuessPlayerJoined');
      socket.off('drawGuessJoinedLobby');
      socket.off('drawGuessYourPrompt');
      socket.off('drawGuessGameStarted');
      socket.off('drawGuessTimerUpdate');
      socket.off('drawGuessPhaseChange');
      socket.off('drawGuessAllSubmitted');
      socket.off('drawGuessResults');
      socket.off('drawGuessReset');
    };
  }, [socket]);

  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        setContext(ctx);
        // Draw college-ruled paper background
        drawPaperBackground(ctx, canvas.width, canvas.height);
      }
    }
  }, [canvasRef.current, gameState]);

  const drawPaperBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // White background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // Blue horizontal lines (college ruled)
    ctx.strokeStyle = '#A7C5ED';
    ctx.lineWidth = 1;
    const lineSpacing = 30;
    for (let y = lineSpacing; y < height; y += lineSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Red vertical margin line
    ctx.strokeStyle = '#FF6B6B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, 0);
    ctx.lineTo(60, height);
    ctx.stroke();
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!context) return;
    setIsDrawing(true);
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    context.beginPath();
    context.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !context) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    context.strokeStyle = '#000000';
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.lineTo(x, y);
    context.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    if (!context || !canvasRef.current) return;
    drawPaperBackground(context, canvasRef.current.width, canvasRef.current.height);
  };

  const submitDrawing = async () => {
    if (!canvasRef.current) return;
    
    const drawing = canvasRef.current.toDataURL('image/png');
    setGameState('enhancing');

    // Send drawing to AI enhancement API
    try {
      const response = await fetch('/api/enhance-drawing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drawing, prompt: myPrompt })
      });

      const data = await response.json();
      
      if (mode === 'multiplayer' && socket) {
        socket.emit('drawGuessSubmitDrawing', { roomId, drawing, enhancedImage: data.imageUrl });
      } else {
        // Single player - go to results
        setPlayers([{
          id: myPlayerId,
          name: playerName,
          prompt: myPrompt,
          drawing,
          enhancedImage: data.imageUrl,
          guess: '',
          score: 0
        }]);
        setGameState('results');
      }
    } catch (error) {
      console.error('Error enhancing drawing:', error);
      alert('Failed to enhance drawing. Please try again.');
      setGameState('drawing');
    }
  };

  const startGame = async (selectedMode: 'single' | 'multiplayer') => {
    setMode(selectedMode);
    
    if (selectedMode === 'single') {
      // Generate prompt from Gemini
      const response = await fetch('/api/generate-drawing-prompt');
      const data = await response.json();
      setMyPrompt(data.prompt);
      setMyPlayerId('player1');
      setPlayerName('You');
      setGameState('drawing');
      setTimeRemaining(60);
    } else {
      // Multiplayer mode
      setGameState('lobby');
    }
  };

  const createLobby = () => {
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }
    
    const newSocket = io(process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000');
    setSocket(newSocket);
    
    const newRoomId = Math.random().toString(36).substring(7).toUpperCase();
    setRoomId(newRoomId);
    setMyPlayerId(newSocket.id || '');
    
    newSocket.emit('drawGuessCreateLobby', { roomId: newRoomId, playerName });
  };

  const joinLobby = () => {
    if (!playerName.trim() || !roomId.trim()) {
      alert('Please enter your name and room code');
      return;
    }
    
    const newSocket = io(process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000');
    setSocket(newSocket);
    setMyPlayerId(newSocket.id || '');
    
    newSocket.emit('drawGuessJoinLobby', { roomId: roomId.toUpperCase(), playerName });
  };

  // Menu Screen
  if (gameState === 'menu') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <div className="max-w-2xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20 shadow-2xl">
          <button onClick={() => router.push('/losgames')} className="mb-6 text-white/80 hover:text-white flex items-center gap-2">
            ← Back to Games
          </button>
          
          <h1 className="text-5xl font-bold text-white mb-4 text-center">Draw & Guess</h1>
          <p className="text-white/80 text-center mb-8">Draw your prompt, AI enhances it, friends guess it!</p>
          
          <div className="space-y-4">
            <button
              onClick={() => startGame('single')}
              className="w-full px-8 py-6 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-2xl font-bold text-2xl transition-all shadow-lg"
            >
              Practice Solo
            </button>
            
            <button
              onClick={() => startGame('multiplayer')}
              className="w-full px-8 py-6 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-2xl font-bold text-2xl transition-all shadow-lg"
            >
              Play with Friends
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Lobby Screen
  if (gameState === 'lobby') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <div className="max-w-2xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20 shadow-2xl">
          <button onClick={() => setGameState('menu')} className="mb-6 text-white/80 hover:text-white">
            ← Back
          </button>
          
          <h2 className="text-4xl font-bold text-white mb-6 text-center">Multiplayer Lobby</h2>
          
          {!roomId ? (
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Enter your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full px-6 py-4 bg-white/20 border border-white/30 rounded-xl text-white placeholder-white/50 text-lg"
              />
              
              <button
                onClick={createLobby}
                className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold text-lg"
              >
                Create Room
              </button>
              
              <div className="flex gap-4">
                <input
                  type="text"
                  placeholder="Room Code"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  className="flex-1 px-6 py-4 bg-white/20 border border-white/30 rounded-xl text-white placeholder-white/50 text-lg uppercase"
                  maxLength={7}
                />
                <button
                  onClick={joinLobby}
                  className="px-6 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-bold text-lg"
                >
                  Join
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="bg-white/10 rounded-2xl p-6 mb-6">
                <p className="text-white/60 text-sm mb-2">Room Code</p>
                <p className="text-5xl font-bold text-yellow-300">{roomId}</p>
              </div>
              
              <div className="space-y-3 mb-8">
                {players.map((player) => (
                  <div key={player.id} className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <div className="flex justify-between items-center">
                      <span className="text-white font-bold">
                        {player.name} {player.id === myPlayerId && '(You)'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              
              {players.length > 0 && players[0].id === myPlayerId && (
                <button
                  onClick={() => socket?.emit('drawGuessStartGame', { roomId })}
                  disabled={players.length < 2}
                  className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white rounded-xl font-bold text-lg transition-all"
                >
                  Start Game {players.length > 1 && `(${players.length} Players)`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Drawing Screen
  if (gameState === 'drawing') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <div className="max-w-4xl w-full">
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20 shadow-2xl">
            <div className="text-center mb-6">
              <h2 className="text-3xl font-bold text-white mb-2">Draw This:</h2>
              <p className="text-4xl font-bold text-yellow-300 mb-4">{myPrompt}</p>
              <p className="text-2xl text-white/80">Time: {timeRemaining}s</p>
            </div>
            
            <div className="bg-white rounded-2xl p-4 shadow-2xl mb-4">
              <canvas
                ref={canvasRef}
                width={800}
                height={600}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="border-2 border-gray-300 rounded-lg cursor-crosshair w-full"
                style={{ touchAction: 'none' }}
              />
            </div>
            
            <div className="flex gap-4">
              <button
                onClick={clearCanvas}
                className="flex-1 px-6 py-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-lg"
              >
                Clear
              </button>
              <button
                onClick={submitDrawing}
                className="flex-1 px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-bold text-lg"
              >
                Submit Drawing
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Enhancing Screen
  if (gameState === 'enhancing') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <div className="text-center">
          <div className="w-20 h-20 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-6"></div>
          <h2 className="text-4xl font-bold text-white mb-2">Enhancing Your Drawing...</h2>
          <p className="text-white/80 text-xl">AI is making it look amazing!</p>
        </div>
      </div>
    );
  }

  // Guessing Screen
  if (gameState === 'guessing') {
    const currentPlayer = players[currentGuessIndex];
    if (!currentPlayer || currentPlayer.id === myPlayerId) {
      return null; // Skip own drawing
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <div className="max-w-2xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20 shadow-2xl">
          <h2 className="text-3xl font-bold text-white mb-6 text-center">What did {currentPlayer.name} draw?</h2>
          
          <div className="bg-white rounded-2xl p-4 mb-6">
            <img src={currentPlayer.enhancedImage} alt="Enhanced drawing" className="w-full rounded-lg" />
          </div>
          
          <input
            type="text"
            placeholder="Your guess..."
            value={myGuess}
            onChange={(e) => setMyGuess(e.target.value)}
            className="w-full px-6 py-4 bg-white/20 border border-white/30 rounded-xl text-white placeholder-white/50 text-lg mb-4"
          />
          
          <button
            onClick={() => {
              if (socket) {
                socket.emit('drawGuessSubmitGuess', { roomId, guess: myGuess, targetPlayerId: currentPlayer.id });
              }
              setMyGuess('');
              setCurrentGuessIndex(currentGuessIndex + 1);
            }}
            className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold text-lg"
          >
            Submit Guess
          </button>
        </div>
      </div>
    );
  }

  // Results Screen
  if (gameState === 'results') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <div className="max-w-4xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20 shadow-2xl">
          <h2 className="text-4xl font-bold text-white mb-8 text-center">Results!</h2>
          
          <div className="space-y-6 mb-8">
            {players.map((player) => (
              <div key={player.id} className="bg-white/10 rounded-2xl p-6 border border-white/20">
                <div className="flex items-center gap-6">
                  <img src={player.enhancedImage} alt={player.name} className="w-40 h-40 rounded-lg object-cover" />
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-white mb-2">{player.name}</h3>
                    <p className="text-xl text-yellow-300 mb-2">Prompt: {player.prompt}</p>
                    {player.guess && <p className="text-lg text-white/70">Guessed: {player.guess}</p>}
                    <p className="text-3xl font-bold text-green-400 mt-4">Score: {player.score}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex gap-4">
            <button
              onClick={() => setGameState('menu')}
              className="flex-1 px-6 py-4 bg-white/20 hover:bg-white/30 text-white rounded-xl font-bold text-lg"
            >
              Main Menu
            </button>
            <button
              onClick={() => {
                if (mode === 'multiplayer' && socket) {
                  socket.emit('drawGuessPlayAgain', { roomId });
                } else {
                  startGame('single');
                }
              }}
              className="flex-1 px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold text-lg"
            >
              Play Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
