'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useCasino } from '../CasinoContext';

// Symbol types matching the actual game
type SymbolType = 'bandit' | 'skull' | 'gun' | 'bottle' | 'moneybag' | 'A' | 'K' | 'Q' | 'J' | '10' | 'wild' | 'vs' | 'train' | 'duel' | 'dead';

interface Symbol {
  type: SymbolType;
  id: string;
  multiplier?: number;
}

interface ReelState {
  symbols: Symbol[];
  isSpinning: boolean;
  hasStopped: boolean;
}

// Symbol configurations with colors matching the actual game
const SYMBOL_STYLES: Record<SymbolType, { bg: string; border: string; text: string; label: string }> = {
  bandit: { bg: 'bg-gradient-to-br from-teal-700 to-teal-900', border: 'border-teal-500', text: '🤠', label: 'Bandit' },
  skull: { bg: 'bg-gradient-to-br from-cyan-600 to-cyan-800', border: 'border-cyan-400', text: '🦴', label: 'Skull' },
  gun: { bg: 'bg-gradient-to-br from-red-800 to-red-950', border: 'border-red-600', text: '🔫', label: 'Gun' },
  bottle: { bg: 'bg-gradient-to-br from-amber-700 to-amber-900', border: 'border-amber-500', text: '🥃', label: 'Whiskey' },
  moneybag: { bg: 'bg-gradient-to-br from-yellow-600 to-yellow-800', border: 'border-yellow-500', text: '💰', label: 'Money' },
  A: { bg: 'bg-gradient-to-br from-red-700 to-red-900', border: 'border-red-500', text: 'A', label: 'Ace' },
  K: { bg: 'bg-gradient-to-br from-green-700 to-green-900', border: 'border-green-500', text: 'K', label: 'King' },
  Q: { bg: 'bg-gradient-to-br from-cyan-700 to-cyan-900', border: 'border-cyan-500', text: 'Q', label: 'Queen' },
  J: { bg: 'bg-gradient-to-br from-blue-700 to-blue-900', border: 'border-blue-500', text: 'J', label: 'Jack' },
  '10': { bg: 'bg-gradient-to-br from-gray-600 to-gray-800', border: 'border-gray-500', text: '10', label: 'Ten' },
  wild: { bg: 'bg-gradient-to-br from-yellow-500 to-orange-600', border: 'border-yellow-400', text: '⭐', label: 'Wild' },
  vs: { bg: 'bg-gradient-to-br from-red-600 via-yellow-500 to-red-600', border: 'border-yellow-400', text: '⚔️', label: 'VS' },
  train: { bg: 'bg-gradient-to-br from-gray-700 to-gray-900', border: 'border-gray-500', text: '🚂', label: 'Train' },
  duel: { bg: 'bg-gradient-to-br from-orange-600 to-red-700', border: 'border-orange-500', text: '🤺', label: 'Duel' },
  dead: { bg: 'bg-gradient-to-br from-purple-800 to-gray-900', border: 'border-purple-600', text: '☠️', label: 'Dead' },
};

// Payouts for symbols (bet multiplier for 3, 4, 5 of a kind)
const PAYOUTS: Record<SymbolType, Record<number, number>> = {
  bandit: { 3: 1.5, 4: 4, 5: 12 },
  skull: { 3: 1.5, 4: 4, 5: 12 },
  gun: { 3: 0.75, 4: 2, 5: 5 },
  bottle: { 3: 0.5, 4: 1.5, 5: 4 },
  moneybag: { 3: 0.5, 4: 1.5, 5: 4 },
  A: { 3: 0.25, 4: 0.75, 5: 2 },
  K: { 3: 0.25, 4: 0.75, 5: 2 },
  Q: { 3: 0.2, 4: 0.5, 5: 1.5 },
  J: { 3: 0.2, 4: 0.5, 5: 1.5 },
  '10': { 3: 0.2, 4: 0.5, 5: 1.5 },
  wild: { 3: 1.5, 4: 4, 5: 12 },
  vs: {},
  train: {},
  duel: {},
  dead: {},
};

const REGULAR_SYMBOLS: SymbolType[] = ['bandit', 'skull', 'gun', 'bottle', 'moneybag', 'A', 'K', 'Q', 'J', '10'];
const SCATTER_TYPES: SymbolType[] = ['train', 'duel', 'dead'];

// Paylines for 5x5 grid (row-major: position = row * 5 + col)
const PAYLINES = [
  [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
  [0, 6, 12, 18, 24], [4, 8, 12, 16, 20], [0, 6, 12, 8, 4], [20, 16, 12, 18, 24],
  [0, 1, 7, 13, 14], [10, 6, 7, 8, 14], [10, 16, 17, 18, 14], [5, 1, 2, 3, 9], [15, 21, 22, 23, 19], [5, 11, 12, 13, 9],
];

// VS wild multipliers with weights
const VS_MULTIPLIERS = [
  { value: 2, weight: 40 }, { value: 3, weight: 25 }, { value: 5, weight: 15 },
  { value: 10, weight: 10 }, { value: 15, weight: 5 }, { value: 25, weight: 3 },
  { value: 50, weight: 1.5 }, { value: 100, weight: 0.5 },
];

type BonusType = 'train' | 'duel' | 'dead' | null;

interface BonusState {
  type: BonusType;
  spinsRemaining: number;
  stickyWilds: number[];
  totalWin: number;
}

// Get VS multiplier with weighted random
const getVSMultiplier = (): number => {
  const total = VS_MULTIPLIERS.reduce((s, m) => s + m.weight, 0);
  let rand = Math.random() * total;
  for (const m of VS_MULTIPLIERS) {
    rand -= m.weight;
    if (rand <= 0) return m.value;
  }
  return 2;
};

export default function WantedDeadOrWild() {
  const router = useRouter();
  const { balance, setBalance, recordBet, checkAndReload } = useCasino();

  const ROWS = 5;
  const COLS = 5;

  // Reel states - each reel is a column
  const [reels, setReels] = useState<ReelState[]>([]);
  const [betAmount, setBetAmount] = useState(10);
  const [lastBet, setLastBet] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [winAmount, setWinAmount] = useState(0);
  const [winningPositions, setWinningPositions] = useState<number[]>([]);
  const [expandingReels, setExpandingReels] = useState<number[]>([]); // Reels currently animating expansion
  const [expandedReels, setExpandedReels] = useState<number[]>([]); // Reels fully expanded
  const [activeMultipliers, setActiveMultipliers] = useState<Map<number, number>>(new Map());
  const [showBuyBonus, setShowBuyBonus] = useState(false);

  // Bonus state
  const [bonus, setBonus] = useState<BonusState>({
    type: null,
    spinsRemaining: 0,
    stickyWilds: [],
    totalWin: 0,
  });
  const [showBonusTrigger, setShowBonusTrigger] = useState<BonusType>(null);
  const [showBonusComplete, setShowBonusComplete] = useState(false);
  const [bonusFinalWin, setBonusFinalWin] = useState(0);
  const [bonusCost, setBonusCost] = useState(0);

  const spinIntervalsRef = useRef<NodeJS.Timeout[]>([]);

  // Generate random symbol
  const generateSymbol = useCallback((includeSpecials = true, bonusMode: BonusType = null): Symbol => {
    const id = Math.random().toString(36).substr(2, 9);
    
    if (bonusMode) {
      if (bonusMode === 'duel' && Math.random() < 0.08) {
        const mult = getVSMultiplier();
        return { type: 'vs', id, multiplier: mult };
      }
      if (Math.random() < 0.06) {
        return { type: 'wild', id };
      }
    } else if (includeSpecials) {
      if (Math.random() < 0.015) {
        const mult = getVSMultiplier();
        return { type: 'vs', id, multiplier: mult };
      }
      if (Math.random() < 0.025) {
        return { type: 'wild', id };
      }
      if (Math.random() < 0.012) {
        return { type: SCATTER_TYPES[Math.floor(Math.random() * SCATTER_TYPES.length)], id };
      }
    }
    
    return { type: REGULAR_SYMBOLS[Math.floor(Math.random() * REGULAR_SYMBOLS.length)], id };
  }, []);

  // Initialize reels
  useEffect(() => {
    const initialReels: ReelState[] = [];
    for (let col = 0; col < COLS; col++) {
      const symbols: Symbol[] = [];
      for (let row = 0; row < ROWS; row++) {
        symbols.push(generateSymbol(false));
      }
      initialReels.push({ symbols, isSpinning: false, hasStopped: true });
    }
    setReels(initialReels);
  }, [generateSymbol]);

  // Check for reload
  useEffect(() => {
    if (balance < 1000 && !isSpinning && !bonus.type) {
      checkAndReload();
    }
  }, [balance, isSpinning, bonus.type, checkAndReload]);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      spinIntervalsRef.current.forEach(t => clearInterval(t));
    };
  }, []);

  // Check wins on paylines
  const checkWins = useCallback((grid: Symbol[], multipliers: Map<number, number>): { positions: number[]; payout: number } => {
    const allWinPos = new Set<number>();
    let totalPayout = 0;

    for (const payline of PAYLINES) {
      const symbols = payline.map(p => grid[p]);
      let matchType: SymbolType | null = null;
      
      for (const s of symbols) {
        if (s.type !== 'wild' && s.type !== 'vs' && !SCATTER_TYPES.includes(s.type)) {
          matchType = s.type;
          break;
        }
      }
      if (!matchType) matchType = 'wild';

      let count = 0;
      let lineMult = 1;
      const linePos: number[] = [];

      for (let i = 0; i < payline.length; i++) {
        const s = symbols[i];
        const pos = payline[i];
        const isMatch = s.type === matchType || s.type === 'wild' || s.type === 'vs';
        
        if (isMatch) {
          count++;
          linePos.push(pos);
          if (multipliers.has(pos)) {
            lineMult *= multipliers.get(pos)!;
          }
        } else break;
      }

      if (count >= 3) {
        const basePay = PAYOUTS[matchType]?.[count] || 0;
        if (basePay > 0) {
          totalPayout += basePay * lineMult;
          linePos.forEach(p => allWinPos.add(p));
        }
      }
    }

    return { positions: Array.from(allWinPos), payout: totalPayout };
  }, []);

  // Check for scatter bonus
  const checkScatters = useCallback((grid: Symbol[]): BonusType => {
    const counts: Record<string, number> = { train: 0, duel: 0, dead: 0 };
    for (const s of grid) {
      if (SCATTER_TYPES.includes(s.type)) counts[s.type]++;
    }
    if (counts.train >= 3) return 'train';
    if (counts.duel >= 3) return 'duel';
    if (counts.dead >= 3) return 'dead';
    return null;
  }, []);

  // Main spin function with reel-by-reel stopping
  const spin = useCallback(async () => {
    if (isSpinning || (betAmount > balance && !bonus.type)) return;

    // Clear any pending intervals
    spinIntervalsRef.current.forEach(t => clearInterval(t));
    spinIntervalsRef.current = [];

    setIsSpinning(true);
    setWinAmount(0);
    setWinningPositions([]);
    setExpandingReels([]);
    setExpandedReels([]);
    setActiveMultipliers(new Map());

    // Deduct bet
    if (!bonus.type) {
      setBalance(balance - betAmount);
      recordBet(betAmount);
      setLastBet(betAmount);
    }

    // Generate final symbols for each reel
    const finalReelSymbols: Symbol[][] = [];
    for (let col = 0; col < COLS; col++) {
      const symbols: Symbol[] = [];
      for (let row = 0; row < ROWS; row++) {
        const pos = row * COLS + col;
        if (bonus.type === 'train' && bonus.stickyWilds.includes(pos)) {
          symbols.push(reels[col].symbols[row]);
        } else {
          symbols.push(generateSymbol(true, bonus.type));
        }
      }
      finalReelSymbols.push(symbols);
    }

    // Start all reels spinning
    setReels(prev => prev.map(r => ({ ...r, isSpinning: true, hasStopped: false })));

    // Animate each reel with spinning effect, stopping left to right
    const stopDelays = [500, 800, 1100, 1400, 1700];

    for (let col = 0; col < COLS; col++) {
      const finalSymbols = finalReelSymbols[col];
      
      // Create spinning animation interval for this reel
      const spinInterval = setInterval(() => {
        setReels(prev => {
          const newReels = [...prev];
          if (newReels[col] && newReels[col].isSpinning) {
            newReels[col] = {
              ...newReels[col],
              symbols: Array.from({ length: ROWS }, () => generateSymbol(true, bonus.type)),
            };
          }
          return newReels;
        });
      }, 50);

      spinIntervalsRef.current.push(spinInterval);

      // Stop reel after delay
      setTimeout(() => {
        clearInterval(spinInterval);
        setReels(prev => {
          const newReels = [...prev];
          newReels[col] = {
            symbols: finalSymbols,
            isSpinning: false,
            hasStopped: true,
          };
          return newReels;
        });
      }, stopDelays[col]);
    }

    // Wait for all reels to stop
    await new Promise(resolve => setTimeout(resolve, stopDelays[COLS - 1] + 300));

    // Build final grid (row-major order for payline checking)
    const buildGrid = (reelSyms: Symbol[][]): Symbol[] => {
      const grid: Symbol[] = [];
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          grid.push(reelSyms[col][row]);
        }
      }
      return grid;
    };

    let finalGrid = buildGrid(finalReelSymbols);

    // Find VS wilds and prepare expansion
    const vsReels: number[] = [];
    const multipliers = new Map<number, number>();

    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        const pos = row * COLS + col;
        if (finalGrid[pos].type === 'vs') {
          vsReels.push(col);
          const mult = finalGrid[pos].multiplier || 2;
          for (let r = 0; r < ROWS; r++) {
            multipliers.set(r * COLS + col, mult);
          }
          break;
        }
      }
    }

    // Animate VS wild expansion
    if (vsReels.length > 0) {
      setExpandingReels(vsReels);
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Convert entire columns to wilds
      const expandedSymbols = [...finalReelSymbols];
      for (const col of vsReels) {
        const mult = multipliers.get(col) || 2;
        expandedSymbols[col] = Array.from({ length: ROWS }, () => ({
          type: 'wild' as SymbolType,
          id: Math.random().toString(36).substr(2, 9),
          multiplier: mult,
        }));
      }

      setReels(prev => {
        const newReels = [...prev];
        for (const col of vsReels) {
          newReels[col] = { ...newReels[col], symbols: expandedSymbols[col] };
        }
        return newReels;
      });

      finalGrid = buildGrid(expandedSymbols);
      setExpandingReels([]);
      setExpandedReels(vsReels);
      setActiveMultipliers(multipliers);

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Check wins
    const { positions, payout } = checkWins(finalGrid, multipliers);
    setWinningPositions(positions);

    const spinWin = Math.round(payout * betAmount * 100) / 100;
    setWinAmount(spinWin);

    if (spinWin > 0) {
      setBalance(balance + spinWin);
    }

    // Update bonus state
    if (bonus.type) {
      const newStickies = [...bonus.stickyWilds];
      if (bonus.type === 'train') {
        finalGrid.forEach((s, idx) => {
          if (s.type === 'wild' && !newStickies.includes(idx)) {
            newStickies.push(idx);
          }
        });
      }

      const newSpins = bonus.spinsRemaining - 1;
      const newTotalWin = bonus.totalWin + spinWin;
      
      if (newSpins <= 0) {
        // Bonus complete - show summary popup
        setBonusFinalWin(newTotalWin);
        setShowBonusComplete(true);
        setTimeout(() => {
          setShowBonusComplete(false);
          setBonusFinalWin(0);
          setBonusCost(0);
        }, 4000);
        setBonus({ type: null, spinsRemaining: 0, stickyWilds: [], totalWin: 0 });
      } else {
        setBonus(prev => ({
          ...prev,
          spinsRemaining: newSpins,
          stickyWilds: newStickies,
          totalWin: newTotalWin,
        }));
      }
    } else {
      // Check for bonus trigger
      const triggeredBonus = checkScatters(finalGrid);
      if (triggeredBonus) {
        setShowBonusTrigger(triggeredBonus);
        await new Promise(resolve => setTimeout(resolve, 2500));
        setShowBonusTrigger(null);
        setBonus({
          type: triggeredBonus,
          spinsRemaining: 10,
          stickyWilds: [],
          totalWin: 0,
        });
      }
    }

    setIsSpinning(false);
  }, [isSpinning, betAmount, balance, bonus, reels, setBalance, recordBet, generateSymbol, checkWins, checkScatters]);

  // Buy bonus function
  const buyBonus = useCallback((bonusType: 'train' | 'duel' | 'dead') => {
    const costs = { train: 80, duel: 200, dead: 400 };
    const cost = betAmount * costs[bonusType];
    if (balance < cost || isSpinning || bonus.type) return;

    setBalance(balance - cost);
    recordBet(cost);
    setLastBet(cost);
    setBonusCost(cost);
    setShowBuyBonus(false);

    setBonus({
      type: bonusType,
      spinsRemaining: 10,
      stickyWilds: [],
      totalWin: 0,
    });
  }, [betAmount, balance, isSpinning, bonus.type, setBalance, recordBet]);

  const bonusNames: Record<string, string> = {
    train: 'GREAT TRAIN ROBBERY',
    duel: 'DUEL AT DAWN',
    dead: "DEAD MAN'S HAND",
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-900 via-red-950 to-black text-white overflow-hidden">
      {/* Desert Background with gradient overlay */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-orange-600/30 via-red-900/50 to-black" />
        <div className="absolute bottom-0 left-0 w-1/3 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute bottom-0 right-0 w-1/4 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />
      </div>

      {/* Bonus Trigger Overlay */}
      {showBonusTrigger && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 animate-pulse">
          <div className="text-center">
            <div className="text-8xl mb-6">
              {showBonusTrigger === 'train' ? '🚂' : showBonusTrigger === 'duel' ? '🤺' : '☠️'}
            </div>
            <div className="text-5xl font-bold text-yellow-400 mb-4" style={{ textShadow: '0 0 20px rgba(255,200,0,0.8)' }}>
              BONUS!
            </div>
            <div className="text-3xl text-white font-bold">
              {bonusNames[showBonusTrigger]}
            </div>
            <div className="text-xl text-amber-300 mt-4">10 FREE SPINS</div>
          </div>
        </div>
      )}

      {/* Bonus Complete Popup */}
      {showBonusComplete && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
          <div className="text-center p-6 sm:p-8">
            <div className="text-3xl sm:text-5xl font-bold text-amber-400 mb-4 animate-pulse">
              🤠 BONUS COMPLETE! 🤠
            </div>
            <div className="text-4xl sm:text-6xl font-black text-white mb-4">
              ${bonusFinalWin.toFixed(2)}
            </div>
            {bonusCost > 0 && (
              <div className={`text-xl sm:text-2xl font-bold ${bonusFinalWin >= bonusCost ? 'text-green-400' : 'text-red-400'}`}>
                {bonusFinalWin >= bonusCost ? (
                  <>📈 {(((bonusFinalWin - bonusCost) / bonusCost) * 100).toFixed(0)}% ROI</>
                ) : (
                  <>📉 {(((bonusCost - bonusFinalWin) / bonusCost) * 100).toFixed(0)}% Loss</>
                )}
              </div>
            )}
            <div className="text-sm sm:text-base text-gray-400 mt-2">
              {bonusCost > 0 ? `Bonus Cost: $${bonusCost.toFixed(0)}` : 'Free Spins Triggered'}
            </div>
          </div>
        </div>
      )}

      {/* Buy Bonus Modal */}
      {showBuyBonus && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setShowBuyBonus(false)}>
          <div className="bg-gradient-to-b from-amber-900 to-gray-900 rounded-2xl p-6 max-w-md w-full mx-4 border-2 border-amber-600" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-bold text-amber-400 text-center mb-4">BUY BONUS</h2>
            <div className="space-y-3">
              {[
                { type: 'train' as const, icon: '🚂', name: 'Great Train Robbery', mult: 80 },
                { type: 'duel' as const, icon: '🤺', name: 'Duel at Dawn', mult: 200 },
                { type: 'dead' as const, icon: '☠️', name: "Dead Man's Hand", mult: 400 },
              ].map(b => (
                <button
                  key={b.type}
                  onClick={() => buyBonus(b.type)}
                  disabled={balance < betAmount * b.mult}
                  className="w-full p-4 bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl border border-gray-600 hover:border-amber-500 disabled:opacity-50 transition-all flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{b.icon}</span>
                    <span className="font-bold">{b.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-amber-400 font-bold">${(betAmount * b.mult).toLocaleString()}</div>
                    <div className="text-xs text-gray-400">{b.mult}× bet</div>
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowBuyBonus(false)}
              className="w-full mt-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="relative z-10 flex flex-col h-screen">
        {/* Title */}
        <div className="text-center py-1 sm:py-2 flex-shrink-0">
          <h1 
            className="text-2xl sm:text-4xl md:text-5xl font-bold tracking-wider"
            style={{ 
              fontFamily: 'serif',
              background: 'linear-gradient(180deg, #f5d78e 0%, #c9a227 50%, #8b6914 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            WANTED
          </h1>
          <div className="text-green-500 text-xs sm:text-lg font-bold tracking-widest" style={{ fontFamily: 'serif' }}>
            DEAD OR A WILD
          </div>
        </div>

        {/* Bonus Banner */}
        {bonus.type && (
          <div className="mx-2 sm:mx-4 mb-1 sm:mb-2 p-1.5 sm:p-2 bg-gradient-to-r from-purple-900/80 to-amber-900/80 rounded-lg border border-amber-500/50 text-center flex-shrink-0 text-xs sm:text-base">
            <span className="text-amber-400 font-bold">{bonusNames[bonus.type]}</span>
            <span className="mx-1 sm:mx-2 text-white">|</span>
            <span className="text-white">{bonus.spinsRemaining} SPINS</span>
            <span className="mx-1 sm:mx-2 text-white">|</span>
            <span className="text-green-400">WIN: ${bonus.totalWin.toLocaleString()}</span>
          </div>
        )}

        {/* Main Slot Machine */}
        <div className="flex-1 flex items-center justify-center px-1 sm:px-4 min-h-0 py-1">
          <div className="w-full max-w-xl">
            {/* Wooden Frame */}
            <div 
              className="rounded-lg p-1 sm:p-2"
              style={{
                background: 'linear-gradient(180deg, #5c4a32 0%, #3d2e1f 50%, #2a1f15 100%)',
                boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.5)',
              }}
            >
              {/* Inner dark area */}
              <div className="bg-gray-950 rounded p-1.5 sm:p-3">
                {/* Reels Container */}
                <div className="grid grid-cols-5 gap-0.5 sm:gap-1.5">
                  {reels.map((reel, colIndex) => (
                    <div key={colIndex} className="relative">
                      {/* Reel Column */}
                      <div className="flex flex-col gap-0.5 sm:gap-1">
                        {reel.symbols.map((symbol, rowIndex) => {
                          const pos = rowIndex * COLS + colIndex;
                          const isWinning = winningPositions.includes(pos);
                          const isExpanding = expandingReels.includes(colIndex);
                          const isExpanded = expandedReels.includes(colIndex);
                          const multiplier = activeMultipliers.get(pos);
                          const style = SYMBOL_STYLES[symbol.type];

                          return (
                            <div
                              key={symbol.id + rowIndex}
                              className={`
                                relative aspect-square rounded-sm sm:rounded border-2 flex items-center justify-center
                                transition-all duration-200
                                ${isExpanded ? 'bg-gradient-to-br from-yellow-400 to-orange-500 border-yellow-300' : `${style.bg} ${style.border}`}
                                ${isWinning ? 'ring-2 ring-green-400 scale-105 z-10' : ''}
                                ${reel.isSpinning ? 'blur-[2px]' : ''}
                              `}
                              style={{
                                boxShadow: isWinning 
                                  ? '0 0 15px rgba(74,222,128,0.6)' 
                                  : isExpanded 
                                    ? '0 0 10px rgba(251,191,36,0.5)' 
                                    : 'inset 0 1px 3px rgba(0,0,0,0.4)',
                                transform: reel.isSpinning ? `translateY(${Math.sin(Date.now() / 50) * 2}px)` : 'none',
                              }}
                            >
                              {/* Symbol Content */}
                              <span 
                                className={`
                                  text-base sm:text-2xl md:text-3xl
                                  ${symbol.type.length <= 2 && symbol.type !== '10' ? 'font-bold' : ''}
                                  ${isExpanded ? 'text-white drop-shadow-lg' : ''}
                                `}
                                style={{ textShadow: isWinning ? '0 0 10px white' : 'none' }}
                              >
                                {isExpanded ? '⭐' : style.text}
                              </span>

                              {/* Multiplier Badge */}
                              {multiplier && (
                                <div className="absolute -top-1 -right-1 bg-gradient-to-r from-yellow-400 to-orange-500 text-black text-[6px] sm:text-[10px] font-bold px-0.5 sm:px-1 rounded shadow-lg">
                                  ×{multiplier}
                                </div>
                              )}

                              {/* Expanding Animation Overlay */}
                              {isExpanding && (
                                <div 
                                  className="absolute inset-0 rounded bg-gradient-to-b from-yellow-400 via-orange-400 to-yellow-400"
                                  style={{
                                    animation: 'expandPulse 0.3s ease-in-out infinite',
                                  }}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Win Display */}
            {winAmount > 0 && !isSpinning && (
              <div className="mt-2 sm:mt-3 text-center animate-bounce">
                <div className="inline-block bg-gradient-to-r from-green-600 to-emerald-600 px-4 sm:px-6 py-1.5 sm:py-2 rounded-full border-2 border-green-400">
                  <span className="text-base sm:text-2xl font-bold text-white">
                    WIN ${winAmount.toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Control Bar - Matching real game layout */}
        <div className="flex-shrink-0 bg-gradient-to-t from-gray-900 to-gray-800 border-t border-gray-700 px-2 sm:px-4 py-2 sm:py-3">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
            {/* Buy Bonus Button */}
            <button
              onClick={() => setShowBuyBonus(true)}
              disabled={isSpinning || !!bonus.type}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-teal-600 to-teal-800 border-2 border-teal-400 flex items-center justify-center text-[8px] sm:text-xs font-bold text-white disabled:opacity-50 hover:scale-105 transition-transform flex-shrink-0"
            >
              BUY<br/>BONUS
            </button>

            {/* Balance */}
            <div className="text-center min-w-0 flex-1">
              <div className="text-[8px] sm:text-xs text-gray-400 uppercase">Balance</div>
              <div className="text-sm sm:text-lg font-bold text-white truncate">${balance.toLocaleString()}</div>
            </div>

            {/* Bet Amount */}
            <div className="flex items-center gap-1 sm:gap-2 bg-gray-800 rounded-lg px-2 sm:px-3 py-1 flex-shrink-0">
              <button
                onClick={() => setBetAmount(Math.max(1, betAmount / 2))}
                disabled={isSpinning || !!bonus.type}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-600 disabled:opacity-50 text-lg sm:text-xl"
              >
                −
              </button>
              <div className="text-center min-w-16 sm:min-w-24">
                <div className="text-[8px] sm:text-xs text-gray-400 uppercase">Bet</div>
                <div className="text-sm sm:text-lg font-bold text-white">${betAmount.toFixed(2)}</div>
              </div>
              <button
                onClick={() => setBetAmount(Math.min(balance, betAmount * 2))}
                disabled={isSpinning || !!bonus.type}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 hover:text-white hover:bg-gray-600 disabled:opacity-50 text-lg sm:text-xl"
              >
                +
              </button>
            </div>

            {/* Spin Button */}
            <button
              onClick={spin}
              disabled={isSpinning || (betAmount > balance && !bonus.type)}
              className={`
                w-14 h-14 sm:w-16 sm:h-16 rounded-full border-4 flex items-center justify-center flex-shrink-0
                transition-all transform hover:scale-105 disabled:opacity-50 disabled:transform-none
                ${bonus.type 
                  ? 'bg-gradient-to-br from-purple-500 to-amber-500 border-purple-400' 
                  : 'bg-gradient-to-br from-gray-700 to-gray-900 border-gray-500 hover:border-white'}
              `}
            >
              {isSpinning ? (
                <div className="w-6 h-6 sm:w-7 sm:h-7 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
            </button>

            {/* Back to Casino */}
            <button
              onClick={() => router.push('/casino')}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-red-600 to-red-800 border-2 border-red-400 flex items-center justify-center text-[8px] sm:text-xs font-bold text-white hover:scale-105 transition-transform flex-shrink-0"
            >
              EXIT
            </button>
          </div>
        </div>
      </div>

      {/* Custom CSS for animations */}
      <style jsx>{`
        @keyframes expandPulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}
