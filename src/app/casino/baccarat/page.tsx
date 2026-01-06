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
  bet: { type: 'player' | 'banker' | 'tie'; amount: number } | null;
  winnings: number;
}

const SUITS = ['♠', '♥', '♦', '♣'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function BaccaratGame() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') || 'single';
  const { playerName: casinoName, balance: casinoBalance, setBalance: setCasinoBalance, recordBet } = useCasino();

  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<'lobby' | 'betting' | 'dealing' | 'results'>('lobby');
  const [playerName, setPlayerName] = useState(casinoName || '');
  const [lobbyCode, setLobbyCode] = useState('');
  const [roomId, setRoomId] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayerId, setMyPlayerId] = useState('');
  const [balance, setBalance] = useState(casinoBalance);
  const [betAmount, setBetAmount] = useState('');
  const [selectedBet, setSelectedBet] = useState<'player' | 'banker' | 'tie' | null>(null);
  const [myBet, setMyBet] = useState<{ type: 'player' | 'banker' | 'tie'; amount: number } | null>(null);
  const [publicLobbies, setPublicLobbies] = useState<Array<{ roomId: string; playerCount: number; maxPlayers: number }>>([]);
  
  // Game state
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [bankerHand, setBankerHand] = useState<Card[]>([]);
  const [playerTotal, setPlayerTotal] = useState(0);
  const [bankerTotal, setBankerTotal] = useState(0);
  const [winner, setWinner] = useState<'player' | 'banker' | 'tie' | null>(null);
  const [winnings, setWinnings] = useState(0);
  const [dealingPhase, setDealingPhase] = useState(0);
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

  const createDeck = useCallback((): Card[] => {
    const newDeck: Card[] = [];
    // Use 8 decks like real baccarat
    for (let d = 0; d < 8; d++) {
      for (const suit of SUITS) {
        for (let i = 0; i < VALUES.length; i++) {
          const value = VALUES[i];
          // In baccarat: A=1, 2-9=face value, 10/J/Q/K=0
          let numValue: number;
          if (value === 'A') {
            numValue = 1;
          } else if (['10', 'J', 'Q', 'K'].includes(value)) {
            numValue = 0;
          } else {
            numValue = parseInt(value);
          }
          newDeck.push({ suit, value, numValue });
        }
      }
    }
    // Shuffle
    for (let i = newDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }
    return newDeck;
  }, []);

  const calculateTotal = (hand: Card[]): number => {
    const sum = hand.reduce((acc, card) => acc + card.numValue, 0);
    return sum % 10; // Baccarat only uses last digit
  };

  useEffect(() => {
    if (mode !== 'single') {
      const socketUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
      const newSocket = io(socketUrl);
      setSocket(newSocket);

      newSocket.on('baccaratLobbyCreated', ({ roomId, players }: { roomId: string; players: Player[] }) => {
        setRoomId(roomId);
        setPlayers(players);
        setGameState('lobby');
      });

      newSocket.on('baccaratPlayerJoined', ({ players }: { players: Player[] }) => {
        setPlayers(players);
      });

      newSocket.on('baccaratPlayersUpdate', ({ players }: { players: Player[] }) => {
        setPlayers(players);
      });

      newSocket.on('baccaratPublicLobbies', ({ lobbies }: { lobbies: Array<{ roomId: string; playerCount: number; maxPlayers: number }> }) => {
        setPublicLobbies(lobbies);
      });

      newSocket.on('baccaratGameStarted', () => {
        setGameState('betting');
        setPlayerHand([]);
        setBankerHand([]);
        setWinner(null);
        setWinnings(0);
        setMyBet(null);
        setSelectedBet(null);
        setBetAmount('');
      });

      newSocket.on('baccaratBetPlaced', ({ players }: { players: Player[] }) => {
        setPlayers(players);
      });

      newSocket.on('baccaratDealing', ({ playerHand, bankerHand, phase }: { playerHand: Card[]; bankerHand: Card[]; phase: number }) => {
        setGameState('dealing');
        setDealingPhase(phase);
        setPlayerHand(playerHand);
        setBankerHand(bankerHand);
        setPlayerTotal(calculateTotal(playerHand));
        setBankerTotal(calculateTotal(bankerHand));
      });

      newSocket.on('baccaratResult', ({ 
        playerHand, 
        bankerHand, 
        winner, 
        players 
      }: { 
        playerHand: Card[]; 
        bankerHand: Card[]; 
        winner: 'player' | 'banker' | 'tie'; 
        players: Player[] 
      }) => {
        setPlayerHand(playerHand);
        setBankerHand(bankerHand);
        setPlayerTotal(calculateTotal(playerHand));
        setBankerTotal(calculateTotal(bankerHand));
        setWinner(winner);
        setPlayers(players);
        setGameState('results');
        
        const me = players.find(p => p.id === newSocket.id);
        if (me) {
          setBalance(me.balance);
          setWinnings(me.winnings);
        }
      });

      newSocket.on('baccaratError', ({ message }: { message: string }) => {
        alert(message);
      });

      return () => {
        newSocket.disconnect();
      };
    }
  }, [mode]);

  // Single player: start new game
  const startSinglePlayerGame = () => {
    if (!playerName.trim()) return;
    setDeck(createDeck());
    setGameState('betting');
    setPlayerHand([]);
    setBankerHand([]);
    setWinner(null);
    setWinnings(0);
    setMyBet(null);
    setSelectedBet(null);
    setBetAmount('');
  };

  // Place bet (single player)
  const placeBet = () => {
    if (!selectedBet || !betAmount) return;
    const amount = parseInt(betAmount);
    if (isNaN(amount) || amount <= 0 || amount > balance) return;

    setBalance(prev => prev - amount);
    recordBet(amount); // Track wager for leaderboard
    setMyBet({ type: selectedBet, amount });
    
    // Start dealing
    dealCards(amount, selectedBet);
  };

  // Deal cards with animation
  const dealCards = async (betAmt: number, betType: 'player' | 'banker' | 'tie') => {
    setGameState('dealing');
    const currentDeck = [...deck];
    
    // Deal initial 2 cards each
    const pHand: Card[] = [];
    const bHand: Card[] = [];
    
    // Deal player card 1
    setDealingPhase(1);
    pHand.push(currentDeck.pop()!);
    setPlayerHand([...pHand]);
    setPlayerTotal(calculateTotal(pHand));
    await new Promise(r => setTimeout(r, 800));
    
    // Deal banker card 1
    setDealingPhase(2);
    bHand.push(currentDeck.pop()!);
    setBankerHand([...bHand]);
    setBankerTotal(calculateTotal(bHand));
    await new Promise(r => setTimeout(r, 800));
    
    // Deal player card 2
    setDealingPhase(3);
    pHand.push(currentDeck.pop()!);
    setPlayerHand([...pHand]);
    setPlayerTotal(calculateTotal(pHand));
    await new Promise(r => setTimeout(r, 800));
    
    // Deal banker card 2
    setDealingPhase(4);
    bHand.push(currentDeck.pop()!);
    setBankerHand([...bHand]);
    setBankerTotal(calculateTotal(bHand));
    await new Promise(r => setTimeout(r, 800));

    let pTotal = calculateTotal(pHand);
    let bTotal = calculateTotal(bHand);

    // Check for natural (8 or 9)
    const playerNatural = pTotal >= 8;
    const bankerNatural = bTotal >= 8;

    if (!playerNatural && !bankerNatural) {
      // Player third card rule
      let playerThirdCard: Card | null = null;
      if (pTotal <= 5) {
        setDealingPhase(5);
        playerThirdCard = currentDeck.pop()!;
        pHand.push(playerThirdCard);
        setPlayerHand([...pHand]);
        pTotal = calculateTotal(pHand);
        setPlayerTotal(pTotal);
        await new Promise(r => setTimeout(r, 800));
      }

      // Banker third card rule
      let bankerDraws = false;
      if (playerThirdCard === null) {
        // Player stood, banker draws on 0-5
        bankerDraws = bTotal <= 5;
      } else {
        // Player drew, complex banker rules based on player's third card
        const p3 = playerThirdCard.numValue;
        if (bTotal <= 2) {
          bankerDraws = true;
        } else if (bTotal === 3) {
          bankerDraws = p3 !== 8;
        } else if (bTotal === 4) {
          bankerDraws = p3 >= 2 && p3 <= 7;
        } else if (bTotal === 5) {
          bankerDraws = p3 >= 4 && p3 <= 7;
        } else if (bTotal === 6) {
          bankerDraws = p3 === 6 || p3 === 7;
        }
      }

      if (bankerDraws) {
        setDealingPhase(6);
        bHand.push(currentDeck.pop()!);
        setBankerHand([...bHand]);
        bTotal = calculateTotal(bHand);
        setBankerTotal(bTotal);
        await new Promise(r => setTimeout(r, 800));
      }
    }

    setDeck(currentDeck);

    // Determine winner
    await new Promise(r => setTimeout(r, 500));
    
    let result: 'player' | 'banker' | 'tie';
    if (pTotal > bTotal) {
      result = 'player';
    } else if (bTotal > pTotal) {
      result = 'banker';
    } else {
      result = 'tie';
    }

    setWinner(result);
    setGameState('results');

    // Calculate winnings
    let win = 0;
    if (betType === result) {
      if (result === 'player') {
        win = betAmt * 2; // 1:1 payout
      } else if (result === 'banker') {
        win = Math.floor(betAmt * 1.95); // 0.95:1 payout (5% commission)
      } else {
        win = betAmt * 9; // 8:1 payout for tie
      }
      const profit = win - betAmt;
      setBalance(prev => prev + win);
      setWinnings(win);
    }
  };

  // Multiplayer functions
  const createLobby = () => {
    if (!socket || !playerName.trim()) return;
    socket.emit('baccaratCreateLobby', { playerName, isPublic: true });
    setMyPlayerId(socket.id || '');
  };

  const joinLobby = (code?: string) => {
    if (!socket || !playerName.trim()) return;
    const targetRoom = code || lobbyCode;
    socket.emit('baccaratJoinLobby', { roomId: targetRoom, playerName });
    setMyPlayerId(socket.id || '');
  };

  const startGame = () => {
    if (!socket) return;
    socket.emit('baccaratStartGame', { roomId });
  };

  const submitBet = () => {
    if (!socket || !selectedBet || !betAmount) return;
    const amount = parseInt(betAmount);
    if (isNaN(amount) || amount <= 0) return;
    socket.emit('baccaratPlaceBet', { roomId, betType: selectedBet, amount });
    setMyBet({ type: selectedBet, amount });
  };

  const playAgain = () => {
    if (mode === 'single') {
      startSinglePlayerGame();
    } else {
      socket?.emit('baccaratStartGame', { roomId });
    }
  };

  // Fetch public lobbies
  useEffect(() => {
    if (mode !== 'single' && socket && gameState === 'lobby') {
      socket.emit('baccaratGetPublicLobbies');
      const interval = setInterval(() => {
        socket.emit('baccaratGetPublicLobbies');
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [mode, socket, gameState]);

  const renderCard = (card: Card, index: number, isDealing: boolean = false) => {
    const isRed = card.suit === '♥' || card.suit === '♦';
    return (
      <div
        key={index}
        className={`w-16 h-24 bg-white rounded-lg shadow-lg flex flex-col items-center justify-center transform transition-all duration-300 ${
          isDealing ? 'animate-bounce' : ''
        }`}
        style={{ animationDelay: `${index * 100}ms` }}
      >
        <span className={`text-2xl font-bold ${isRed ? 'text-red-500' : 'text-black'}`}>
          {card.value}
        </span>
        <span className={`text-xl ${isRed ? 'text-red-500' : 'text-black'}`}>
          {card.suit}
        </span>
      </div>
    );
  };

  // Lobby Screen
  if (gameState === 'lobby') {
    if (mode === 'single') {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-black/60 backdrop-blur-xl rounded-3xl p-8 border border-white/20">
            <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-red-400 to-yellow-400 bg-clip-text text-transparent">
              🎴 Baccarat 🎴
            </h1>
            <p className="text-white/70 text-center mb-8">Classic casino card game</p>

            <div className="space-y-4">
              <div>
                <label className="text-white/80 text-sm mb-2 block">Your Name</label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50"
                />
              </div>

              <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-xl p-4 border border-green-500/30">
                <div className="text-white/60 text-sm">Your Balance</div>
                <div className="text-3xl font-bold text-green-400">${balance.toLocaleString()}</div>
              </div>

              <button
                onClick={startSinglePlayerGame}
                disabled={!playerName.trim()}
                className="w-full py-4 bg-gradient-to-r from-red-500 to-yellow-500 hover:from-red-600 hover:to-yellow-600 disabled:opacity-50 text-white rounded-xl font-bold text-xl transition-all"
              >
                Start Game
              </button>

              <button
                onClick={() => router.push('/casino')}
                className="w-full py-3 bg-white/10 hover:bg-white/20 text-white/80 rounded-xl transition-all"
              >
                ← Back to Casino
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Multiplayer lobby
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-black/60 backdrop-blur-xl rounded-3xl p-8 border border-white/20">
          <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-red-400 to-yellow-400 bg-clip-text text-transparent">
            🎴 Baccarat Multiplayer 🎴
          </h1>
          
          {!roomId ? (
            <div className="space-y-6 mt-8">
              <div>
                <label className="text-white/80 text-sm mb-2 block">Your Name</label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={createLobby}
                  disabled={!playerName.trim()}
                  className="py-4 bg-gradient-to-r from-red-500 to-yellow-500 hover:from-red-600 hover:to-yellow-600 disabled:opacity-50 text-white rounded-xl font-bold transition-all"
                >
                  Create Lobby
                </button>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Room code"
                    value={lobbyCode}
                    onChange={(e) => setLobbyCode(e.target.value.toUpperCase())}
                    className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50"
                  />
                  <button
                    onClick={() => joinLobby()}
                    disabled={!playerName.trim() || !lobbyCode}
                    className="px-6 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl font-bold transition-all"
                  >
                    Join
                  </button>
                </div>
              </div>

              {publicLobbies.length > 0 && (
                <div>
                  <h3 className="text-white/80 mb-3">Public Lobbies</h3>
                  <div className="space-y-2">
                    {publicLobbies.map(lobby => (
                      <button
                        key={lobby.roomId}
                        onClick={() => joinLobby(lobby.roomId)}
                        disabled={!playerName.trim()}
                        className="w-full flex items-center justify-between p-4 bg-white/10 hover:bg-white/20 rounded-xl transition-all"
                      >
                        <span className="text-white font-bold">{lobby.roomId}</span>
                        <span className="text-white/60">{lobby.playerCount}/{lobby.maxPlayers} players</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => router.push('/casino')}
                className="w-full py-3 bg-white/10 hover:bg-white/20 text-white/80 rounded-xl transition-all"
              >
                ← Back to Casino
              </button>
            </div>
          ) : (
            <div className="space-y-6 mt-8">
              <div className="text-center">
                <div className="text-white/60 mb-2">Room Code</div>
                <div className="text-4xl font-mono font-bold text-yellow-400">{roomId}</div>
              </div>

              <div className="space-y-3">
                <h3 className="text-white/80">Players ({players.length}/8)</h3>
                {players.map(player => (
                  <div key={player.id} className="flex items-center justify-between p-3 bg-white/10 rounded-xl">
                    <span className="text-white font-bold">{player.name}</span>
                    <span className="text-green-400">${player.balance.toLocaleString()}</span>
                  </div>
                ))}
              </div>

              {players.length >= 1 && players[0]?.id === myPlayerId && (
                <button
                  onClick={startGame}
                  className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl font-bold text-xl transition-all"
                >
                  Start Game
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Betting Screen
  if (gameState === 'betting') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-xl w-full bg-black/60 backdrop-blur-xl rounded-3xl p-8 border border-white/20">
          <h2 className="text-3xl font-bold text-center mb-2 text-white">Place Your Bet</h2>
          <p className="text-white/60 text-center mb-6">Choose Player, Banker, or Tie</p>

          <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-xl p-4 border border-green-500/30 mb-6">
            <div className="text-white/60 text-sm">Balance</div>
            <div className="text-3xl font-bold text-green-400">${balance.toLocaleString()}</div>
          </div>

          {/* Bet type selection */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <button
              onClick={() => setSelectedBet('player')}
              className={`py-6 rounded-xl font-bold text-lg transition-all ${
                selectedBet === 'player'
                  ? 'bg-blue-500 text-white ring-4 ring-blue-300'
                  : 'bg-blue-500/30 text-white hover:bg-blue-500/50'
              }`}
            >
              <div className="text-2xl mb-1">👤</div>
              <div>Player</div>
              <div className="text-xs opacity-70">1:1</div>
            </button>
            <button
              onClick={() => setSelectedBet('tie')}
              className={`py-6 rounded-xl font-bold text-lg transition-all ${
                selectedBet === 'tie'
                  ? 'bg-green-500 text-white ring-4 ring-green-300'
                  : 'bg-green-500/30 text-white hover:bg-green-500/50'
              }`}
            >
              <div className="text-2xl mb-1">🤝</div>
              <div>Tie</div>
              <div className="text-xs opacity-70">8:1</div>
            </button>
            <button
              onClick={() => setSelectedBet('banker')}
              className={`py-6 rounded-xl font-bold text-lg transition-all ${
                selectedBet === 'banker'
                  ? 'bg-red-500 text-white ring-4 ring-red-300'
                  : 'bg-red-500/30 text-white hover:bg-red-500/50'
              }`}
            >
              <div className="text-2xl mb-1">🏦</div>
              <div>Banker</div>
              <div className="text-xs opacity-70">0.95:1</div>
            </button>
          </div>

          {/* Bet amount */}
          <div className="mb-6">
            <label className="text-white/80 text-sm mb-2 block">Bet Amount</label>
            <input
              type="number"
              placeholder="Enter bet amount"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-center text-2xl"
            />
            <div className="grid grid-cols-4 gap-2 mt-3">
              {[100, 500, 1000, 5000].map(amt => (
                <button
                  key={amt}
                  onClick={() => setBetAmount(amt.toString())}
                  className="py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
                >
                  ${amt}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={mode === 'single' ? placeBet : submitBet}
            disabled={!selectedBet || !betAmount || parseInt(betAmount) > balance}
            className="w-full py-4 bg-gradient-to-r from-red-500 to-yellow-500 hover:from-red-600 hover:to-yellow-600 disabled:opacity-50 text-white rounded-xl font-bold text-xl transition-all"
          >
            Deal Cards
          </button>

          {/* Show other players' bets in multiplayer */}
          {mode !== 'single' && players.length > 0 && (
            <div className="mt-6">
              <h3 className="text-white/80 mb-3">Players</h3>
              <div className="space-y-2">
                {players.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 bg-white/10 rounded-xl">
                    <span className="text-white">{p.name}</span>
                    <span className={p.bet ? 'text-yellow-400' : 'text-white/40'}>
                      {p.bet ? `${p.bet.type.toUpperCase()} - $${p.bet.amount}` : 'Waiting...'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Dealing / Game Screen
  if (gameState === 'dealing' || gameState === 'results') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-3xl w-full">
          {/* Game table */}
          <div className="bg-gradient-to-br from-green-800 to-green-900 rounded-3xl p-8 border-8 border-amber-700 shadow-2xl">
            <h2 className="text-3xl font-bold text-center text-white mb-8">
              {gameState === 'dealing' ? 'Dealing...' : (
                winner === 'tie' ? '🤝 Tie!' : 
                winner === 'player' ? '👤 Player Wins!' : 
                '🏦 Banker Wins!'
              )}
            </h2>

            {/* Your bet display */}
            {myBet && (
              <div className="text-center mb-6">
                <span className="text-white/60">Your Bet: </span>
                <span className={`font-bold ${
                  myBet.type === 'player' ? 'text-blue-400' : 
                  myBet.type === 'banker' ? 'text-red-400' : 
                  'text-green-400'
                }`}>
                  {myBet.type.toUpperCase()} - ${myBet.amount}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-8">
              {/* Player side */}
              <div className={`text-center p-6 rounded-2xl ${
                winner === 'player' ? 'bg-blue-500/30 ring-4 ring-blue-400' : 'bg-white/10'
              }`}>
                <h3 className="text-xl font-bold text-blue-400 mb-4">👤 Player</h3>
                <div className="flex justify-center gap-2 mb-4 min-h-[96px]">
                  {playerHand.map((card, i) => renderCard(card, i, gameState === 'dealing' && i === playerHand.length - 1))}
                </div>
                <div className="text-4xl font-bold text-white">{playerTotal}</div>
              </div>

              {/* Banker side */}
              <div className={`text-center p-6 rounded-2xl ${
                winner === 'banker' ? 'bg-red-500/30 ring-4 ring-red-400' : 'bg-white/10'
              }`}>
                <h3 className="text-xl font-bold text-red-400 mb-4">🏦 Banker</h3>
                <div className="flex justify-center gap-2 mb-4 min-h-[96px]">
                  {bankerHand.map((card, i) => renderCard(card, i, gameState === 'dealing' && i === bankerHand.length - 1))}
                </div>
                <div className="text-4xl font-bold text-white">{bankerTotal}</div>
              </div>
            </div>

            {/* Results */}
            {gameState === 'results' && (
              <div className="mt-8 text-center">
                {winnings > 0 ? (
                  <div className="bg-green-500/20 rounded-xl p-4 mb-4">
                    <div className="text-green-400 text-2xl font-bold">
                      🎉 You Won ${winnings.toLocaleString()}!
                    </div>
                  </div>
                ) : myBet ? (
                  <div className="bg-red-500/20 rounded-xl p-4 mb-4">
                    <div className="text-red-400 text-xl font-bold">
                      You Lost ${myBet.amount.toLocaleString()}
                    </div>
                  </div>
                ) : null}

                <div className="text-white/60 mb-4">
                  Balance: <span className="text-green-400 font-bold">${balance.toLocaleString()}</span>
                </div>

                <div className="flex gap-4 justify-center">
                  <button
                    onClick={playAgain}
                    disabled={balance <= 0}
                    className="px-8 py-3 bg-gradient-to-r from-red-500 to-yellow-500 hover:from-red-600 hover:to-yellow-600 disabled:opacity-50 text-white rounded-xl font-bold transition-all"
                  >
                    Play Again
                  </button>
                  <button
                    onClick={() => router.push('/casino')}
                    className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-all"
                  >
                    Back to Casino
                  </button>
                </div>
              </div>
            )}

            {/* Multiplayer: show other players */}
            {mode !== 'single' && players.length > 0 && (
              <div className="mt-6 pt-6 border-t border-white/20">
                <h3 className="text-white/60 mb-3 text-center">All Bets</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {players.map(p => (
                    <div key={p.id} className={`p-3 rounded-xl text-center ${
                      gameState === 'results' && p.bet?.type === winner 
                        ? 'bg-green-500/30' 
                        : 'bg-white/10'
                    }`}>
                      <div className="text-white font-bold text-sm">{p.name}</div>
                      <div className={`text-xs ${
                        p.bet?.type === 'player' ? 'text-blue-400' : 
                        p.bet?.type === 'banker' ? 'text-red-400' : 
                        'text-green-400'
                      }`}>
                        {p.bet ? `${p.bet.type.toUpperCase()}` : '-'}
                      </div>
                      {gameState === 'results' && p.winnings > 0 && (
                        <div className="text-green-400 text-xs">+${p.winnings}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function BaccaratPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white text-2xl">Loading Baccarat...</div>
      </div>
    }>
      <BaccaratGame />
    </Suspense>
  );
}
