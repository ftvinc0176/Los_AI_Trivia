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
  const [isPublic, setIsPublic] = useState(true);
  const [publicLobbies, setPublicLobbies] = useState<Array<{ roomId: string; playerCount: number; maxPlayers: number }>>([]);
  const [selectedChip, setSelectedChip] = useState(25);
  const [sideBets, setSideBets] = useState({ perfectPairs: 0, twentyOnePlus3: 0 });
  const [currentTurn, setCurrentTurn] = useState<string>('');
  const [playerPositions, setPlayerPositions] = useState<number>(0);

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

      newSocket.on('casinoPublicLobbies', ({ lobbies }: { lobbies: Array<{ roomId: string; playerCount: number; maxPlayers: number }> }) => {
        setPublicLobbies(lobbies);
      });

      newSocket.on('casinoGameStarted', ({ playerPositions }: { playerPositions: number }) => {
        setGameState('betting');
        setPlayerPositions(playerPositions);
      });

      newSocket.on('casinoTurnUpdate', ({ currentTurn }: { currentTurn: string }) => {
        setCurrentTurn(currentTurn);
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
      socket.emit('casinoCreateLobby', { playerName, isPublic });
      setMyPlayerId(socket.id!);
    }
  };

  const joinLobby = (targetRoomId?: string) => {
    const joinRoomId = targetRoomId || lobbyCode;
    if (socket && playerName && joinRoomId) {
      socket.emit('casinoJoinLobby', { roomId: joinRoomId, playerName });
      setRoomId(joinRoomId);
      setMyPlayerId(socket.id!);
      setGameState('lobby');
    }
  };

  const refreshLobbies = () => {
    if (socket) {
      socket.emit('getCasinoPublicLobbies');
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
    const totalSideBets = sideBets.perfectPairs + sideBets.twentyOnePlus3;
    const totalBet = bet + totalSideBets;
    
    if (bet > 0 && totalBet <= balance) {
      setBetAmount(bet);
      setBalance(balance - totalBet);
      
      if (socket) {
        socket.emit('casinoPlaceBet', { roomId, bet, sideBets });
      } else {
        // Single player - deal cards immediately
        dealInitialCards(bet);
      }
    }
  };

  const addChipToBet = (area: 'main' | 'perfectPairs' | 'twentyOnePlus3') => {
    if (selectedChip > balance) return;
    
    if (area === 'main') {
      setBetInput(String(parseInt(betInput || '0') + selectedChip));
    } else if (area === 'perfectPairs') {
      setSideBets({ ...sideBets, perfectPairs: sideBets.perfectPairs + selectedChip });
    } else if (area === 'twentyOnePlus3') {
      setSideBets({ ...sideBets, twentyOnePlus3: sideBets.twentyOnePlus3 + selectedChip });
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
    if (socket && currentTurn === socket.id) {
      socket.emit('casinoHit', { roomId });
    } else if (!socket) {
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
    
    if (socket && currentTurn === socket.id) {
      socket.emit('casinoStand', { roomId });
    } else if (!socket) {
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

  // Browse Lobbies
  if (mode === 'browse' && !roomId) {
    if (!playerName) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20">
            <h1 className="text-4xl font-bold text-white mb-8 text-center">👁️ Browse Lobbies</h1>
            
            <input
              type="text"
              placeholder="Your Name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-white/40 mb-4"
            />
            
            <button
              onClick={refreshLobbies}
              disabled={!playerName}
              className="w-full px-6 py-4 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 disabled:from-gray-500 disabled:to-gray-600 text-white rounded-xl font-bold text-lg transition-all disabled:cursor-not-allowed mb-4"
            >
              View Public Lobbies
            </button>
            
            <button onClick={() => router.push('/casino')} className="w-full text-white/60 hover:text-white">
              ← Back
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-4xl font-bold text-white">Public Casino Lobbies</h1>
            <button
              onClick={refreshLobbies}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-all"
            >
              🔄 Refresh
            </button>
          </div>

          <div className="space-y-3 mb-6">
            {publicLobbies.length === 0 ? (
              <div className="text-center py-12 text-white/60">
                <p className="text-xl mb-2">No public lobbies available</p>
                <p className="text-sm">Create one to get started!</p>
              </div>
            ) : (
              publicLobbies.map((lobby) => (
                <div
                  key={lobby.roomId}
                  className="bg-white/5 rounded-xl p-4 border border-white/10 flex justify-between items-center hover:bg-white/10 transition-all"
                >
                  <div>
                    <p className="text-white font-bold text-lg">Lobby {lobby.roomId}</p>
                    <p className="text-white/60">
                      {lobby.playerCount}/{lobby.maxPlayers} players
                    </p>
                  </div>
                  <button
                    onClick={() => joinLobby(lobby.roomId)}
                    className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold transition-all"
                  >
                    Join
                  </button>
                </div>
              ))
            )}
          </div>

          <button onClick={() => router.push('/casino')} className="w-full text-white/60 hover:text-white">
            ← Back to Casino
          </button>
        </div>
      </div>
    );
  }

  // Create Lobby State
  if (mode === 'create' && gameState === 'lobby' && !roomId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20">
          <h1 className="text-4xl font-bold text-white mb-8 text-center">🎰 Create Casino Lobby</h1>
          
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Your Name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-white/40"
            />
            
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-white font-bold">Public Lobby</span>
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="w-6 h-6"
                />
              </label>
              <p className="text-white/60 text-sm mt-2">
                {isPublic ? 'Anyone can join' : 'Only players with code can join'}
              </p>
            </div>
            
            <button
              onClick={createLobby}
              disabled={!playerName}
              className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-gray-500 disabled:to-gray-600 text-white rounded-xl font-bold text-lg transition-all disabled:cursor-not-allowed"
            >
              Create Lobby
            
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
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'radial-gradient(ellipse at center, #0d5520 0%, #08350f 100%)' }}>
        <div className="max-w-6xl w-full">
          {/* Balance Display */}
          <div className="text-center mb-6">
            <p className="text-yellow-300 text-3xl font-bold">{balance} LosBucks</p>
          </div>

          {/* Betting Table */}
          <div className="relative bg-green-800 rounded-[200px] border-8 border-yellow-900 p-12 shadow-2xl">
            <div className="absolute inset-0 rounded-[200px] bg-gradient-to-br from-green-700 to-green-900 opacity-50"></div>
            
            {/* Table Text */}
            <div className="relative text-center mb-8">
              <h1 className="text-4xl font-bold text-yellow-600/40 mb-2">BLACKJACK PAYS 3 TO 2</h1>
              <p className="text-lg text-yellow-600/30">Dealer stands on all 17 and above</p>
            </div>

            {/* Betting Areas */}
            <div className="relative flex justify-center items-end gap-8 mb-8">
              {/* Side Bet: Perfect Pairs */}
              <div className="flex flex-col items-center">
                <div 
                  onClick={() => addChipToBet('perfectPairs')}
                  className="w-32 h-32 rounded-full border-4 border-yellow-600/50 bg-green-700 flex flex-col items-center justify-center cursor-pointer hover:bg-green-600 transition-all relative"
                >
                  <span className="text-yellow-600/60 text-xs font-bold">PERFECT</span>
                  <span className="text-yellow-600/60 text-xs font-bold">PAIRS</span>
                  {sideBets.perfectPairs > 0 && (
                    <div className="absolute -top-4">
                      <div className="w-12 h-12 rounded-full bg-red-600 border-4 border-white flex items-center justify-center shadow-lg">
                        <span className="text-white font-bold text-sm">{sideBets.perfectPairs}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Main Bet */}
              <div className="flex flex-col items-center">
                <div 
                  onClick={() => addChipToBet('main')}
                  className="w-40 h-40 rounded-full border-4 border-yellow-600 bg-green-700 flex items-center justify-center cursor-pointer hover:bg-green-600 transition-all relative"
                >
                  <span className="text-yellow-600 text-2xl font-bold">{betInput}</span>
                  {parseInt(betInput) > 0 && (
    const isMyTurn = !socket || currentTurn === socket.id;
    const myPlayerIndex = socket ? players.findIndex(p => p.id === socket.id) : 0;
    
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'radial-gradient(ellipse at center, #0d5520 0%, #08350f 100%)' }}>
        <div className="max-w-6xl w-full">
          {/* Balance Display */}
          <div className="text-center mb-6">
            <p className="text-yellow-300 text-2xl font-bold">{balance} LosBucks</p>
          </div>

          {/* Game Table */}
          <div className="relative bg-green-800 rounded-[200px] border-8 border-yellow-900 p-12 shadow-2xl min-h-[600px]">
            <div className="absolute inset-0 rounded-[200px] bg-gradient-to-br from-green-700 to-green-900 opacity-50"></div>
            
            {/* Dealer Area */}
            <div className="relative mb-16">
              <div className="text-center mb-4">
                <span className="text-yellow-300 text-xl font-bold">Dealer: {dealerHandValue}</span>
              </div>
              <div className="flex justify-center gap-2">
                {dealerHand.map((card, idx) => (
                  <div
                    key={idx}
                    className="w-20 h-28 bg-white rounded-lg shadow-2xl flex flex-col items-center justify-center border-2 border-gray-300"
                    style={{ 
                      animation: 'cardDeal 0.3s ease-out forwards',
                      animationDelay: `${idx * 0.1}s`,
                      opacity: 0
                    }}
                  >
                    <div className={`text-2xl ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-500' : 'text-black'}`}>
                      {card.suit}
                    </div>
                    <div className={`text-xl font-bold ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-500' : 'text-black'}`}>
                      {card.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Player Positions */}
            <div className="relative">
              {socket && players.length > 0 ? (
                // Multiplayer - show up to 3 players
                <div className="flex justify-around items-end">
                  {players.slice(0, 3).map((player, idx) => {
                    const isMe = player.id === socket.id;
                    const isCurrentTurn = currentTurn === player.id;
                    
                    return (
                      <div key={player.id} className={`flex flex-col items-center ${isCurrentTurn ? 'scale-105' : 'scale-100'} transition-transform`}>
                        {/* Player Cards */}
                        <div className="flex gap-1 mb-3">
                          {player.hand.map((card, cardIdx) => (
                            <div
                              key={cardIdx}
                              className="w-16 h-24 bg-white rounded-md shadow-xl flex flex-col items-center justify-center border border-gray-300"
                              style={{ 
                                animation: 'cardDeal 0.3s ease-out forwards',
                                animationDelay: `${(cardIdx + 2) * 0.1}s`,
                                opacity: 0
                              }}
                            >
                              <div className={`text-xl ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-500' : 'text-black'}`}>
                                {card.suit}
                              </div>
                              <div className={`text-lg font-bold ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-500' : 'text-black'}`}>
                                {card.value}
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Player Info */}
                        <div className={`px-4 py-2 rounded-lg ${isCurrentTurn ? 'bg-yellow-600' : 'bg-green-700'} border-2 ${isMe ? 'border-yellow-400' : 'border-yellow-800'}`}>
                          <p className="text-white font-bold text-sm">{player.name} {isMe && '(You)'}</p>
                          <p className="text-white text-xs">Value: {player.handValue}</p>
                          <p className="text-yellow-300 text-xs">Bet: {player.currentBet}</p>
                          {player.isBusted && <p className="text-red-300 text-xs font-bold">BUST!</p>}
                          {player.isStanding && !player.isBusted && <p className="text-blue-300 text-xs font-bold">STANDING</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Single Player
                <div className="flex flex-col items-center">
                  <div className="flex gap-2 mb-4">
                    {myHand.map((card, idx) => (
                      <div
                        key={idx}
                        className="w-20 h-28 bg-white rounded-lg shadow-2xl flex flex-col items-center justify-center border-2 border-gray-300"
                        style={{ 
                          animation: 'cardDeal 0.3s ease-out forwards',
                          animationDelay: `${(idx + 2) * 0.1}s`,
                          opacity: 0
                        }}
                      >
                        <div className={`text-2xl ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-500' : 'text-black'}`}>
                          {card.suit}
                        </div>
                        <div className={`text-xl font-bold ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-500' : 'text-black'}`}>
                          {card.value}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-green-700 px-6 py-3 rounded-lg border-2 border-yellow-600">
                    <p className="text-yellow-300 text-xl font-bold">Your Hand: {myHandValue}</p>
                    <p className="text-white text-sm">Bet: {currentBet} LosBucks</p>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            {canHit && !isDealing && isMyTurn && (
              <div className="relative flex justify-center gap-4 mt-8">
                <button
                  onClick={hit}
                  className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xl transition-all shadow-lg"
                >
                  HIT
                </button>
                <button
                  onClick={stand}
                  className="px-8 py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xl transition-all shadow-lg"
                >
                  STAND
                </button>
              </div>
            )}
            
            {!isMyTurn && socket && (
              <div className="relative text-center mt-8">
                <p className="text-yellow-300 text-xl font-bold animate-pulse">
                  Waiting for {players.find(p => p.id === currentTurn)?.name || 'other player'}...
                </p>
              </div>
            )}
          </div>
        </div>

        <style jsx>{`
          @keyframes cardDeal {
            0% {
              opacity: 0;
              transform: translateY(-100px) rotate(-10deg);
            }
            100% {
              opacity: 1;
              transform: translateY(0) rotate(0);
            }
          }
        `}</style </button>
            </div>
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
