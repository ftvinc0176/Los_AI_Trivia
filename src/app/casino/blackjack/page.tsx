'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

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
  hand: Card[];
  handValue: number;
  isStanding: boolean;
  isBusted: boolean;
}

function BlackjackGame() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') || 'single';

  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<'lobby' | 'betting' | 'playing' | 'results'>('lobby');
  const [playerName, setPlayerName] = useState('');
  const [lobbyCode, setLobbyCode] = useState('');
  const [roomId, setRoomId] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayerId, setMyPlayerId] = useState('');
  const [balance, setBalance] = useState(1000);
  const [currentBet, setBetAmount] = useState(0);
  const [betInput, setBetInput] = useState('100');
  const [dealerHand, setDealerHand] = useState<Card[]>([]);
  const [dealerHandValue, setDealerHandValue] = useState(0);
  const [myHand, setMyHand] = useState<Card[]>([]);
  const [myHandValue, setMyHandValue] = useState(0);
  const [isDealing, setIsDealing] = useState(false);
  const [canHit, setCanHit] = useState(true);
  const [resultMessage, setResultMessage] = useState('');

  useEffect(() => {
    if (mode !== 'single') {
      const socketUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
      const newSocket = io(socketUrl);
      setSocket(newSocket);

      newSocket.on('casinoLobbyCreated', ({ roomId }: { roomId: string }) => {
        setRoomId(roomId);
        setGameState('lobby');
      });

      newSocket.on('casinoPlayerJoined', ({ players }: { players: Player[] }) => {
        setPlayers(players);
      });

      newSocket.on('casinoGameStarted', () => {
        setGameState('betting');
      });

      newSocket.on('casinoDealCards', ({ players, dealer }: { players: Player[]; dealer: { hand: Card[]; value: number } }) => {
        setPlayers(players);
        setDealerHand(dealer.hand);
        setDealerHandValue(dealer.value);
        const me = players.find(p => p.id === newSocket.id);
        if (me) {
          setMyHand(me.hand);
          setMyHandValue(me.handValue);
        }
        setIsDealing(false);
        setCanHit(true);
      });

      newSocket.on('casinoCardDealt', ({ playerId, card, handValue }: { playerId: string; card: Card; handValue: number }) => {
        if (playerId === newSocket.id) {
          setMyHand(prev => [...prev, card]);
          setMyHandValue(handValue);
        }
        setPlayers(prev => prev.map(p => 
          p.id === playerId 
            ? { ...p, hand: [...p.hand, card], handValue }
            : p
        ));
      });

      newSocket.on('casinoRoundEnd', ({ players, dealer, results }: any) => {
        setPlayers(players);
        setDealerHand(dealer.hand);
        setDealerHandValue(dealer.value);
        const me = players.find((p: Player) => p.id === newSocket.id);
        if (me && newSocket.id) {
          setBalance(me.balance);
          setResultMessage(results[newSocket.id] || '');
        }
        setGameState('results');
      });

      return () => {
        newSocket.close();
      };
    }
  }, [mode]);

  const createLobby = () => {
    if (socket && playerName) {
      socket.emit('casinoCreateLobby', { playerName });
      setMyPlayerId(socket.id!);
    }
  };

  const joinLobby = () => {
    if (socket && playerName && lobbyCode) {
      socket.emit('casinoJoinLobby', { roomId: lobbyCode, playerName });
      setRoomId(lobbyCode);
      setMyPlayerId(socket.id!);
      setGameState('lobby');
    }
  };

  const startGame = () => {
    if (socket) {
      socket.emit('casinoStartGame', { roomId });
    } else {
      // Single player
      setGameState('betting');
    }
  };

  const placeBet = () => {
    const bet = parseInt(betInput);
    if (bet > 0 && bet <= balance) {
      setBetAmount(bet);
      setBalance(balance - bet);
      
      if (socket) {
        socket.emit('casinoPlaceBet', { roomId, bet });
      } else {
        // Single player - deal cards immediately
        dealInitialCards(bet);
      }
    }
  };

  const dealInitialCards = (bet: number) => {
    setIsDealing(true);
    setGameState('playing');
    
    // Create deck and shuffle
    const deck = createDeck();
    shuffleDeck(deck);
    
    // Deal cards with animation delay
    setTimeout(() => {
      const playerCard1 = deck.pop()!;
      const dealerCard1 = deck.pop()!;
      const playerCard2 = deck.pop()!;
      const dealerCard2 = deck.pop()!;
      
      const playerHand = [playerCard1, playerCard2];
      const dealerHandInitial = [dealerCard1, dealerCard2];
      
      setMyHand(playerHand);
      setDealerHand([dealerCard1]); // Only show one dealer card
      setMyHandValue(calculateHandValue(playerHand));
      setDealerHandValue(dealerCard1.numValue);
      setIsDealing(false);
      setCanHit(true);
      
      // Store full dealer hand in state for later
      (window as any).dealerFullHand = dealerHandInitial;
      (window as any).gameDeck = deck;
    }, 1000);
  };

  const createDeck = (): Card[] => {
    const suits = ['♠️', '♥️', '♣️', '♦️'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const deck: Card[] = [];
    
    suits.forEach(suit => {
      values.forEach(value => {
        let numValue = parseInt(value);
        if (value === 'A') numValue = 11;
        else if (['J', 'Q', 'K'].includes(value)) numValue = 10;
        
        deck.push({ suit, value, numValue });
      });
    });
    
    return deck;
  };

  const shuffleDeck = (deck: Card[]) => {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  };

  const calculateHandValue = (hand: Card[]): number => {
    let value = 0;
    let aces = 0;
    
    hand.forEach(card => {
      if (card.value === 'A') {
        aces++;
        value += 11;
      } else {
        value += card.numValue;
      }
    });
    
    while (value > 21 && aces > 0) {
      value -= 10;
      aces--;
    }
    
    return value;
  };

  const hit = () => {
    if (socket) {
      socket.emit('casinoHit', { roomId });
    } else {
      const deck = (window as any).gameDeck as Card[];
      const newCard = deck.pop()!;
      const newHand = [...myHand, newCard];
      setMyHand(newHand);
      const newValue = calculateHandValue(newHand);
      setMyHandValue(newValue);
      
      if (newValue > 21) {
        // Busted
        setCanHit(false);
        setTimeout(() => stand(), 1000);
      }
    }
  };

  const stand = () => {
    setCanHit(false);
    
    if (socket) {
      socket.emit('casinoStand', { roomId });
    } else {
      // Reveal dealer's hand and play dealer
      const dealerFullHand = (window as any).dealerFullHand as Card[];
      setDealerHand(dealerFullHand);
      
      let dealerValue = calculateHandValue(dealerFullHand);
      setDealerHandValue(dealerValue);
      
      const deck = (window as any).gameDeck as Card[];
      
      // Dealer hits until 17+
      const dealerPlay = () => {
        if (dealerValue < 17) {
          setTimeout(() => {
            const newCard = deck.pop()!;
            dealerFullHand.push(newCard);
            setDealerHand([...dealerFullHand]);
            dealerValue = calculateHandValue(dealerFullHand);
            setDealerHandValue(dealerValue);
            dealerPlay();
          }, 1000);
        } else {
          // Determine winner
          setTimeout(() => {
            determineWinner(myHandValue, dealerValue);
          }, 1000);
        }
      };
      
      dealerPlay();
    }
  };

  const determineWinner = (playerValue: number, dealerValue: number) => {
    let message = '';
    let winAmount = 0;
    
    if (playerValue > 21) {
      message = 'Bust! You lose.';
    } else if (dealerValue > 21) {
      message = 'Dealer busts! You win!';
      winAmount = currentBet * 2;
    } else if (playerValue > dealerValue) {
      message = 'You win!';
      winAmount = currentBet * 2;
    } else if (playerValue < dealerValue) {
      message = 'Dealer wins.';
    } else {
      message = 'Push! Bet returned.';
      winAmount = currentBet;
    }
    
    setBalance(balance + winAmount);
    setResultMessage(message);
    setGameState('results');
  };

  const playAgain = () => {
    setMyHand([]);
    setDealerHand([]);
    setMyHandValue(0);
    setDealerHandValue(0);
    setBetAmount(0);
    setResultMessage('');
    setCanHit(true);
    setGameState('betting');
  };

  // Lobby State
  if (mode !== 'single' && gameState === 'lobby' && !roomId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20">
          <h1 className="text-4xl font-bold text-white mb-8 text-center">
            {mode === 'create' ? '🎰 Create Casino Lobby' : '🔗 Join Casino Lobby'}
          </h1>
          
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Your Name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-white/40"
            />
            
            {mode === 'join' && (
              <input
                type="text"
                placeholder="Lobby Code"
                value={lobbyCode}
                onChange={(e) => setLobbyCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-white/40"
              />
            )}
            
            <button
              onClick={mode === 'create' ? createLobby : joinLobby}
              disabled={!playerName || (mode === 'join' && !lobbyCode)}
              className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-gray-500 disabled:to-gray-600 text-white rounded-xl font-bold text-lg transition-all disabled:cursor-not-allowed"
            >
              {mode === 'create' ? 'Create Lobby' : 'Join Lobby'}
            </button>
            
            <button
              onClick={() => router.push('/casino')}
              className="w-full text-white/60 hover:text-white"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Waiting for players
  if (mode !== 'single' && gameState === 'lobby' && roomId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20">
          <h1 className="text-4xl font-bold text-white mb-4 text-center">Casino Lobby</h1>
          <div className="text-center mb-8">
            <p className="text-white/60 mb-2">Lobby Code:</p>
            <p className="text-5xl font-bold text-yellow-300">{roomId}</p>
          </div>
          
          <div className="space-y-3 mb-8">
            {players.map((player, idx) => (
              <div key={player.id} className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="flex justify-between items-center">
                  <span className="text-white font-bold">
                    {player.name} {player.id === myPlayerId && '(You)'}
                  </span>
                  <span className="text-yellow-300">{player.balance} LosBucks</span>
                </div>
              </div>
            ))}
          </div>
          
          {players.length > 0 && players[0].id === myPlayerId && (
            <button
              onClick={startGame}
              className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-bold text-lg"
            >
              Start Game
            </button>
          )}
        </div>
      </div>
    );
  }

  // Betting State
  if (gameState === 'betting') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20">
          <h1 className="text-4xl font-bold text-white mb-4 text-center">Place Your Bet</h1>
          <div className="text-center mb-8">
            <p className="text-white/60 mb-2">Your Balance:</p>
            <p className="text-4xl font-bold text-yellow-300">{balance} LosBucks</p>
          </div>
          
          <div className="space-y-4">
            <input
              type="number"
              value={betInput}
              onChange={(e) => setBetInput(e.target.value)}
              min="1"
              max={balance}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white text-center text-2xl focus:outline-none focus:border-white/40"
            />
            
            <div className="grid grid-cols-4 gap-2">
              {[25, 50, 100, 250].map(amount => (
                <button
                  key={amount}
                  onClick={() => setBetInput(String(amount))}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-white transition-all"
                >
                  {amount}
                </button>
              ))}
            </div>
            
            <button
              onClick={placeBet}
              disabled={parseInt(betInput) <= 0 || parseInt(betInput) > balance}
              className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-gray-500 disabled:to-gray-600 text-white rounded-xl font-bold text-lg disabled:cursor-not-allowed"
            >
              Deal Cards
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Playing State
  if (gameState === 'playing') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-6xl w-full">
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold text-white mb-4">♠️ Blackjack ♥️</h1>
            <div className="flex justify-center gap-8 text-xl">
              <span className="text-yellow-300">Balance: {balance} LosBucks</span>
              <span className="text-green-300">Bet: {currentBet} LosBucks</span>
            </div>
          </div>

          {/* Dealer's Hand */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-white mb-4 text-center">Dealer: {dealerHandValue}</h2>
            <div className="flex justify-center gap-4">
              {dealerHand.map((card, idx) => (
                <div
                  key={idx}
                  className="w-24 h-36 bg-white rounded-xl shadow-2xl flex flex-col items-center justify-center border-4 border-gray-300 animate-fade-in"
                  style={{ animationDelay: `${idx * 0.2}s` }}
                >
                  <div className={`text-4xl ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-500' : 'text-black'}`}>
                    {card.suit}
                  </div>
                  <div className={`text-3xl font-bold ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-500' : 'text-black'}`}>
                    {card.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Player's Hand */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4 text-center">Your Hand: {myHandValue}</h2>
            <div className="flex justify-center gap-4">
              {myHand.map((card, idx) => (
                <div
                  key={idx}
                  className="w-24 h-36 bg-white rounded-xl shadow-2xl flex flex-col items-center justify-center border-4 border-gray-300 animate-fade-in"
                  style={{ animationDelay: `${idx * 0.2}s` }}
                >
                  <div className={`text-4xl ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-500' : 'text-black'}`}>
                    {card.suit}
                  </div>
                  <div className={`text-3xl font-bold ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-500' : 'text-black'}`}>
                    {card.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          {canHit && !isDealing && (
            <div className="flex justify-center gap-4">
              <button
                onClick={hit}
                className="px-8 py-4 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white rounded-xl font-bold text-xl transition-all"
              >
                Hit
              </button>
              <button
                onClick={stand}
                className="px-8 py-4 bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white rounded-xl font-bold text-xl transition-all"
              >
                Stand
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Results State
  if (gameState === 'results') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20 text-center">
          <h1 className="text-5xl font-bold text-white mb-6">{resultMessage}</h1>
          <p className="text-3xl text-yellow-300 mb-8">Balance: {balance} LosBucks</p>
          
          <div className="space-y-4">
            <button
              onClick={playAgain}
              className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-bold text-lg"
            >
              Play Again
            </button>
            <button
              onClick={() => router.push('/casino')}
              className="w-full text-white/60 hover:text-white"
            >
              ← Back to Casino
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Single player initial state
  if (mode === 'single' && gameState === 'lobby') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20 text-center">
          <h1 className="text-5xl font-bold text-white mb-6">♠️ Blackjack ♥️</h1>
          <p className="text-3xl text-yellow-300 mb-8">Starting Balance: 1000 LosBucks</p>
          
          <button
            onClick={startGame}
            className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-bold text-lg"
          >
            Start Game
          </button>
          
          <button
            onClick={() => router.push('/casino')}
            className="w-full text-white/60 hover:text-white mt-4"
          >
            ← Back to Casino
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default function BlackjackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white">Loading...</div>}>
      <BlackjackGame />
    </Suspense>
  );
}
