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
  holeCards: Card[];
  currentBet: number;
  totalBetThisRound: number;
  hasFolded: boolean;
  hasActed: boolean;
  isAllIn: boolean;
  isDealer: boolean;
  handRank?: string;
  handValue?: number;
}

interface GameRoom {
  players: Player[];
  communityCards: Card[];
  pot: number;
  currentBet: number;
  currentTurn: string | null;
  dealerIndex: number;
  state: 'lobby' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'results';
  smallBlind: number;
  bigBlind: number;
  winners?: { id: string; amount: number; handRank: string }[];
}

const HAND_RANKINGS = [
  'High Card',
  'One Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
  'Royal Flush'
];

function TexasHoldemGame() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') || 'single';
  const { playerName: casinoName, balance: casinoBalance, setBalance: setCasinoBalance } = useCasino();

  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<'lobby' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'results'>('lobby');
  const [playerName, setPlayerName] = useState(casinoName || '');
  const [lobbyCode, setLobbyCode] = useState('');
  const [roomId, setRoomId] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayerId, setMyPlayerId] = useState('');
  const [balance, setBalance] = useState(casinoBalance);
  const [holeCards, setHoleCards] = useState<Card[]>([]);
  const [communityCards, setCommunityCards] = useState<Card[]>([]);
  const [pot, setPot] = useState(0);
  const [currentBet, setCurrentBet] = useState(0);
  const [currentTurn, setCurrentTurn] = useState<string | null>(null);
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [publicLobbies, setPublicLobbies] = useState<Array<{ roomId: string; playerCount: number; maxPlayers: number }>>([]);
  const [winners, setWinners] = useState<{ id: string; amount: number; handRank: string }[]>([]);
  const [myCurrentBet, setMyCurrentBet] = useState(0);
  const [hasFolded, setHasFolded] = useState(false);
  const [isAllIn, setIsAllIn] = useState(false);
  const [smallBlind] = useState(50);
  const [bigBlind] = useState(100);
  const [message, setMessage] = useState('');

  // Single player state
  const [deck, setDeck] = useState<Card[]>([]);
  const [aiPlayers, setAiPlayers] = useState<Player[]>([]);

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
  const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

  const createDeck = (): Card[] => {
    const newDeck: Card[] = [];
    for (const suit of suits) {
      for (let i = 0; i < values.length; i++) {
        newDeck.push({
          suit,
          value: values[i],
          numValue: i + 2 // 2-14 (A=14)
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

  // Hand evaluation function
  const evaluateHand = (cards: Card[]): { rank: number; rankName: string; tiebreaker: number[] } => {
    // Get best 5 cards from 7
    const sortedCards = [...cards].sort((a, b) => b.numValue - a.numValue);
    
    // Count values and suits
    const valueCounts: Record<number, number> = {};
    const suitCounts: Record<string, Card[]> = {};
    
    for (const card of sortedCards) {
      valueCounts[card.numValue] = (valueCounts[card.numValue] || 0) + 1;
      if (!suitCounts[card.suit]) suitCounts[card.suit] = [];
      suitCounts[card.suit].push(card);
    }
    
    // Check for flush
    let flushCards: Card[] | null = null;
    for (const suit in suitCounts) {
      if (suitCounts[suit].length >= 5) {
        flushCards = suitCounts[suit].sort((a, b) => b.numValue - a.numValue).slice(0, 5);
        break;
      }
    }
    
    // Check for straight
    const checkStraight = (cards: Card[]): Card[] | null => {
      const uniqueValues = [...new Set(cards.map(c => c.numValue))].sort((a, b) => b - a);
      // Check for ace-low straight (A-2-3-4-5)
      if (uniqueValues.includes(14)) uniqueValues.push(1);
      
      for (let i = 0; i <= uniqueValues.length - 5; i++) {
        let isSequence = true;
        for (let j = 0; j < 4; j++) {
          if (uniqueValues[i + j] - uniqueValues[i + j + 1] !== 1) {
            isSequence = false;
            break;
          }
        }
        if (isSequence) {
          const straightHigh = uniqueValues[i];
          return cards.filter(c => {
            const val = c.numValue === 14 && straightHigh === 5 ? 1 : c.numValue;
            return val <= straightHigh && val > straightHigh - 5;
          }).slice(0, 5);
        }
      }
      return null;
    };
    
    const straightCards = checkStraight(sortedCards);
    
    // Get pairs, trips, quads
    const pairs: number[] = [];
    const trips: number[] = [];
    const quads: number[] = [];
    
    for (const [value, count] of Object.entries(valueCounts)) {
      const v = parseInt(value);
      if (count === 4) quads.push(v);
      else if (count === 3) trips.push(v);
      else if (count === 2) pairs.push(v);
    }
    
    pairs.sort((a, b) => b - a);
    trips.sort((a, b) => b - a);
    
    // Determine hand rank
    // Royal Flush
    if (flushCards && straightCards) {
      const flushStraight = checkStraight(flushCards);
      if (flushStraight && Math.max(...flushStraight.map(c => c.numValue)) === 14) {
        return { rank: 9, rankName: 'Royal Flush', tiebreaker: [14] };
      }
      // Straight Flush
      if (flushStraight) {
        return { rank: 8, rankName: 'Straight Flush', tiebreaker: [Math.max(...flushStraight.map(c => c.numValue))] };
      }
    }
    
    // Four of a Kind
    if (quads.length > 0) {
      const kicker = sortedCards.find(c => c.numValue !== quads[0])!.numValue;
      return { rank: 7, rankName: 'Four of a Kind', tiebreaker: [quads[0], kicker] };
    }
    
    // Full House
    if (trips.length > 0 && (pairs.length > 0 || trips.length > 1)) {
      const pairVal = pairs.length > 0 ? pairs[0] : trips[1];
      return { rank: 6, rankName: 'Full House', tiebreaker: [trips[0], pairVal] };
    }
    
    // Flush
    if (flushCards) {
      return { rank: 5, rankName: 'Flush', tiebreaker: flushCards.map(c => c.numValue) };
    }
    
    // Straight
    if (straightCards) {
      const highCard = straightCards[0].numValue === 14 && straightCards[4].numValue === 2 ? 5 : straightCards[0].numValue;
      return { rank: 4, rankName: 'Straight', tiebreaker: [highCard] };
    }
    
    // Three of a Kind
    if (trips.length > 0) {
      const kickers = sortedCards.filter(c => c.numValue !== trips[0]).slice(0, 2).map(c => c.numValue);
      return { rank: 3, rankName: 'Three of a Kind', tiebreaker: [trips[0], ...kickers] };
    }
    
    // Two Pair
    if (pairs.length >= 2) {
      const kicker = sortedCards.find(c => c.numValue !== pairs[0] && c.numValue !== pairs[1])!.numValue;
      return { rank: 2, rankName: 'Two Pair', tiebreaker: [pairs[0], pairs[1], kicker] };
    }
    
    // One Pair
    if (pairs.length === 1) {
      const kickers = sortedCards.filter(c => c.numValue !== pairs[0]).slice(0, 3).map(c => c.numValue);
      return { rank: 1, rankName: 'One Pair', tiebreaker: [pairs[0], ...kickers] };
    }
    
    // High Card
    return { rank: 0, rankName: 'High Card', tiebreaker: sortedCards.slice(0, 5).map(c => c.numValue) };
  };

  // Compare two hands - returns positive if hand1 wins, negative if hand2 wins, 0 for tie
  const compareHands = (hand1: ReturnType<typeof evaluateHand>, hand2: ReturnType<typeof evaluateHand>): number => {
    if (hand1.rank !== hand2.rank) return hand1.rank - hand2.rank;
    for (let i = 0; i < hand1.tiebreaker.length; i++) {
      if (hand1.tiebreaker[i] !== hand2.tiebreaker[i]) {
        return hand1.tiebreaker[i] - hand2.tiebreaker[i];
      }
    }
    return 0;
  };

  useEffect(() => {
    if (mode !== 'single') {
      const socketUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
      const newSocket = io(socketUrl);
      setSocket(newSocket);

      newSocket.on('holdemLobbyCreated', ({ roomId, players }: { roomId: string; players: Player[] }) => {
        setRoomId(roomId);
        setPlayers(players);
        setGameState('lobby');
      });

      newSocket.on('holdemPlayerJoined', ({ players }: { players: Player[] }) => {
        setPlayers(players);
      });

      newSocket.on('holdemGameState', (data: any) => {
        setPlayers(data.players);
        setGameState(data.state);
        setCommunityCards(data.communityCards || []);
        setPot(data.pot || 0);
        setCurrentBet(data.currentBet || 0);
        setCurrentTurn(data.currentTurn);
        
        const me = data.players.find((p: Player) => p.id === newSocket.id);
        if (me) {
          setHoleCards(me.holeCards || []);
          setBalance(me.balance);
          setMyCurrentBet(me.totalBetThisRound || 0);
          setHasFolded(me.hasFolded || false);
          setIsAllIn(me.isAllIn || false);
        }
      });

      newSocket.on('holdemPublicLobbies', ({ lobbies }: { lobbies: Array<{ roomId: string; playerCount: number; maxPlayers: number }> }) => {
        setPublicLobbies(lobbies);
      });

      newSocket.on('holdemCardsDealt', ({ players, communityCards }: any) => {
        setPlayers(players);
        const me = players.find((p: Player) => p.id === newSocket.id);
        if (me) {
          setHoleCards(me.holeCards);
          setBalance(me.balance);
          setMyCurrentBet(me.totalBetThisRound || 0);
        }
        setCommunityCards(communityCards || []);
        setGameState('preflop');
      });

      newSocket.on('holdemBettingUpdate', ({ players, pot, currentBet, currentTurn, state }: any) => {
        setPlayers(players);
        setPot(pot);
        setCurrentBet(currentBet);
        setCurrentTurn(currentTurn);
        if (state) setGameState(state);
        
        const me = players.find((p: Player) => p.id === newSocket.id);
        if (me) {
          setBalance(me.balance);
          setMyCurrentBet(me.totalBetThisRound || 0);
          setHasFolded(me.hasFolded || false);
          setIsAllIn(me.isAllIn || false);
        }
      });

      newSocket.on('holdemCommunityCards', ({ communityCards, state }: any) => {
        setCommunityCards(communityCards);
        setGameState(state);
      });

      newSocket.on('holdemShowdown', ({ players, winners, pot }: any) => {
        setPlayers(players);
        setWinners(winners);
        setPot(pot);
        setGameState('showdown');
        
        const me = players.find((p: Player) => p.id === newSocket.id);
        if (me) {
          setBalance(me.balance);
        }
      });

      newSocket.on('holdemNewHandStarted', () => {
        setCommunityCards([]);
        setHoleCards([]);
        setPot(0);
        setCurrentBet(0);
        setMyCurrentBet(0);
        setHasFolded(false);
        setIsAllIn(false);
        setWinners([]);
        setGameState('preflop');
      });

      newSocket.on('holdemKicked', ({ reason }: { reason: string }) => {
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
      socket.emit('getHoldemPublicLobbies');
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
      socket.emit('holdemCreateLobby', { playerName, isPublic: true });
      setMyPlayerId(socket.id!);
    }
  };

  const joinLobby = () => {
    if (socket && playerName && lobbyCode) {
      socket.emit('holdemJoinLobby', { roomId: lobbyCode, playerName });
      setRoomId(lobbyCode);
      setMyPlayerId(socket.id!);
      setGameState('lobby');
    }
  };

  const joinPublicLobby = (lobbyRoomId: string) => {
    if (socket && playerName) {
      socket.emit('holdemJoinLobby', { roomId: lobbyRoomId, playerName });
      setRoomId(lobbyRoomId);
      setMyPlayerId(socket.id!);
      setGameState('lobby');
    }
  };

  const startGame = () => {
    if (socket) {
      socket.emit('holdemStartGame', { roomId });
    } else {
      // Single player - start with AI opponents
      startSinglePlayerGame();
    }
  };

  const startSinglePlayerGame = () => {
    // Clear previous game state
    setCommunityCards([]);
    setWinners([]);
    setMessage('');
    setHasFolded(false);
    setIsAllIn(false);
    
    const gameDeck = shuffleDeck(createDeck());
    setDeck(gameDeck);
    
    // Create AI players
    const aiNames = ['AI Alex', 'AI Beth', 'AI Carl'];
    const newAiPlayers: Player[] = aiNames.map((name, i) => ({
      id: `ai_${i}`,
      name,
      balance: 25000,
      holeCards: [gameDeck.pop()!, gameDeck.pop()!],
      currentBet: 0,
      totalBetThisRound: 0,
      hasFolded: false,
      hasActed: false,
      isAllIn: false,
      isDealer: i === 0
    }));
    
    // Player
    const playerCards = [gameDeck.pop()!, gameDeck.pop()!];
    setHoleCards(playerCards);
    
    const me: Player = {
      id: 'player',
      name: 'You',
      balance: balance - bigBlind,
      holeCards: playerCards,
      currentBet: bigBlind,
      totalBetThisRound: bigBlind,
      hasFolded: false,
      hasActed: false,
      isAllIn: false,
      isDealer: false
    };
    
    // Set blinds
    newAiPlayers[0].balance -= smallBlind;
    newAiPlayers[0].currentBet = smallBlind;
    newAiPlayers[0].totalBetThisRound = smallBlind;
    
    setBalance(me.balance);
    setMyCurrentBet(bigBlind);
    setAiPlayers(newAiPlayers);
    setPlayers([...newAiPlayers, me]);
    setPot(smallBlind + bigBlind);
    setCurrentBet(bigBlind);
    setCurrentTurn('player');
    setDeck(gameDeck);
    setGameState('preflop');
  };

  const handleAction = (action: 'fold' | 'check' | 'call' | 'raise' | 'allin') => {
    if (socket) {
      socket.emit('holdemAction', { 
        roomId, 
        action, 
        amount: action === 'raise' ? raiseAmount : undefined 
      });
    } else {
      // Single player action handling
      handleSinglePlayerAction(action);
    }
  };

  const handleSinglePlayerAction = async (action: 'fold' | 'check' | 'call' | 'raise' | 'allin') => {
    let newBalance = balance;
    let newPot = pot;
    let newCurrentBet = currentBet;
    let newMyCurrentBet = myCurrentBet;
    
    if (action === 'fold') {
      setHasFolded(true);
      setMessage('You folded. AI wins!');
      setGameState('results');
      return;
    } else if (action === 'call') {
      const callAmount = currentBet - myCurrentBet;
      newBalance -= callAmount;
      newPot += callAmount;
      newMyCurrentBet = currentBet;
    } else if (action === 'raise') {
      const totalBet = raiseAmount;
      const additionalBet = totalBet - myCurrentBet;
      newBalance -= additionalBet;
      newPot += additionalBet;
      newCurrentBet = totalBet;
      newMyCurrentBet = totalBet;
    } else if (action === 'allin') {
      newPot += newBalance;
      newMyCurrentBet += newBalance;
      if (newMyCurrentBet > newCurrentBet) {
        newCurrentBet = newMyCurrentBet;
      }
      newBalance = 0;
      setIsAllIn(true);
    }
    
    setBalance(newBalance);
    setPot(newPot);
    setCurrentBet(newCurrentBet);
    setMyCurrentBet(newMyCurrentBet);
    
    // AI actions (simplified - they mostly call or fold)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const updatedAiPlayers = aiPlayers.map(ai => {
      if (ai.hasFolded) return ai;
      
      const callAmount = newCurrentBet - ai.totalBetThisRound;
      const shouldFold = Math.random() < 0.2 && callAmount > 500;
      
      if (shouldFold) {
        return { ...ai, hasFolded: true };
      } else {
        const newAiBalance = ai.balance - callAmount;
        return { 
          ...ai, 
          balance: newAiBalance,
          totalBetThisRound: newCurrentBet,
          currentBet: newCurrentBet
        };
      }
    });
    
    const aiFoldCount = updatedAiPlayers.filter(ai => !ai.hasFolded).length;
    const aiCallAmount = updatedAiPlayers.reduce((sum, ai) => {
      if (!ai.hasFolded) {
        return sum + (newCurrentBet - (aiPlayers.find(a => a.id === ai.id)?.totalBetThisRound || 0));
      }
      return sum;
    }, 0);
    
    newPot += aiCallAmount;
    setPot(newPot);
    setAiPlayers(updatedAiPlayers);
    
    if (aiFoldCount === 0) {
      setMessage('All opponents folded! You win!');
      setBalance(newBalance + newPot);
      setGameState('results');
      return;
    }
    
    // Progress to next stage
    const gameDeck = [...deck];
    let newCommunityCards = [...communityCards];
    
    if (gameState === 'preflop') {
      // Deal flop
      gameDeck.pop(); // Burn
      newCommunityCards = [gameDeck.pop()!, gameDeck.pop()!, gameDeck.pop()!];
      setCommunityCards(newCommunityCards);
      setDeck(gameDeck);
      setGameState('flop');
    } else if (gameState === 'flop') {
      // Deal turn
      gameDeck.pop(); // Burn
      newCommunityCards.push(gameDeck.pop()!);
      setCommunityCards(newCommunityCards);
      setDeck(gameDeck);
      setGameState('turn');
    } else if (gameState === 'turn') {
      // Deal river
      gameDeck.pop(); // Burn
      newCommunityCards.push(gameDeck.pop()!);
      setCommunityCards(newCommunityCards);
      setDeck(gameDeck);
      setGameState('river');
    } else if (gameState === 'river') {
      // Showdown - evaluate all hands properly
      const activeAi = updatedAiPlayers.filter(ai => !ai.hasFolded);
      
      // Evaluate player's hand
      const playerFullHand = [...holeCards, ...newCommunityCards];
      const playerEval = evaluateHand(playerFullHand);
      
      // Evaluate AI hands
      const aiEvals = activeAi.map(ai => ({
        id: ai.id,
        name: ai.name,
        eval: evaluateHand([...ai.holeCards, ...newCommunityCards])
      }));
      
      // Find the winner
      let bestHand = { id: 'player', name: 'You', eval: playerEval };
      
      for (const aiHand of aiEvals) {
        if (compareHands(aiHand.eval, bestHand.eval) > 0) {
          bestHand = aiHand;
        }
      }
      
      if (bestHand.id === 'player') {
        setMessage(`🎉 You win $${newPot} with ${playerEval.rankName}!`);
        setBalance(newBalance + newPot);
      } else {
        setMessage(`${bestHand.name} wins $${newPot} with ${bestHand.eval.rankName}!`);
      }
      setGameState('showdown');
    }
    
    // Reset for next betting round
    setMyCurrentBet(0);
    setCurrentBet(0);
  };

  const nextHand = () => {
    if (socket) {
      socket.emit('holdemNextHand', { roomId });
    } else {
      // Reset for new hand
      setCommunityCards([]);
      setHoleCards([]);
      setPot(0);
      setCurrentBet(0);
      setMyCurrentBet(0);
      setHasFolded(false);
      setIsAllIn(false);
      setWinners([]);
      setMessage('');
      startSinglePlayerGame();
    }
  };

  // Render card component
  const renderCard = (card: Card, index: number, faceDown: boolean = false) => (
    <div 
      key={index}
      className={`
        w-12 h-16 md:w-14 md:h-20 rounded-lg shadow-lg flex flex-col items-center justify-center
        transform transition-all duration-300 hover:scale-105
        ${faceDown ? 'bg-gradient-to-br from-blue-600 to-blue-800' : 'bg-white'}
      `}
    >
      {faceDown ? (
        <span className="text-2xl">🂠</span>
      ) : (
        <>
          <span className={`text-xs md:text-sm font-bold ${getCardColor(card.suit)}`}>{card.value}</span>
          <span className={`text-lg md:text-xl ${getCardColor(card.suit)}`}>{card.suit}</span>
        </>
      )}
    </div>
  );

  const isMyTurn = currentTurn === socket?.id || (mode === 'single' && currentTurn === 'player');
  const callAmount = currentBet - myCurrentBet;
  const canCheck = callAmount === 0;
  const minRaise = currentBet + bigBlind;

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
            🃏 Texas Hold&apos;em
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
            🃏 Public Texas Hold&apos;em Tables
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
              <p className="text-xl mb-4">No public tables available</p>
              <button
                onClick={() => router.push('/casino/texas-holdem?mode=create')}
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
                    <div className="text-white font-bold">Table {lobby.roomId}</div>
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
            🃏 Texas Hold&apos;em
          </h1>
          
          <div className="bg-white/10 rounded-xl p-4 mb-6">
            <div className="text-white/60 text-sm mb-1">Table Code</div>
            <div className="text-3xl font-bold text-yellow-400 tracking-widest">{roomId}</div>
          </div>
          
          <div className="bg-white/10 rounded-xl p-4 mb-6">
            <div className="text-white/60 text-sm">Blinds</div>
            <div className="text-white">${smallBlind} / ${bigBlind}</div>
          </div>
          
          <div className="mb-6">
            <div className="text-white/60 text-sm mb-2">Players ({players.length}/8)</div>
            <div className="space-y-2">
              {players.map((player, i) => (
                <div key={player.id} className="bg-white/10 rounded-lg p-3 flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                    {player.name[0]}
                  </div>
                  <span className="text-white">{player.name}</span>
                  <span className="text-green-400 text-sm ml-auto">${player.balance.toLocaleString()}</span>
                  {i === 0 && <span className="text-yellow-400 text-xs">HOST</span>}
                </div>
              ))}
            </div>
          </div>
          
          {players.length >= 2 && players[0].id === socket?.id && (
            <button
              onClick={startGame}
              className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl font-bold text-xl transition-all"
            >
              Start Game (Min 2 players)
            </button>
          )}
          
          {players.length < 2 && (
            <div className="text-center text-white/60">
              Waiting for more players... (need at least 2)
            </div>
          )}
          
          {players.length >= 2 && players[0].id !== socket?.id && (
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
          
          <h1 className="text-4xl font-bold text-white mb-4 text-center">🃏 Texas Hold&apos;em</h1>
          <p className="text-white/70 text-center mb-6">
            Play poker against AI opponents!
          </p>
          
          <div className="bg-white/10 rounded-xl p-4 mb-6">
            <h3 className="text-white font-bold mb-2">Game Info:</h3>
            <ul className="text-white/70 text-sm space-y-1">
              <li>• Blinds: ${smallBlind} / ${bigBlind}</li>
              <li>• 3 AI opponents</li>
              <li>• No Limit Texas Hold&apos;em</li>
            </ul>
          </div>
          
          <div className="text-center mb-6">
            <div className="text-white/60 text-sm">Your Stack</div>
            <div className="text-3xl font-bold text-green-400">${balance.toLocaleString()}</div>
          </div>
          
          <button
            onClick={startGame}
            className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl font-bold text-xl transition-all"
          >
            Start Playing
          </button>
        </div>
      </div>
    );
  }

  // Main game screen
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-emerald-900 to-teal-900 p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <button
          onClick={() => router.push('/casino')}
          className="text-white/60 hover:text-white transition-colors"
        >
          ← Exit
        </button>
        <div className="text-2xl font-bold text-white">🃏 Texas Hold&apos;em</div>
        <div className="text-xl font-bold text-green-400">${balance.toLocaleString()}</div>
      </div>

      {/* Poker Table */}
      <div className="max-w-4xl mx-auto">
        {/* Pot Display */}
        <div className="text-center mb-4">
          <div className="inline-block bg-black/40 rounded-full px-6 py-2">
            <span className="text-white/60 text-sm">POT: </span>
            <span className="text-yellow-400 font-bold text-xl">${pot.toLocaleString()}</span>
          </div>
        </div>

        {/* Community Cards */}
        <div className="flex justify-center mb-8">
          <div className="bg-green-800/50 rounded-2xl p-4 border-2 border-green-600/50">
            <div className="text-white/60 text-sm text-center mb-2">COMMUNITY CARDS</div>
            <div className="flex gap-2 justify-center min-h-20">
              {communityCards.length > 0 ? (
                communityCards.map((card, i) => renderCard(card, i))
              ) : (
                <div className="text-white/30 flex items-center">Waiting for cards...</div>
              )}
            </div>
          </div>
        </div>

        {/* Other Players */}
        <div className="flex flex-wrap justify-center gap-4 mb-6">
          {players.filter(p => p.id !== socket?.id && p.id !== 'player').map((player) => (
            <div 
              key={player.id}
              className={`bg-black/30 rounded-xl p-3 border-2 transition-all ${
                currentTurn === player.id ? 'border-yellow-400 animate-pulse' : 
                player.hasFolded ? 'border-red-500/50 opacity-50' : 'border-white/20'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                  {player.name[0]}
                </div>
                <div>
                  <div className="text-white text-sm font-bold">{player.name}</div>
                  <div className="text-green-400 text-xs">${player.balance.toLocaleString()}</div>
                </div>
                {player.isDealer && <span className="text-yellow-400 text-xs">D</span>}
              </div>
              <div className="flex gap-1 justify-center">
                {gameState === 'showdown' && !player.hasFolded ? (
                  player.holeCards?.map((card, i) => renderCard(card, i))
                ) : (
                  <>
                    {renderCard({ suit: '', value: '', numValue: 0 }, 0, true)}
                    {renderCard({ suit: '', value: '', numValue: 0 }, 1, true)}
                  </>
                )}
              </div>
              {player.totalBetThisRound > 0 && !player.hasFolded && (
                <div className="text-center mt-2 text-yellow-300 text-sm">
                  Bet: ${player.totalBetThisRound}
                </div>
              )}
              {player.hasFolded && (
                <div className="text-center mt-2 text-red-400 text-sm">FOLDED</div>
              )}
            </div>
          ))}
        </div>

        {/* Your Cards */}
        <div className={`bg-black/40 backdrop-blur-sm rounded-2xl p-4 mb-4 border-2 ${
          isMyTurn ? 'border-yellow-400' : 'border-white/20'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-full flex items-center justify-center text-white font-bold">
                Y
              </div>
              <div>
                <div className="text-white font-bold">You</div>
                <div className="text-green-400 text-sm">${balance.toLocaleString()}</div>
              </div>
            </div>
            {myCurrentBet > 0 && (
              <div className="text-yellow-300">Your bet: ${myCurrentBet}</div>
            )}
            {isMyTurn && <div className="text-yellow-400 animate-pulse font-bold">YOUR TURN</div>}
          </div>
          
          <div className="flex gap-2 justify-center mb-4">
            {holeCards.length > 0 ? (
              holeCards.map((card, i) => (
                <div key={i} className="transform hover:scale-110 transition-transform">
                  {renderCard(card, i)}
                </div>
              ))
            ) : (
              <div className="text-white/30">Waiting for cards...</div>
            )}
          </div>
          
          {hasFolded && (
            <div className="text-center text-red-400 font-bold">YOU FOLDED</div>
          )}
        </div>

        {/* Winner/Message Display */}
        {(winners.length > 0 || message) && (
          <div className="text-center mb-4">
            {winners.map((winner, i) => (
              <div key={i} className="text-2xl font-bold text-yellow-400 mb-2">
                🏆 {players.find(p => p.id === winner.id)?.name} wins ${winner.amount} with {winner.handRank}!
              </div>
            ))}
            {message && (
              <div className={`text-2xl font-bold ${message.includes('win') ? 'text-green-400' : 'text-red-400'}`}>
                {message}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {isMyTurn && !hasFolded && !isAllIn && gameState !== 'showdown' && gameState !== 'results' && (
          <div className="bg-black/40 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <button
                onClick={() => handleAction('fold')}
                className="py-3 bg-red-500/80 hover:bg-red-500 text-white rounded-xl font-bold transition-all"
              >
                Fold
              </button>
              
              {canCheck ? (
                <button
                  onClick={() => handleAction('check')}
                  className="py-3 bg-blue-500/80 hover:bg-blue-500 text-white rounded-xl font-bold transition-all"
                >
                  Check
                </button>
              ) : (
                <button
                  onClick={() => handleAction('call')}
                  className="py-3 bg-blue-500/80 hover:bg-blue-500 text-white rounded-xl font-bold transition-all"
                >
                  Call ${callAmount}
                </button>
              )}
              
              <button
                onClick={() => handleAction('allin')}
                className="py-3 bg-purple-500/80 hover:bg-purple-500 text-white rounded-xl font-bold transition-all"
              >
                All In ${balance}
              </button>
              
              <button
                onClick={() => handleAction('raise')}
                disabled={raiseAmount < minRaise || raiseAmount > balance + myCurrentBet}
                className="py-3 bg-green-500/80 hover:bg-green-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all"
              >
                Raise
              </button>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-white/60 text-sm">Raise to:</span>
              <input
                type="range"
                min={minRaise}
                max={balance + myCurrentBet}
                value={raiseAmount || minRaise}
                onChange={(e) => setRaiseAmount(parseInt(e.target.value))}
                className="flex-1"
              />
              <input
                type="number"
                value={raiseAmount || minRaise}
                onChange={(e) => setRaiseAmount(parseInt(e.target.value) || minRaise)}
                className="w-24 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-center"
              />
            </div>
          </div>
        )}

        {/* Next Hand Button */}
        {(gameState === 'showdown' || gameState === 'results') && (
          <div className="flex justify-center">
            <button
              onClick={nextHand}
              className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl font-bold text-xl transition-all"
            >
              Next Hand
            </button>
          </div>
        )}

        {/* Waiting for others */}
        {!isMyTurn && gameState !== 'showdown' && gameState !== 'results' && gameState !== 'lobby' && (
          <div className="text-center text-white/60 animate-pulse">
            Waiting for {players.find(p => p.id === currentTurn)?.name || 'other players'}...
          </div>
        )}
      </div>
    </div>
  );
}

export default function TexasHoldemPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white text-2xl">Loading...</div>
      </div>
    }>
      <TexasHoldemGame />
    </Suspense>
  );
}
