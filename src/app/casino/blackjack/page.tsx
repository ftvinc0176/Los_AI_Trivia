'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
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
  sideBets?: { perfectPairs: number; twentyOnePlus3: number };
  sideBetResults?: {
    perfectPairs?: { name: string; betAmount: number; win: number; lost: boolean } | null;
    twentyOnePlus3?: { name: string; betAmount: number; win: number; lost: boolean } | null;
  };
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
  const [balance, setBalance] = useState(25000);
  const [currentBet, setBetAmount] = useState(0);
  const [betInput, setBetInput] = useState('');
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
  const [publicLobbies, setPublicLobbies] = useState<Array<{ roomId: string; playerCount: number; maxPlayers: number }>>([]);
  const [roundResults, setRoundResults] = useState<Record<string, string>>({});

  useEffect(() => {
    if (mode !== 'single') {
      const socketUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
      const newSocket = io(socketUrl);
      setSocket(newSocket);

      newSocket.on('casinoLobbyCreated', ({ roomId, players }: { roomId: string; players: Player[] }) => {
        setRoomId(roomId);
        setPlayers(players);
        setGameState('lobby');
      });

      newSocket.on('casinoPlayerJoined', ({ players }: { players: Player[] }) => {
        setPlayers(players);
      });

      newSocket.on('casinoGameState', ({ state, players, dealer }: { state: string; players: Player[]; dealer: any }) => {
        // Handle joining mid-game
        setPlayers(players);
        if (state === 'betting') {
          setGameState('betting');
        } else if (state === 'playing' || state === 'results') {
          // Player joined mid-round, show them the table but they wait
          setGameState('playing');
          setDealerHand(dealer.hand || []);
          setDealerHandValue(dealer.value || 0);
        }
      });

      newSocket.on('casinoPlayersUpdate', ({ players }: { players: Player[] }) => {
        setPlayers(players);
      });

      newSocket.on('casinoTurnUpdate', ({ currentTurn }: { currentTurn: string }) => {
        setCurrentTurn(currentTurn);
        setIsMyTurn(currentTurn === newSocket.id);
      });

      newSocket.on('casinoPublicLobbies', ({ lobbies }: { lobbies: Array<{ roomId: string; playerCount: number; maxPlayers: number }> }) => {
        setPublicLobbies(lobbies);
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
        console.log('Received casinoRoundEnd, players:', players.map((p: Player) => ({ 
          name: p.name, 
          sideBetResults: p.sideBetResults 
        })));
        
        setPlayers(players);
        setDealerHand(dealer.hand);
        setDealerHandValue(dealer.value);
        setShowDealerHole(true);
        setRoundResults(results);
        const me = players.find((p: Player) => p.id === newSocket.id);
        if (me && newSocket.id) {
          setBalance(me.balance);
        }
        // Stay in 'playing' state to show results on table
      });

      newSocket.on('casinoNewHandStarted', () => {
        setRoundResults({});
        setShowDealerHole(false);
        setCanHit(true);
        setDealerHand([]);
        setDealerHandValue(0);
        setMyHand([]);
        setMyHandValue(0);
        setSideBets({ perfectPairs: 0, twentyOnePlus3: 0 });
        setBetInput('');
        setGameState('betting');
      });

      newSocket.on('casinoKicked', ({ reason }: { reason: string }) => {
        alert(`You have been removed from the lobby: ${reason}`);
        router.push('/casino');
      });

      return () => {
        newSocket.close();
      };
    }
  }, [mode]);

  const fetchPublicLobbies = useCallback(() => {
    if (socket) {
      socket.emit('getCasinoPublicLobbies');
    }
  }, [socket]);

  useEffect(() => {
    if (mode === 'browse' && socket) {
      fetchPublicLobbies();
      // Refresh lobby list every 3 seconds
      const interval = setInterval(fetchPublicLobbies, 3000);
      return () => clearInterval(interval);
    }
  }, [mode, socket, fetchPublicLobbies]);

  const createLobby = () => {
    if (socket && playerName) {
      socket.emit('casinoCreateLobby', { playerName, isPublic: false });
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

  const joinPublicLobby = (lobbyRoomId: string) => {
    if (socket && playerName) {
      socket.emit('casinoJoinLobby', { roomId: lobbyRoomId, playerName });
      setRoomId(lobbyRoomId);
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

  const nextHand = () => {
    if (socket) {
      // Multiplayer - emit to server so all players get reset
      socket.emit('casinoNextHand', { roomId });
    } else {
      // Single player - reset locally
      setRoundResults({});
      setShowDealerHole(false);
      setCanHit(true);
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
    setShowDealerHole(true);
    setRoundResults({ 'single': message });
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
    setShowDealerHole(true);
    setRoundResults({ 'single': message });
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
    setBetInput('');
    setGameState('betting');
  };

  // Lobby State
  if (mode !== 'single' && gameState === 'lobby' && !roomId) {
    // Browse mode - show public lobbies
    if (mode === 'browse') {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20">
            <h1 className="text-4xl font-bold text-white mb-8 text-center">🎰 Public Casino Lobbies</h1>
            
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
                  onClick={fetchPublicLobbies}
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
                          <p className="text-white font-bold text-lg">Lobby {lobby.roomId}</p>
                          <p className="text-white/60 text-sm">{lobby.playerCount}/{lobby.maxPlayers} players</p>
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
              onClick={() => router.push('/casino')}
              className="w-full text-white/60 hover:text-white"
            >
              ← Back to Casino
            </button>
          </div>
        </div>
      );
    }

    // Create or Join mode
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
      <div className="min-h-screen flex items-center justify-center p-2 sm:p-4 overflow-hidden" style={{ background: 'radial-gradient(ellipse at center, #0d5520 0%, #08350f 100%)' }}>
        <div className="max-w-6xl w-full">
          {/* Balance Display */}
          <div className="text-center mb-3 sm:mb-6">
            <p className="text-yellow-300 text-xl sm:text-3xl font-bold">{balance} LosBucks</p>
          </div>

          {/* Betting Table */}
          <div className="relative bg-green-800 rounded-[60px] sm:rounded-[200px] border-4 sm:border-8 border-yellow-900 p-3 sm:p-8 md:p-12 shadow-2xl overflow-hidden">
            <div className="absolute inset-0 rounded-[60px] sm:rounded-[200px] bg-gradient-to-br from-green-700 to-green-900 opacity-50"></div>
            
            {/* Table Text */}
            <div className="relative text-center mb-2 sm:mb-4 md:mb-8">
              <h1 className="text-sm sm:text-2xl md:text-5xl font-bold text-yellow-600/30 mb-1" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.3)' }}>BLACKJACK PAYS 3 TO 2</h1>
              <p className="text-[10px] sm:text-sm md:text-xl text-yellow-600/25 hidden sm:block" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.3)' }}>Dealer stands on all 17 and above</p>
              <p className="text-[10px] sm:text-sm md:text-xl text-yellow-600/25 mt-1 hidden sm:block" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.3)' }}>INSURANCE PAYS 2 TO 1</p>
            </div>

            {/* Betting Areas */}
            <div className="relative flex justify-center items-end gap-1 sm:gap-4 md:gap-8 mb-3 sm:mb-8">
              {/* Side Bet: Perfect Pairs */}
              <div className="flex flex-col items-center">
                <div 
                  onClick={() => addChipToBet('perfectPairs')}
                  className="w-20 h-20 sm:w-36 sm:h-36 rounded-full border-2 sm:border-4 border-yellow-600/40 bg-green-700/80 flex flex-col items-center justify-center cursor-pointer hover:border-yellow-500/60 transition-all relative shadow-inner"
                >
                  <span className="text-yellow-600/50 text-[8px] sm:text-sm font-bold">PERFECT</span>
                  <span className="text-yellow-600/50 text-[8px] sm:text-sm font-bold">PAIRS</span>
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
                  className="w-28 h-28 sm:w-48 sm:h-48 rounded-full border-2 sm:border-4 border-yellow-600 bg-green-700/80 flex items-center justify-center cursor-pointer hover:border-yellow-500 transition-all relative shadow-inner"
                >
                  {parseInt(betInput || '0') === 0 && <span className="text-yellow-600/50 text-xl sm:text-3xl font-bold">0</span>}
                  {parseInt(betInput || '0') > 0 && (
                    <div className="absolute -top-8 sm:-top-12 flex flex-col items-center">
                      {Array.from({ length: Math.min(Math.ceil(parseInt(betInput) / 100), 6) }).map((_, i) => {
                        const chipValue = parseInt(betInput) >= 500 ? 500 : parseInt(betInput) >= 250 ? 250 : parseInt(betInput) >= 100 ? 100 : parseInt(betInput) >= 50 ? 50 : 25;
                        const chipColor = chipValue === 500 ? 'bg-yellow-600' : chipValue === 250 ? 'bg-purple-600' : chipValue === 100 ? 'bg-green-600' : chipValue === 50 ? 'bg-blue-600' : 'bg-red-600';
                        return (
                          <div key={i} className={`w-10 h-10 sm:w-16 sm:h-16 rounded-full ${chipColor} border-2 sm:border-4 border-white flex items-center justify-center shadow-xl`} style={{ marginTop: i > 0 ? '-30px' : '0', zIndex: 6 - i }}>
                            <span className="text-white font-bold text-xs sm:text-base">{chipValue}</span>
                          </div>
                        );
                      })}
                      <div className="mt-1 sm:mt-2 bg-black/70 px-2 sm:px-4 py-1 rounded-full">
                        <span className="text-white font-bold text-sm sm:text-lg">{betInput}</span>
                      </div>
                    </div>
                  )}
                </div>
                <span className="text-yellow-600 text-xs sm:text-base mt-1 sm:mt-3 font-bold">MAIN BET</span>
              </div>

              {/* Side Bet: 21+3 */}
              <div className="flex flex-col items-center">
                <div 
                  onClick={() => addChipToBet('twentyOnePlus3')}
                  className="w-20 h-20 sm:w-36 sm:h-36 rounded-full border-2 sm:border-4 border-yellow-600/40 bg-green-700/80 flex flex-col items-center justify-center cursor-pointer hover:border-yellow-500/60 transition-all relative shadow-inner"
                >
                  <span className="text-yellow-600/50 text-sm sm:text-xl font-bold">21+3</span>
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
            <div className="relative flex justify-center gap-1 sm:gap-3 mb-3 sm:mb-6">
              {[25, 50, 100, 250, 500].map((value) => (
                <button
                  key={value}
                  onClick={() => setSelectedChip(value)}
                  disabled={value > balance}
                  className={`relative transition-all ${selectedChip === value ? 'scale-110' : 'scale-100'} ${value > balance ? 'opacity-30' : 'hover:scale-105'}`}
                >
                  <div className={`w-10 h-10 sm:w-14 sm:h-14 rounded-full border-2 sm:border-4 border-white shadow-lg flex items-center justify-center font-bold text-white text-xs sm:text-base ${
                    value === 25 ? 'bg-red-600' :
                    value === 50 ? 'bg-blue-600' :
                    value === 100 ? 'bg-green-600' :
                    value === 250 ? 'bg-purple-600' :
                    'bg-yellow-600'
                  }`}>
                    {value}
                  </div>
                  {selectedChip === value && (
                    <div className="absolute -bottom-1 sm:-bottom-2 left-1/2 transform -translate-x-1/2 w-10 sm:w-16 h-1 bg-yellow-400 rounded"></div>
                  )}
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="relative flex justify-center gap-2 sm:gap-4">
              <button
                onClick={clearBets}
                className="px-4 sm:px-6 py-2 sm:py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm sm:text-base transition-all"
              >
                Clear Bets
              </button>
              <button
                onClick={placeBet}
                disabled={parseInt(betInput || '0') <= 0 || totalBet > balance}
                className="px-5 sm:px-8 py-2 sm:py-3 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white rounded-xl font-bold text-sm sm:text-lg disabled:cursor-not-allowed transition-all"
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
      <div className="min-h-screen flex items-center justify-center p-2 sm:p-4 overflow-hidden" style={{ background: 'radial-gradient(ellipse at center, #0d5520 0%, #08350f 100%)' }}>
        <div className="max-w-6xl w-full px-2 sm:px-0">
          {/* Turn Indicator for Multiplayer */}
          {socket && (
            <div className="text-center mb-2 sm:mb-4">
              {isMyTurn ? (
                <div className="inline-block bg-green-600 px-4 sm:px-6 py-2 sm:py-3 rounded-full animate-pulse">
                  <p className="text-white font-bold text-sm sm:text-xl">🎲 YOUR TURN 🎲</p>
                </div>
              ) : (
                <div className="inline-block bg-gray-700 px-4 sm:px-6 py-2 sm:py-3 rounded-full">
                  <p className="text-white/60 font-bold text-xs sm:text-base">Waiting for {players.find(p => p.id === currentTurn)?.name || 'other player'}...</p>
                </div>
              )}
            </div>
          )}
          
          {/* Balance Display */}
          <div className="text-center mb-3 sm:mb-6">
            <p className="text-yellow-300 text-xl sm:text-2xl font-bold">{balance} LosBucks</p>
          </div>

          {/* Game Table */}
          <div className="relative bg-green-800 rounded-[60px] sm:rounded-[200px] border-4 sm:border-8 border-yellow-900 p-4 sm:p-8 md:p-12 shadow-2xl min-h-[400px] sm:min-h-[600px] overflow-hidden">
            <div className="absolute inset-0 rounded-[60px] sm:rounded-[200px] bg-gradient-to-br from-green-700 to-green-900 opacity-50"></div>
            
            {/* Dealer Area */}
            <div className="relative mb-8 sm:mb-16">
              <div className="text-center mb-2 sm:mb-4">
                <div className="inline-block bg-black/50 px-3 sm:px-6 py-1 sm:py-2 rounded-full">
                  <span className="text-yellow-300 text-base sm:text-2xl font-bold">DEALER: {showDealerHole ? dealerHandValue : '?'}</span>
                </div>
              </div>
              <div className="flex justify-center gap-1 sm:gap-3">
                {dealerHand.map((card, idx) => (
                  <div
                    key={idx}
                    className="relative w-16 h-24 sm:w-24 sm:h-36 bg-white rounded-lg sm:rounded-xl shadow-2xl border-2 border-gray-400"
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

            {/* Players Area - Show all players in multiplayer */}
            <div className="relative">
              {socket && players.length > 1 ? (
                /* Multiplayer: Show all players */
                <div className="flex flex-wrap justify-center items-end gap-2 sm:gap-4 max-w-full">
                  {players.map((player) => {
                    const isMe = player.id === myPlayerId;
                    const isTurn = player.id === currentTurn;
                    const result = roundResults[player.id];
                    const isWaiting = !player.currentBet || player.currentBet === 0;
                    
                    return (
                      <div key={player.id} className="flex flex-col items-center min-w-[100px] max-w-[180px]">
                        {/* Waiting Message for Late Joiners */}
                        {isWaiting && !result && (
                          <div className="mb-2 px-2 py-1 rounded-lg font-bold text-center text-xs sm:text-sm bg-blue-600 text-white max-w-full">
                            <div className="break-words">Waiting for next hand...</div>
                          </div>
                        )}
                        
                        {/* Result Message Above Hand */}
                        {result && (
                          <div className="mb-2 max-w-full space-y-1">
                            {/* Main Hand Result */}
                            <div className={`px-2 py-1 rounded-lg font-bold text-center text-xs sm:text-sm ${
                              result.includes('Won') 
                                ? 'bg-green-600 text-white' 
                                : result.includes('Push') 
                                  ? 'bg-yellow-600 text-black' 
                                  : 'bg-red-600 text-white'
                            }`}>
                              {result}
                            </div>
                          </div>
                        )}
                        
                        {/* Show Side Bet Results when round ends */}
                        {result && player.sideBetResults && (
                          <div className="mb-2 space-y-1">
                            {player.sideBetResults.perfectPairs && (
                              <div className={`px-2 py-1 rounded text-[10px] sm:text-xs font-semibold text-center ${
                                player.sideBetResults.perfectPairs.lost 
                                  ? 'bg-red-500 text-white' 
                                  : 'bg-green-500 text-white'
                              }`}>
                                {player.sideBetResults.perfectPairs.lost 
                                  ? `Perfect Pairs: ${player.sideBetResults.perfectPairs.name}` 
                                  : `${player.sideBetResults.perfectPairs.name} +${player.sideBetResults.perfectPairs.win}`
                                }
                              </div>
                            )}
                            {player.sideBetResults.twentyOnePlus3 && (
                              <div className={`px-2 py-1 rounded text-[10px] sm:text-xs font-semibold text-center ${
                                player.sideBetResults.twentyOnePlus3.lost 
                                  ? 'bg-red-500 text-white' 
                                  : 'bg-green-500 text-white'
                              }`}>
                                {player.sideBetResults.twentyOnePlus3.lost 
                                  ? `21+3: ${player.sideBetResults.twentyOnePlus3.name}` 
                                  : `${player.sideBetResults.twentyOnePlus3.name} +${player.sideBetResults.twentyOnePlus3.win}`
                                }
                              </div>
                            )}
                          </div>
                        )}
                        
                        <div className="flex gap-1 sm:gap-2 mb-2 sm:mb-4 flex-wrap justify-center max-w-full">
                          {!isWaiting && player.hand.map((card, idx) => (
                            <div
                              key={idx}
                              className="relative w-12 h-16 sm:w-20 sm:h-28 bg-white rounded-lg shadow-xl border border-gray-400 flex-shrink-0"
                              style={{ 
                                animation: 'cardDeal 0.3s ease-out forwards',
                                animationDelay: `${(idx + 2) * 0.15}s`,
                                opacity: 0,
                                transform: 'perspective(1000px)'
                              }}
                            >
                              <div className="absolute top-0.5 sm:top-1 left-0.5 sm:left-1">
                                <div className={`text-xs sm:text-2xl ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-600' : 'text-gray-900'}`}>
                                  {card.value}
                                </div>
                                <div className={`text-xs sm:text-xl -mt-0.5 sm:-mt-1 ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-600' : 'text-gray-900'}`}>
                                  {card.suit}
                                </div>
                              </div>
                              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                                <div className={`text-xl sm:text-4xl ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-600' : 'text-gray-900'}`}>
                                  {card.suit}
                                </div>
                              </div>
                              <div className="absolute bottom-0.5 sm:bottom-1 right-0.5 sm:right-1 rotate-180">
                                <div className={`text-xs sm:text-2xl ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-600' : 'text-gray-900'}`}>
                                  {card.value}
                                </div>
                                <div className={`text-xs sm:text-xl -mt-0.5 sm:-mt-1 ${card.suit === '♥️' || card.suit === '♦️' ? 'text-red-600' : 'text-gray-900'}`}>
                                  {card.suit}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className={`px-3 sm:px-6 py-2 sm:py-3 rounded-2xl shadow-xl ${
                          isMe 
                            ? 'bg-yellow-600 border-2 border-yellow-400' 
                            : isTurn 
                              ? 'bg-green-600 border-2 border-green-400 animate-pulse' 
                              : player.isStanding 
                                ? 'bg-gray-700 border-2 border-gray-500' 
                                : player.isBusted 
                                  ? 'bg-red-900 border-2 border-red-700' 
                                  : 'bg-black/70 border-2 border-white/30'
                        }`}>
                          <p className={`font-bold text-xs sm:text-lg ${isMe ? 'text-black' : 'text-white'} truncate max-w-full`}>
                            {isMe ? 'YOU' : player.name}
                          </p>
                          <p className={`text-base sm:text-xl font-bold ${isMe ? 'text-black' : 'text-yellow-300'}`}>
                            {player.handValue}
                          </p>
                          {!result && (
                            <p className={`text-xs sm:text-sm ${isMe ? 'text-black/70' : 'text-white/70'}`}>
                              Bet: {player.currentBet}
                            </p>
                          )}
                          {player.isStanding && !result && (
                            <p className="text-[10px] sm:text-xs text-white/90 mt-1">STANDING</p>
                          )}
                          {player.isBusted && !result && (
                            <p className="text-[10px] sm:text-xs text-red-300 mt-1 font-bold">BUSTED!</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Single Player: Show just your hand */
                <div className="flex flex-col items-center">
                  {/* Result Message Above Hand */}
                  {roundResults['single'] && (
                    <div className={`mb-4 px-6 py-3 rounded-lg font-bold text-xl ${
                      roundResults['single'].includes('win') || roundResults['single'].includes('Win') 
                        ? 'bg-green-600 text-white' 
                        : roundResults['single'].includes('Push') 
                          ? 'bg-yellow-600 text-black' 
                          : 'bg-red-600 text-white'
                    }`}>
                      {roundResults['single']}
                    </div>
                  )}
                  
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
              )}
            </div>

            {/* Action Buttons */}
            {Object.keys(roundResults).length > 0 ? (
              /* Show Next Hand button after round ends */
              <div className="relative flex justify-center mt-8">
                <button
                  onClick={nextHand}
                  className="px-12 py-5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-bold text-2xl transition-all shadow-lg animate-pulse"
                >
                  Next Hand
                </button>
              </div>
            ) : canHit && !isDealing && (!socket || isMyTurn) && (
              <div className="relative flex justify-center gap-2 sm:gap-3 mt-4 sm:mt-8 flex-wrap">
                <button
                  onClick={hit}
                  disabled={socket !== null && !isMyTurn}
                  className="px-4 sm:px-8 py-2 sm:py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-xl font-bold text-base sm:text-xl transition-all shadow-lg"
                >
                  HIT
                </button>
                <button
                  onClick={stand}
                  disabled={socket !== null && !isMyTurn}
                  className="px-4 sm:px-8 py-2 sm:py-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-xl font-bold text-base sm:text-xl transition-all shadow-lg"
                >
                  STAND
                </button>
                {canDouble && (
                  <button
                    onClick={doubleDown}
                    disabled={socket !== null && !isMyTurn}
                    className="px-3 sm:px-6 py-2 sm:py-4 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm sm:text-xl transition-all shadow-lg"
                  >
                    DOUBLE
                  </button>
                )}
                {canSplit && (
                  <button
                    onClick={split}
                    disabled={socket !== null && !isMyTurn}
                    className="px-3 sm:px-6 py-2 sm:py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm sm:text-xl transition-all shadow-lg"
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

  // Single player initial state
  if (mode === 'single' && gameState === 'lobby') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20 text-center">
          <h1 className="text-5xl font-bold text-white mb-6">♠️ Blackjack ♥️</h1>
          <p className="text-3xl text-yellow-300 mb-8">Starting Balance: 25000 LosBucks</p>
          
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
