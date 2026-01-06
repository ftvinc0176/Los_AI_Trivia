'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
}

type GamePhase = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

function TexasHoldemGameContent() {
  const router = useRouter();
  const { playerName: casinoName, balance: casinoBalance, setBalance: setCasinoBalance, recordWin, checkAndReload } = useCasino();

  const [gameStarted, setGameStarted] = useState(false);
  const [phase, setPhase] = useState<GamePhase>('preflop');
  const [deck, setDeck] = useState<Card[]>([]);
  const [communityCards, setCommunityCards] = useState<Card[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [pot, setPot] = useState(0);
  const [currentBet, setCurrentBet] = useState(0);
  const [activePlayerIndex, setActivePlayerIndex] = useState(0);
  const [dealerIndex, setDealerIndex] = useState(0);
  const [playerBalance, setPlayerBalance] = useState(casinoBalance);
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [showdown, setShowdown] = useState(false);
  const [winner, setWinner] = useState<{ name: string; handRank: string; winAmount: number } | null>(null);
  const [phaseMessage, setPhaseMessage] = useState('');
  
  const SMALL_BLIND = 50;
  const BIG_BLIND = 100;

  // Update casino context
  useEffect(() => {
    setCasinoBalance(playerBalance);
  }, [playerBalance, setCasinoBalance]);

  const suits = ['♠', '♥', '♦', '♣'];
  const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

  const createDeck = (): Card[] => {
    const newDeck: Card[] = [];
    for (const suit of suits) {
      for (let i = 0; i < values.length; i++) {
        newDeck.push({
          suit,
          value: values[i],
          numValue: i + 2
        });
      }
    }
    return newDeck;
  };

  const shuffleDeck = (deckToShuffle: Card[]): Card[] => {
    const shuffled = [...deckToShuffle];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const evaluateHand = (cards: Card[]): { rank: number; rankName: string; tiebreaker: number[] } => {
    const sortedCards = [...cards].sort((a, b) => b.numValue - a.numValue);
    
    const valueCounts: Record<number, number> = {};
    const suitCounts: Record<string, Card[]> = {};
    
    for (const card of sortedCards) {
      valueCounts[card.numValue] = (valueCounts[card.numValue] || 0) + 1;
      if (!suitCounts[card.suit]) suitCounts[card.suit] = [];
      suitCounts[card.suit].push(card);
    }
    
    let flushCards: Card[] | null = null;
    for (const suit in suitCounts) {
      if (suitCounts[suit].length >= 5) {
        flushCards = suitCounts[suit].sort((a, b) => b.numValue - a.numValue).slice(0, 5);
        break;
      }
    }
    
    const checkStraight = (cardsToCheck: Card[]): Card[] | null => {
      const uniqueValues = [...new Set(cardsToCheck.map(c => c.numValue))].sort((a, b) => b - a);
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
          return cardsToCheck.filter(c => {
            const val = c.numValue === 14 && straightHigh === 5 ? 1 : c.numValue;
            return val <= straightHigh && val > straightHigh - 5;
          }).slice(0, 5);
        }
      }
      return null;
    };
    
    const straightCards = checkStraight(sortedCards);
    
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
    
    if (flushCards && straightCards) {
      const flushStraight = checkStraight(flushCards);
      if (flushStraight && Math.max(...flushStraight.map(c => c.numValue)) === 14) {
        return { rank: 9, rankName: 'Royal Flush', tiebreaker: [14] };
      }
      if (flushStraight) {
        return { rank: 8, rankName: 'Straight Flush', tiebreaker: [Math.max(...flushStraight.map(c => c.numValue))] };
      }
    }
    
    if (quads.length > 0) {
      const kicker = sortedCards.find(c => c.numValue !== quads[0])!.numValue;
      return { rank: 7, rankName: 'Four of a Kind', tiebreaker: [quads[0], kicker] };
    }
    
    if (trips.length > 0 && (pairs.length > 0 || trips.length > 1)) {
      const pairVal = pairs.length > 0 ? pairs[0] : trips[1];
      return { rank: 6, rankName: 'Full House', tiebreaker: [trips[0], pairVal] };
    }
    
    if (flushCards) {
      return { rank: 5, rankName: 'Flush', tiebreaker: flushCards.map(c => c.numValue) };
    }
    
    if (straightCards) {
      const highCard = straightCards[0].numValue === 14 && straightCards[4].numValue === 2 ? 5 : straightCards[0].numValue;
      return { rank: 4, rankName: 'Straight', tiebreaker: [highCard] };
    }
    
    if (trips.length > 0) {
      const kickers = sortedCards.filter(c => c.numValue !== trips[0]).slice(0, 2).map(c => c.numValue);
      return { rank: 3, rankName: 'Three of a Kind', tiebreaker: [trips[0], ...kickers] };
    }
    
    if (pairs.length >= 2) {
      const kicker = sortedCards.find(c => c.numValue !== pairs[0] && c.numValue !== pairs[1])!.numValue;
      return { rank: 2, rankName: 'Two Pair', tiebreaker: [pairs[0], pairs[1], kicker] };
    }
    
    if (pairs.length === 1) {
      const kickers = sortedCards.filter(c => c.numValue !== pairs[0]).slice(0, 3).map(c => c.numValue);
      return { rank: 1, rankName: 'One Pair', tiebreaker: [pairs[0], ...kickers] };
    }
    
    return { rank: 0, rankName: 'High Card', tiebreaker: sortedCards.slice(0, 5).map(c => c.numValue) };
  };

  const compareHands = (hand1: ReturnType<typeof evaluateHand>, hand2: ReturnType<typeof evaluateHand>): number => {
    if (hand1.rank !== hand2.rank) return hand1.rank - hand2.rank;
    for (let i = 0; i < Math.min(hand1.tiebreaker.length, hand2.tiebreaker.length); i++) {
      if (hand1.tiebreaker[i] !== hand2.tiebreaker[i]) {
        return hand1.tiebreaker[i] - hand2.tiebreaker[i];
      }
    }
    return 0;
  };

  const startGame = () => {
    const gameDeck = shuffleDeck(createDeck());
    const aiNames = ['AI Alex', 'AI Beth', 'AI Carl'];
    
    const newPlayers: Player[] = aiNames.map((name, i) => ({
      id: `ai_${i}`,
      name,
      balance: 25000,
      holeCards: [],
      currentBet: 0,
      totalBetThisRound: 0,
      hasFolded: false,
      hasActed: false,
      isAllIn: false,
      isDealer: i === dealerIndex
    }));

    // Deal hole cards
    for (let i = 0; i < 2; i++) {
      for (const player of newPlayers) {
        player.holeCards.push(gameDeck.pop()!);
      }
    }

    // Human player
    const humanPlayer: Player = {
      id: 'player',
      name: casinoName || 'You',
      balance: playerBalance,
      holeCards: [gameDeck.pop()!, gameDeck.pop()!],
      currentBet: 0,
      totalBetThisRound: 0,
      hasFolded: false,
      hasActed: false,
      isAllIn: false,
      isDealer: false
    };

    // Post blinds
    const sbIndex = (dealerIndex + 1) % newPlayers.length;
    const bbIndex = (dealerIndex + 2) % newPlayers.length;
    
    newPlayers[sbIndex].balance -= SMALL_BLIND;
    newPlayers[sbIndex].currentBet = SMALL_BLIND;
    newPlayers[sbIndex].totalBetThisRound = SMALL_BLIND;
    
    newPlayers[bbIndex].balance -= BIG_BLIND;
    newPlayers[bbIndex].currentBet = BIG_BLIND;
    newPlayers[bbIndex].totalBetThisRound = BIG_BLIND;

    const allPlayers = [...newPlayers, humanPlayer];
    
    setPlayers(allPlayers);
    setDeck(gameDeck);
    setCommunityCards([]);
    setPot(SMALL_BLIND + BIG_BLIND);
    setCurrentBet(BIG_BLIND);
    setPhase('preflop');
    setActivePlayerIndex((bbIndex + 1) % allPlayers.length);
    setGameStarted(true);
    setShowdown(false);
    setWinner(null);
    setPhaseMessage('Pre-flop betting');
    setRaiseAmount(BIG_BLIND + BIG_BLIND);
  };

  const getAIAction = (player: Player, phase: GamePhase): { action: 'fold' | 'call' | 'raise' | 'check' | 'allin'; amount?: number } => {
    const callAmount = currentBet - player.totalBetThisRound;
    const potOdds = callAmount / (pot + callAmount);
    
    // If AI doesn't have enough to call, must fold or go all-in
    if (callAmount > player.balance && player.balance > 0) {
      // Evaluate hand strength
      const fullHand = [...player.holeCards, ...communityCards];
      const handEval = fullHand.length >= 5 ? evaluateHand(fullHand) : null;
      const handStrength = handEval ? handEval.rank / 9 : 0;
      
      // Only go all-in with strong hands
      if (handStrength > 0.6) {
        return { action: 'allin' };
      } else {
        return { action: 'fold' };
      }
    }
    
    // Evaluate hand strength
    const fullHand = [...player.holeCards, ...communityCards];
    const handEval = fullHand.length >= 5 ? evaluateHand(fullHand) : null;
    const handStrength = handEval ? handEval.rank / 9 : 0;
    
    // Simple AI strategy
    if (callAmount === 0) {
      // Can check
      if (handStrength > 0.6 && Math.random() > 0.7) {
        return { action: 'raise', amount: currentBet + BIG_BLIND };
      }
      return { action: 'check' };
    }
    
    // Has to call
    if (handStrength > 0.7 || (handStrength > 0.4 && phase !== 'preflop')) {
      // Good hand - might raise
      if (Math.random() > 0.8 && player.balance > callAmount + BIG_BLIND) {
        return { action: 'raise', amount: currentBet + BIG_BLIND };
      }
      return { action: 'call' };
    } else if (handStrength > 0.25 && callAmount < player.balance * 0.1) {
      // Marginal hand, cheap to call
      return { action: 'call' };
    } else {
      // Weak hand
      return { action: 'fold' };
    }
  };

  const handlePlayerAction = (action: 'fold' | 'call' | 'raise' | 'check' | 'allin', amount?: number) => {
    const playerIndex = players.findIndex(p => p.id === 'player');
    if (playerIndex === -1 || activePlayerIndex !== playerIndex) return;

    const updatedPlayers = [...players];
    const player = updatedPlayers[playerIndex];
    let newPot = pot;

    if (action === 'fold') {
      player.hasFolded = true;
      player.hasActed = true;
    } else if (action === 'check') {
      player.hasActed = true;
    } else if (action === 'call') {
      const callAmount = currentBet - player.totalBetThisRound;
      player.balance -= callAmount;
      player.totalBetThisRound += callAmount;
      player.currentBet = currentBet;
      newPot += callAmount;
      player.hasActed = true;
      setPlayerBalance(player.balance);
    } else if (action === 'raise' && amount) {
      const raiseTotal = amount;
      const additionalBet = raiseTotal - player.totalBetThisRound;
      player.balance -= additionalBet;
      player.totalBetThisRound = raiseTotal;
      player.currentBet = raiseTotal;
      newPot += additionalBet;
      setCurrentBet(raiseTotal);
      // Reset hasActed for all other players
      updatedPlayers.forEach(p => {
        if (p.id !== 'player') p.hasActed = false;
      });
      player.hasActed = true;
      setPlayerBalance(player.balance);
    } else if (action === 'allin') {
      newPot += player.balance;
      player.totalBetThisRound += player.balance;
      if (player.totalBetThisRound > currentBet) {
        setCurrentBet(player.totalBetThisRound);
        updatedPlayers.forEach(p => {
          if (p.id !== 'player') p.hasActed = false;
        });
      }
      player.balance = 0;
      player.isAllIn = true;
      player.hasActed = true;
      setPlayerBalance(0);
    }

    setPlayers(updatedPlayers);
    setPot(newPot);
    
    // Move to next player
    processNextPlayer(updatedPlayers, newPot);
  };

  const processNextPlayer = async (currentPlayers: Player[], currentPot: number) => {
    await new Promise(resolve => setTimeout(resolve, 800));

    const activePlayers = currentPlayers.filter(p => !p.hasFolded && !p.isAllIn);
    const nonFoldedPlayers = currentPlayers.filter(p => !p.hasFolded);
    
    if (activePlayers.length === 0) {
      // Everyone is either all-in or folded, deal remaining cards and showdown
      if (nonFoldedPlayers.length > 1) {
        dealAllRemainingCards(currentPlayers, currentPot);
      } else {
        endHand(currentPlayers, currentPot);
      }
      return;
    }
    
    if (activePlayers.length === 1 && nonFoldedPlayers.length === 1) {
      // Only one player left not folded
      endHand(currentPlayers, currentPot);
      return;
    }

    // Check if betting round complete
    const allActed = activePlayers.every(p => p.hasActed && p.currentBet === currentBet);
    if (allActed) {
      proceedToNextPhase(currentPlayers, currentPot);
      return;
    }

    // Find next active player
    let nextIndex = (activePlayerIndex + 1) % currentPlayers.length;
    while (currentPlayers[nextIndex].hasFolded || currentPlayers[nextIndex].isAllIn) {
      nextIndex = (nextIndex + 1) % currentPlayers.length;
    }

    setActivePlayerIndex(nextIndex);

    // If AI player, execute AI action
    if (currentPlayers[nextIndex].id !== 'player') {
      const aiAction = getAIAction(currentPlayers[nextIndex], phase);
      executeAIAction(nextIndex, aiAction, currentPlayers, currentPot);
    }
  };

  const executeAIAction = (playerIndex: number, aiAction: { action: string; amount?: number }, currentPlayers: Player[], currentPot: number) => {
    setTimeout(() => {
      const updatedPlayers = [...currentPlayers];
      const player = updatedPlayers[playerIndex];
      let newPot = currentPot;

      if (aiAction.action === 'fold') {
        player.hasFolded = true;
        player.hasActed = true;
        setPhaseMessage(`${player.name} folds`);
      } else if (aiAction.action === 'check') {
        player.hasActed = true;
        setPhaseMessage(`${player.name} checks`);
      } else if (aiAction.action === 'call') {
        const callAmount = currentBet - player.totalBetThisRound;
        player.balance -= callAmount;
        player.totalBetThisRound += callAmount;
        player.currentBet = currentBet;
        newPot += callAmount;
        player.hasActed = true;
        setPhaseMessage(`${player.name} calls $${callAmount}`);
      } else if (aiAction.action === 'raise' && aiAction.amount) {
        const additionalBet = aiAction.amount - player.totalBetThisRound;
        player.balance -= additionalBet;
        player.totalBetThisRound = aiAction.amount;
        player.currentBet = aiAction.amount;
        newPot += additionalBet;
        setCurrentBet(aiAction.amount);
        updatedPlayers.forEach(p => {
          if (p.id !== player.id) p.hasActed = false;
        });
        player.hasActed = true;
        setPhaseMessage(`${player.name} raises to $${aiAction.amount}`);
      } else if (aiAction.action === 'allin') {
        newPot += player.balance;
        player.totalBetThisRound += player.balance;
        if (player.totalBetThisRound > currentBet) {
          setCurrentBet(player.totalBetThisRound);
          updatedPlayers.forEach(p => {
            if (p.id !== player.id) p.hasActed = false;
          });
        }
        player.balance = 0;
        player.isAllIn = true;
        player.hasActed = true;
        setPhaseMessage(`${player.name} goes all-in!`);
      }

      setPlayers(updatedPlayers);
      setPot(newPot);
      processNextPlayer(updatedPlayers, newPot);
    }, 1200);
  };

  const dealAllRemainingCards = async (currentPlayers: Player[], currentPot: number) => {
    const gameDeck = [...deck];
    const newCommunityCards = [...communityCards];
    
    // Deal flop if not dealt
    if (phase === 'preflop') {
      gameDeck.pop(); // Burn
      newCommunityCards.push(gameDeck.pop()!, gameDeck.pop()!, gameDeck.pop()!);
      setPhaseMessage('Flop dealt (all-in)');
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Deal turn if not dealt
    if (phase === 'preflop' || phase === 'flop') {
      gameDeck.pop(); // Burn
      newCommunityCards.push(gameDeck.pop()!);
      setPhaseMessage('Turn dealt (all-in)');
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Deal river if not dealt
    if (phase === 'preflop' || phase === 'flop' || phase === 'turn') {
      gameDeck.pop(); // Burn
      newCommunityCards.push(gameDeck.pop()!);
      setPhaseMessage('River dealt (all-in)');
    }
    
    setCommunityCards(newCommunityCards);
    setDeck(gameDeck);
    setPhase('river');
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Go to showdown
    endHand(currentPlayers, currentPot);
  };

  const proceedToNextPhase = (currentPlayers: Player[], currentPot: number) => {
    const gameDeck = [...deck];
    
    // Reset for next betting round (but keep totalBetThisRound for tracking contributions)
    currentPlayers.forEach(p => {
      p.hasActed = false;
      p.currentBet = 0;
      // Don't reset totalBetThisRound - we need it to track total contributions
    });

    if (phase === 'preflop') {
      // Deal flop
      gameDeck.pop(); // Burn
      const flop = [gameDeck.pop()!, gameDeck.pop()!, gameDeck.pop()!];
      setCommunityCards(flop);
      setDeck(gameDeck);
      setPhase('flop');
      setPhaseMessage('Flop dealt');
      setCurrentBet(0);
      setActivePlayerIndex((dealerIndex + 1) % currentPlayers.length);
      setPlayers(currentPlayers);
      
      // Start next betting round
      setTimeout(() => {
        const firstPlayer = currentPlayers[(dealerIndex + 1) % currentPlayers.length];
        if (firstPlayer.id !== 'player' && !firstPlayer.hasFolded && !firstPlayer.isAllIn) {
          const aiAction = getAIAction(firstPlayer, 'flop');
          executeAIAction((dealerIndex + 1) % currentPlayers.length, aiAction, currentPlayers, currentPot);
        }
      }, 1500);
    } else if (phase === 'flop') {
      // Deal turn
      gameDeck.pop(); // Burn
      const turn = gameDeck.pop()!;
      setCommunityCards([...communityCards, turn]);
      setDeck(gameDeck);
      setPhase('turn');
      setPhaseMessage('Turn dealt');
      setCurrentBet(0);
      setActivePlayerIndex((dealerIndex + 1) % currentPlayers.length);
      setPlayers(currentPlayers);
      
      setTimeout(() => {
        const firstPlayer = currentPlayers[(dealerIndex + 1) % currentPlayers.length];
        if (firstPlayer.id !== 'player' && !firstPlayer.hasFolded && !firstPlayer.isAllIn) {
          const aiAction = getAIAction(firstPlayer, 'turn');
          executeAIAction((dealerIndex + 1) % currentPlayers.length, aiAction, currentPlayers, currentPot);
        }
      }, 1500);
    } else if (phase === 'turn') {
      // Deal river
      gameDeck.pop(); // Burn
      const river = gameDeck.pop()!;
      setCommunityCards([...communityCards, river]);
      setDeck(gameDeck);
      setPhase('river');
      setPhaseMessage('River dealt');
      setCurrentBet(0);
      setActivePlayerIndex((dealerIndex + 1) % currentPlayers.length);
      setPlayers(currentPlayers);
      
      setTimeout(() => {
        const firstPlayer = currentPlayers[(dealerIndex + 1) % currentPlayers.length];
        if (firstPlayer.id !== 'player' && !firstPlayer.hasFolded && !firstPlayer.isAllIn) {
          const aiAction = getAIAction(firstPlayer, 'river');
          executeAIAction((dealerIndex + 1) % currentPlayers.length, aiAction, currentPlayers, currentPot);
        }
      }, 1500);
    } else if (phase === 'river') {
      // Showdown
      endHand(currentPlayers, currentPot);
    }
  };

  const endHand = (currentPlayers: Player[], currentPot: number) => {
    const activePlayers = currentPlayers.filter(p => !p.hasFolded);
    
    if (activePlayers.length === 1) {
      // Everyone else folded
      const winnerPlayer = activePlayers[0];
      winnerPlayer.balance += currentPot;
      
      if (winnerPlayer.id === 'player') {
        setPlayerBalance(winnerPlayer.balance);
        const winnerContribution = currentPlayers.find(p => p.id === 'player')?.totalBetThisRound || 0;
        const profit = currentPot - winnerContribution;
        if (profit > 0) recordWin(profit);
      }
      
      setWinner({ name: winnerPlayer.name, handRank: 'All opponents folded', winAmount: currentPot });
      setShowdown(true);
      setPlayers(currentPlayers);
      return;
    }

    // Evaluate hands
    const handsWithPlayers = activePlayers.map(p => ({
      player: p,
      handEval: evaluateHand([...p.holeCards, ...communityCards])
    }));

    handsWithPlayers.sort((a, b) => compareHands(b.handEval, a.handEval));
    
    const bestHand = handsWithPlayers[0];
    const winnerPlayer = currentPlayers.find(p => p.id === bestHand.player.id)!;
    
    winnerPlayer.balance += currentPot;
    
    if (winnerPlayer.id === 'player') {
      setPlayerBalance(winnerPlayer.balance);
      const winnerContribution = currentPlayers.find(p => p.id === 'player')?.totalBetThisRound || 0;
      const profit = currentPot - winnerContribution;
      if (profit > 0) recordWin(profit);
    }

    setWinner({ 
      name: winnerPlayer.name, 
      handRank: bestHand.handEval.rankName, 
      winAmount: currentPot 
    });
    setShowdown(true);
    setPlayers(currentPlayers);
  };

  const nextHand = () => {
    // Check and reload balance if needed
    checkAndReload();
    
    setDealerIndex((dealerIndex + 1) % 4);
    startGame();
  };

  const renderCard = (card: Card, faceDown = false) => (
    <div className={`w-12 h-16 md:w-14 md:h-20 rounded-lg shadow-lg flex flex-col items-center justify-center ${
      faceDown ? 'bg-gradient-to-br from-blue-600 to-blue-800' : 'bg-white'
    }`}>
      {faceDown ? (
        <span className="text-2xl">🂠</span>
      ) : (
        <>
          <span className={`text-xs md:text-sm font-bold ${card.suit === '♥' || card.suit === '♦' ? 'text-red-600' : 'text-black'}`}>
            {card.value}
          </span>
          <span className={`text-lg md:text-xl ${card.suit === '♥' || card.suit === '♦' ? 'text-red-600' : 'text-black'}`}>
            {card.suit}
          </span>
        </>
      )}
    </div>
  );

  if (!gameStarted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-black/60 backdrop-blur-xl rounded-3xl p-8 border border-white/20">
          <button
            onClick={() => router.push('/casino')}
            className="mb-6 text-white/60 hover:text-white transition-colors"
          >
            ← Back to Casino
          </button>
          
          <h1 className="text-4xl font-bold text-white mb-4 text-center">
            🃏 Texas Hold&apos;em
          </h1>
          
          <div className="text-center text-white/80 mb-8">
            <p className="mb-2">Your balance: <span className="text-green-400 font-bold">${playerBalance.toLocaleString()}</span></p>
            <p className="text-sm text-white/60">Blinds: ${SMALL_BLIND}/${BIG_BLIND}</p>
          </div>

          <button
            onClick={startGame}
            className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl font-bold text-xl transition-all"
          >
            Start Game
          </button>
        </div>
      </div>
    );
  }

  const player = players.find(p => p.id === 'player');
  const isPlayerTurn = activePlayerIndex === players.findIndex(p => p.id === 'player');
  const callAmount = currentBet - (player?.totalBetThisRound || 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => router.push('/casino')}
            className="text-white/60 hover:text-white transition-colors"
          >
            ← Back to Casino
          </button>
          <div className="text-2xl font-bold text-green-400">${playerBalance.toLocaleString()}</div>
        </div>

        {/* Community Cards */}
        <div className="bg-green-700/50 rounded-2xl p-6 mb-4">
          <div className="text-center mb-4">
            <h2 className="text-2xl font-bold text-white mb-2">
              {phase.charAt(0).toUpperCase() + phase.slice(1)}
            </h2>
            <p className="text-green-200 text-sm">{phaseMessage}</p>
            <p className="text-yellow-300 font-bold text-xl mt-2">Pot: ${pot.toLocaleString()}</p>
          </div>
          
          <div className="flex justify-center gap-2 flex-wrap">
            {communityCards.map((card, i) => (
              <div key={i}>{renderCard(card)}</div>
            ))}
            {Array.from({ length: 5 - communityCards.length }).map((_, i) => (
              <div key={`empty-${i}`} className="w-12 h-16 md:w-14 md:h-20 rounded-lg border-2 border-dashed border-white/30" />
            ))}
          </div>
        </div>

        {/* AI Players */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          {players.filter(p => p.id !== 'player').map((p, i) => (
            <div key={p.id} className={`bg-gray-800/70 rounded-xl p-4 border-2 ${
              activePlayerIndex === players.findIndex(player => player.id === p.id) ? 'border-yellow-400' : 'border-transparent'
            }`}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-white font-bold">{p.name}</span>
                {p.isDealer && <span className="bg-yellow-500 text-black px-2 py-1 rounded text-xs font-bold">D</span>}
              </div>
              <p className="text-green-400 text-sm mb-2">${p.balance.toLocaleString()}</p>
              {!p.hasFolded && (
                <>
                  <div className="flex gap-1 mb-2">
                    {!showdown ? (
                      <>
                        {renderCard({ suit: '♠', value: '?', numValue: 0 }, true)}
                        {renderCard({ suit: '♠', value: '?', numValue: 0 }, true)}
                      </>
                    ) : (
                      p.holeCards.map((card, i) => <div key={i}>{renderCard(card)}</div>)
                    )}
                  </div>
                  <p className="text-yellow-300 text-sm">Bet: ${p.totalBetThisRound}</p>
                </>
              )}
              {p.hasFolded && <p className="text-red-400 text-sm">Folded</p>}
            </div>
          ))}
        </div>

        {/* Player Hand */}
        {player && (
          <div className={`bg-blue-900/70 rounded-xl p-6 border-2 ${
            isPlayerTurn && !showdown ? 'border-yellow-400' : 'border-transparent'
          }`}>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-white font-bold text-xl">{player.name}</h3>
                <p className="text-green-400">${player.balance.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-yellow-300">Current Bet: ${player.totalBetThisRound}</p>
                {isPlayerTurn && <p className="text-yellow-400 font-bold">Your Turn!</p>}
              </div>
            </div>

            {!player.hasFolded && (
              <div className="flex gap-2 mb-4">
                {player.holeCards.map((card, i) => (
                  <div key={i}>{renderCard(card)}</div>
                ))}
              </div>
            )}

            {player.hasFolded && (
              <p className="text-red-400 font-bold mb-4">You folded</p>
            )}

            {/* Actions */}
            {isPlayerTurn && !showdown && !player.hasFolded && (
              <div className="space-y-4">
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => handlePlayerAction('fold')}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold"
                  >
                    Fold
                  </button>
                  
                  {callAmount === 0 ? (
                    <button
                      onClick={() => handlePlayerAction('check')}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold"
                    >
                      Check
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePlayerAction('call')}
                      disabled={player.balance < callAmount}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-bold"
                    >
                      Call ${callAmount}
                    </button>
                  )}

                  <button
                    onClick={() => handlePlayerAction('allin')}
                    disabled={player.balance === 0}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg font-bold"
                  >
                    All-In (${player.balance})
                  </button>
                </div>

                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    value={raiseAmount}
                    onChange={(e) => setRaiseAmount(parseInt(e.target.value) || 0)}
                    min={currentBet + BIG_BLIND}
                    max={player.balance + player.totalBetThisRound}
                    className="flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white"
                    placeholder="Raise amount"
                  />
                  <button
                    onClick={() => handlePlayerAction('raise', raiseAmount)}
                    disabled={raiseAmount < currentBet + BIG_BLIND || raiseAmount > player.balance + player.totalBetThisRound}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white rounded-lg font-bold"
                  >
                    Raise to ${raiseAmount}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Winner Display */}
        {showdown && winner && (
          <div className="mt-4 bg-yellow-500 text-black rounded-xl p-6 text-center">
            <h2 className="text-3xl font-bold mb-2">🏆 {winner.name} Wins!</h2>
            <p className="text-xl mb-2">{winner.handRank}</p>
            <p className="text-2xl font-bold">${winner.winAmount.toLocaleString()}</p>
            <button
              onClick={nextHand}
              className="mt-4 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold"
            >
              Next Hand
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TexasHoldemGame() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white">Loading...</div>}>
      <TexasHoldemGameContent />
    </Suspense>
  );
}
