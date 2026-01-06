'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { useCasino } from '../CasinoContext';

interface Card {
  suit: string;
  value: string;
  numValue: number;
}

interface Player {
  id: string;
  name: string;
  balance: number;
  currentBet: number;
  betSide: 'andar' | 'bahar' | null;
  result: 'win' | 'lose' | null;
}

interface GameRoom {
  players: Player[];
  jokerCard: Card | null;
  andarCards: Card[];
  baharCards: Card[];
  winningSide: 'andar' | 'bahar' | null;
  state: 'lobby' | 'betting' | 'dealing' | 'results';
}

function AndarBaharGame() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') || 'single';
  const { playerName: casinoName, balance: casinoBalance, setBalance: setCasinoBalance } = useCasino();

  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<'lobby' | 'betting' | 'dealing' | 'results'>('lobby');
  const [playerName, setPlayerName] = useState(casinoName || '');
  const [lobbyCode, setLobbyCode] = useState('');
  const [roomId, setRoomId] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayerId, setMyPlayerId] = useState('');
  const [balance, setBalance] = useState(casinoBalance);
  const [currentBet, setCurrentBet] = useState(0);
  const [betInput, setBetInput] = useState('');
  const [betSide, setBetSide] = useState<'andar' | 'bahar' | null>(null);
  const [jokerCard, setJokerCard] = useState<Card | null>(null);
  const [andarCards, setAndarCards] = useState<Card[]>([]);
  const [baharCards, setBaharCards] = useState<Card[]>([]);
  const [winningSide, setWinningSide] = useState<'andar' | 'bahar' | null>(null);
  const [resultMessage, setResultMessage] = useState('');
  const [selectedChip, setSelectedChip] = useState(100);
  const [publicLobbies, setPublicLobbies] = useState<Array<{ roomId: string; playerCount: number; maxPlayers: number }>>([]);
  const [isDealing, setIsDealing] = useState(false);
  const [lastBet, setLastBet] = useState<{ amount: number; side: 'andar' | 'bahar' } | null>(null);

  // Single player deck
  const [deck, setDeck] = useState<Card[]>([]);

  // Sync casino balance on mount for single player
  useEffect(() => {
    if (mode === 'single') {
      setBalance(casinoBalance);
      if (casinoName) setPlayerName(casinoName);
    }
  }, [mode, casinoBalance, casinoName]);

  // Update casino context when balance changes in single player
  useEffect(() => {
    if (mode === 'single') {
      setCasinoBalance(balance);
    }
  }, [balance, mode, setCasinoBalance]);

  const suits = ['♠', '♥', '♦', '♣'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  const createDeck = (): Card[] => {
    const newDeck: Card[] = [];
    for (const suit of suits) {
      for (let i = 0; i < values.length; i++) {
        newDeck.push({
          suit,
          value: values[i],
          numValue: i + 1
        });
      }
    }
    return newDeck;
  };

  const shuffleDeck = (deck: Card[]): Card[] => {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const getCardColor = (suit: string) => {
    return suit === '♥' || suit === '♦' ? 'text-red-600' : 'text-black';
  };

  useEffect(() => {
    if (mode !== 'single') {
      const socketUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
      const newSocket = io(socketUrl);
      setSocket(newSocket);

      newSocket.on('andarBaharLobbyCreated', ({ roomId, players }: { roomId: string; players: Player[] }) => {
        setRoomId(roomId);
        setPlayers(players);
        setGameState('lobby');
      });

      newSocket.on('andarBaharPlayerJoined', ({ players }: { players: Player[] }) => {
        setPlayers(players);
      });

      newSocket.on('andarBaharGameState', ({ state, players, jokerCard, andarCards, baharCards }: any) => {
        setPlayers(players);
        setGameState(state);
        if (jokerCard) setJokerCard(jokerCard);
        if (andarCards) setAndarCards(andarCards);
        if (baharCards) setBaharCards(baharCards);
      });

      newSocket.on('andarBaharPlayersUpdate', ({ players }: { players: Player[] }) => {
        setPlayers(players);
      });

      newSocket.on('andarBaharPublicLobbies', ({ lobbies }: { lobbies: Array<{ roomId: string; playerCount: number; maxPlayers: number }> }) => {
        setPublicLobbies(lobbies);
      });

      newSocket.on('andarBaharGameStarted', () => {
        setGameState('betting');
      });

      newSocket.on('andarBaharJokerRevealed', ({ jokerCard }: { jokerCard: Card }) => {
        setJokerCard(jokerCard);
        setGameState('dealing');
      });

      newSocket.on('andarBaharCardDealt', ({ side, card }: { side: 'andar' | 'bahar'; card: Card }) => {
        if (side === 'andar') {
          setAndarCards(prev => [...prev, card]);
        } else {
          setBaharCards(prev => [...prev, card]);
        }
      });

      newSocket.on('andarBaharRoundEnd', ({ winningSide, players }: { winningSide: 'andar' | 'bahar'; players: Player[] }) => {
        setWinningSide(winningSide);
        setPlayers(players);
        setGameState('results');
        
        const me = players.find((p: Player) => p.id === newSocket.id);
        if (me) {
          setBalance(me.balance);
          if (me.result === 'win') {
            setResultMessage(`🎉 ${winningSide.toUpperCase()} wins! You won $${me.currentBet}!`);
          } else if (me.result === 'lose') {
            setResultMessage(`${winningSide.toUpperCase()} wins. You lost $${me.currentBet}.`);
          }
        }
      });

      newSocket.on('andarBaharNewRoundStarted', () => {
        setJokerCard(null);
        setAndarCards([]);
        setBaharCards([]);
        setWinningSide(null);
        setResultMessage('');
        setCurrentBet(0);
        setBetSide(null);
        setBetInput('');
        setGameState('betting');
      });

      newSocket.on('andarBaharKicked', ({ reason }: { reason: string }) => {
        alert(`You have been removed from the lobby: ${reason}`);
        router.push('/casino');
      });

      return () => {
        newSocket.close();
      };
    }
  }, [mode, router]);

  const fetchPublicLobbies = useCallback(() => {
    if (socket) {
      socket.emit('getAndarBaharPublicLobbies');
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
      socket.emit('andarBaharCreateLobby', { playerName, isPublic: true });
      setMyPlayerId(socket.id!);
    }
  };

  const joinLobby = () => {
    if (socket && playerName && lobbyCode) {
      socket.emit('andarBaharJoinLobby', { roomId: lobbyCode, playerName });
      setRoomId(lobbyCode);
      setMyPlayerId(socket.id!);
      setGameState('lobby');
    }
  };

  const joinPublicLobby = (lobbyRoomId: string) => {
    if (socket && playerName) {
      socket.emit('andarBaharJoinLobby', { roomId: lobbyRoomId, playerName });
      setRoomId(lobbyRoomId);
      setMyPlayerId(socket.id!);
      setGameState('lobby');
    }
  };

  const startGame = () => {
    if (socket) {
      socket.emit('andarBaharStartGame', { roomId });
    } else {
      // Single player mode
      setGameState('betting');
    }
  };

  const nextRound = () => {
    if (socket) {
      socket.emit('andarBaharNextRound', { roomId });
    } else {
      // Single player reset
      setJokerCard(null);
      setAndarCards([]);
      setBaharCards([]);
      setWinningSide(null);
      setResultMessage('');
      setCurrentBet(0);
      setBetSide(null);
      setBetInput('');
      setGameState('betting');
    }
  };

  const placeBet = (side: 'andar' | 'bahar') => {
    const bet = parseInt(betInput);
    if (bet > 0 && bet <= balance) {
      setLastBet({ amount: bet, side });
      setCurrentBet(bet);
      setBetSide(side);
      setBalance(balance - bet);
      
      if (socket) {
        socket.emit('andarBaharPlaceBet', { roomId, bet, side });
      } else {
        // Single player - start dealing
        startDealing(bet, side);
      }
    }
  };

  const rebetLastBet = () => {
    if (!lastBet || lastBet.amount > balance) return;
    setBetInput(String(lastBet.amount));
  };

  const allIn = () => {
    if (balance <= 0) return;
    setBetInput(String(balance));
  };

  const addChipToBet = () => {
    const currentAmount = parseInt(betInput || '0');
    if (currentAmount + selectedChip <= balance) {
      setBetInput(String(currentAmount + selectedChip));
    }
  };

  const clearBets = () => {
    setBetInput('0');
    setBetSide(null);
  };

  const startDealing = async (bet: number, side: 'andar' | 'bahar') => {
    setIsDealing(true);
    setGameState('dealing');
    
    // Create and shuffle deck
    let gameDeck = shuffleDeck(createDeck());
    
    // Deal joker card
    const joker = gameDeck.pop()!;
    setJokerCard(joker);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Deal cards alternating between Andar and Bahar
    let currentSide: 'andar' | 'bahar' = 'andar';
    const andar: Card[] = [];
    const bahar: Card[] = [];
    let winner: 'andar' | 'bahar' | null = null;
    
    while (!winner && gameDeck.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const card = gameDeck.pop()!;
      
      if (currentSide === 'andar') {
        andar.push(card);
        setAndarCards([...andar]);
      } else {
        bahar.push(card);
        setBaharCards([...bahar]);
      }
      
      // Check if card matches joker value
      if (card.value === joker.value) {
        winner = currentSide;
        break;
      }
      
      // Alternate sides
      currentSide = currentSide === 'andar' ? 'bahar' : 'andar';
    }
    
    setIsDealing(false);
    setWinningSide(winner);
    setGameState('results');
    
    // Calculate result
    if (winner === side) {
      // Win - Andar pays 0.9:1, Bahar pays 1:1
      const payout = side === 'andar' ? Math.floor(bet * 1.9) : bet * 2;
      setBalance(prev => prev + payout);
      setResultMessage(`🎉 ${winner.toUpperCase()} wins! You won $${payout - bet}!`);
    } else {
      setResultMessage(`${winner?.toUpperCase()} wins. You lost $${bet}.`);
    }
  };

  // Render card component
  const renderCard = (card: Card, index: number, isWinningCard: boolean = false) => (
    <div 
      key={index}
      className={`
        w-12 h-16 md:w-14 md:h-20 bg-white rounded-lg shadow-lg flex flex-col items-center justify-center
        transform transition-all duration-300
        ${isWinningCard ? 'ring-4 ring-yellow-400 scale-110' : ''}
      `}
      style={{ 
        marginLeft: index > 0 ? '-20px' : '0',
        animation: 'slideIn 0.3s ease-out'
      }}
    >
      <span className={`text-xs md:text-sm font-bold ${getCardColor(card.suit)}`}>{card.value}</span>
      <span className={`text-lg md:text-xl ${getCardColor(card.suit)}`}>{card.suit}</span>
    </div>
  );

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
            🎴 Andar Bahar
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
                className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 disabled:opacity-50 text-white rounded-xl font-bold text-xl transition-all"
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
            🎴 Public Andar Bahar Lobbies
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
              <p className="text-xl mb-4">No public lobbies available</p>
              <button
                onClick={() => router.push('/casino/andar-bahar?mode=create')}
                className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold transition-all"
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
                    <div className="text-white font-bold">Lobby {lobby.roomId}</div>
                    <div className="text-white/60 text-sm">{lobby.playerCount}/{lobby.maxPlayers} players</div>
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
            🎴 Andar Bahar Lobby
          </h1>
          
          <div className="bg-white/10 rounded-xl p-4 mb-6">
            <div className="text-white/60 text-sm mb-1">Lobby Code</div>
            <div className="text-3xl font-bold text-yellow-400 tracking-widest">{roomId}</div>
          </div>
          
          <div className="mb-6">
            <div className="text-white/60 text-sm mb-2">Players ({players.length}/6)</div>
            <div className="space-y-2">
              {players.map((player, i) => (
                <div key={player.id} className="bg-white/10 rounded-lg p-3 flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center text-white font-bold">
                    {player.name[0]}
                  </div>
                  <span className="text-white">{player.name}</span>
                  {i === 0 && <span className="text-yellow-400 text-xs ml-auto">HOST</span>}
                </div>
              ))}
            </div>
          </div>
          
          {players.length > 0 && players[0].id === socket?.id && (
            <button
              onClick={startGame}
              className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl font-bold text-xl transition-all"
            >
              Start Game
            </button>
          )}
          
          {players.length > 0 && players[0].id !== socket?.id && (
            <div className="text-center text-white/60">
              Waiting for host to start...
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
          
          <h1 className="text-4xl font-bold text-white mb-4 text-center">🎴 Andar Bahar</h1>
          <p className="text-white/70 text-center mb-6">
            Guess which side will get the matching card!
          </p>
          
          <div className="bg-white/10 rounded-xl p-4 mb-6">
            <h3 className="text-white font-bold mb-2">How to Play:</h3>
            <ul className="text-white/70 text-sm space-y-1">
              <li>• A Joker card is dealt face up in the middle</li>
              <li>• Bet on ANDAR (left) or BAHAR (right)</li>
              <li>• Cards are dealt alternately to each side</li>
              <li>• First side to get a matching value wins!</li>
              <li>• Andar pays 0.9:1, Bahar pays 1:1</li>
            </ul>
          </div>
          
          <div className="text-center mb-6">
            <div className="text-white/60 text-sm">Starting Balance</div>
            <div className="text-3xl font-bold text-green-400">${balance.toLocaleString()}</div>
          </div>
          
          <button
            onClick={startGame}
            className="w-full py-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl font-bold text-xl transition-all"
          >
            Start Playing
          </button>
        </div>
      </div>
    );
  }

  // Main game screen
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-900 via-red-900 to-purple-900 p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <button
          onClick={() => router.push('/casino')}
          className="text-white/60 hover:text-white transition-colors"
        >
          ← Exit
        </button>
        <div className="text-2xl font-bold text-white">🎴 Andar Bahar</div>
        <div className="text-xl font-bold text-green-400">${balance.toLocaleString()}</div>
      </div>

      {/* Game Table */}
      <div className="max-w-4xl mx-auto">
        {/* Joker Card */}
        <div className="flex justify-center mb-8">
          <div className="text-center">
            <div className="text-white/60 text-sm mb-2">JOKER CARD</div>
            {jokerCard ? (
              <div className="w-20 h-28 bg-white rounded-xl shadow-2xl flex flex-col items-center justify-center transform hover:scale-105 transition-all ring-4 ring-yellow-400">
                <span className={`text-2xl font-bold ${getCardColor(jokerCard.suit)}`}>{jokerCard.value}</span>
                <span className={`text-3xl ${getCardColor(jokerCard.suit)}`}>{jokerCard.suit}</span>
              </div>
            ) : (
              <div className="w-20 h-28 bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl shadow-2xl flex items-center justify-center">
                <span className="text-4xl">🎴</span>
              </div>
            )}
          </div>
        </div>

        {/* Andar and Bahar sides */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          {/* Andar Side */}
          <div className={`bg-black/30 rounded-2xl p-4 border-2 transition-all ${
            winningSide === 'andar' ? 'border-yellow-400 bg-yellow-400/20' : 
            betSide === 'andar' ? 'border-orange-400' : 'border-white/20'
          }`}>
            <div className="text-center mb-4">
              <h3 className={`text-2xl font-bold ${winningSide === 'andar' ? 'text-yellow-400' : 'text-orange-400'}`}>
                ANDAR
              </h3>
              <div className="text-white/60 text-sm">Pays 0.9:1</div>
              {betSide === 'andar' && currentBet > 0 && (
                <div className="text-green-400 font-bold mt-1">Your bet: ${currentBet}</div>
              )}
            </div>
            <div className="min-h-24 flex items-center justify-center flex-wrap gap-1 p-2">
              {andarCards.map((card, i) => renderCard(card, i, 
                winningSide === 'andar' && i === andarCards.length - 1 && card.value === jokerCard?.value
              ))}
              {andarCards.length === 0 && !isDealing && (
                <div className="text-white/30 text-sm">Cards will appear here</div>
              )}
            </div>
          </div>

          {/* Bahar Side */}
          <div className={`bg-black/30 rounded-2xl p-4 border-2 transition-all ${
            winningSide === 'bahar' ? 'border-yellow-400 bg-yellow-400/20' : 
            betSide === 'bahar' ? 'border-blue-400' : 'border-white/20'
          }`}>
            <div className="text-center mb-4">
              <h3 className={`text-2xl font-bold ${winningSide === 'bahar' ? 'text-yellow-400' : 'text-blue-400'}`}>
                BAHAR
              </h3>
              <div className="text-white/60 text-sm">Pays 1:1</div>
              {betSide === 'bahar' && currentBet > 0 && (
                <div className="text-green-400 font-bold mt-1">Your bet: ${currentBet}</div>
              )}
            </div>
            <div className="min-h-24 flex items-center justify-center flex-wrap gap-1 p-2">
              {baharCards.map((card, i) => renderCard(card, i,
                winningSide === 'bahar' && i === baharCards.length - 1 && card.value === jokerCard?.value
              ))}
              {baharCards.length === 0 && !isDealing && (
                <div className="text-white/30 text-sm">Cards will appear here</div>
              )}
            </div>
          </div>
        </div>

        {/* Result Message */}
        {resultMessage && (
          <div className={`text-center text-2xl font-bold mb-6 ${
            resultMessage.includes('won') ? 'text-green-400' : 'text-red-400'
          }`}>
            {resultMessage}
          </div>
        )}

        {/* Betting Controls */}
        {gameState === 'betting' && (
          <div className="bg-black/40 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
            <h3 className="text-xl font-bold text-white text-center mb-4">Place Your Bet</h3>
            
            {/* Chip Selection */}
            <div className="flex justify-center gap-2 mb-4">
              {[25, 100, 500, 1000, 5000].map(chip => (
                <button
                  key={chip}
                  onClick={() => setSelectedChip(chip)}
                  className={`w-12 h-12 rounded-full font-bold text-xs transition-all ${
                    selectedChip === chip 
                      ? 'bg-yellow-400 text-black scale-110' 
                      : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
                >
                  ${chip >= 1000 ? `${chip/1000}K` : chip}
                </button>
              ))}
            </div>

            {/* Bet Amount */}
            <div className="flex items-center gap-2 mb-4">
              <input
                type="number"
                value={betInput}
                onChange={(e) => setBetInput(e.target.value)}
                placeholder="Bet amount"
                className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white text-center text-xl"
              />
              <button
                onClick={addChipToBet}
                className="px-4 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold"
              >
                +${selectedChip}
              </button>
            </div>

            {/* Quick Bet Buttons */}
            <div className="flex justify-center gap-2 mb-6">
              <button onClick={clearBets} className="px-4 py-2 bg-red-500/50 hover:bg-red-500 text-white rounded-lg text-sm">
                Clear
              </button>
              {lastBet && (
                <button onClick={rebetLastBet} className="px-4 py-2 bg-blue-500/50 hover:bg-blue-500 text-white rounded-lg text-sm">
                  Rebet ${lastBet.amount}
                </button>
              )}
              <button onClick={allIn} className="px-4 py-2 bg-purple-500/50 hover:bg-purple-500 text-white rounded-lg text-sm">
                All In
              </button>
            </div>

            {/* Bet Placement Buttons */}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => placeBet('andar')}
                disabled={!betInput || parseInt(betInput) <= 0 || parseInt(betInput) > balance}
                className="py-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 text-white rounded-xl font-bold text-xl transition-all"
              >
                Bet ANDAR
              </button>
              <button
                onClick={() => placeBet('bahar')}
                disabled={!betInput || parseInt(betInput) <= 0 || parseInt(betInput) > balance}
                className="py-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 text-white rounded-xl font-bold text-xl transition-all"
              >
                Bet BAHAR
              </button>
            </div>
          </div>
        )}

        {/* Dealing indicator */}
        {gameState === 'dealing' && isDealing && (
          <div className="text-center text-white text-xl animate-pulse">
            Dealing cards...
          </div>
        )}

        {/* Results - Next Round Button */}
        {gameState === 'results' && (
          <div className="flex justify-center">
            <button
              onClick={nextRound}
              className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl font-bold text-xl transition-all"
            >
              Next Round
            </button>
          </div>
        )}

        {/* Players list for multiplayer */}
        {mode !== 'single' && players.length > 0 && (
          <div className="mt-6 bg-black/30 rounded-xl p-4">
            <h4 className="text-white/60 text-sm mb-2">Players</h4>
            <div className="flex flex-wrap gap-2">
              {players.map(player => (
                <div 
                  key={player.id}
                  className={`px-3 py-1 rounded-full text-sm ${
                    player.id === socket?.id ? 'bg-yellow-500/30 text-yellow-400' : 'bg-white/10 text-white/70'
                  }`}
                >
                  {player.name}: ${player.balance.toLocaleString()}
                  {player.betSide && ` (${player.betSide})`}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

export default function AndarBaharPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white text-2xl">Loading...</div>
      </div>
    }>
      <AndarBaharGame />
    </Suspense>
  );
}
