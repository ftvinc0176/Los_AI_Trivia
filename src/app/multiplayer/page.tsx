'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

interface Player {
  id: string;
  name: string;
  score: number;
}

interface Question {
  question: string;
  options: string[];
  correctAnswer: number;
}

interface GameState {
  players: Player[];
  host: string;
  category: string;
  difficulty: string;
  started: boolean;
  currentQuestion: number;
  questions: Question[];
  answers: { [playerId: string]: number | null };
  timeLeft: number;
  showAnswer: boolean;
}

const CATEGORIES = [
  'General Knowledge',
  'Science & Nature',
  'History',
  'Geography',
  'Sports',
  'Entertainment',
  'Technology',
  'Art & Literature',
];

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

export default function Multiplayer() {
  const router = useRouter();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [playerId, setPlayerId] = useState<string>('');
  const [playerName, setPlayerName] = useState<string>('');
  const [roomId, setRoomId] = useState<string>('');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [joined, setJoined] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [showLobbyBrowser, setShowLobbyBrowser] = useState(false);
  const [publicLobbies, setPublicLobbies] = useState<Array<{roomId: string; hostName: string; playerCount: number}>>([]);

  useEffect(() => {
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
    const newSocket = io(serverUrl);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setPlayerId(newSocket.id || '');
    });

    newSocket.on('gameState', (state: GameState) => {
      setGameState(state);
    });

    newSocket.on('questionUpdate', (data: { currentQuestion: number; timeLeft: number; showAnswer: boolean }) => {
      setGameState((prevState) => {
        if (!prevState) return prevState;
        return {
          ...prevState,
          currentQuestion: data.currentQuestion,
          timeLeft: data.timeLeft,
          showAnswer: data.showAnswer,
        };
      });
      if (data.showAnswer) {
        setSelectedAnswer(null);
      }
    });

    newSocket.on('gameEnd', () => {
      setShowResults(true);
    });

    newSocket.on('publicLobbies', (lobbies: Array<{roomId: string; hostName: string; playerCount: number}>) => {
      setPublicLobbies(lobbies);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const joinRoom = (targetRoomId?: string) => {
    const finalRoomId = targetRoomId || roomId;
    if (socket && playerName.trim() && finalRoomId.trim()) {
      socket.emit('joinRoom', { roomId: finalRoomId, playerName });
      setRoomId(finalRoomId);
      setJoined(true);
      setShowLobbyBrowser(false);
    }
  };

  const createRoom = () => {
    if (socket && playerName.trim()) {
      const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      setRoomId(newRoomId);
      socket.emit('joinRoom', { roomId: newRoomId, playerName, isPublic });
      setJoined(true);
    }
  };

  const requestPublicLobbies = () => {
    if (socket) {
      socket.emit('getPublicLobbies');
      setShowLobbyBrowser(true);
    }
  };

  const updateSettings = (category: string, difficulty: string) => {
    if (socket && roomId) {
      socket.emit('updateSettings', { roomId, category, difficulty });
    }
  };

  const startGame = () => {
    if (socket && roomId) {
      socket.emit('startGame', { roomId });
    }
  };

  const submitAnswer = (answerIndex: number) => {
    if (socket && roomId && !gameState?.showAnswer) {
      setSelectedAnswer(answerIndex);
      socket.emit('submitAnswer', { roomId, answer: answerIndex });
    }
  };

  const returnToLobby = () => {
    if (socket && roomId) {
      socket.emit('returnToLobby', { roomId });
      setShowResults(false);
    }
  };

  const isHost = gameState?.host === playerId;
  const playerCount = gameState?.players?.length || 0;

  // Lobby Screen
  if (!joined || !gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-4xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-12 border border-white/20">
          <h1 className="text-5xl font-bold text-white mb-8 text-center">Multiplayer</h1>
          
          {!showLobbyBrowser ? (
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
                <label className="block text-white text-lg mb-3 font-medium">Privacy Setting</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setIsPublic(true)}
                    className={`p-4 rounded-xl font-medium text-lg transition-all ${
                      isPublic
                        ? 'bg-white text-purple-700'
                        : 'bg-white/20 text-white hover:bg-white/30'
                    }`}
                  >
                    🌐 Public
                  </button>
                  <button
                    onClick={() => setIsPublic(false)}
                    className={`p-4 rounded-xl font-medium text-lg transition-all ${
                      !isPublic
                        ? 'bg-white text-purple-700'
                        : 'bg-white/20 text-white hover:bg-white/30'
                    }`}
                  >
                    🔒 Private
                  </button>
                </div>
              </div>

              {!isPublic && (
                <div>
                  <label className="block text-white text-lg mb-3 font-medium">Room Code</label>
                  <input
                    type="text"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                    placeholder="Enter room code to join"
                    className="w-full p-4 rounded-xl bg-white/20 text-white border border-white/30 focus:outline-none focus:border-white/50 text-lg placeholder-white/50 uppercase"
                    maxLength={6}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {isPublic ? (
                  <>
                    <button
                      onClick={requestPublicLobbies}
                      disabled={!playerName.trim()}
                      className="px-8 py-4 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-all text-lg font-bold disabled:opacity-50"
                    >
                      Browse Lobbies
                    </button>
                    <button
                      onClick={createRoom}
                      disabled={!playerName.trim()}
                      className="px-8 py-4 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all text-lg font-bold disabled:opacity-50"
                    >
                      Create Public Room
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => joinRoom()}
                      disabled={!playerName.trim() || !roomId.trim()}
                      className="px-8 py-4 bg-white text-purple-700 rounded-xl hover:bg-purple-50 transition-all text-lg font-bold disabled:opacity-50"
                    >
                      Join Private Room
                    </button>
                    <button
                      onClick={createRoom}
                      disabled={!playerName.trim()}
                      className="px-8 py-4 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all text-lg font-bold disabled:opacity-50"
                    >
                      Create Private Room
                    </button>
                  </>
                )}
              </div>

              <button
                onClick={() => router.push('/')}
                className="w-full px-8 py-4 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-all text-lg font-medium"
              >
                Back to Home
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-white">Public Lobbies</h2>
                <button
                  onClick={() => setShowLobbyBrowser(false)}
                  className="px-6 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-all"
                >
                  Back
                </button>
              </div>
              
              {publicLobbies.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-white/70 text-lg">No public lobbies available</p>
                  <p className="text-white/50 text-sm mt-2">Create a new public room to get started!</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {publicLobbies.map((lobby) => (
                    <button
                      key={lobby.roomId}
                      onClick={() => joinRoom(lobby.roomId)}
                      className="w-full p-6 bg-white/20 rounded-xl hover:bg-white/30 transition-all text-left border border-white/20 hover:border-white/40"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-white font-bold text-lg">{lobby.hostName}'s Room</p>
                          <p className="text-purple-200 text-sm">Code: {lobby.roomId}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-white font-medium">{lobby.playerCount}/4 Players</p>
                          <p className="text-green-300 text-sm">Click to Join</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Waiting Room
  if (!gameState.started) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-4xl w-full">
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-12 border border-white/20">
            <div className="text-center mb-8">
              <h1 className="text-5xl font-bold text-white mb-4">Waiting Room</h1>
              <p className="text-3xl text-purple-200 font-mono">{roomId}</p>
              <p className="text-lg text-purple-200 mt-2">Share this code with friends!</p>
            </div>

            {/* Players */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {gameState.players.map((player, index) => (
                <div
                  key={player.id}
                  className="bg-white/20 rounded-2xl p-6 text-center"
                >
                  <div className="text-4xl mb-2">
                    {index === 0 ? '👑' : '👤'}
                  </div>
                  <p className="text-white font-medium truncate">{player.name}</p>
                  {player.id === gameState.host && (
                    <p className="text-purple-200 text-sm">Host</p>
                  )}
                </div>
              ))}
              {[...Array(4 - playerCount)].map((_, index) => (
                <div
                  key={`empty-${index}`}
                  className="bg-white/10 rounded-2xl p-6 text-center border-2 border-dashed border-white/20"
                >
                  <div className="text-4xl mb-2 opacity-30">👤</div>
                  <p className="text-white/30 font-medium">Waiting...</p>
                </div>
              ))}
            </div>

            {/* Host Controls */}
            {isHost && (
              <div className="space-y-6 mb-8">
                <div>
                  <label className="block text-white text-lg mb-3 font-medium">Category</label>
                  <select
                    value={gameState.category}
                    onChange={(e) => updateSettings(e.target.value, gameState.difficulty)}
                    className="w-full p-4 rounded-xl bg-white/20 text-white border border-white/30 focus:outline-none focus:border-white/50 text-lg"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat} className="bg-purple-900">
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-white text-lg mb-3 font-medium">Difficulty</label>
                  <div className="grid grid-cols-3 gap-4">
                    {DIFFICULTIES.map((diff) => (
                      <button
                        key={diff}
                        onClick={() => updateSettings(gameState.category, diff)}
                        className={`p-4 rounded-xl font-medium text-lg transition-all ${
                          gameState.difficulty === diff
                            ? 'bg-white text-purple-700'
                            : 'bg-white/20 text-white hover:bg-white/30'
                        }`}
                      >
                        {diff}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={startGame}
                  disabled={playerCount < 2}
                  className="w-full px-8 py-4 bg-white text-purple-700 rounded-xl hover:bg-purple-50 transition-all text-xl font-bold disabled:opacity-50"
                >
                  {playerCount < 2 ? 'Waiting for Players...' : 'Start Game!'}
                </button>
              </div>
            )}

            {!isHost && (
              <div className="text-center text-purple-200 text-xl">
                Waiting for host to start the game...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Results Screen
  if (showResults) {
    const sortedPlayers = [...gameState.players].sort((a, b) => b.score - a.score);
    
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-3xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-12 border border-white/20">
          <h1 className="text-6xl font-bold text-white mb-12 text-center">Final Scores</h1>
          
          <div className="space-y-4 mb-12">
            {sortedPlayers.map((player, index) => (
              <div
                key={player.id}
                className={`flex items-center justify-between p-6 rounded-2xl ${
                  index === 0 ? 'bg-yellow-500/30' : 'bg-white/20'
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className="text-4xl">
                    {index === 0 ? '🏆' : index === 1 ? '🥈' : index === 2 ? '🥉' : '👤'}
                  </span>
                  <span className="text-2xl font-bold text-white">{player.name}</span>
                </div>
                <span className="text-3xl font-bold text-white">{player.score}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => router.push('/')}
            className="w-full px-8 py-4 bg-white text-purple-700 rounded-xl hover:bg-purple-50 transition-all text-xl font-bold"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  // Game Screen
  if (gameState.questions && gameState.questions.length > 0 && gameState.currentQuestion < gameState.questions.length) {
    const question = gameState.questions[gameState.currentQuestion];
    const playerPositions = ['top-4 left-4', 'top-4 right-4', 'bottom-4 left-4', 'bottom-4 right-4'];
    
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative">
        {/* Players in corners */}
        {gameState.players.map((player, index) => {
          const answer = gameState.answers[player.id];
          const isCorrect = gameState.showAnswer && answer === question.correctAnswer;
          const isWrong = gameState.showAnswer && answer !== null && answer !== question.correctAnswer;
          
          return (
            <div
              key={player.id}
              className={`absolute ${playerPositions[index]} bg-white/10 backdrop-blur-lg rounded-2xl p-4 border border-white/20 min-w-[180px]`}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{index === 0 ? '👑' : '👤'}</span>
                <div>
                  <p className="text-white font-bold truncate">{player.name}</p>
                  <p className="text-purple-200 text-sm">Score: {player.score}</p>
                </div>
              </div>
              {gameState.showAnswer && (
                <div className="mt-2">
                  <div className={`text-center text-2xl ${isCorrect ? 'text-green-300' : isWrong ? 'text-red-300' : 'text-white/50'}`}>
                    {isCorrect ? '✓' : isWrong ? '✗' : '—'}
                  </div>
                  {answer !== null && (
                    <p className={`text-xs mt-1 text-center ${isCorrect ? 'text-green-200' : isWrong ? 'text-red-200' : 'text-white/50'}`}>
                      {question.options[answer]}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Center content */}
        <div className="max-w-4xl w-full">
          {/* Timer & Progress */}
          <div className="flex justify-between items-center mb-8 text-white">
            <div className="flex items-center gap-4">
              <div className="text-2xl font-bold">
                Question {gameState.currentQuestion + 1} / 10
              </div>
              {isHost && (
                <button
                  onClick={returnToLobby}
                  className="px-4 py-2 bg-red-500/80 hover:bg-red-500 rounded-lg text-sm font-medium transition-all"
                >
                  Return to Lobby
                </button>
              )}
            </div>
            <div className={`text-5xl font-bold ${gameState.timeLeft <= 3 ? 'text-red-300 animate-pulse' : ''}`}>
              {gameState.timeLeft}s
            </div>
          </div>

          {/* Question */}
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-12 mb-8 border border-white/20">
            <h2 className="text-3xl font-bold text-white text-center leading-relaxed">
              {question.question}
            </h2>
          </div>

          {/* Options */}
          <div className="grid grid-cols-2 gap-6">
            {question.options.map((option, index) => (
              <button
                key={index}
                onClick={() => submitAnswer(index)}
                disabled={gameState.showAnswer}
                className={`p-8 rounded-2xl text-xl font-medium transition-all ${
                  gameState.showAnswer
                    ? index === question.correctAnswer
                      ? 'bg-green-500 text-white'
                      : selectedAnswer === index
                      ? 'bg-red-500 text-white'
                      : 'bg-white/20 text-white/50'
                    : selectedAnswer === index
                    ? 'bg-white text-purple-700'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
