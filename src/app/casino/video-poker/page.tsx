'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCasino } from '../CasinoContext';

// Card types
type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

interface Card {
  suit: Suit;
  rank: Rank;
  held: boolean;
}

// Paytable from Stake.us (Jacks or Better)
const PAYTABLE = {
  'Royal Flush': 800,
  'Straight Flush': 60,
  '4 of a Kind': 22,
  'Full House': 9,
  'Flush': 6,
  'Straight': 4,
  '3 of a Kind': 3,
  '2 Pair': 2,
  'Jacks or Better': 1,
};

type HandRank = keyof typeof PAYTABLE | 'No Win';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// Suit symbols and colors
const SUIT_DISPLAY: Record<Suit, { symbol: string; color: string }> = {
  hearts: { symbol: '♥', color: 'text-red-500' },
  diamonds: { symbol: '♦', color: 'text-red-500' },
  clubs: { symbol: '♣', color: 'text-white' },
  spades: { symbol: '♠', color: 'text-white' },
};

export default function VideoPoker() {
  const router = useRouter();
  const { balance, setBalance, recordBet, checkAndReload } = useCasino();
  
  // Game state
  const [deck, setDeck] = useState<Card[]>([]);
  const [hand, setHand] = useState<Card[]>([]);
  const [betAmount, setBetAmount] = useState(100);
  const [gamePhase, setGamePhase] = useState<'betting' | 'holding' | 'result'>('betting');
  const [winAmount, setWinAmount] = useState(0);
  const [handRank, setHandRank] = useState<HandRank | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // Check for reload on balance change
  useEffect(() => {
    if (balance < 1000 && gamePhase === 'betting') {
      checkAndReload();
    }
  }, [balance, gamePhase, checkAndReload]);

  // Create and shuffle deck
  const createDeck = useCallback((): Card[] => {
    const newDeck: Card[] = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        newDeck.push({ suit, rank, held: false });
      }
    }
    // Fisher-Yates shuffle
    for (let i = newDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }
    return newDeck;
  }, []);

  // Get rank value for comparisons
  const getRankValue = (rank: Rank): number => {
    const values: Record<Rank, number> = {
      'A': 14, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
      '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13
    };
    return values[rank];
  };

  // Evaluate the hand
  const evaluateHand = useCallback((cards: Card[]): HandRank => {
    const ranks = cards.map(c => getRankValue(c.rank)).sort((a, b) => a - b);
    const suits = cards.map(c => c.suit);
    
    // Check flush
    const isFlush = suits.every(s => s === suits[0]);
    
    // Check straight (including A-2-3-4-5 and 10-J-Q-K-A)
    const isStraight = (() => {
      const unique = [...new Set(ranks)];
      if (unique.length !== 5) return false;
      const diff = unique[4] - unique[0];
      if (diff === 4) return true;
      // Check A-2-3-4-5 (wheel)
      if (unique.join(',') === '2,3,4,5,14') return true;
      return false;
    })();
    
    // Check royal (10-J-Q-K-A)
    const isRoyal = ranks.join(',') === '10,11,12,13,14';
    
    // Count ranks
    const rankCounts: Record<number, number> = {};
    for (const r of ranks) {
      rankCounts[r] = (rankCounts[r] || 0) + 1;
    }
    const counts = Object.values(rankCounts).sort((a, b) => b - a);
    
    // Evaluate hands from highest to lowest
    if (isRoyal && isFlush) return 'Royal Flush';
    if (isStraight && isFlush) return 'Straight Flush';
    if (counts[0] === 4) return '4 of a Kind';
    if (counts[0] === 3 && counts[1] === 2) return 'Full House';
    if (isFlush) return 'Flush';
    if (isStraight) return 'Straight';
    if (counts[0] === 3) return '3 of a Kind';
    if (counts[0] === 2 && counts[1] === 2) return '2 Pair';
    
    // Jacks or Better (pair of J, Q, K, or A)
    if (counts[0] === 2) {
      for (const [rank, count] of Object.entries(rankCounts)) {
        if (count === 2 && Number(rank) >= 11) {
          return 'Jacks or Better';
        }
      }
    }
    
    return 'No Win';
  }, []);

  // Deal initial hand
  const deal = useCallback(() => {
    if (betAmount > balance || isAnimating) return;
    
    setIsAnimating(true);
    setBalance(balance - betAmount);
    recordBet(betAmount);
    
    const newDeck = createDeck();
    const newHand = newDeck.slice(0, 5).map(c => ({ ...c, held: false }));
    
    setDeck(newDeck.slice(5));
    setHand([]);
    setWinAmount(0);
    setHandRank(null);
    
    // Animate dealing cards one by one
    setTimeout(() => setHand([newHand[0]]), 100);
    setTimeout(() => setHand([newHand[0], newHand[1]]), 200);
    setTimeout(() => setHand([newHand[0], newHand[1], newHand[2]]), 300);
    setTimeout(() => setHand([newHand[0], newHand[1], newHand[2], newHand[3]]), 400);
    setTimeout(() => {
      setHand(newHand);
      setGamePhase('holding');
      setIsAnimating(false);
    }, 500);
  }, [betAmount, balance, createDeck, setBalance, recordBet, isAnimating]);

  // Toggle hold on a card
  const toggleHold = useCallback((index: number) => {
    if (gamePhase !== 'holding') return;
    
    setHand(prev => prev.map((card, i) => 
      i === index ? { ...card, held: !card.held } : card
    ));
  }, [gamePhase]);

  // Draw new cards for non-held positions
  const draw = useCallback(() => {
    if (gamePhase !== 'holding' || isAnimating) return;
    
    setIsAnimating(true);
    
    // Replace non-held cards
    let deckIndex = 0;
    const newHand = hand.map(card => {
      if (card.held) return card;
      return { ...deck[deckIndex++], held: false };
    });
    
    // Animate the draw
    setTimeout(() => {
      setHand(newHand);
      
      // Evaluate and award winnings
      const rank = evaluateHand(newHand);
      setHandRank(rank);
      
      if (rank !== 'No Win') {
        const mult = PAYTABLE[rank];
        const win = betAmount * mult;
        setWinAmount(win);
        setBalance(balance - betAmount + win);
      }
      
      setGamePhase('result');
      setIsAnimating(false);
    }, 300);
  }, [gamePhase, hand, deck, betAmount, balance, setBalance, evaluateHand, isAnimating]);

  // New game
  const newGame = useCallback(() => {
    setHand([]);
    setHandRank(null);
    setWinAmount(0);
    setGamePhase('betting');
  }, []);

  // Render a card
  const renderCard = (card: Card | null, index: number, faceDown: boolean = false) => {
    if (!card) {
      // Empty card slot or face down
      return (
        <div 
          key={index}
          className="aspect-[2.5/3.5] bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl border-2 border-blue-400/50 flex items-center justify-center shadow-xl"
        >
          <div className="text-4xl font-bold text-blue-300/50">?</div>
        </div>
      );
    }
    
    if (faceDown) {
      return (
        <div 
          key={index}
          className="aspect-[2.5/3.5] bg-gradient-to-br from-red-700 to-red-900 rounded-xl border-2 border-red-500/50 flex items-center justify-center shadow-xl relative overflow-hidden"
        >
          <div className="absolute inset-0 opacity-20">
            <div className="absolute inset-2 border-2 border-white/30 rounded-lg" />
            <div className="absolute inset-4 border border-white/20 rounded" />
          </div>
          <div className="text-3xl font-bold text-red-300/70">🎰</div>
        </div>
      );
    }
    
    const { symbol, color } = SUIT_DISPLAY[card.suit];
    
    return (
      <button
        key={index}
        onClick={() => toggleHold(index)}
        disabled={gamePhase !== 'holding'}
        className={`aspect-[2.5/3.5] bg-white rounded-xl shadow-xl relative transition-all duration-200 ${
          card.held 
            ? 'ring-4 ring-yellow-400 shadow-yellow-400/50 -translate-y-3' 
            : 'hover:shadow-2xl'
        } ${gamePhase === 'holding' ? 'cursor-pointer hover:-translate-y-1' : 'cursor-default'}`}
      >
        {/* Held indicator */}
        {card.held && (
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-yellow-400 text-black text-xs font-bold px-2 py-0.5 rounded">
            HELD
          </div>
        )}
        
        {/* Card content */}
        <div className="absolute inset-0 flex flex-col justify-between p-1.5 sm:p-2">
          {/* Top left */}
          <div className={`flex flex-col items-start leading-tight ${color}`}>
            <span className="text-lg sm:text-2xl font-bold">{card.rank}</span>
            <span className="text-lg sm:text-xl -mt-1">{symbol}</span>
          </div>
          
          {/* Center */}
          <div className={`text-4xl sm:text-5xl self-center ${color}`}>
            {symbol}
          </div>
          
          {/* Bottom right */}
          <div className={`flex flex-col items-end leading-tight rotate-180 ${color}`}>
            <span className="text-lg sm:text-2xl font-bold">{card.rank}</span>
            <span className="text-lg sm:text-xl -mt-1">{symbol}</span>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 bg-black/40 border-b border-red-500/20 px-3 py-2">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/casino')} className="text-gray-400 hover:text-white text-sm">
            ← Back
          </button>
          <span className="text-red-400 font-bold">VIDEO POKER</span>
          <div className="text-green-400 font-bold text-sm">${balance.toLocaleString()}</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row gap-3 p-3 min-h-0 overflow-hidden">
        
        {/* Left Panel - Controls */}
        <div className="lg:w-56 flex-shrink-0 space-y-2 order-2 lg:order-1 overflow-auto">
          {/* Bet Amount */}
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
            <label className="block text-xs text-gray-500 mb-1">Amount</label>
            <div className="flex items-center gap-1">
              <input 
                type="number" 
                value={betAmount} 
                onChange={(e) => setBetAmount(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={gamePhase !== 'betting'} 
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
              />
              <button 
                onClick={() => gamePhase === 'betting' && setBetAmount(Math.max(1, betAmount / 2))} 
                disabled={gamePhase !== 'betting'}
                className="px-2 py-2 bg-slate-700 rounded-lg text-xs text-gray-300 hover:text-white disabled:opacity-50"
              >½</button>
              <button 
                onClick={() => gamePhase === 'betting' && setBetAmount(betAmount * 2)} 
                disabled={gamePhase !== 'betting'}
                className="px-2 py-2 bg-slate-700 rounded-lg text-xs text-gray-300 hover:text-white disabled:opacity-50"
              >2×</button>
            </div>
          </div>

          {/* Play Button */}
          <button 
            onClick={gamePhase === 'betting' ? deal : gamePhase === 'holding' ? draw : newGame}
            disabled={isAnimating || (gamePhase === 'betting' && betAmount > balance)}
            className={`w-full py-3 rounded-xl font-bold text-base transition-all ${
              isAnimating || (gamePhase === 'betting' && betAmount > balance)
                ? 'bg-slate-700 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 shadow-lg shadow-green-500/30 text-white'
            }`}
          >
            {gamePhase === 'betting' ? 'Deal' : gamePhase === 'holding' ? 'Draw' : 'New Game'}
          </button>

          {/* Instructions */}
          <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/50 text-xs text-gray-400">
            {gamePhase === 'betting' && <p>Click Deal to start. Jacks or Better pays 1×.</p>}
            {gamePhase === 'holding' && <p>Click cards to hold them, then click Draw.</p>}
            {gamePhase === 'result' && <p>Click New Game to play again.</p>}
          </div>
        </div>

        {/* Right Panel - Game Board */}
        <div className="flex-1 flex flex-col min-h-0 order-1 lg:order-2">
          
          {/* Paytable */}
          <div className="flex-shrink-0 bg-slate-800/60 rounded-xl p-2 border border-slate-700/50 mb-3 overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <tbody>
                {Object.entries(PAYTABLE).map(([hand, mult]) => (
                  <tr 
                    key={hand} 
                    className={`border-b border-slate-700/30 last:border-0 ${
                      handRank === hand ? 'bg-green-500/30' : ''
                    }`}
                  >
                    <td className="py-1.5 px-2 text-white font-medium uppercase">{hand}</td>
                    <td className="py-1.5 px-2 text-right text-yellow-400 font-bold">{mult}×</td>
                    <td className="py-1.5 px-2 text-right text-green-400 font-medium">
                      ${(mult * betAmount).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Result Banner */}
          {gamePhase === 'result' && (
            <div className={`flex-shrink-0 mb-3 py-3 px-4 rounded-xl text-center ${
              winAmount > 0 
                ? 'bg-gradient-to-r from-green-500/30 to-emerald-500/30 border border-green-500/50' 
                : 'bg-gradient-to-r from-red-500/30 to-pink-500/30 border border-red-500/50'
            }`}>
              {winAmount > 0 ? (
                <div>
                  <div className="text-2xl font-bold text-green-400 mb-1">🎉 {handRank}!</div>
                  <div className="text-xl font-bold text-white">+${winAmount.toLocaleString()}</div>
                </div>
              ) : (
                <span className="text-lg font-bold text-red-400">No Win</span>
              )}
            </div>
          )}

          {/* Cards */}
          <div className="flex-1 flex items-center justify-center min-h-0">
            <div className="grid grid-cols-5 gap-2 sm:gap-4 w-full max-w-2xl px-2">
              {gamePhase === 'betting' ? (
                // Show face-down cards before deal
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="aspect-[2.5/3.5] bg-gradient-to-br from-red-700 to-red-900 rounded-xl border-2 border-red-500/50 flex items-center justify-center shadow-xl relative overflow-hidden">
                    <div className="absolute inset-0 opacity-20">
                      <div className="absolute inset-2 border-2 border-white/30 rounded-lg" />
                    </div>
                    <div className="text-2xl sm:text-3xl font-bold text-red-300/70">🎰</div>
                  </div>
                ))
              ) : (
                // Show dealt cards
                hand.map((card, i) => renderCard(card, i))
              )}
            </div>
          </div>

          {/* Hold Instructions */}
          {gamePhase === 'holding' && (
            <div className="flex-shrink-0 text-center mt-4">
              <p className="text-gray-400 text-sm">Tap cards to HOLD, then click DRAW</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
