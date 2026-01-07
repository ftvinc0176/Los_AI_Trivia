'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useCasino } from '../CasinoContext';

// Symbol types
type SymbolType = 'gun' | 'bottle' | 'moneybag' | 'bandit' | 'skull' | 'A' | 'K' | 'Q' | 'J' | '10' | 'wild' | 'vs' | 'train' | 'duel' | 'dead';

interface Symbol {
  type: SymbolType;
  id: string;
  isWinning?: boolean;
  isWild?: boolean;
  isExpanded?: boolean;
  multiplier?: number;
}

interface SymbolConfig {
  emoji: string;
  name: string;
  payouts: { [key: number]: number }; // count -> multiplier (for 3,4,5 of a kind)
  color: string;
}

// Paylines for 5x5 grid - 15 paylines
const PAYLINES = [
  // Horizontal lines
  [0, 1, 2, 3, 4],        // Row 1
  [5, 6, 7, 8, 9],        // Row 2
  [10, 11, 12, 13, 14],   // Row 3
  [15, 16, 17, 18, 19],   // Row 4
  [20, 21, 22, 23, 24],   // Row 5
  // Diagonal and zigzag patterns
  [0, 6, 12, 18, 24],     // Diagonal top-left to bottom-right
  [4, 8, 12, 16, 20],     // Diagonal top-right to bottom-left
  [0, 6, 12, 8, 4],       // V shape
  [20, 16, 12, 18, 24],   // Inverted V
  [0, 1, 7, 13, 14],      // Zigzag 1
  [10, 6, 7, 8, 14],      // Zigzag 2
  [10, 16, 17, 18, 14],   // Zigzag 3
  [5, 1, 2, 3, 9],        // Zigzag 4
  [15, 21, 22, 23, 19],   // Zigzag 5
  [5, 11, 12, 13, 9],     // Center cross-ish
];

const SYMBOLS: Record<SymbolType, SymbolConfig> = {
  // Premium symbols
  gun: {
    emoji: '🔫',
    name: 'Gun Chamber',
    payouts: { 3: 2, 4: 10, 5: 20 },
    color: 'from-gray-400 to-gray-600'
  },
  bottle: {
    emoji: '🥃',
    name: 'Whiskey',
    payouts: { 3: 1, 4: 5, 5: 10 },
    color: 'from-amber-400 to-amber-700'
  },
  moneybag: {
    emoji: '💰',
    name: 'Money Bag',
    payouts: { 3: 1, 4: 5, 5: 10 },
    color: 'from-green-400 to-green-700'
  },
  bandit: {
    emoji: '🤠',
    name: 'Bandit',
    payouts: { 3: 0.5, 4: 2.5, 5: 5 },
    color: 'from-yellow-600 to-brown-700'
  },
  skull: {
    emoji: '💀',
    name: 'Skull',
    payouts: { 3: 0.5, 4: 2.5, 5: 5 },
    color: 'from-gray-200 to-gray-500'
  },
  // Low paying symbols
  A: {
    emoji: '🅰️',
    name: 'Ace',
    payouts: { 3: 0.1, 4: 0.5, 5: 1 },
    color: 'from-red-500 to-red-700'
  },
  K: {
    emoji: '🔷',
    name: 'King',
    payouts: { 3: 0.1, 4: 0.5, 5: 1 },
    color: 'from-blue-500 to-blue-700'
  },
  Q: {
    emoji: '💜',
    name: 'Queen',
    payouts: { 3: 0.1, 4: 0.5, 5: 1 },
    color: 'from-purple-500 to-purple-700'
  },
  J: {
    emoji: '💚',
    name: 'Jack',
    payouts: { 3: 0.1, 4: 0.5, 5: 1 },
    color: 'from-green-500 to-green-700'
  },
  '10': {
    emoji: '🔟',
    name: 'Ten',
    payouts: { 3: 0.1, 4: 0.5, 5: 1 },
    color: 'from-orange-500 to-orange-700'
  },
  // Special symbols
  wild: {
    emoji: '⭐',
    name: 'Wild',
    payouts: { 3: 2, 4: 10, 5: 20 },
    color: 'from-yellow-400 to-yellow-600'
  },
  vs: {
    emoji: '⚔️',
    name: 'VS Wild',
    payouts: {},
    color: 'from-red-500 via-yellow-500 to-red-500'
  },
  train: {
    emoji: '🚂',
    name: 'Train Scatter',
    payouts: {},
    color: 'from-gray-700 to-gray-900'
  },
  duel: {
    emoji: '🤺',
    name: 'Duel Scatter',
    payouts: {},
    color: 'from-orange-500 to-red-600'
  },
  dead: {
    emoji: '☠️',
    name: 'Dead Scatter',
    payouts: {},
    color: 'from-purple-700 to-black'
  }
};

const REGULAR_SYMBOLS: SymbolType[] = ['gun', 'bottle', 'moneybag', 'bandit', 'skull', 'A', 'K', 'Q', 'J', '10'];
const SCATTER_SYMBOLS: SymbolType[] = ['train', 'duel', 'dead'];

// Weighted multipliers for VS wilds
const VS_MULTIPLIERS = [
  { value: 2, weight: 40 },
  { value: 3, weight: 25 },
  { value: 5, weight: 15 },
  { value: 10, weight: 10 },
  { value: 15, weight: 5 },
  { value: 25, weight: 3 },
  { value: 50, weight: 1.5 },
  { value: 100, weight: 0.5 }
];

type BonusType = 'train' | 'duel' | 'dead' | null;

interface BonusState {
  type: BonusType;
  spinsRemaining: number;
  stickyWilds: number[];  // Positions with sticky wilds
  collectedWilds: number;
  collectedMultiplier: number;
  phase: 'collect' | 'showdown' | null;
  showdownSpins: number;
}

export default function WantedDeadOrWild() {
  const router = useRouter();
  const { balance, setBalance, recordBet, checkAndReload } = useCasino();

  // Game state
  const [grid, setGrid] = useState<Symbol[]>([]);
  const [betAmount, setBetAmount] = useState(100);
  const [lastBet, setLastBet] = useState<number>(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [winAmount, setWinAmount] = useState(0);
  const [totalWin, setTotalWin] = useState(0);
  const [winningPositions, setWinningPositions] = useState<number[]>([]);
  const [expandedReels, setExpandedReels] = useState<number[]>([]); // Reel indices with expanded VS wilds
  const [activeMultipliers, setActiveMultipliers] = useState<Map<number, number>>(new Map()); // Position -> multiplier
  
  // Bonus state
  const [bonus, setBonus] = useState<BonusState>({
    type: null,
    spinsRemaining: 0,
    stickyWilds: [],
    collectedWilds: 0,
    collectedMultiplier: 1,
    phase: null,
    showdownSpins: 0
  });
  const [showBonusTrigger, setShowBonusTrigger] = useState<BonusType>(null);

  const GRID_SIZE = 25; // 5x5
  const ROWS = 5;
  const COLS = 5;

  // Initialize grid
  useEffect(() => {
    setGrid(generateGrid());
  }, []);

  // Check for reload
  useEffect(() => {
    if (balance < 1000 && !isSpinning && !bonus.type) {
      checkAndReload();
    }
  }, [balance, isSpinning, bonus.type, checkAndReload]);

  // Get weighted random VS multiplier
  const getVSMultiplier = useCallback(() => {
    const totalWeight = VS_MULTIPLIERS.reduce((sum, m) => sum + m.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const mult of VS_MULTIPLIERS) {
      random -= mult.weight;
      if (random <= 0) return mult.value;
    }
    return VS_MULTIPLIERS[0].value;
  }, []);

  // Generate a random symbol
  const generateSymbol = useCallback((includeSpecials: boolean = true, bonusType: BonusType = null): Symbol => {
    const id = Math.random().toString(36).substr(2, 9);
    
    // In bonus, different spawn rates
    if (bonusType) {
      // Higher VS wild chance in Duel at Dawn
      if (bonusType === 'duel' && Math.random() < 0.08) {
        return { type: 'vs', id, multiplier: getVSMultiplier() };
      }
      // Regular wild chance
      if (Math.random() < 0.05) {
        return { type: 'wild', id, isWild: true };
      }
    } else {
      // Base game - low VS wild chance
      if (includeSpecials && Math.random() < 0.02) {
        return { type: 'vs', id, multiplier: getVSMultiplier() };
      }
      // Regular wild
      if (includeSpecials && Math.random() < 0.03) {
        return { type: 'wild', id, isWild: true };
      }
      // Scatter symbols - very rare
      if (includeSpecials && Math.random() < 0.015) {
        const scatterType = SCATTER_SYMBOLS[Math.floor(Math.random() * SCATTER_SYMBOLS.length)];
        return { type: scatterType, id };
      }
    }
    
    // Regular symbol
    const type = REGULAR_SYMBOLS[Math.floor(Math.random() * REGULAR_SYMBOLS.length)];
    return { type, id };
  }, [getVSMultiplier]);

  // Generate initial grid
  const generateGrid = useCallback((): Symbol[] => {
    return Array.from({ length: GRID_SIZE }, () => generateSymbol(false));
  }, [generateSymbol]);

  // Check for wins on all paylines
  const checkWins = useCallback((currentGrid: Symbol[], multipliers: Map<number, number>): { positions: number[], totalPayout: number } => {
    const allWinningPositions = new Set<number>();
    let totalPayout = 0;

    for (const payline of PAYLINES) {
      // Get symbols on this payline
      const symbols = payline.map(pos => currentGrid[pos]);
      
      // Find the first non-wild symbol to determine what we're matching
      let matchType: SymbolType | null = null;
      for (const sym of symbols) {
        if (sym.type !== 'wild' && sym.type !== 'vs' && !SCATTER_SYMBOLS.includes(sym.type)) {
          matchType = sym.type;
          break;
        }
      }
      
      if (!matchType) {
        // All wilds - use wild payout
        matchType = 'wild';
      }

      // Count consecutive matching symbols from left
      let count = 0;
      let lineMultiplier = 1;
      const linePositions: number[] = [];
      
      for (let i = 0; i < payline.length; i++) {
        const sym = symbols[i];
        const pos = payline[i];
        
        const isMatch = sym.type === matchType || sym.type === 'wild' || sym.type === 'vs';
        
        if (isMatch) {
          count++;
          linePositions.push(pos);
          
          // Add VS multiplier
          if (multipliers.has(pos)) {
            lineMultiplier *= multipliers.get(pos)!;
          }
        } else {
          break;
        }
      }

      // Check for win (3+ matching)
      if (count >= 3) {
        const basePayout = SYMBOLS[matchType].payouts[count] || 0;
        if (basePayout > 0) {
          totalPayout += basePayout * lineMultiplier;
          linePositions.forEach(pos => allWinningPositions.add(pos));
        }
      }
    }

    return { positions: Array.from(allWinningPositions), totalPayout };
  }, []);

  // Check for scatter bonus triggers
  const checkScatters = useCallback((currentGrid: Symbol[]): BonusType => {
    const scatterCounts: Record<string, number> = { train: 0, duel: 0, dead: 0 };
    
    for (const sym of currentGrid) {
      if (SCATTER_SYMBOLS.includes(sym.type)) {
        scatterCounts[sym.type]++;
      }
    }

    // Need 3+ of same scatter to trigger
    if (scatterCounts.train >= 3) return 'train';
    if (scatterCounts.duel >= 3) return 'duel';
    if (scatterCounts.dead >= 3) return 'dead';
    
    return null;
  }, []);

  // Process VS wilds - expand full reel
  const processVSWilds = useCallback((currentGrid: Symbol[]): { grid: Symbol[], expandedReels: number[], multipliers: Map<number, number> } => {
    const newGrid = [...currentGrid];
    const expanded: number[] = [];
    const multipliers = new Map<number, number>();

    for (let col = 0; col < COLS; col++) {
      // Check each cell in column for VS wild
      for (let row = 0; row < ROWS; row++) {
        const pos = row * COLS + col;
        if (newGrid[pos].type === 'vs') {
          // Expand to fill entire reel
          expanded.push(col);
          const mult = newGrid[pos].multiplier || getVSMultiplier();
          
          for (let r = 0; r < ROWS; r++) {
            const expandPos = r * COLS + col;
            newGrid[expandPos] = {
              ...newGrid[expandPos],
              type: 'wild',
              isWild: true,
              isExpanded: true
            };
            multipliers.set(expandPos, mult);
          }
          break; // Only process first VS in column
        }
      }
    }

    return { grid: newGrid, expandedReels: expanded, multipliers };
  }, [getVSMultiplier]);

  // Main spin function
  const spin = useCallback(async () => {
    if (isSpinning || (betAmount > balance && !bonus.type)) return;

    setIsSpinning(true);
    setWinAmount(0);
    setWinningPositions([]);
    setExpandedReels([]);
    setActiveMultipliers(new Map());

    // Deduct bet if not in bonus
    if (!bonus.type) {
      setBalance(balance - betAmount);
      recordBet(betAmount);
      setLastBet(betAmount);
      setTotalWin(0);
    }

    // Animate spinning
    const spinDuration = 1500;
    const spinInterval = 50;
    const spinSteps = spinDuration / spinInterval;

    for (let i = 0; i < spinSteps; i++) {
      await new Promise(resolve => setTimeout(resolve, spinInterval));
      setGrid(prev => {
        // Keep sticky wilds in place during bonus
        if (bonus.type === 'train' && bonus.stickyWilds.length > 0) {
          const newGrid = prev.map((sym, idx) => 
            bonus.stickyWilds.includes(idx) ? sym : generateSymbol(true, bonus.type)
          );
          return newGrid;
        }
        return prev.map(() => generateSymbol(true, bonus.type));
      });
    }

    // Generate final grid
    let finalGrid: Symbol[];
    if (bonus.type === 'train' && bonus.stickyWilds.length > 0) {
      finalGrid = grid.map((sym, idx) => 
        bonus.stickyWilds.includes(idx) ? sym : generateSymbol(true, bonus.type)
      );
    } else {
      finalGrid = Array.from({ length: GRID_SIZE }, () => generateSymbol(true, bonus.type));
    }

    // Process VS wilds
    const vsResult = processVSWilds(finalGrid);
    finalGrid = vsResult.grid;
    setExpandedReels(vsResult.expandedReels);
    setActiveMultipliers(vsResult.multipliers);
    setGrid(finalGrid);

    await new Promise(resolve => setTimeout(resolve, 300));

    // Check for wins
    const { positions, totalPayout } = checkWins(finalGrid, vsResult.multipliers);
    setWinningPositions(positions);

    const spinWin = totalPayout * betAmount;
    setWinAmount(spinWin);
    setTotalWin(prev => prev + spinWin);

    if (spinWin > 0 && !bonus.type) {
      setBalance(balance - betAmount + spinWin);
    } else if (spinWin > 0 && bonus.type) {
      setBalance(balance + spinWin);
    }

    // Update bonus state
    if (bonus.type) {
      const newStickies = [...bonus.stickyWilds];
      
      // Train Robbery: collect sticky wilds
      if (bonus.type === 'train') {
        finalGrid.forEach((sym, idx) => {
          if ((sym.type === 'wild' || sym.isExpanded) && !newStickies.includes(idx)) {
            newStickies.push(idx);
          }
        });
      }

      setBonus(prev => ({
        ...prev,
        spinsRemaining: prev.spinsRemaining - 1,
        stickyWilds: newStickies
      }));

      // Check if bonus ended
      if (bonus.spinsRemaining <= 1) {
        setBonus({
          type: null,
          spinsRemaining: 0,
          stickyWilds: [],
          collectedWilds: 0,
          collectedMultiplier: 1,
          phase: null,
          showdownSpins: 0
        });
      }
    } else {
      // Check for new bonus trigger
      const triggeredBonus = checkScatters(finalGrid);
      if (triggeredBonus) {
        setShowBonusTrigger(triggeredBonus);
        await new Promise(resolve => setTimeout(resolve, 2000));
        setShowBonusTrigger(null);
        
        setBonus({
          type: triggeredBonus,
          spinsRemaining: 10,
          stickyWilds: [],
          collectedWilds: 0,
          collectedMultiplier: 1,
          phase: triggeredBonus === 'dead' ? 'collect' : null,
          showdownSpins: triggeredBonus === 'dead' ? 3 : 0
        });
      }
    }

    setIsSpinning(false);
  }, [isSpinning, betAmount, balance, bonus, setBalance, recordBet, grid, generateSymbol, processVSWilds, checkWins, checkScatters]);

  // Rebet / All In
  const rebet = useCallback(() => {
    if (lastBet > 0 && lastBet <= balance && !isSpinning && !bonus.type) {
      setBetAmount(lastBet);
    }
  }, [lastBet, balance, isSpinning, bonus.type]);

  const allIn = useCallback(() => {
    if (!isSpinning && !bonus.type) {
      setBetAmount(Math.floor(balance));
    }
  }, [balance, isSpinning, bonus.type]);

  // Buy Bonus - purchase bonus rounds directly
  const buyBonus = useCallback((bonusType: 'train' | 'duel' | 'dead') => {
    const costs = { train: 80, duel: 200, dead: 400 };
    const cost = betAmount * costs[bonusType];
    
    if (balance < cost || isSpinning || bonus.type) return;
    
    setBalance(balance - cost);
    recordBet(cost);
    setLastBet(cost);
    
    // Initialize the bonus round based on type
    if (bonusType === 'train') {
      // Great Train Robbery - 10 spins with sticky wilds
      setBonus({
        type: 'train',
        spinsRemaining: 10,
        stickyWilds: [],
        collectedWilds: 0,
        collectedMultiplier: 1,
        phase: null,
        showdownSpins: 0
      });
    } else if (bonusType === 'duel') {
      // Duel at Dawn - 10 spins with multiplier collection
      setBonus({
        type: 'duel',
        spinsRemaining: 10,
        stickyWilds: [],
        collectedWilds: 0,
        collectedMultiplier: 1,
        phase: null,
        showdownSpins: 0
      });
    } else {
      // Dead Man's Hand - Collection then showdown
      setBonus({
        type: 'dead',
        spinsRemaining: 10,
        stickyWilds: [],
        collectedWilds: 0,
        collectedMultiplier: 1,
        phase: 'collect',
        showdownSpins: 3
      });
    }
    
    // Generate initial bonus grid with guaranteed scatter/wild presence
    const newGrid: Symbol[] = [];
    for (let i = 0; i < GRID_SIZE; i++) {
      const rand = Math.random();
      const id = Math.random().toString(36).substr(2, 9);
      let type: SymbolType;
      
      // Higher chance of wilds in bonus
      if (rand < 0.15) {
        type = Math.random() < 0.3 ? 'vs' : 'wild';
      } else if (rand < 0.35) {
        type = ['gun', 'bottle', 'moneybag'][Math.floor(Math.random() * 3)] as SymbolType;
      } else {
        type = ['A', 'K', 'Q', 'J', '10'][Math.floor(Math.random() * 5)] as SymbolType;
      }
      
      newGrid.push({ 
        type, 
        id,
        multiplier: type === 'vs' ? getVSMultiplier() : undefined, 
        isExpanded: false,
        isWild: type === 'wild' || type === 'vs'
      });
    }
    setGrid(newGrid);
  }, [betAmount, balance, isSpinning, bonus.type, setBalance, recordBet]);

  // Get symbol display
  const getSymbolDisplay = (sym: Symbol, pos: number) => {
    const config = SYMBOLS[sym.type];
    const isWinning = winningPositions.includes(pos);
    const hasMultiplier = activeMultipliers.has(pos);
    
    return (
      <div
        className={`relative aspect-square flex items-center justify-center text-3xl sm:text-4xl rounded-lg transition-all duration-300 ${
          sym.isExpanded ? 'bg-gradient-to-br from-yellow-400/30 to-yellow-600/30 border-2 border-yellow-500' :
          isWinning ? 'bg-gradient-to-br from-green-400/30 to-green-600/30 border-2 border-green-500 scale-110' :
          `bg-gradient-to-br ${config.color} bg-opacity-20`
        } ${isSpinning ? 'animate-pulse' : ''}`}
      >
        <span className={`${isWinning ? 'animate-bounce' : ''}`}>
          {config.emoji}
        </span>
        {hasMultiplier && (
          <div className="absolute -top-1 -right-1 bg-gradient-to-r from-yellow-400 to-orange-500 text-black text-xs font-bold px-1 rounded">
            ×{activeMultipliers.get(pos)}
          </div>
        )}
        {bonus.type === 'train' && bonus.stickyWilds.includes(pos) && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-xs">📌</div>
        )}
      </div>
    );
  };

  const bonusNames: Record<string, string> = {
    train: '🚂 Great Train Robbery',
    duel: '🤺 Duel at Dawn',
    dead: '☠️ Dead Man\'s Hand'
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-950 via-red-950 to-gray-900 text-white">
      {/* Header */}
      <div className="bg-black/40 border-b border-amber-500/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.push('/casino')}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <span className="text-xl">←</span>
            <span>Back to Casino</span>
          </button>
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 px-4 py-2 rounded-lg border border-yellow-500/30">
              <span className="text-yellow-400 font-bold">${balance.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Title */}
      <div className="text-center py-4">
        <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-amber-400 via-red-500 to-amber-400 bg-clip-text text-transparent">
          🤠 WANTED DEAD OR A WILD 🤠
        </h1>
        <p className="text-amber-300/60 text-sm mt-1">15 Paylines | Max Win 12,500×</p>
      </div>

      {/* Bonus Trigger Overlay */}
      {showBonusTrigger && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="text-center animate-pulse">
            <div className="text-6xl mb-4">
              {showBonusTrigger === 'train' ? '🚂' : showBonusTrigger === 'duel' ? '🤺' : '☠️'}
            </div>
            <div className="text-4xl font-bold text-yellow-400 mb-2">
              BONUS TRIGGERED!
            </div>
            <div className="text-2xl text-white">
              {bonusNames[showBonusTrigger]}
            </div>
            <div className="text-lg text-amber-300 mt-2">10 Free Spins!</div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 pb-8">
        {/* Bonus Banner */}
        {bonus.type && (
          <div className="mb-4 p-3 bg-gradient-to-r from-purple-900/50 to-amber-900/50 rounded-xl border border-amber-500/30 text-center">
            <div className="text-lg font-bold text-amber-400">{bonusNames[bonus.type]}</div>
            <div className="text-sm text-white">
              {bonus.spinsRemaining} Spins Remaining | Total Win: ${totalWin.toLocaleString()}
            </div>
            {bonus.type === 'train' && (
              <div className="text-xs text-amber-300 mt-1">
                Sticky Wilds: {bonus.stickyWilds.length}
              </div>
            )}
          </div>
        )}

        {/* Game Grid - Full Width */}
        <div className="bg-gradient-to-br from-amber-900/30 to-red-900/30 rounded-2xl p-4 border border-amber-500/20">
          {/* Expanded reel indicators */}
          {expandedReels.length > 0 && (
            <div className="grid grid-cols-5 gap-2 mb-2 max-w-lg mx-auto">
              {[0, 1, 2, 3, 4].map(col => (
                <div 
                  key={col}
                  className={`text-center text-xs py-1 rounded ${
                    expandedReels.includes(col) 
                      ? 'bg-yellow-500/30 text-yellow-400 font-bold' 
                      : 'text-transparent'
                  }`}
                >
                  {expandedReels.includes(col) ? `×${activeMultipliers.get(col * ROWS) || '?'}` : '-'}
                </div>
              ))}
            </div>
          )}

          {/* Main Grid */}
          <div className="grid grid-cols-5 gap-2 max-w-lg mx-auto">
            {grid.map((sym, idx) => (
              <div key={sym.id}>
                {getSymbolDisplay(sym, idx)}
              </div>
            ))}
          </div>

          {/* Paylines indicator */}
          <div className="mt-3 text-center text-xs text-amber-300/60">
            15 Paylines • Left to Right
          </div>
        </div>

        {/* Win Display */}
        {winAmount > 0 && (
          <div className="mt-4 bg-gradient-to-r from-green-900/50 to-emerald-900/50 rounded-xl p-4 border border-green-500/30 text-center">
            <div className="text-sm text-green-400">WIN!</div>
            <div className="text-3xl font-bold text-white">+${winAmount.toLocaleString()}</div>
          </div>
        )}

        {/* Controls Under Grid */}
        <div className="mt-4 bg-black/40 backdrop-blur-lg rounded-2xl p-4 border border-amber-500/20">
          <div className="flex flex-wrap justify-center items-center gap-4">
            {/* Bet Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setBetAmount(Math.max(10, betAmount / 2))}
                disabled={isSpinning || !!bonus.type}
                className="w-10 h-10 bg-red-500 hover:bg-red-600 disabled:opacity-50 rounded-full text-white font-bold text-xl transition-all"
              >
                -
              </button>
              <div className="bg-white/10 px-4 py-2 rounded-xl min-w-24 text-center">
                <div className="text-white/70 text-xs">BET</div>
                <div className="text-white font-bold text-lg">${betAmount}</div>
              </div>
              <button
                onClick={() => setBetAmount(Math.min(balance, betAmount * 2))}
                disabled={isSpinning || !!bonus.type}
                className="w-10 h-10 bg-green-500 hover:bg-green-600 disabled:opacity-50 rounded-full text-white font-bold text-xl transition-all"
              >
                +
              </button>
            </div>

            {/* All In and Rebet Buttons */}
            <div className="flex gap-2">
              <button
                onClick={allIn}
                disabled={isSpinning || !!bonus.type}
                className="px-4 py-2 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 disabled:opacity-50 rounded-lg text-white font-bold transition-all"
              >
                💰 All In
              </button>
              <button
                onClick={rebet}
                disabled={isSpinning || !!bonus.type || lastBet === 0}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:opacity-50 rounded-lg text-white font-bold transition-all"
              >
                🔄 Rebet
              </button>
            </div>

            {/* Quick Bet Buttons */}
            <div className="flex gap-2 flex-wrap justify-center">
              {[100, 500, 1000, 5000, 10000].map(amount => (
                <button
                  key={amount}
                  onClick={() => setBetAmount(amount)}
                  disabled={isSpinning || !!bonus.type}
                  className={`px-3 py-2 rounded-lg font-bold transition-all ${
                    betAmount === amount
                      ? 'bg-amber-500 text-black'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  } disabled:opacity-50`}
                >
                  ${amount}
                </button>
              ))}
            </div>

            {/* Spin Button */}
            <button
              onClick={spin}
              disabled={isSpinning || (betAmount > balance && !bonus.type)}
              className={`
                px-8 py-4 rounded-2xl font-bold text-xl transition-all transform hover:scale-105
                ${bonus.type 
                  ? 'bg-gradient-to-r from-purple-500 to-amber-500 animate-pulse' 
                  : 'bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-600 hover:to-red-700'}
                text-white shadow-lg disabled:opacity-50 disabled:transform-none
              `}
            >
              {isSpinning ? '🎰' : bonus.type ? `🎁 FREE SPIN (${bonus.spinsRemaining})` : '🎰 SPIN'}
            </button>
          </div>
        </div>

        {/* Buy Bonus Section */}
        {!bonus.type && (
          <div className="mt-4 bg-gradient-to-r from-amber-900/30 to-red-900/30 rounded-2xl p-4 border border-amber-500/20">
            <div className="text-center mb-3">
              <h3 className="text-lg font-bold text-amber-400">🎁 Buy Bonus</h3>
              <p className="text-xs text-gray-400">Skip straight to the action!</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Train Robbery - 80x */}
              <button
                onClick={() => buyBonus('train')}
                disabled={isSpinning || balance < betAmount * 80}
                className="p-4 bg-gradient-to-br from-gray-700/50 to-gray-900/50 rounded-xl border border-gray-600 hover:border-amber-500 transition-all disabled:opacity-50 group"
              >
                <div className="text-3xl mb-2">🚂</div>
                <div className="font-bold text-white group-hover:text-amber-400">Train Robbery</div>
                <div className="text-xs text-gray-400">Sticky Wilds</div>
                <div className="mt-2 text-amber-400 font-bold">${(betAmount * 80).toLocaleString()}</div>
                <div className="text-xs text-gray-500">80× Bet</div>
              </button>

              {/* Duel at Dawn - 200x */}
              <button
                onClick={() => buyBonus('duel')}
                disabled={isSpinning || balance < betAmount * 200}
                className="p-4 bg-gradient-to-br from-orange-700/50 to-red-900/50 rounded-xl border border-orange-600 hover:border-amber-500 transition-all disabled:opacity-50 group"
              >
                <div className="text-3xl mb-2">🤺</div>
                <div className="font-bold text-white group-hover:text-amber-400">Duel at Dawn</div>
                <div className="text-xs text-gray-400">More VS Wilds</div>
                <div className="mt-2 text-amber-400 font-bold">${(betAmount * 200).toLocaleString()}</div>
                <div className="text-xs text-gray-500">200× Bet</div>
              </button>

              {/* Dead Man's Hand - 400x */}
              <button
                onClick={() => buyBonus('dead')}
                disabled={isSpinning || balance < betAmount * 400}
                className="p-4 bg-gradient-to-br from-purple-700/50 to-black/50 rounded-xl border border-purple-600 hover:border-amber-500 transition-all disabled:opacity-50 group"
              >
                <div className="text-3xl mb-2">☠️</div>
                <div className="font-bold text-white group-hover:text-amber-400">Dead Man&apos;s Hand</div>
                <div className="text-xs text-gray-400">Collect & Showdown</div>
                <div className="mt-2 text-amber-400 font-bold">${(betAmount * 400).toLocaleString()}</div>
                <div className="text-xs text-gray-500">400× Bet</div>
              </button>
            </div>
          </div>
        )}

        {/* Feature Info */}
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700/50">
            <div className="text-2xl mb-1">🚂</div>
            <div className="text-xs text-gray-400">Train Robbery</div>
            <div className="text-xs text-amber-400">Sticky Wilds</div>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700/50">
            <div className="text-2xl mb-1">🤺</div>
            <div className="text-xs text-gray-400">Duel at Dawn</div>
            <div className="text-xs text-amber-400">More VS Wilds</div>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700/50">
            <div className="text-2xl mb-1">☠️</div>
            <div className="text-xs text-gray-400">Dead Man&apos;s Hand</div>
            <div className="text-xs text-amber-400">Collect & Showdown</div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <span>⭐</span>
            <span className="text-gray-400">Wild</span>
          </div>
          <div className="flex items-center gap-1">
            <span>⚔️</span>
            <span className="text-gray-400">VS Wild (Expands)</span>
          </div>
          <div className="flex items-center gap-1">
            <span>🚂🤺☠️</span>
            <span className="text-gray-400">3+ = Bonus</span>
          </div>
        </div>
      </div>
    </div>
  );
}
