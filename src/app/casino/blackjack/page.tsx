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
  const [selectedChip, setSelectedChip] = useState(25);
  const [sideBets, setSideBets] = useState({ perfectPairs: 0, twentyOnePlus3: 0 });
  const [sideBetResults, setSideBetResults] = useState({ perfectPairs: '', twentyOnePlus3: '', perfectPairsWin: 0, twentyOnePlus3Win: 0 });
  const [showDealerHole, setShowDealerHole] = useState(false);
  const [hasDoubled, setHasDoubled] = useState(false);
  const [canDouble, setCanDouble] = useState(false);
  const [canSplit, setCanSplit] = useState(false);
  const [currentTurn, setCurrentTurn] = useState<string | null>(null);
  const [isMyTurn, setIsMyTurn] = useState(false);

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

      newSocket.on('casinoPlayersUpdate', ({ players }: { players: Player[] }) => {
        setPlayers(players);
      });

      newSocket.on('casinoTurnUpdate', ({ currentTurn }: { currentTurn: string }) => {
        setCurrentTurn(currentTurn);
        setIsMyTurn(currentTurn === newSocket.id);
      });

      newSocket.on('casinoGameStarted', () => {
        setGameState('betting');
      });

      newSocket.on('casinoDealCards', ({ players, dealer, currentTurn }: { players: Player[]; dealer: { hand: Card[]; value: number }; currentTurn: string }) => {
        setPlayers(players);
        setDealerHand([dealer.hand[0]]); // Only show one dealer card initially
        setDealerHandValue(dealer.hand[0].numValue);
        setShowDealerHole(false);
        const me = players.find(p => p.id === newSocket.id);
        if (me) {
          setMyHand(me.hand);
          const playerVal = calculateHandValue(me.hand);
          setMyHandValue(playerVal);
          
          // Check for blackjack or set turn abilities
          if (playerVal === 21) {
            setCanHit(false);
            setCanDouble(false);
            setCanSplit(false);
          } else {
            setCanDouble(me.balance >= me.currentBet && me.hand.length === 2);
            setCanSplit(me.hand.length === 2 && me.hand[0].value === me.hand[1].value && me.balance >= me.currentBet);
          }
        }
        setIsDealing(false);
        setCurrentTurn(currentTurn);
        setIsMyTurn(currentTurn === newSocket.id);
        setGameState('playing');
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
      // Allow starting with 1-3 players
      socket.emit('casinoStartGame', { roomId });
    } else {
      // Single player mode
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
        socket.emit('casinoPlaceBet', { roomId, bet });
      } else {
        // Single player - deal cards immediately
        dealInitialCards(bet);
      }
    }
  };

  const addChipToBet = (area: 'main' | 'perfectPairs' | 'twentyOnePlus3') => {
    const totalBet = parseInt(betInput || '0') + sideBets.perfectPairs + sideBets.twentyOnePlus3;
    if (totalBet + selectedChip > balance) return;
    
    if (area === 'main') {
      setBetInput(String(parseInt(betInput || '0') + selectedChip));
    } else if (area === 'perfectPairs') {
      setSideBets({ ...sideBets, perfectPairs: sideBets.perfectPairs + selectedChip });
    } else if (area === 'twentyOnePlus3') {
      setSideBets({ ...sideBets, twentyOnePlus3: sideBets.twentyOnePlus3 + selectedChip });
    }
  };

  const clearBets = () => {
    setBetInput('0');
    setSideBets({ perfectPairs: 0, twentyOnePlus3: 0 });
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
      const playerVal = calculateHandValue(playerHand);
      setMyHandValue(playerVal);
      setDealerHandValue(dealerCard1.numValue);
      setIsDealing(false);
      setShowDealerHole(false);
      setHasDoubled(false);
      
      // Check for blackjack (21 with 2 cards)
      const dealerVal = calculateHandValue(dealerHandInitial);
      if (playerVal === 21 || dealerVal === 21) {
        // Instant blackjack - reveal dealer and determine winner
        setCanHit(false);
        setCanDouble(false);
        setCanSplit(false);
        setTimeout(() => {
          setDealerHand(dealerHandInitial);
          setDealerHandValue(dealerVal);
          setShowDealerHole(true);
          setTimeout(() => {
            handleBlackjack(playerVal, dealerVal, bet);
          }, 1000);
        }, 1500);
      } else {
        setCanHit(true);
        // Can double on any first two cards
        setCanDouble(balance >= bet);
        // Can split if cards have same value
        setCanSplit(playerCard1.value === playerCard2.value && balance >= bet);
      }
      
      // Store full dealer hand in state for later
      (window as any).dealerFullHand = dealerHandInitial;
      (window as any).gameDeck = deck;
      
      // Check side bets
      checkSideBets(playerHand, dealerCard1);
    }, 1000);
  };

  const handleBlackjack = (playerValue: number, dealerValue: number, bet: number) => {
    let message = '';
    let winAmount = 0;
    
    if (playerValue === 21 && dealerValue === 21) {
      message = 'Push - Both Blackjack!';
      winAmount = bet; // Return bet
    } else if (playerValue === 21) {
      message = 'Blackjack! You win!';
      winAmount = bet + Math.floor(bet * 1.5); // Blackjack pays 3:2
    } else if (dealerValue === 21) {
      message = 'Dealer Blackjack. You lose.';
      winAmount = 0;
    }
    
    setBalance(balance + winAmount);
    setResultMessage(message);
    setGameState('results');
  };

  const checkSideBets = (playerHand: Card[], dealerUpCard: Card) => {
    let ppResult = '';
    let ppWin = 0;
    let tp3Result = '';
    let tp3Win = 0;
    
    // Perfect Pairs - checks if player's first two cards are a pair
    if (sideBets.perfectPairs > 0) {
      const card1 = playerHand[0];
      const card2 = playerHand[1];
      
      if (card1.value === card2.value && card1.suit === card2.suit) {
        ppResult = 'Perfect Pair!';
        ppWin = sideBets.perfectPairs * 25; // 25:1
      } else if (card1.value === card2.value && (card1.suit === '♥️' || card1.suit === '♦️') === (card2.suit === '♥️' || card2.suit === '♦️')) {
        ppResult = 'Colored Pair!';
        ppWin = sideBets.perfectPairs * 12; // 12:1
      } else if (card1.value === card2.value) {
        ppResult = 'Mixed Pair!';
        ppWin = sideBets.perfectPairs * 6; // 6:1
      } else {
        ppResult = 'No pair';
      }
    }
    
    // 21+3 - checks for poker hands with player's first two cards and dealer's up card
    if (sideBets.twentyOnePlus3 > 0) {
      const cards = [playerHand[0], playerHand[1], dealerUpCard];
      const values = cards.map(c => c.value).sort();
      const suits = cards.map(c => c.suit);
      const allSameSuit = suits.every(s => s === suits[0]);
      
      // Check for straight
      const valueOrder = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
      const indices = values.map(v => valueOrder.indexOf(v));
      const sortedIndices = [...indices].sort((a, b) => a - b);
      const isStraight = sortedIndices.every((val, i, arr) => i === 0 || val === arr[i-1] + 1) || 
                         (sortedIndices[0] === 0 && sortedIndices[1] === 11 && sortedIndices[2] === 12); // A-Q-K
      
      // Check for three of a kind
      const isThreeOfKind = values.every(v => v === values[0]);
      
      if (isThreeOfKind && allSameSuit) {
        tp3Result = 'Suited Trips!';
        tp3Win = sideBets.twentyOnePlus3 * 100; // 100:1
      } else if (isStraight && allSameSuit) {
        tp3Result = 'Straight Flush!';
        tp3Win = sideBets.twentyOnePlus3 * 40; // 40:1
      } else if (isThreeOfKind) {
        tp3Result = 'Three of a Kind!';
        tp3Win = sideBets.twentyOnePlus3 * 30; // 30:1
      } else if (isStraight) {
        tp3Result = 'Straight!';
        tp3Win = sideBets.twentyOnePlus3 * 10; // 10:1
      } else if (allSameSuit) {
        tp3Result = 'Flush!';
        tp3Win = sideBets.twentyOnePlus3 * 5; // 5:1
      } else {
        tp3Result = 'No winning hand';
      }
    }
    
    setSideBetResults({ perfectPairs: ppResult, twentyOnePlus3: tp3Result, perfectPairsWin: ppWin, twentyOnePlus3Win: tp3Win });
    
    // Add side bet winnings immediately
    if (ppWin > 0 || tp3Win > 0) {
      setBalance(prev => prev + ppWin + tp3Win);
    }
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
      if (!isMyTurn) return; // Can only hit on your turn
      socket.emit('casinoHit', { roomId });
      setCanDouble(false); // Can't double after hitting
      setCanSplit(false); // Can't split after hitting
    } else {
      const deck = (window as any).gameDeck as Card[];
      const newCard = deck.pop()!;
      const newHand = [...myHand, newCard];
      setMyHand(newHand);
      const newValue = calculateHandValue(newHand);
      setMyHandValue(newValue);
      
      // Can't double or split after hitting
      setCanDouble(false);
      setCanSplit(false);
      
      if (newValue > 21) {
        // Busted - don't play dealer, just end game
        setCanHit(false);
        setShowDealerHole(true);
        const dealerFullHand = (window as any).dealerFullHand as Card[];
        setDealerHand(dealerFullHand);
        setDealerHandValue(calculateHandValue(dealerFullHand));
        setTimeout(() => {
          determineWinner(newValue, calculateHandValue(dealerFullHand));
        }, 1500);
      }
    }
  };

  const stand = () => {
    setCanHit(false);
    setCanDouble(false);
    setCanSplit(false);
    
    if (socket) {
      if (!isMyTurn) return; // Can only stand on your turn
      socket.emit('casinoStand', { roomId });
    } else {
      setShowDealerHole(true);
      // Only play dealer if player hasn't busted
      if (myHandValue > 21) {
        const dealerFullHand = (window as any).dealerFullHand as Card[];
        setDealerHand(dealerFullHand);
        setDealerHandValue(calculateHandValue(dealerFullHand));
        setTimeout(() => {
          determineWinner(myHandValue, calculateHandValue(dealerFullHand));
        }, 1000);
        return;
      }
      
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

  const doubleDown = () => {
    if (socket) {
      if (!isMyTurn) return; // Can only double on your turn
      socket.emit('casinoDoubleDown', { roomId });
      setCanHit(false);
      setCanDouble(false);
      setCanSplit(false);
      return;
    }
    
    if (balance < currentBet) return;
    
    // Double the bet (single player)
    setBalance(balance - currentBet);
    setBetAmount(currentBet * 2);
    setHasDoubled(true);
    setCanDouble(false);
    setCanSplit(false);
    
    // Take exactly one card
    const deck = (window as any).gameDeck as Card[];
    const newCard = deck.pop()!;
    const newHand = [...myHand, newCard];
    setMyHand(newHand);
    const newValue = calculateHandValue(newHand);
    setMyHandValue(newValue);
    setCanHit(false);
    
    // Automatically stand after double
    setTimeout(() => {
      setShowDealerHole(true);
      
      if (newValue > 21) {
        // Busted - don't play dealer
        const dealerFullHand = (window as any).dealerFullHand as Card[];
        setDealerHand(dealerFullHand);
        setDealerHandValue(calculateHandValue(dealerFullHand));
        setTimeout(() => {
          determineWinner(newValue, calculateHandValue(dealerFullHand));
        }, 1000);
      } else {
        // Play dealer
        const dealerFullHand = (window as any).dealerFullHand as Card[];
        setDealerHand(dealerFullHand);
        let dealerValue = calculateHandValue(dealerFullHand);
        setDealerHandValue(dealerValue);
        const gameDeck = (window as any).gameDeck as Card[];
        
        const dealerPlay = () => {
          if (dealerValue < 17) {
            setTimeout(() => {
              const card = gameDeck.pop()!;
              dealerFullHand.push(card);
              setDealerHand([...dealerFullHand]);
              dealerValue = calculateHandValue(dealerFullHand);
              setDealerHandValue(dealerValue);
              dealerPlay();
            }, 1000);
          } else {
            setTimeout(() => {
              determineWinner(newValue, dealerValue);
            }, 1000);
          }
        };
        
        dealerPlay();
      }
    }, 1500);
  };

  const split = () => {
    // For now, show a message that split is not yet implemented in this version
    // Full split implementation would require managing two separate hands
    alert('Split functionality coming soon! For now, please Hit or Stand.');
  };

  const determineWinner = (playerValue: number, dealerValue: number) => {
    let message = '';
    let winAmount = 0;
    const finalBet = currentBet; // Use current bet (which may be doubled)
    
    if (playerValue > 21) {
      message = 'Bust! You lose.';
      winAmount = 0;
    } else if (dealerValue > 21) {
      message = 'Dealer busts! You win!';
      winAmount = finalBet * 2;
    } else if (playerValue > dealerValue) {
      message = 'You win!';
      winAmount = finalBet * 2;
    } else if (playerValue < dealerValue) {
      message = 'Dealer wins.';
      winAmount = 0;
    } else {
      message = 'Push! Bet returned.';
      winAmount = finalBet;
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
    setHasDoubled(false);
    setCanDouble(false);
    setCanSplit(false);
    setSideBets({ perfectPairs: 0, twentyOnePlus3: 0 });
    setSideBetResults({ perfectPairs: '', twentyOnePlus3: '', perfectPairsWin: 0, twentyOnePlus3Win: 0 });
    setShowDealerHole(false);
    setBetInput('100');
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
            <>
              <p className="text-white/60 text-sm mb-4 text-center">
                {players.length === 1 ? 'You can start alone or wait for others to join (max 3 players)' : `${players.length}/3 players ready`}
              </p>
              <button
                onClick={startGame}
                disabled={players.length > 3}
                className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white rounded-xl font-bold text-lg transition-all"
              >
                Start Game {players.length > 1 && `(${players.length} Players)`}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Betting State
  if (gameState === 'betting') {
    const totalBet = parseInt(betInput || '0') + sideBets.perfectPairs + sideBets.twentyOnePlus3;
    
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
              <h1 className="text-5xl font-bold text-yellow-600/30 mb-2" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.3)' }}>BLACKJACK PAYS 3 TO 2</h1>
              <p className="text-xl text-yellow-600/25" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.3)' }}>Dealer stands on all 17 and above</p>
              <p className="text-xl text-yellow-600/25 mt-1" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.3)' }}>INSURANCE PAYS 2 TO 1</p>
            </div>

            {/* Betting Areas */}
            <div className="relative flex justify-center items-end gap-8 mb-8">
              {/* Side Bet: Perfect Pairs */}
              <div className="flex flex-col items-center">
                <div 
                  onClick={() => addChipToBet('perfectPairs')}
                  className="w-36 h-36 rounded-full border-4 border-yellow-600/40 bg-green-700/80 flex flex-col items-center justify-center cursor-pointer hover:border-yellow-500/60 transition-all relative shadow-inner"
                >
                  <span className="text-yellow-600/50 text-sm font-bold">PERFECT</span>
                  <span className="text-yellow-600/50 text-sm font-bold">PAIRS</span>
                  {sideBets.perfectPairs > 0 && (
                    <div className="absolute -top-8 flex flex-col items-center">
                      {Array.from({ length: Math.min(Math.floor(sideBets.perfectPairs / 25), 5) }).map((_, i) => (
                        <div key={i} className="w-14 h-14 rounded-full bg-red-600 border-4 border-white flex items-center justify-center shadow-xl" style={{ marginTop: i > 0 ? '-40px' : '0', zIndex: 5 - i }}>
                          <span className="text-white font-bold text-xs">25</span>
                        </div>
                      ))}
                      <div className="mt-1 bg-black/70 px-3 py-1 rounded-full">
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
                  className="w-48 h-48 rounded-full border-4 border-yellow-600 bg-green-700/80 flex items-center justify-center cursor-pointer hover:border-yellow-500 transition-all relative shadow-inner"
                >
                  {parseInt(betInput || '0') === 0 && <span className="text-yellow-600/50 text-3xl font-bold">0</span>}
                  {parseInt(betInput || '0') > 0 && (
                    <div className="absolute -top-12 flex flex-col items-center">
                      {Array.from({ length: Math.min(Math.ceil(parseInt(betInput) / 100), 6) }).map((_, i) => {
                        const chipValue = parseInt(betInput) >= 500 ? 500 : parseInt(betInput) >= 250 ? 250 : parseInt(betInput) >= 100 ? 100 : parseInt(betInput) >= 50 ? 50 : 25;
                        const chipColor = chipValue === 500 ? 'bg-yellow-600' : chipValue === 250 ? 'bg-purple-600' : chipValue === 100 ? 'bg-green-600' : chipValue === 50 ? 'bg-blue-600' : 'bg-red-600';
                        return (
                          <div key={i} className={`w-16 h-16 rounded-full ${chipColor} border-4 border-white flex items-center justify-center shadow-xl`} style={{ marginTop: i > 0 ? '-48px' : '0', zIndex: 6 - i }}>
                            <span className="text-white font-bold">{chipValue}</span>
                          </div>
                        );
                      })}
                      <div className="mt-2 bg-black/70 px-4 py-1 rounded-full">
                        <span className="text-white font-bold text-lg">{betInput}</span>
                      </div>
                    </div>
                  )}
                </div>
                <span className="text-yellow-600 text-base mt-3 font-bold">MAIN BET</span>
              </div>

              {/* Side Bet: 21+3 */}
              <div className="flex flex-col items-center">
                <div 
                  onClick={() => addChipToBet('twentyOnePlus3')}
                  className="w-36 h-36 rounded-full border-4 border-yellow-600/40 bg-green-700/80 flex flex-col items-center justify-center cursor-pointer hover:border-yellow-500/60 transition-all relative shadow-inner"
                >
                  <span className="text-yellow-600/50 text-xl font-bold">21+3</span>
                  {sideBets.twentyOnePlus3 > 0 && (
                    <div className="absolute -top-8 flex flex-col items-center">
                      {Array.from({ length: Math.min(Math.floor(sideBets.twentyOnePlus3 / 25), 5) }).map((_, i) => (
                        <div key={i} className="w-14 h-14 rounded-full bg-green-600 border-4 border-white flex items-center justify-center shadow-xl" style={{ marginTop: i > 0 ? '-40px' : '0', zIndex: 5 - i }}>
                          <span className="text-white font-bold text-xs">25</span>
                        </div>
                      ))}
                      <div className="mt-1 bg-black/70 px-3 py-1 rounded-full">
                        <span className="text-white font-bold text-sm">{sideBets.twentyOnePlus3}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Chip Selection */}
            <div className="relative flex justify-center gap-3 mb-6">
              {[25, 50, 100, 250, 500].map((value) => (
                <button
                  key={value}
                  onClick={() => setSelectedChip(value)}
                  disabled={value > balance}
                  className={`relative transition-all ${selectedChip === value ? 'scale-110' : 'scale-100'} ${value > balance ? 'opacity-30' : 'hover:scale-105'}`}
                >
                  <div className={`w-14 h-14 rounded-full border-4 border-white shadow-lg flex items-center justify-center font-bold text-white ${
                    value === 25 ? 'bg-red-600' :
                    value === 50 ? 'bg-blue-600' :
                    value === 100 ? 'bg-green-600' :
                    value === 250 ? 'bg-purple-600' :
                    'bg-yellow-600'
                  }`}>
                    {value}
                  </div>
                  {selectedChip === value && (
                    <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-16 h-1 bg-yellow-400 rounded"></div>
                  )}
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="relative flex justify-center gap-4">
              <button
                onClick={clearBets}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all"
              >
                Clear Bets
              </button>
              <button
                onClick={placeBet}
                disabled={parseInt(betInput || '0') <= 0 || totalBet > balance}
                className="px-8 py-3 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white rounded-xl font-bold text-lg disabled:cursor-not-allowed transition-all"
              >
                Deal Cards
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Playing State
  if (gameState === 'playing') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'radial-gradient(ellipse at center, #0d5520 0%, #08350f 100%)' }}>
        <div className="max-w-6xl w-full">
          {/* Turn Indicator for Multiplayer */}
          {socket && (
            <div className="text-center mb-4">
              {isMyTurn ? (
                <div className="inline-block bg-green-600 px-6 py-3 rounded-full animate-pulse">
                  <p className="text-white font-bold text-xl">🎲 YOUR TURN 🎲</p>
                </div>
              ) : (
                <div className="inline-block bg-gray-700 px-6 py-3 rounded-full">
                  <p className="text-white/60 font-bold">Waiting for {players.find(p => p.id === currentTurn)?.name || 'other player'}...</p>
                </div>
              )}
            </div>
          )}
          
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
                <div className="inline-block bg-black/50 px-6 py-2 rounded-full">
                  <span className="text-yellow-300 text-2xl font-bold">DEALER: {showDealerHole ? dealerHandValue : '?'}</span>
                </div>
              </div>
              <div className="flex justify-center gap-3">
                {dealerHand.map((card, idx) => (
                  <div
                    key={idx}
                    className="relative w-24 h-36 bg-white rounded-xl shadow-2xl border-2 border-gray-400"
                    style={{ 
                      animation: 'cardDeal 0.3s ease-out forwards',
                      animationDelay: `${idx * 0.15}s`,
                      opacity: 0,
                      transform: 'perspective(1000px)'
                    }}
                  >
                    <div className="absolute top-2 left-2">
                      <div className={`text-3xl ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-600' : 'text-gray-900'}`}>
                        {card.value}
                      </div>
                      <div className={`text-2xl -mt-1 ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-600' : 'text-gray-900'}`}>
                        {card.suit}
                      </div>
                    </div>
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                      <div className={`text-6xl ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-600' : 'text-gray-900'}`}>
                        {card.suit}
                      </div>
                    </div>
                    <div className="absolute bottom-2 right-2 rotate-180">
                      <div className={`text-3xl ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-600' : 'text-gray-900'}`}>
                        {card.value}
                      </div>
                      <div className={`text-2xl -mt-1 ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-600' : 'text-gray-900'}`}>
                        {card.suit}
                      </div>
                    </div>
                  </div>
                ))}
                {/* Dealer hole card */}
                {!showDealerHole && dealerHand.length === 1 && (
                  <div
                    className="w-24 h-36 bg-gradient-to-br from-blue-900 to-red-900 rounded-xl shadow-2xl border-2 border-gray-400 flex items-center justify-center"
                    style={{ 
                      animation: 'cardDeal 0.3s ease-out forwards',
                      animationDelay: '0.15s',
                      opacity: 0,
                      backgroundImage: 'repeating-linear-gradient(45deg, #1e3a8a 0px, #1e3a8a 10px, #991b1b 10px, #991b1b 20px)'
                    }}
                  >
                    <div className="text-white text-4xl font-bold opacity-30">🂠</div>
                  </div>
                )}
              </div>
            </div>

            {/* Player Area */}
            <div className="relative">
              <div className="flex flex-col items-center">
                <div className="flex gap-3 mb-6">
                  {myHand.map((card, idx) => (
                    <div
                      key={idx}
                      className="relative w-24 h-36 bg-white rounded-xl shadow-2xl border-2 border-gray-400"
                      style={{ 
                        animation: 'cardDeal 0.3s ease-out forwards',
                        animationDelay: `${(idx + 2) * 0.15}s`,
                        opacity: 0,
                        transform: 'perspective(1000px)'
                      }}
                    >
                      <div className="absolute top-2 left-2">
                        <div className={`text-3xl ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-600' : 'text-gray-900'}`}>
                          {card.value}
                        </div>
                        <div className={`text-2xl -mt-1 ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-600' : 'text-gray-900'}`}>
                          {card.suit}
                        </div>
                      </div>
                      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                        <div className={`text-6xl ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-600' : 'text-gray-900'}`}>
                          {card.suit}
                        </div>
                      </div>
                      <div className="absolute bottom-2 right-2 rotate-180">
                        <div className={`text-3xl ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-600' : 'text-gray-900'}`}>
                          {card.value}
                        </div>
                        <div className={`text-2xl -mt-1 ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-600' : 'text-gray-900'}`}>
                          {card.suit}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-black/70 px-8 py-4 rounded-2xl border-2 border-yellow-600 shadow-xl">
                  <p className="text-yellow-300 text-2xl font-bold mb-1">YOUR HAND: {myHandValue}</p>
                  <p className="text-white text-lg">Main Bet: {currentBet} LosBucks</p>
                  
                  {/* Side Bet Results */}
                  {(sideBetResults.perfectPairs || sideBetResults.twentyOnePlus3) && (
                    <div className="mt-3 pt-3 border-t border-yellow-600/30">
                      {sideBetResults.perfectPairs && (
                        <div className={`text-sm mb-1 ${sideBetResults.perfectPairsWin > 0 ? 'text-green-400 font-bold' : 'text-red-400'}`}>
                          Perfect Pairs: {sideBetResults.perfectPairs} {sideBetResults.perfectPairsWin > 0 && `+${sideBetResults.perfectPairsWin} LosBucks!`}
                        </div>
                      )}
                      {sideBetResults.twentyOnePlus3 && (
                        <div className={`text-sm ${sideBetResults.twentyOnePlus3Win > 0 ? 'text-green-400 font-bold' : 'text-red-400'}`}>
                          21+3: {sideBetResults.twentyOnePlus3} {sideBetResults.twentyOnePlus3Win > 0 && `+${sideBetResults.twentyOnePlus3Win} LosBucks!`}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            {canHit && !isDealing && (!socket || isMyTurn) && (
              <div className="relative flex justify-center gap-3 mt-8 flex-wrap">
                <button
                  onClick={hit}
                  disabled={socket !== null && !isMyTurn}
                  className="px-8 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xl transition-all shadow-lg"
                >
                  HIT
                </button>
                <button
                  onClick={stand}
                  disabled={socket !== null && !isMyTurn}
                  className="px-8 py-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xl transition-all shadow-lg"
                >
                  STAND
                </button>
                {canDouble && (
                  <button
                    onClick={doubleDown}
                    disabled={socket !== null && !isMyTurn}
                    className="px-6 py-4 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xl transition-all shadow-lg"
                  >
                    DOUBLE DOWN
                  </button>
                )}
                {canSplit && (
                  <button
                    onClick={split}
                    disabled={socket !== null && !isMyTurn}
                    className="px-6 py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xl transition-all shadow-lg"
                  >
                    SPLIT
                  </button>
                )}
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
        `}</style>
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
