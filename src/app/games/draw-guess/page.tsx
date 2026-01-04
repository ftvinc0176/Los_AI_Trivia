'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

function DrawAndGuessGame() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') || 'single';
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<'lobby' | 'drawing' | 'enhancing' | 'guessing' | 'results'>('lobby');
  const [lobbyCode, setLobbyCode] = useState('');
  const [roomId, setRoomId] = useState('');
  const [myPlayerId, setMyPlayerId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [publicLobbies, setPublicLobbies] = useState<Array<{ roomId: string; hostName: string; playerCount: number; maxPlayers: number }>>([]);
  const [myPrompt, setMyPrompt] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(60);
  const [currentGuessIndex, setCurrentGuessIndex] = useState(0);
  const [myGuess, setMyGuess] = useState('');

  // Drawing state
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);
  const [puterLoaded, setPuterLoaded] = useState(false);

  // Load Puter.js for free image generation
  useEffect(() => {
    if (typeof window !== 'undefined' && !(window as any).puter) {
      const script = document.createElement('script');
      script.src = 'https://js.puter.com/v2/';
      script.async = true;
      script.onload = () => setPuterLoaded(true);
      document.head.appendChild(script);
    } else {
      setPuterLoaded(true);
    }
  }, []);

  // Socket.io setup for multiplayer
  useEffect(() => {
    if (mode !== 'single') {
      const socketUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
      const newSocket = io(socketUrl);
      setSocket(newSocket);

      newSocket.on('drawGuessLobbyCreated', ({ roomId, players }) => {
        setRoomId(roomId);
        setPlayers(players);
        setGameState('lobby');
      });

      newSocket.on('drawGuessPlayerJoined', ({ players }) => {
        setPlayers(players);
      });

      newSocket.on('drawGuessJoinedLobby', ({ roomId, players }) => {
        setRoomId(roomId);
        setPlayers(players);
        setGameState('lobby');
      });

      newSocket.on('drawGuessPublicLobbies', ({ lobbies }) => {
        setPublicLobbies(lobbies);
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
        newSocket.close();
      };
    }
  }, [mode]);

  // Fetch public lobbies for browse mode
  useEffect(() => {
    if (mode === 'browse' && socket) {
      socket.emit('getDrawGuessPublicLobbies');
      const interval = setInterval(() => {
        socket.emit('getDrawGuessPublicLobbies');
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [mode, socket]);

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
  }, [gameState]);

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

    try {
      let enhancedImageUrl = drawing;

      // Use Puter.js for FREE AI image-to-image enhancement (no API key needed!)
      if ((window as any).puter && puterLoaded) {
        try {
          // Convert base64 to raw image data for Puter (remove data:image/png;base64, prefix)
          const base64Data = drawing.split(',')[1];
          
          // Enhance the actual drawing using Gemini's image-to-image
          // CRITICAL: input_image only works with Gemini models!
          const imageElement = await (window as any).puter.ai.txt2img(
            `Transform this simple sketch into a highly detailed, realistic photograph with professional quality, 4k resolution, sharp focus, photorealistic`,
            { 
              model: 'gemini-2.5-flash-image-preview',  // MUST use Gemini model for input_image support
              input_image: base64Data,
              input_image_mime_type: 'image/png'
            }
          );
          
          // Convert image element to base64
          enhancedImageUrl = imageElement.src;
        } catch (puterError) {
          console.error('Puter.js image enhancement error:', puterError);
          // Fall back to original drawing if Puter fails
        }
      }
      
      if (mode === 'multiplayer' && socket) {
        socket.emit('drawGuessSubmitDrawing', { roomId, drawing, enhancedImage: enhancedImageUrl });
      } else {
        // Single player - go to results
        setPlayers([{
          id: myPlayerId,
          name: playerName,
          prompt: myPrompt,
          drawing,
          enhancedImage: enhancedImageUrl,
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

  const startSinglePlayer = async () => {
    setGameState('enhancing');
    
    try {
      const response = await fetch('/api/generate-drawing-prompt');
      const data = await response.json();
      
      if (data.prompt) {
        setMyPrompt(data.prompt);
        setMyPlayerId('player1');
        setPlayerName('You');
        setTimeRemaining(60);
        setGameState('drawing');
      } else {
        alert('Failed to generate prompt.');
        router.push('/losgames');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to generate prompt.');
      router.push('/losgames');
    }
  };

  const createLobby = () => {
    if (socket && playerName) {
      socket.emit('drawGuessCreateLobby', { playerName, isPublic: mode === 'browse' });
      setMyPlayerId(socket.id!);
    }
  };

  const joinLobby = () => {
    if (socket && playerName && lobbyCode) {
      socket.emit('drawGuessJoinLobby', { roomId: lobbyCode.toUpperCase(), playerName });
      setMyPlayerId(socket.id!);
    }
  };

  const joinPublicLobby = (lobbyRoomId: string) => {
    if (socket && playerName) {
      socket.emit('drawGuessJoinLobby', { roomId: lobbyRoomId, playerName });
      setMyPlayerId(socket.id!);
    }
  };

  const startGame = () => {
    if (socket && mode !== 'single') {
      socket.emit('drawGuessStartGame', { roomId });
    } else {
      startSinglePlayer();
    }
  };

  // Auto-start single player mode
  useEffect(() => {
    if (mode === 'single') {
      startSinglePlayer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Browse Public Lobbies
  if (mode === 'browse' && !roomId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <div className="max-w-2xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20 shadow-2xl">
          <h1 className="text-4xl font-bold text-white mb-8 text-center">🎨 Public Draw & Guess Lobbies</h1>
          
          <div className="space-y-4 mb-6">
            <input
              type="text"
              placeholder="Your Name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-white/40"
            />
          </div>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Available Lobbies</h2>
              <button
                onClick={() => socket?.emit('getDrawGuessPublicLobbies')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-all"
              >
                🔄 Refresh
              </button>
            </div>
            
            {publicLobbies.length === 0 ? (
              <div className="bg-white/5 rounded-xl p-8 text-center">
                <p className="text-white/60">No public lobbies available</p>
                <p className="text-white/40 text-sm mt-2">Create your own lobby to start playing!</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {publicLobbies.map((lobby) => (
                  <div key={lobby.roomId} className="bg-white/5 hover:bg-white/10 rounded-xl p-4 border border-white/10 transition-all">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-white font-bold text-lg">{lobby.hostName}&apos;s Game</p>
                        <p className="text-white/60 text-sm">{lobby.playerCount}/{lobby.maxPlayers} players • Room: {lobby.roomId}</p>
                      </div>
                      <button
                        onClick={() => joinPublicLobby(lobby.roomId)}
                        disabled={!playerName || lobby.playerCount >= lobby.maxPlayers}
                        className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white rounded-xl font-bold transition-all disabled:cursor-not-allowed"
                      >
                        {lobby.playerCount >= lobby.maxPlayers ? 'Full' : 'Join'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <button
            onClick={() => router.push('/losgames')}
            className="w-full text-white/60 hover:text-white"
          >
            ← Back to Games
          </button>
        </div>
      </div>
    );
  }

  // Create or Join Lobby
  if (mode !== 'single' && gameState === 'lobby' && !roomId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20">
          <h1 className="text-4xl font-bold text-white mb-8 text-center">
            {mode === 'create' ? '🎨 Create Game' : '🔗 Join Game'}
          </h1>
          
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Your Name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-6 py-4 bg-white/20 border border-white/30 rounded-xl text-white placeholder-white/50 text-lg"
            />
            
            {mode === 'create' ? (
              <button
                onClick={createLobby}
                disabled={!playerName}
                className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white rounded-xl font-bold text-lg transition-all"
              >
                Create Lobby
              </button>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Room Code"
                  value={lobbyCode}
                  onChange={(e) => setLobbyCode(e.target.value.toUpperCase())}
                  className="w-full px-6 py-4 bg-white/20 border border-white/30 rounded-xl text-white placeholder-white/50 text-lg uppercase"
                  maxLength={7}
                />
                <button
                  onClick={joinLobby}
                  disabled={!playerName || !lobbyCode}
                  className="w-full px-6 py-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 text-white rounded-xl font-bold text-lg transition-all"
                >
                  Join Lobby
                </button>
              </>
            )}
          </div>
          
          <button
            onClick={() => router.push('/losgames')}
            className="w-full mt-6 text-white/60 hover:text-white"
          >
            ← Back to Games
          </button>
        </div>
      </div>
    );
  }

  // Waiting Lobby (after joining/creating)
  if (mode !== 'single' && gameState === 'lobby' && roomId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <div className="max-w-2xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20 shadow-2xl">
          <h2 className="text-4xl font-bold text-white mb-6 text-center">Game Lobby</h2>
          
          <div className="bg-white/10 rounded-2xl p-6 mb-6">
            <p className="text-white/60 text-sm mb-2">Room Code</p>
            <p className="text-5xl font-bold text-yellow-300 text-center">{roomId}</p>
          </div>
          
          <div className="space-y-3 mb-8">
            <h3 className="text-xl font-bold text-white">Players ({players.length}/4)</h3>
            {players.map((player) => (
              <div key={player.id} className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="flex justify-between items-center">
                  <span className="text-white font-bold text-lg">
                    {player.name} {player.id === myPlayerId && '(You)'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          
          {players.length > 0 && players[0].id === myPlayerId ? (
            <button
              onClick={startGame}
              disabled={players.length < 2}
              className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white rounded-xl font-bold text-lg transition-all"
            >
              {players.length < 2 ? 'Waiting for players...' : `Start Game (${players.length} Players)`}
            </button>
          ) : (
            <div className="text-center text-white/60 py-4">
              Waiting for host to start the game...
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
        <div className="max-w-6xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20 shadow-2xl">
          <h2 className="text-4xl font-bold text-white mb-8 text-center">Results!</h2>
          
          <div className="space-y-8 mb-8">
            {players.map((player) => (
              <div key={player.id} className="bg-white/10 rounded-2xl p-6 border border-white/20">
                <h3 className="text-3xl font-bold text-white mb-4 text-center">{player.name}</h3>
                <p className="text-2xl text-yellow-300 mb-6 text-center">Prompt: {player.prompt}</p>
                
                {/* Side-by-side images */}
                <div className="grid md:grid-cols-2 gap-6 mb-6">
                  {/* Original Drawing */}
                  <div className="bg-white rounded-2xl p-4">
                    <h4 className="text-lg font-bold text-gray-800 mb-3 text-center">Your Drawing</h4>
                    <img src={player.drawing} alt="Original drawing" className="w-full rounded-lg" />
                  </div>
                  
                  {/* AI Enhanced Image */}
                  <div className="bg-white rounded-2xl p-4">
                    <h4 className="text-lg font-bold text-gray-800 mb-3 text-center">AI Enhanced</h4>
                    <img src={player.enhancedImage} alt="AI enhanced" className="w-full rounded-lg" />
                  </div>
                </div>
                
                <div className="text-center">
                  {player.guess && <p className="text-xl text-white/70 mb-2">Guessed: {player.guess}</p>}
                  <p className="text-4xl font-bold text-green-400">Score: {player.score}</p>
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex gap-4">
            <button
              onClick={() => router.push('/losgames')}
              className="flex-1 px-6 py-4 bg-white/20 hover:bg-white/30 text-white rounded-xl font-bold text-lg"
            >
              Main Menu
            </button>
            <button
              onClick={() => {
                if (mode === 'single') {
                  startSinglePlayer();
                } else if (socket) {
                  socket.emit('drawGuessPlayAgain', { roomId });
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

export default function DrawAndGuess() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}><div className="text-white text-2xl">Loading...</div></div>}>
      <DrawAndGuessGame />
    </Suspense>
  );
}
