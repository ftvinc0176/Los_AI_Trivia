'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useCasino } from '../CasinoContext';

type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

interface Card {
  suit: Suit;
  rank: Rank;
}

// Stake.us Jacks or Better paytable
const PAYTABLE: Record<string, number> = {
  'ROYAL FLUSH': 800,
  'STRAIGHT FLUSH': 60,
  '4 OF A KIND': 22,
  'FULL HOUSE': 9,
  'FLUSH': 6,
  'STRAIGHT': 4,
  '3 OF A KIND': 3,
  '2 PAIR': 2,
  'JACKS OR BETTER': 1,
};

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

export default function VideoPoker() {
  const router = useRouter();
  const { balance, setBalance, recordBet, checkAndReload } = useCasino();
  
  const [betAmount, setBetAmount] = useState(500000);
  const [gamePhase, setGamePhase] = useState<'betting' | 'holding' | 'result'>('betting');
  const [hand, setHand] = useState<(Card | null)[]>([null, null, null, null, null]);
  const [heldCards, setHeldCards] = useState<boolean[]>([false, false, false, false, false]);
  const [deck, setDeck] = useState<Card[]>([]);
  const [handResult, setHandResult] = useState<string | null>(null);
  const [winAmount, setWinAmount] = useState(0);
  const deckRef = useRef<Card[]>([]);

  useEffect(() => {
    if (balance < 1000 && gamePhase === 'betting') {
      checkAndReload();
    }
  }, [balance, gamePhase, checkAndReload]);

  // Create shuffled deck
  const createDeck = (): Card[] => {
    const newDeck: Card[] = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        newDeck.push({ suit, rank });
      }
    }
    // Fisher-Yates shuffle
    for (let i = newDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }
    return newDeck;
  };

  // Get rank value
  const getRankValue = (rank: Rank): number => {
    const values: Record<Rank, number> = {
      'A': 14, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
      '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13
    };
    return values[rank];
  };

  // Evaluate hand
  const evaluateHand = (cards: Card[]): string => {
    if (cards.length !== 5 || cards.some(c => !c)) return 'No Win';
    
    const ranks = cards.map(c => getRankValue(c.rank)).sort((a, b) => a - b);
    const suits = cards.map(c => c.suit);
    
    const isFlush = suits.every(s => s === suits[0]);
    
    // Check straight
    const isStraight = (() => {
      const unique = [...new Set(ranks)];
      if (unique.length !== 5) return false;
      if (unique[4] - unique[0] === 4) return true;
      // Wheel (A-2-3-4-5)
      if (unique.join(',') === '2,3,4,5,14') return true;
      return false;
    })();
    
    const isRoyal = ranks.join(',') === '10,11,12,13,14';
    
    // Count ranks
    const rankCounts: Record<number, number> = {};
    for (const r of ranks) {
      rankCounts[r] = (rankCounts[r] || 0) + 1;
    }
    const counts = Object.values(rankCounts).sort((a, b) => b - a);
    
    if (isRoyal && isFlush) return 'ROYAL FLUSH';
    if (isStraight && isFlush) return 'STRAIGHT FLUSH';
    if (counts[0] === 4) return '4 OF A KIND';
    if (counts[0] === 3 && counts[1] === 2) return 'FULL HOUSE';
    if (isFlush) return 'FLUSH';
    if (isStraight) return 'STRAIGHT';
    if (counts[0] === 3) return '3 OF A KIND';
    if (counts[0] === 2 && counts[1] === 2) return '2 PAIR';
    
    // Jacks or Better
    if (counts[0] === 2) {
      for (const [rank, count] of Object.entries(rankCounts)) {
        if (count === 2 && Number(rank) >= 11) {
          return 'JACKS OR BETTER';
        }
      }
    }
    
    return 'No Win';
  };

  // Deal initial 5 cards
  const deal = () => {
    if (betAmount > balance || betAmount <= 0) return;
    
    setBalance(balance - betAmount);
    recordBet(betAmount);
    
    const newDeck = createDeck();
    const dealtCards = newDeck.slice(0, 5);
    const remaining = newDeck.slice(5);
    
    deckRef.current = remaining;
    setDeck(remaining);
    setHand(dealtCards);
    setHeldCards([false, false, false, false, false]);
    setHandResult(null);
    setWinAmount(0);
    setGamePhase('holding');
  };

  // Toggle hold
  const toggleHold = (index: number) => {
    if (gamePhase !== 'holding') return;
    setHeldCards(prev => {
      const newHeld = [...prev];
      newHeld[index] = !newHeld[index];
      return newHeld;
    });
  };

  // Draw - replace non-held cards
  const draw = () => {
    if (gamePhase !== 'holding') return;
    
    const currentDeck = [...deckRef.current];
    let deckIndex = 0;
    
    const newHand = hand.map((card, i) => {
      if (heldCards[i] && card) {
        return card; // Keep held card
      } else {
        // Draw new card from deck
        const newCard = currentDeck[deckIndex];
        deckIndex++;
        return newCard;
      }
    });
    
    setHand(newHand);
    
    // Evaluate the final hand
    const validCards = newHand.filter((c): c is Card => c !== null);
    const result = evaluateHand(validCards);
    setHandResult(result);
    
    if (result !== 'No Win') {
      const mult = PAYTABLE[result] || 0;
      const win = betAmount * mult;
      setWinAmount(win);
      setBalance(balance - betAmount + win);
    }
    
    setGamePhase('result');
  };

  // New game
  const newGame = () => {
    setHand([null, null, null, null, null]);
    setHeldCards([false, false, false, false, false]);
    setHandResult(null);
    setWinAmount(0);
    setGamePhase('betting');
  };

  // Render card
  const renderCard = (card: Card | null, index: number) => {
    const isHeld = heldCards[index];
    
    // Face down card (before deal)
    if (!card) {
      return (
        <div 
          key={index}
          className="aspect-[2.5/3.5] bg-gradient-to-br from-blue-700 to-blue-900 rounded-xl border-2 border-blue-500/50 flex items-center justify-center shadow-xl"
        >
          <span className="text-3xl">🎴</span>
        </div>
      );
    }
    
    const symbol = SUIT_SYMBOLS[card.suit];
    const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
    const textColor = isRed ? 'text-red-500' : 'text-slate-800';
    
    return (
      <div key={index} className="relative">
        {/* HELD badge */}
        {isHeld && gamePhase === 'holding' && (
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-yellow-400 text-black text-[10px] font-bold px-2 py-0.5 rounded z-10">
            HELD
          </div>
        )}
        
        <button
          onClick={() => toggleHold(index)}
          disabled={gamePhase !== 'holding'}
          className={`aspect-[2.5/3.5] w-full bg-white rounded-xl shadow-lg transition-all duration-200 relative overflow-hidden ${
            isHeld ? 'ring-4 ring-yellow-400 -translate-y-2' : ''
          } ${gamePhase === 'holding' ? 'cursor-pointer hover:-translate-y-1' : 'cursor-default'}`}
        >
          {/* Card face */}
          <div className="absolute inset-0 p-1.5 flex flex-col justify-between">
            {/* Top left */}
            <div className={`flex flex-col items-start ${textColor}`}>
              <span className="text-base sm:text-xl font-bold leading-none">{card.rank}</span>
              <span className="text-sm sm:text-lg leading-none">{symbol}</span>
            </div>
            
            {/* Center */}
            <div className={`text-3xl sm:text-4xl ${textColor} self-center`}>
              {symbol}
            </div>
            
            {/* Bottom right */}
            <div className={`flex flex-col items-end rotate-180 ${textColor}`}>
              <span className="text-base sm:text-xl font-bold leading-none">{card.rank}</span>
              <span className="text-sm sm:text-lg leading-none">{symbol}</span>
            </div>
          </div>
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#1a1d29] text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
        <button onClick={() => router.push('/casino')} className="text-slate-400 hover:text-white text-sm">
          ← Back
        </button>
        <span className="text-red-400 font-bold text-lg">VIDEO POKER</span>
        <div className="text-green-400 font-bold">${balance.toLocaleString()}</div>
      </div>

      {/* Main Layout - Centered container for desktop */}
      <div className="max-w-2xl mx-auto p-4 flex flex-col gap-4">
        
        {/* Game Area - ORDER 1 on mobile (shows first) */}
        <div className="order-1">
          {/* Paytable */}
          <div className="bg-slate-800/50 rounded-xl overflow-hidden mb-4">
            {Object.entries(PAYTABLE).map(([name, mult]) => (
              <div 
                key={name}
                className={`flex items-center justify-between px-4 py-2 border-b border-slate-700/30 last:border-0 ${
                  handResult === name ? 'bg-green-500/30' : ''
                }`}
              >
                <span className="text-white font-medium text-sm">{name}</span>
                <div className="flex items-center gap-4">
                  <span className="text-yellow-400 font-bold">{mult}×</span>
                  <span className="text-green-400 text-sm">${(mult * betAmount).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Result Banner */}
          {gamePhase === 'result' && (
            <div className={`mb-4 py-3 px-4 rounded-xl text-center font-bold ${
              winAmount > 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {winAmount > 0 ? `🎉 ${handResult}! +$${winAmount.toLocaleString()}` : 'No Win'}
            </div>
          )}

          {/* Cards - Bigger cards in centered container */}
          <div className="flex justify-center gap-2 sm:gap-3">
            {hand.map((card, i) => (
              <div key={i} className="w-[18%] sm:w-[17%] min-w-[60px] max-w-[110px]">
                {renderCard(card, i)}
              </div>
            ))}
          </div>

          {/* Hold Instruction */}
          {gamePhase === 'holding' && (
            <p className="text-center text-slate-500 text-sm mt-4">
              Tap cards to HOLD, then click DRAW
            </p>
          )}
        </div>

        {/* Controls - ORDER 2 on mobile (shows below cards) */}
        <div className="order-2 space-y-3 mt-4">
          {/* Amount */}
          <div>
            <label className="text-slate-400 text-xs mb-1 block">Amount</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={betAmount}
                onChange={(e) => setBetAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                disabled={gamePhase !== 'betting'}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none disabled:opacity-50"
              />
              <button 
                onClick={() => gamePhase === 'betting' && setBetAmount(Math.max(0, betAmount / 2))}
                disabled={gamePhase !== 'betting'}
                className="px-3 py-2 bg-slate-800 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-50"
              >½</button>
              <button 
                onClick={() => gamePhase === 'betting' && setBetAmount(betAmount * 2)}
                disabled={gamePhase !== 'betting'}
                className="px-3 py-2 bg-slate-800 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-50"
              >2×</button>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={gamePhase === 'betting' ? deal : gamePhase === 'holding' ? draw : newGame}
            disabled={gamePhase === 'betting' && (betAmount > balance || betAmount <= 0)}
            className={`w-full py-3 rounded-lg font-bold text-lg transition-all ${
              (gamePhase === 'betting' && (betAmount > balance || betAmount <= 0))
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-green-500 hover:bg-green-400 text-white'
            }`}
          >
            {gamePhase === 'betting' ? 'Deal' : gamePhase === 'holding' ? 'Draw' : 'New Game'}
          </button>

          {/* Instructions */}
          <div className="text-slate-500 text-xs text-center">
            {gamePhase === 'betting' && 'Click Deal to start.'}
            {gamePhase === 'holding' && 'Click cards to HOLD, then Draw.'}
            {gamePhase === 'result' && 'Click New Game to play again.'}
          </div>
        </div>
      </div>
    </div>
  );
}
