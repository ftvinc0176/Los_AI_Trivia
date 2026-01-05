'use client';

import { useState, useEffect, Suspense, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

interface Horse {
  id: number;
  name: string;
  color: string;
  odds: number;
  position: number; // 0-100 percentage
  jockey: string;
}

interface Player {
  id: string;
  name: string;
  balance: number;
  bet: { horseId: number; amount: number } | null;
  winnings: number;
}

const HORSE_NAMES = [
  'Thunder Bolt', 'Silver Arrow', 'Golden Star', 'Dark Knight',
  'Fire Storm', 'Ocean Wave', 'Mountain King', 'Desert Wind'
];

const HORSE_COLORS = [
  'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
  'bg-purple-500', 'bg-pink-500', 'bg-orange-500', 'bg-cyan-500'
];

const JOCKEY_NAMES = [
  'J. Smith', 'M. Johnson', 'R. Williams', 'T. Brown',
  'K. Davis', 'L. Miller', 'P. Wilson', 'A. Garcia'
];

function HorseRacingGame() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') || 'single';

  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<'lobby' | 'betting' | 'racing' | 'results'>('lobby');
  const [playerName, setPlayerName] = useState('');
  const [lobbyCode, setLobbyCode] = useState('');
  const [roomId, setRoomId] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayerId, setMyPlayerId] = useState('');
  const [balance, setBalance] = useState(25000);
  const [horses, setHorses] = useState<Horse[]>([]);
  const [selectedHorse, setSelectedHorse] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState('');
  const [publicLobbies, setPublicLobbies] = useState<Array<{ roomId: string; playerCount: number; maxPlayers: number }>>([]);
  const [winner, setWinner] = useState<Horse | null>(null);
  const [myBet, setMyBet] = useState<{ horseId: number; amount: number } | null>(null);
  const [winnings, setWinnings] = useState(0);
  const [raceInProgress, setRaceInProgress] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const raceIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const generateHorses = (): Horse[] => {
    return Array.from({ length: 8 }, (_, i) => ({
      id: i,
      name: HORSE_NAMES[i],
      color: HORSE_COLORS[i],
      odds: Math.round((Math.random() * 8 + 2) * 10) / 10, // 2.0 to 10.0 odds
      position: 0,
      jockey: JOCKEY_NAMES[i]
    })).sort((a, b) => a.odds - b.odds); // Sort by odds (favorites first)
  };

  useEffect(() => {
    if (mode !== 'single') {
      const socketUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
      const newSocket = io(socketUrl);
      setSocket(newSocket);

      newSocket.on('horseRacingLobbyCreated', ({ roomId, players, horses }: { roomId: string; players: Player[]; horses: Horse[] }) => {
        setRoomId(roomId);
        setPlayers(players);
        setHorses(horses);
        setGameState('lobby');
      });

      newSocket.on('horseRacingPlayerJoined', ({ players }: { players: Player[] }) => {
        setPlayers(players);
      });

      newSocket.on('horseRacingGameState', (data: any) => {
        setPlayers(data.players);
        setGameState(data.state);
        if (data.horses) setHorses(data.horses);
        
        const me = data.players.find((p: Player) => p.id === newSocket.id);
        if (me) {
          setBalance(me.balance);
          setMyBet(me.bet);
        }
      });

      newSocket.on('horseRacingPublicLobbies', ({ lobbies }: { lobbies: Array<{ roomId: string; playerCount: number; maxPlayers: number }> }) => {
        setPublicLobbies(lobbies);
      });

      newSocket.on('horseRacingBettingStarted', ({ horses, countdown }: { horses: Horse[]; countdown: number }) => {
        setHorses(horses);
        setCountdown(countdown);
        setGameState('betting');
        
        // Start countdown
        const countdownInterval = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              clearInterval(countdownInterval);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      });

      newSocket.on('horseRacingBetPlaced', ({ players }: { players: Player[] }) => {
        setPlayers(players);
        const me = players.find((p: Player) => p.id === newSocket.id);
        if (me) {
          setBalance(me.balance);
          setMyBet(me.bet);
        }
      });

      newSocket.on('horseRacingRaceStarted', () => {
        setGameState('racing');
        setRaceInProgress(true);
      });

      newSocket.on('horseRacingPositionUpdate', ({ horses }: { horses: Horse[] }) => {
        setHorses(horses);
      });

      newSocket.on('horseRacingRaceEnded', ({ winner, players }: { winner: Horse; players: Player[] }) => {
        setWinner(winner);
        setPlayers(players);
        setRaceInProgress(false);
        setGameState('results');
        
        const me = players.find((p: Player) => p.id === newSocket.id);
        if (me) {
          setBalance(me.balance);
          setWinnings(me.winnings);
        }
      });

      newSocket.on('horseRacingNewRaceStarted', ({ horses }: { horses: Horse[] }) => {
        setHorses(horses);
        setWinner(null);
        setMyBet(null);
        setWinnings(0);
        setSelectedHorse(null);
        setBetAmount('');
        setGameState('betting');
      });

      newSocket.on('horseRacingKicked', ({ reason }: { reason: string }) => {
        alert(`You have been removed from the lobby: ${reason}`);
        router.push('/casino');
      });

      return () => {
        newSocket.close();
        if (raceIntervalRef.current) {
          clearInterval(raceIntervalRef.current);
        }
      };
    }
  }, [mode, router]);

  const fetchPublicLobbies = useCallback(() => {
    if (socket) {
      socket.emit('getHorseRacingPublicLobbies');
    }
  }, [socket]);

  useEffect(() => {
    if (mode === 'browse' && socket) {
      fetchPublicLobbies();
      const interval = setInterval(fetchPublicLobbies, 3000);
      return () => clearInterval(interval);
    }
  }, [mode, socket, fetchPublicLobbies]);

  const createLobby = () => {
    if (socket && playerName) {
      socket.emit('horseRacingCreateLobby', { playerName, isPublic: true });
      setMyPlayerId(socket.id!);
    }
  };

  const joinLobby = () => {
    if (socket && playerName && lobbyCode) {
      socket.emit('horseRacingJoinLobby', { roomId: lobbyCode, playerName });
      setRoomId(lobbyCode);
      setMyPlayerId(socket.id!);
      setGameState('lobby');
    }
  };

  const joinPublicLobby = (lobbyRoomId: string) => {
    if (socket && playerName) {
      socket.emit('horseRacingJoinLobby', { roomId: lobbyRoomId, playerName });
      setRoomId(lobbyRoomId);
      setMyPlayerId(socket.id!);
      setGameState('lobby');
    }
  };

  const startGame = () => {
    if (socket) {
      socket.emit('horseRacingStartGame', { roomId });
    } else {
      // Single player
      const newHorses = generateHorses();
      setHorses(newHorses);
      setGameState('betting');
      setCountdown(30);
      
      const countdownInterval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            if (myBet) {
              startRace(newHorses);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  };

  const placeBet = () => {
    const amount = parseInt(betAmount);
    if (selectedHorse === null || !amount || amount > balance || amount <= 0) return;
    
    if (socket) {
      socket.emit('horseRacingPlaceBet', { roomId, horseId: selectedHorse, amount });
    } else {
      // Single player
      setBalance(balance - amount);
      setMyBet({ horseId: selectedHorse, amount });
    }
  };

  const startRace = (raceHorses: Horse[]) => {
    setGameState('racing');
    setRaceInProgress(true);
    
    let horsesState = raceHorses.map(h => ({ ...h, position: 0 }));
    
    raceIntervalRef.current = setInterval(() => {
      let raceEnded = false;
      let winningHorse: Horse | null = null;
      
      horsesState = horsesState.map(horse => {
        if (horse.position >= 100) return horse;
        
        // Random speed based on odds (lower odds = slightly faster on average)
        const baseSpeed = 0.5 + Math.random() * 2;
        const oddsBonus = (10 - horse.odds) / 20; // Better odds = small bonus
        const newPosition = Math.min(100, horse.position + baseSpeed + oddsBonus);
        
        if (newPosition >= 100 && !winningHorse) {
          winningHorse = { ...horse, position: 100 };
          raceEnded = true;
        }
        
        return { ...horse, position: newPosition };
      });
      
      setHorses([...horsesState]);
      
      if (raceEnded && winningHorse) {
        clearInterval(raceIntervalRef.current!);
        raceIntervalRef.current = null;
        
        setTimeout(() => {
          setWinner(winningHorse);
          setRaceInProgress(false);
          setGameState('results');
          
          // Calculate winnings
          if (myBet && myBet.horseId === winningHorse!.id) {
            const win = Math.floor(myBet.amount * winningHorse!.odds);
            setWinnings(win);
            setBalance(prev => prev + win + myBet.amount);
          }
        }, 500);
      }
    }, 50);
  };

  const confirmBetAndRace = () => {
    if (!myBet) {
      alert('Please place a bet first!');
      return;
    }
    startRace(horses);
  };

  const nextRace = () => {
    if (socket) {
      socket.emit('horseRacingNextRace', { roomId });
    } else {
      // Single player reset
      const newHorses = generateHorses();
      setHorses(newHorses);
      setWinner(null);
      setMyBet(null);
      setWinnings(0);
      setSelectedHorse(null);
      setBetAmount('');
      setCountdown(30);
      setGameState('betting');
    }
  };

  // Lobby screen for multiplayer
  if ((mode === 'create' || mode === 'join') && gameState === 'lobby' && !roomId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-black/60 backdrop-blur-xl rounded-3xl p-8 border border-white/20">
          <button
            onClick={() => router.push('/casino')}
            className="mb-6 text-white/60 hover:text-white transition-colors"
          >
            ← Back to Casino
          </button>
          
          <h1 className="text-4xl font-bold text-white mb-6 text-center">
            🏇 Horse Racing
          </h1>
          
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Enter your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50"
            />
            
            {mode === 'create' ? (
              <button
                onClick={createLobby}
                disabled={!playerName}
                className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 text-white rounded-xl font-bold text-xl transition-all"
              >
                Create Lobby
              </button>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Enter lobby code"
                  value={lobbyCode}
                  onChange={(e) => setLobbyCode(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 uppercase"
                />
                <button
                  onClick={joinLobby}
                  disabled={!playerName || !lobbyCode}
                  className="w-full py-4 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:opacity-50 text-white rounded-xl font-bold text-xl transition-all"
                >
                  Join Lobby
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Browse public lobbies
  if (mode === 'browse' && gameState === 'lobby') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-black/60 backdrop-blur-xl rounded-3xl p-8 border border-white/20">
          <button
            onClick={() => router.push('/casino')}
            className="mb-6 text-white/60 hover:text-white transition-colors"
          >
            ← Back to Casino
          </button>
          
          <h1 className="text-4xl font-bold text-white mb-6 text-center">
            🏇 Public Horse Racing Lobbies
          </h1>
          
          {!playerName ? (
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Enter your name to join"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50"
              />
            </div>
          ) : publicLobbies.length === 0 ? (
            <div className="text-center text-white/60 py-8">
              <p className="text-xl mb-4">No public races available</p>
              <button
                onClick={() => router.push('/casino/horse-racing?mode=create')}
                className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold transition-all"
              >
                Create One
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {publicLobbies.map((lobby) => (
                <div
                  key={lobby.roomId}
                  className="flex items-center justify-between bg-white/10 rounded-xl p-4 border border-white/10"
                >
                  <div>
                    <div className="text-white font-bold">Race {lobby.roomId}</div>
                    <div className="text-white/60 text-sm">{lobby.playerCount}/{lobby.maxPlayers} bettors</div>
                  </div>
                  <button
                    onClick={() => joinPublicLobby(lobby.roomId)}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-bold transition-all"
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Waiting lobby
  if (roomId && gameState === 'lobby') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-black/60 backdrop-blur-xl rounded-3xl p-8 border border-white/20">
          <h1 className="text-4xl font-bold text-white mb-6 text-center">
            🏇 Horse Racing
          </h1>
          
          <div className="bg-white/10 rounded-xl p-4 mb-6">
            <div className="text-white/60 text-sm mb-1">Race Code</div>
            <div className="text-3xl font-bold text-yellow-400 tracking-widest">{roomId}</div>
          </div>
          
          <div className="mb-6">
            <div className="text-white/60 text-sm mb-2">Bettors ({players.length}/10)</div>
            <div className="space-y-2">
              {players.map((player, i) => (
                <div key={player.id} className="bg-white/10 rounded-lg p-3 flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center text-white font-bold">
                    {player.name[0]}
                  </div>
                  <span className="text-white">{player.name}</span>
                  <span className="text-green-400 text-sm ml-auto">${player.balance.toLocaleString()}</span>
                  {i === 0 && <span className="text-yellow-400 text-xs">HOST</span>}
                </div>
              ))}
            </div>
          </div>
          
          {players.length > 0 && players[0].id === socket?.id && (
            <button
              onClick={startGame}
              className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl font-bold text-xl transition-all"
            >
              Start Race
            </button>
          )}
          
          {players.length > 0 && players[0].id !== socket?.id && (
            <div className="text-center text-white/60">
              Waiting for host to start the race...
            </div>
          )}
        </div>
      </div>
    );
  }

  // Single player start screen
  if (mode === 'single' && gameState === 'lobby') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-black/60 backdrop-blur-xl rounded-3xl p-8 border border-white/20">
          <button
            onClick={() => router.push('/casino')}
            className="mb-6 text-white/60 hover:text-white transition-colors"
          >
            ← Back to Casino
          </button>
          
          <h1 className="text-4xl font-bold text-white mb-4 text-center">🏇 Horse Racing</h1>
          <p className="text-white/70 text-center mb-6">
            Bet on your favorite horse and watch them race!
          </p>
          
          <div className="bg-white/10 rounded-xl p-4 mb-6">
            <h3 className="text-white font-bold mb-2">How to Play:</h3>
            <ul className="text-white/70 text-sm space-y-1">
              <li>• 8 horses compete in each race</li>
              <li>• Each horse has different odds</li>
              <li>• Pick a horse and place your bet</li>
              <li>• Win based on odds if your horse wins!</li>
            </ul>
          </div>
          
          <div className="text-center mb-6">
            <div className="text-white/60 text-sm">Your Balance</div>
            <div className="text-3xl font-bold text-green-400">${balance.toLocaleString()}</div>
          </div>
          
          <button
            onClick={startGame}
            className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl font-bold text-xl transition-all"
          >
            Start Betting
          </button>
        </div>
      </div>
    );
  }

  // Main game screen
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-900 via-orange-900 to-red-900 p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <button
          onClick={() => router.push('/casino')}
          className="text-white/60 hover:text-white transition-colors"
        >
          ← Exit
        </button>
        <div className="text-2xl font-bold text-white">🏇 Horse Racing</div>
        <div className="text-xl font-bold text-green-400">${balance.toLocaleString()}</div>
      </div>

      <div className="max-w-6xl mx-auto">
        {/* Countdown */}
        {gameState === 'betting' && countdown > 0 && (
          <div className="text-center mb-4">
            <div className="inline-block bg-black/40 rounded-full px-6 py-2">
              <span className="text-white/60 text-sm">Race starts in: </span>
              <span className={`font-bold text-xl ${countdown <= 10 ? 'text-red-400' : 'text-yellow-400'}`}>
                {countdown}s
              </span>
            </div>
          </div>
        )}

        {/* Race Track */}
        <div className="bg-green-800/50 rounded-2xl p-4 mb-6 border-2 border-green-600/50">
          <div className="text-white/60 text-sm mb-2">🏁 RACE TRACK</div>
          
          <div className="space-y-2">
            {horses.map((horse) => (
              <div key={horse.id} className="flex items-center gap-2">
                {/* Horse number and name */}
                <div className="w-32 flex items-center gap-2">
                  <div className={`w-8 h-8 ${horse.color} rounded-full flex items-center justify-center text-white font-bold text-sm`}>
                    {horse.id + 1}
                  </div>
                  <span className="text-white text-sm truncate">{horse.name}</span>
                </div>
                
                {/* Track */}
                <div className="flex-1 relative h-10 bg-amber-900/50 rounded-lg overflow-hidden border border-amber-700/50">
                  {/* Track lines */}
                  <div className="absolute inset-0 flex">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} className="flex-1 border-r border-amber-700/30" />
                    ))}
                  </div>
                  
                  {/* Horse */}
                  <div 
                    className="absolute top-1 transition-all duration-100 ease-linear"
                    style={{ left: `${Math.min(horse.position, 95)}%` }}
                  >
                    <span className="text-2xl">🏇</span>
                  </div>
                  
                  {/* Finish line */}
                  <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/50" />
                </div>
                
                {/* Odds */}
                <div className="w-16 text-right">
                  <span className="text-yellow-400 font-bold">{horse.odds}x</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Winner Display */}
        {winner && (
          <div className="text-center mb-6 bg-yellow-500/20 rounded-2xl p-6 border-2 border-yellow-400">
            <div className="text-4xl mb-2">🏆</div>
            <div className="text-2xl font-bold text-yellow-400 mb-2">
              {winner.name} WINS!
            </div>
            <div className="text-white/70">
              Odds: {winner.odds}x • Jockey: {winner.jockey}
            </div>
            {myBet && (
              <div className={`mt-4 text-xl font-bold ${myBet.horseId === winner.id ? 'text-green-400' : 'text-red-400'}`}>
                {myBet.horseId === winner.id 
                  ? `🎉 You won $${winnings.toLocaleString()}!` 
                  : `You lost $${myBet.amount.toLocaleString()}`
                }
              </div>
            )}
          </div>
        )}

        {/* Betting Panel */}
        {gameState === 'betting' && (
          <div className="bg-black/40 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
            <h3 className="text-xl font-bold text-white mb-4 text-center">Place Your Bet</h3>
            
            {/* Horse Selection */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {horses.map((horse) => (
                <button
                  key={horse.id}
                  onClick={() => setSelectedHorse(horse.id)}
                  className={`p-3 rounded-xl border-2 transition-all ${
                    selectedHorse === horse.id 
                      ? 'border-yellow-400 bg-yellow-400/20' 
                      : 'border-white/20 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <div className={`w-10 h-10 ${horse.color} rounded-full flex items-center justify-center text-white font-bold mx-auto mb-2`}>
                    {horse.id + 1}
                  </div>
                  <div className="text-white text-sm font-bold truncate">{horse.name}</div>
                  <div className="text-yellow-400 text-sm">{horse.odds}x</div>
                  <div className="text-white/50 text-xs">{horse.jockey}</div>
                </button>
              ))}
            </div>

            {/* Bet Amount */}
            <div className="flex flex-col md:flex-row items-center gap-4 mb-6">
              <div className="flex-1 flex items-center gap-2 w-full">
                <span className="text-white/60">Bet Amount:</span>
                <input
                  type="number"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white text-center"
                />
              </div>
              
              {/* Quick bet buttons */}
              <div className="flex gap-2">
                {[100, 500, 1000, 5000].map(amount => (
                  <button
                    key={amount}
                    onClick={() => setBetAmount(String(amount))}
                    className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-all"
                  >
                    ${amount >= 1000 ? `${amount/1000}K` : amount}
                  </button>
                ))}
                <button
                  onClick={() => setBetAmount(String(balance))}
                  className="px-3 py-2 bg-purple-500/50 hover:bg-purple-500 text-white rounded-lg text-sm transition-all"
                >
                  All In
                </button>
              </div>
            </div>

            {/* Current Bet Display */}
            {myBet && (
              <div className="text-center mb-4 bg-green-500/20 rounded-xl p-3 border border-green-500/50">
                <span className="text-green-400">
                  ✓ Bet placed: ${myBet.amount.toLocaleString()} on {horses.find(h => h.id === myBet.horseId)?.name}
                </span>
              </div>
            )}

            {/* Potential Winnings */}
            {selectedHorse !== null && betAmount && (
              <div className="text-center mb-4 text-white/70">
                Potential win: <span className="text-yellow-400 font-bold">
                  ${(parseInt(betAmount) * horses[selectedHorse].odds).toLocaleString()}
                </span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4">
              {!myBet ? (
                <button
                  onClick={placeBet}
                  disabled={selectedHorse === null || !betAmount || parseInt(betAmount) > balance || parseInt(betAmount) <= 0}
                  className="flex-1 py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 text-white rounded-xl font-bold text-xl transition-all"
                >
                  Place Bet
                </button>
              ) : mode === 'single' ? (
                <button
                  onClick={confirmBetAndRace}
                  className="flex-1 py-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl font-bold text-xl transition-all"
                >
                  🏁 Start Race!
                </button>
              ) : (
                <div className="flex-1 text-center text-white/60 py-4">
                  Waiting for race to start...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Racing Message */}
        {gameState === 'racing' && (
          <div className="text-center text-2xl font-bold text-yellow-400 animate-pulse">
            🏇 Race in progress... 🏇
          </div>
        )}

        {/* Results - Next Race Button */}
        {gameState === 'results' && (
          <div className="flex justify-center">
            <button
              onClick={nextRace}
              className="px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl font-bold text-xl transition-all"
            >
              Next Race
            </button>
          </div>
        )}

        {/* Players list for multiplayer */}
        {mode !== 'single' && players.length > 0 && (
          <div className="mt-6 bg-black/30 rounded-xl p-4">
            <h4 className="text-white/60 text-sm mb-2">Bettors</h4>
            <div className="flex flex-wrap gap-2">
              {players.map(player => (
                <div 
                  key={player.id}
                  className={`px-3 py-1 rounded-full text-sm ${
                    player.id === socket?.id ? 'bg-yellow-500/30 text-yellow-400' : 'bg-white/10 text-white/70'
                  }`}
                >
                  {player.name}: ${player.balance.toLocaleString()}
                  {player.bet && (
                    <span className="ml-1 text-green-400">
                      (#{player.bet.horseId + 1})
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function HorseRacingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white text-2xl">Loading...</div>
      </div>
    }>
      <HorseRacingGame />
    </Suspense>
  );
}
