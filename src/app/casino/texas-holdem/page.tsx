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
  totalBetThisHand: number;
  hasFolded: boolean;
  isAllIn: boolean;
  isDealer: boolean;
}

type GamePhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

function TexasHoldemGameContent() {
  const router = useRouter();
  const { playerName: casinoName, balance: casinoBalance, setBalance: setCasinoBalance, recordWin } = useCasino();

  const [gameStarted, setGameStarted] = useState(false);
  const [phase, setPhase] = useState<GamePhase>('waiting');
  const [deck, setDeck] = useState<Card[]>([]);
  const [communityCards, setCommunityCards] = useState<Card[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [pot, setPot] = useState(0);
  const [currentBet, setCurrentBet] = useState(0);
  const [activePlayerIndex, setActivePlayerIndex] = useState(-1);
  const [dealerIndex, setDealerIndex] = useState(0);
  const [playerBalance, setPlayerBalance] = useState(casinoBalance);
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [showdown, setShowdown] = useState(false);
  const [winner, setWinner] = useState<{ name: string; handRank: string; winAmount: number } | null>(null);
  const [message, setMessage] = useState('Click Deal to start!');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const SMALL_BLIND = 50;
  const BIG_BLIND = 100;

  useEffect(() => {
    setCasinoBalance(playerBalance);
  }, [playerBalance, setCasinoBalance]);

  const createDeck = (): Card[] => {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const numValues = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
    const newDeck: Card[] = [];

    for (let suit of suits) {
      for (let i = 0; i < values.length; i++) {
        newDeck.push({ suit, value: values[i], numValue: numValues[i] });
      }
    }

    return newDeck.sort(() => Math.random() - 0.5);
  };

  const dealNewHand = () => {
    if (playerBalance < BIG_BLIND) {
      setMessage('Not enough chips to play! Need at least $100.');
      return;
    }

    const gameDeck = createDeck();
    const newDealerIndex = (dealerIndex + 1) % 4;
    
    const allPlayers: Player[] = [
      { id: 'player', name: casinoName || 'You', balance: playerBalance, holeCards: [], currentBet: 0, totalBetThisHand: 0, hasFolded: false, isAllIn: false, isDealer: false },
      { id: 'ai1', name: 'AI Alex', balance: 25000, holeCards: [], currentBet: 0, totalBetThisHand: 0, hasFolded: false, isAllIn: false, isDealer: false },
      { id: 'ai2', name: 'AI Beth', balance: 25000, holeCards: [], currentBet: 0, totalBetThisHand: 0, hasFolded: false, isAllIn: false, isDealer: false },
      { id: 'ai3', name: 'AI Carl', balance: 25000, holeCards: [], currentBet: 0, totalBetThisHand: 0, hasFolded: false, isAllIn: false, isDealer: false }
    ];

    allPlayers[newDealerIndex].isDealer = true;

    // Deal hole cards
    for (let i = 0; i < 2; i++) {
      allPlayers.forEach(player => {
        player.holeCards.push(gameDeck.pop()!);
      });
    }

    // Post blinds
    const sbIndex = (newDealerIndex + 1) % 4;
    const bbIndex = (newDealerIndex + 2) % 4;
    
    const sbAmount = Math.min(SMALL_BLIND, allPlayers[sbIndex].balance);
    const bbAmount = Math.min(BIG_BLIND, allPlayers[bbIndex].balance);
    
    allPlayers[sbIndex].balance -= sbAmount;
    allPlayers[sbIndex].currentBet = sbAmount;
    allPlayers[sbIndex].totalBetThisHand = sbAmount;
    if (sbAmount === allPlayers[sbIndex].balance + sbAmount) allPlayers[sbIndex].isAllIn = true;
    
    allPlayers[bbIndex].balance -= bbAmount;
    allPlayers[bbIndex].currentBet = bbAmount;
    allPlayers[bbIndex].totalBetThisHand = bbAmount;
    if (bbAmount === allPlayers[bbIndex].balance + bbAmount) allPlayers[bbIndex].isAllIn = true;

    if (allPlayers[0].id === 'player') {
      setPlayerBalance(allPlayers[0].balance);
    }

    setDeck(gameDeck);
    setCommunityCards([]);
    setPot(sbAmount + bbAmount);
    setCurrentBet(BIG_BLIND);
    setPhase('preflop');
    setActivePlayerIndex((bbIndex + 1) % 4);
    setPlayers(allPlayers);
    setDealerIndex(newDealerIndex);
    setGameStarted(true);
    setShowdown(false);
    setWinner(null);
    setMessage('Pre-flop betting');
    setRaiseAmount(BIG_BLIND * 2);
    setIsProcessing(false);

    // Auto-play AI if first to act
    if (allPlayers[(bbIndex + 1) % 4].id !== 'player') {
      setTimeout(() => processAITurns(allPlayers, sbAmount + bbAmount, BIG_BLIND, (bbIndex + 1) % 4, gameDeck, []), 1000);
    }
  };

  const processAITurns = async (currentPlayers: Player[], currentPot: number, currentBetAmount: number, startIndex: number, currentDeck: Card[], currentCommunity: Card[]) => {
    if (isProcessing) return;
    setIsProcessing(true);

    let workingPlayers = [...currentPlayers];
    let workingPot = currentPot;
    let workingBet = currentBetAmount;
    let index = startIndex;

    while (true) {
      const activePlayers = workingPlayers.filter(p => !p.hasFolded && !p.isAllIn);
      
      // Check if betting round is complete
      if (activePlayers.length === 0 || 
          (activePlayers.length === 1 && activePlayers[0].id === 'player')) {
        // Move to next phase or showdown
        const nonFoldedPlayers = workingPlayers.filter(p => !p.hasFolded);
        if (nonFoldedPlayers.length === 1 || phase === 'river' || activePlayers.length === 0) {
          await resolveShowdown(workingPlayers, workingPot, currentDeck, currentCommunity);
          setIsProcessing(false);
          return;
        } else {
          await advancePhase(workingPlayers, workingPot, currentDeck, currentCommunity);
          setIsProcessing(false);
          return;
        }
      }

      // Check if all active players have matching bets
      const maxBet = Math.max(...workingPlayers.map(p => p.currentBet));
      const allMatched = activePlayers.every(p => p.currentBet === maxBet);
      
      if (allMatched) {
        // Betting round complete, advance phase
        const nonFoldedPlayers = workingPlayers.filter(p => !p.hasFolded);
        if (nonFoldedPlayers.length === 1 || phase === 'river') {
          await resolveShowdown(workingPlayers, workingPot, currentDeck, currentCommunity);
          setIsProcessing(false);
          return;
        } else {
          await advancePhase(workingPlayers, workingPot, currentDeck, currentCommunity);
          setIsProcessing(false);
          return;
        }
      }

      const currentPlayer = workingPlayers[index];

      // Skip folded or all-in players
      if (currentPlayer.hasFolded || currentPlayer.isAllIn) {
        index = (index + 1) % 4;
        continue;
      }

      // If it's the player's turn, stop and wait for input
      if (currentPlayer.id === 'player') {
        setPlayers(workingPlayers);
        setPot(workingPot);
        setCurrentBet(workingBet);
        setActivePlayerIndex(index);
        setIsProcessing(false);
        return;
      }

      // AI's turn
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const action = getAIAction(currentPlayer, workingBet, currentCommunity);
      
      if (action.type === 'fold') {
        currentPlayer.hasFolded = true;
        setMessage(`${currentPlayer.name} folds`);
      } else if (action.type === 'call') {
        const callAmount = Math.min(workingBet - currentPlayer.currentBet, currentPlayer.balance);
        currentPlayer.balance -= callAmount;
        currentPlayer.currentBet += callAmount;
        currentPlayer.totalBetThisHand += callAmount;
        workingPot += callAmount;
        if (currentPlayer.balance === 0) currentPlayer.isAllIn = true;
        setMessage(`${currentPlayer.name} calls $${callAmount}`);
        workingBet = Math.max(workingBet, currentPlayer.currentBet);
      } else if (action.type === 'raise') {
        const raiseTotal = action.amount!;
        const raiseAmount = Math.min(raiseTotal - currentPlayer.currentBet, currentPlayer.balance);
        currentPlayer.balance -= raiseAmount;
        currentPlayer.currentBet += raiseAmount;
        currentPlayer.totalBetThisHand += raiseAmount;
        workingPot += raiseAmount;
        workingBet = currentPlayer.currentBet;
        if (currentPlayer.balance === 0) currentPlayer.isAllIn = true;
        setMessage(`${currentPlayer.name} raises to $${currentPlayer.currentBet}`);
      } else if (action.type === 'check') {
        setMessage(`${currentPlayer.name} checks`);
      } else if (action.type === 'allin') {
        const allinAmount = currentPlayer.balance;
        currentPlayer.currentBet += allinAmount;
        currentPlayer.totalBetThisHand += allinAmount;
        currentPlayer.balance = 0;
        currentPlayer.isAllIn = true;
        workingPot += allinAmount;
        if (currentPlayer.currentBet > workingBet) {
          workingBet = currentPlayer.currentBet;
        }
        setMessage(`${currentPlayer.name} goes all-in!`);
      }

      setPlayers([...workingPlayers]);
      setPot(workingPot);
      setCurrentBet(workingBet);
      
      index = (index + 1) % 4;
    }
  };

  const getAIAction = (player: Player, currentBetAmount: number, community: Card[]): { type: 'fold' | 'call' | 'raise' | 'check' | 'allin'; amount?: number } => {
    const callAmount = currentBetAmount - player.currentBet;
    
    // Can't call with insufficient funds
    if (callAmount > player.balance) {
      // Evaluate hand to decide all-in or fold
      const handStrength = evaluateHandStrength(player.holeCards, community);
      if (handStrength > 0.6) {
        return { type: 'allin' };
      }
      return { type: 'fold' };
    }

    const handStrength = evaluateHandStrength(player.holeCards, community);
    
    if (callAmount === 0) {
      // Can check for free
      if (handStrength > 0.65 && Math.random() > 0.7 && player.balance > BIG_BLIND * 2) {
        return { type: 'raise', amount: currentBetAmount + BIG_BLIND * 2 };
      }
      return { type: 'check' };
    }

    // Need to call
    const potOdds = callAmount / (pot + callAmount);
    
    if (handStrength > 0.75) {
      // Strong hand - raise
      if (player.balance > callAmount + BIG_BLIND * 2 && Math.random() > 0.6) {
        return { type: 'raise', amount: currentBetAmount + BIG_BLIND * 2 };
      }
      return { type: 'call' };
    } else if (handStrength > 0.5) {
      // Decent hand - call
      return { type: 'call' };
    } else if (handStrength > 0.3 && callAmount < player.balance * 0.1) {
      // Marginal hand, cheap call
      return { type: 'call' };
    }
    
    return { type: 'fold' };
  };

  const evaluateHandStrength = (holeCards: Card[], community: Card[]): number => {
    const allCards = [...holeCards, ...community];
    if (allCards.length < 2) return 0.3;
    
    // Simple hand strength evaluation
    const values = holeCards.map(c => c.numValue);
    const isPair = values[0] === values[1];
    const isHighCard = Math.max(...values) >= 12; // Q or better
    
    if (isPair && values[0] >= 10) return 0.8; // High pair
    if (isPair) return 0.6; // Any pair
    if (isHighCard) return 0.4; // High card
    
    return 0.2;
  };

  const advancePhase = async (workingPlayers: Player[], workingPot: number, currentDeck: Card[], currentCommunity: Card[]) => {
    const gameDeck = [...currentDeck];
    let newCommunity = [...currentCommunity];
    
    // Reset current bets for next round
    workingPlayers.forEach(p => p.currentBet = 0);
    
    let nextPhase: GamePhase = 'showdown';
    if (phase === 'preflop') {
      gameDeck.pop(); // Burn
      newCommunity = [gameDeck.pop()!, gameDeck.pop()!, gameDeck.pop()!];
      nextPhase = 'flop';
      setMessage('Flop dealt');
    } else if (phase === 'flop') {
      gameDeck.pop(); // Burn
      newCommunity.push(gameDeck.pop()!);
      nextPhase = 'turn';
      setMessage('Turn dealt');
    } else if (phase === 'turn') {
      gameDeck.pop(); // Burn
      newCommunity.push(gameDeck.pop()!);
      nextPhase = 'river';
      setMessage('River dealt');
    }

    setPhase(nextPhase);
    setCommunityCards(newCommunity);
    setDeck(gameDeck);
    setCurrentBet(0);
    
    // Find first non-folded, non-all-in player after dealer
    let nextPlayerIndex = (dealerIndex + 1) % 4;
    while (workingPlayers[nextPlayerIndex].hasFolded || workingPlayers[nextPlayerIndex].isAllIn) {
      nextPlayerIndex = (nextPlayerIndex + 1) % 4;
      if (nextPlayerIndex === dealerIndex) break;
    }

    setActivePlayerIndex(nextPlayerIndex);
    setPlayers(workingPlayers);
    setPot(workingPot);

    await new Promise(resolve => setTimeout(resolve, 1500));

    if (workingPlayers[nextPlayerIndex].id !== 'player') {
      processAITurns(workingPlayers, workingPot, 0, nextPlayerIndex, gameDeck, newCommunity);
    }
  };

  const resolveShowdown = async (workingPlayers: Player[], workingPot: number, currentDeck: Card[], currentCommunity: Card[]) => {
    // If all cards aren't dealt, deal them
    let finalCommunity = [...currentCommunity];
    const gameDeck = [...currentDeck];
    
    while (finalCommunity.length < 5) {
      gameDeck.pop(); // Burn
      finalCommunity.push(gameDeck.pop()!);
    }

    setCommunityCards(finalCommunity);
    setPhase('showdown');

    const nonFoldedPlayers = workingPlayers.filter(p => !p.hasFolded);
    
    if (nonFoldedPlayers.length === 1) {
      const winner = nonFoldedPlayers[0];
      winner.balance += workingPot;
      
      if (winner.id === 'player') {
        const profit = workingPot - winner.totalBetThisHand;
        setPlayerBalance(winner.balance);
        if (profit > 0) recordWin(profit);
      }
      
      setWinner({ name: winner.name, handRank: 'All opponents folded', winAmount: workingPot });
      setPlayers([...workingPlayers]);
      setShowdown(true);
      setMessage(`${winner.name} wins $${workingPot}!`);
      return;
    }

    // Evaluate hands
    const evaluatedPlayers = nonFoldedPlayers.map(p => ({
      player: p,
      hand: evaluateHand([...p.holeCards, ...finalCommunity])
    }));

    // Find winner
    evaluatedPlayers.sort((a, b) => {
      if (a.hand.rank !== b.hand.rank) return b.hand.rank - a.hand.rank;
      for (let i = 0; i < a.hand.tiebreaker.length; i++) {
        if (a.hand.tiebreaker[i] !== b.hand.tiebreaker[i]) {
          return b.hand.tiebreaker[i] - a.hand.tiebreaker[i];
        }
      }
      return 0;
    });

    const winnerPlayer = evaluatedPlayers[0].player;
    winnerPlayer.balance += workingPot;
    
    if (winnerPlayer.id === 'player') {
      const profit = workingPot - winnerPlayer.totalBetThisHand;
      setPlayerBalance(winnerPlayer.balance);
      if (profit > 0) recordWin(profit);
    }

    setWinner({ name: winnerPlayer.name, handRank: evaluatedPlayers[0].hand.rankName, winAmount: workingPot });
    setPlayers([...workingPlayers]);
    setShowdown(true);
    setMessage(`${winnerPlayer.name} wins with ${evaluatedPlayers[0].hand.rankName}!`);
  };

  const evaluateHand = (cards: Card[]): { rank: number; rankName: string; tiebreaker: number[] } => {
    const counts = new Map<number, number>();
    const suits = new Map<string, number>();
    
    cards.forEach(card => {
      counts.set(card.numValue, (counts.get(card.numValue) || 0) + 1);
      suits.set(card.suit, (suits.get(card.suit) || 0) + 1);
    });

    const values = Array.from(counts.keys()).sort((a, b) => b - a);
    const countArray = Array.from(counts.values()).sort((a, b) => b - a);
    const isFlush = Array.from(suits.values()).some(count => count >= 5);
    
    // Check straight
    let isStraight = false;
    const sortedValues = [...new Set(cards.map(c => c.numValue))].sort((a, b) => b - a);
    for (let i = 0; i <= sortedValues.length - 5; i++) {
      if (sortedValues[i] - sortedValues[i + 4] === 4) {
        isStraight = true;
        break;
      }
    }

    if (isFlush && isStraight) {
      return { rank: 9, rankName: 'Straight Flush', tiebreaker: values };
    } else if (countArray[0] === 4) {
      return { rank: 8, rankName: 'Four of a Kind', tiebreaker: values };
    } else if (countArray[0] === 3 && countArray[1] === 2) {
      return { rank: 7, rankName: 'Full House', tiebreaker: values };
    } else if (isFlush) {
      return { rank: 6, rankName: 'Flush', tiebreaker: values };
    } else if (isStraight) {
      return { rank: 5, rankName: 'Straight', tiebreaker: values };
    } else if (countArray[0] === 3) {
      return { rank: 4, rankName: 'Three of a Kind', tiebreaker: values };
    } else if (countArray[0] === 2 && countArray[1] === 2) {
      return { rank: 3, rankName: 'Two Pair', tiebreaker: values };
    } else if (countArray[0] === 2) {
      return { rank: 2, rankName: 'Pair', tiebreaker: values };
    } else {
      return { rank: 1, rankName: 'High Card', tiebreaker: values };
    }
  };

  const handlePlayerAction = (action: 'fold' | 'call' | 'raise' | 'check' | 'allin', raiseTotal?: number) => {
    if (activePlayerIndex < 0 || players[activePlayerIndex]?.id !== 'player' || isProcessing) return;

    const workingPlayers = [...players];
    const player = workingPlayers[activePlayerIndex];
    let workingPot = pot;

    if (action === 'fold') {
      player.hasFolded = true;
      setMessage('You fold');
    } else if (action === 'check') {
      setMessage('You check');
    } else if (action === 'call') {
      const callAmount = Math.min(currentBet - player.currentBet, player.balance);
      player.balance -= callAmount;
      player.currentBet += callAmount;
      player.totalBetThisHand += callAmount;
      workingPot += callAmount;
      if (player.balance === 0) player.isAllIn = true;
      setPlayerBalance(player.balance);
      setMessage(`You call $${callAmount}`);
    } else if (action === 'raise' && raiseTotal) {
      const raiseAmount = Math.min(raiseTotal - player.currentBet, player.balance);
      player.balance -= raiseAmount;
      player.currentBet += raiseAmount;
      player.totalBetThisHand += raiseAmount;
      workingPot += raiseAmount;
      if (player.balance === 0) player.isAllIn = true;
      setPlayerBalance(player.balance);
      setMessage(`You raise to $${player.currentBet}`);
      setCurrentBet(player.currentBet);
    } else if (action === 'allin') {
      const allinAmount = player.balance;
      player.currentBet += allinAmount;
      player.totalBetThisHand += allinAmount;
      player.balance = 0;
      player.isAllIn = true;
      workingPot += allinAmount;
      setPlayerBalance(0);
      setMessage('You go all-in!');
      if (player.currentBet > currentBet) {
        setCurrentBet(player.currentBet);
      }
    }

    setPlayers(workingPlayers);
    setPot(workingPot);

    const nextIndex = (activePlayerIndex + 1) % 4;
    setActivePlayerIndex(nextIndex);

    setTimeout(() => {
      processAITurns(workingPlayers, workingPot, action === 'raise' && raiseTotal ? player.currentBet : currentBet, nextIndex, deck, communityCards);
    }, 500);
  };

  const renderCard = (card: Card, hidden = false) => {
    if (hidden) {
      return (
        <div className="w-16 h-24 bg-blue-600 rounded-lg border-2 border-white flex items-center justify-center">
          <div className="text-white text-2xl">🂠</div>
        </div>
      );
    }

    const color = card.suit === '♥' || card.suit === '♦' ? 'text-red-600' : 'text-black';
    return (
      <div className="w-16 h-24 bg-white rounded-lg border-2 border-gray-300 flex flex-col items-center justify-between p-1">
        <div className={`text-sm font-bold ${color}`}>{card.value}</div>
        <div className={`text-2xl ${color}`}>{card.suit}</div>
        <div className={`text-sm font-bold ${color}`}>{card.value}</div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4 bg-black/40 rounded-lg p-4">
          <button
            onClick={() => router.push('/casino')}
            className="text-white/60 hover:text-white transition-colors"
          >
            ← Back to Casino
          </button>
          <div className="text-2xl font-bold text-green-400">${playerBalance.toLocaleString()}</div>
        </div>

        <div className="text-center mb-4">
          <div className="text-white text-xl">{message}</div>
          <div className="text-yellow-400 text-2xl font-bold">Pot: ${pot.toLocaleString()}</div>
        </div>

        {/* Community Cards */}
        <div className="bg-green-700/50 rounded-2xl p-6 mb-4">
          <div className="flex justify-center gap-2 mb-4">
            {communityCards.length > 0 ? (
              communityCards.map((card, i) => <div key={i}>{renderCard(card)}</div>)
            ) : (
              <div className="text-white/60">Community cards will appear here</div>
            )}
          </div>
        </div>

        {/* Opponents */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          {players.filter(p => p.id !== 'player').map((player, index) => (
            <div key={player.id} className={`bg-gray-800 rounded-lg p-4 ${activePlayerIndex === players.indexOf(player) ? 'ring-4 ring-yellow-400' : ''}`}>
              <div className="flex justify-between items-center mb-2">
                <div className="text-white font-bold">{player.name}</div>
                {player.isDealer && <div className="text-yellow-400 text-xl">D</div>}
              </div>
              <div className="text-green-400 font-bold">${player.balance.toLocaleString()}</div>
              {player.hasFolded && <div className="text-red-400">Folded</div>}
              {player.isAllIn && <div className="text-orange-400">All-In</div>}
              {player.currentBet > 0 && <div className="text-yellow-400">Bet: ${player.currentBet}</div>}
              <div className="flex gap-1 mt-2">
                {player.holeCards.map((_, i) => <div key={i}>{renderCard({ suit: '♠', value: '?', numValue: 0 }, true)}</div>)}
              </div>
            </div>
          ))}
        </div>

        {/* Player */}
        {players.find(p => p.id === 'player') && (
          <div className="bg-blue-800 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="text-white font-bold text-xl">{casinoName || 'You'}</div>
              {players.find(p => p.id === 'player')!.isDealer && <div className="text-yellow-400 text-2xl">D</div>}
            </div>
            <div className="flex gap-2 mb-4">
              {players.find(p => p.id === 'player')!.holeCards.map((card, i) => (
                <div key={i}>{renderCard(card)}</div>
              ))}
            </div>

            {!gameStarted && (
              <button
                onClick={dealNewHand}
                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-xl"
              >
                Deal Hand
              </button>
            )}

            {gameStarted && !showdown && activePlayerIndex >= 0 && players[activePlayerIndex]?.id === 'player' && !players[activePlayerIndex].hasFolded && !players[activePlayerIndex].isAllIn && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {currentBet === players[activePlayerIndex].currentBet ? (
                    <button
                      onClick={() => handlePlayerAction('check')}
                      className="py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold"
                    >
                      Check
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePlayerAction('call')}
                      disabled={currentBet - players[activePlayerIndex].currentBet > players[activePlayerIndex].balance}
                      className="py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg font-bold"
                    >
                      Call ${currentBet - players[activePlayerIndex].currentBet}
                    </button>
                  )}
                  <button
                    onClick={() => handlePlayerAction('fold')}
                    className="py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold"
                  >
                    Fold
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={raiseAmount}
                    onChange={(e) => setRaiseAmount(Math.max(currentBet + BIG_BLIND, parseInt(e.target.value) || 0))}
                    min={currentBet + BIG_BLIND}
                    max={players[activePlayerIndex].balance + players[activePlayerIndex].currentBet}
                    className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg"
                  />
                  <button
                    onClick={() => handlePlayerAction('raise', raiseAmount)}
                    disabled={raiseAmount <= currentBet || raiseAmount > players[activePlayerIndex].balance + players[activePlayerIndex].currentBet}
                    className="px-6 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white rounded-lg font-bold"
                  >
                    Raise
                  </button>
                </div>
                <button
                  onClick={() => handlePlayerAction('allin')}
                  className="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-bold"
                >
                  All-In (${players[activePlayerIndex].balance})
                </button>
              </div>
            )}

            {showdown && winner && (
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-400 mb-2">{winner.name} wins!</div>
                <div className="text-xl text-white mb-2">{winner.rankName}</div>
                <div className="text-lg text-green-400">${winner.winAmount.toLocaleString()}</div>
                <button
                  onClick={dealNewHand}
                  className="mt-4 py-3 px-6 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold"
                >
                  Next Hand
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TexasHoldem() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TexasHoldemGameContent />
    </Suspense>
  );
}
