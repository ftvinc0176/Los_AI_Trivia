'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCasino } from '../CasinoContext';

type RiskLevel = 'low' | 'medium' | 'high' | 'classic';

// Stake.us Keno payout tables
const PAYOUT_TABLES: Record<RiskLevel, Record<number, Record<number, number>>> = {
  classic: {
    1: { 1: 3.96 },
    2: { 1: 1, 2: 4.9 },
    3: { 1: 0.5, 2: 1.5, 3: 12 },
    4: { 1: 0.4, 2: 1, 3: 3.5, 4: 29 },
    5: { 1: 0.3, 2: 0.8, 3: 2, 4: 8, 5: 50 },
    6: { 2: 0.5, 3: 1.5, 4: 4, 5: 15, 6: 90 },
    7: { 2: 0.4, 3: 1, 4: 2.5, 5: 8, 6: 35, 7: 150 },
    8: { 3: 0.8, 4: 2, 5: 5, 6: 18, 7: 70, 8: 300 },
    9: { 3: 0.5, 4: 1.5, 5: 3, 6: 10, 7: 40, 8: 150, 9: 500 },
    10: { 3: 0.4, 4: 1, 5: 2, 6: 6, 7: 20, 8: 80, 9: 300, 10: 1000 }
  },
  low: {
    1: { 1: 3.96 },
    2: { 2: 5.8 },
    3: { 2: 1.8, 3: 5.5 },
    4: { 2: 1.2, 3: 2.5, 4: 14 },
    5: { 2: 0.8, 3: 1.8, 4: 5, 5: 23 },
    6: { 3: 1.3, 4: 3, 5: 10, 6: 43 },
    7: { 3: 1.1, 4: 2, 5: 5, 6: 20, 7: 80 },
    8: { 4: 1.5, 5: 3, 6: 10, 7: 40, 8: 150 },
    9: { 4: 1.3, 5: 2.5, 6: 6, 7: 24, 8: 90, 9: 300 },
    10: { 4: 1.1, 5: 2, 6: 4, 7: 14, 8: 55, 9: 200, 10: 500 }
  },
  medium: {
    1: { 1: 3.96 },
    2: { 2: 9 },
    3: { 2: 1.4, 3: 15 },
    4: { 2: 0.6, 3: 3, 4: 44 },
    5: { 3: 2, 4: 8, 5: 80 },
    6: { 3: 1.2, 4: 4, 5: 20, 6: 200 },
    7: { 4: 2, 5: 8, 6: 50, 7: 400 },
    8: { 4: 1.5, 5: 5, 6: 25, 7: 120, 8: 700 },
    9: { 5: 3, 6: 12, 7: 60, 8: 300, 9: 1500 },
    10: { 5: 2, 6: 8, 7: 35, 8: 150, 9: 700, 10: 3000 }
  },
  high: {
    1: { 1: 3.96 },
    2: { 2: 17 },
    3: { 3: 50 },
    4: { 3: 4, 4: 81.5 },
    5: { 4: 10, 5: 250 },
    6: { 4: 4, 5: 35, 6: 710 },
    7: { 4: 2, 5: 15, 6: 130, 7: 2000 },
    8: { 5: 8, 6: 50, 7: 400, 8: 5000 },
    9: { 5: 4, 6: 25, 7: 180, 8: 1500, 9: 10000 },
    10: { 6: 15, 7: 100, 8: 700, 9: 5000, 10: 25000 }
  }
};

export default function KenoGame() {
  const router = useRouter();
  const { balance, setBalance, recordBet, checkAndReload } = useCasino();
  
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [betAmount, setBetAmount] = useState(100);
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('medium');
  const [isPlaying, setIsPlaying] = useState(false);
  const [gamePhase, setGamePhase] = useState<'idle' | 'drawing' | 'result'>('idle');
  const [winAmount, setWinAmount] = useState(0);
  const [hitCount, setHitCount] = useState(0);
  const [fastSpins, setFastSpins] = useState(false);
  const [showDiffDropdown, setShowDiffDropdown] = useState(false);

  const TOTAL_NUMBERS = 40;
  const DRAW_COUNT = 10;
  const MAX_PICKS = 10;

  useEffect(() => {
    if (balance < 1000 && !isPlaying) {
      checkAndReload();
    }
  }, [balance, isPlaying, checkAndReload]);

  // Toggle number selection
  const toggleNumber = (num: number) => {
    if (isPlaying) return;
    setSelectedNumbers(prev => {
      if (prev.includes(num)) {
        return prev.filter(n => n !== num);
      } else if (prev.length < MAX_PICKS) {
        return [...prev, num];
      }
      return prev;
    });
  };

  // Random pick
  const randomPick = () => {
    if (isPlaying) return;
    const count = Math.min(5, MAX_PICKS);
    const nums: number[] = [];
    while (nums.length < count) {
      const n = Math.floor(Math.random() * TOTAL_NUMBERS) + 1;
      if (!nums.includes(n)) nums.push(n);
    }
    setSelectedNumbers(nums);
  };

  // Clear table
  const clearTable = () => {
    if (isPlaying) return;
    setSelectedNumbers([]);
    setDrawnNumbers([]);
    setGamePhase('idle');
    setWinAmount(0);
    setHitCount(0);
  };

  // Generate draw
  const generateDraw = (): number[] => {
    const nums: number[] = [];
    while (nums.length < DRAW_COUNT) {
      const n = Math.floor(Math.random() * TOTAL_NUMBERS) + 1;
      if (!nums.includes(n)) nums.push(n);
    }
    return nums;
  };

  // Play game
  const play = async () => {
    if (selectedNumbers.length === 0 || isPlaying || betAmount > balance) return;

    setIsPlaying(true);
    setGamePhase('drawing');
    setWinAmount(0);
    setHitCount(0);
    setDrawnNumbers([]);
    
    setBalance(balance - betAmount);
    recordBet(betAmount);
    
    const drawn = generateDraw();

    if (fastSpins) {
      // Instant reveal
      setDrawnNumbers(drawn);
    } else {
      // Animate one by one
      for (let i = 0; i < DRAW_COUNT; i++) {
        await new Promise(r => setTimeout(r, 100));
        setDrawnNumbers(prev => [...prev, drawn[i]]);
      }
    }

    // Calculate result
    await new Promise(r => setTimeout(r, fastSpins ? 50 : 200));
    
    const hits = drawn.filter(n => selectedNumbers.includes(n)).length;
    setHitCount(hits);
    
    const payoutTable = PAYOUT_TABLES[riskLevel][selectedNumbers.length] || {};
    const mult = payoutTable[hits] || 0;
    const win = mult * betAmount;
    
    setWinAmount(win);
    if (win > 0) {
      setBalance(balance - betAmount + win);
    }
    
    setGamePhase('result');
    setIsPlaying(false);
  };

  // Get payout previews
  const getPayouts = () => {
    if (selectedNumbers.length === 0) return [];
    const table = PAYOUT_TABLES[riskLevel][selectedNumbers.length] || {};
    const result: { hits: number; mult: number }[] = [];
    for (let i = 0; i <= selectedNumbers.length; i++) {
      result.push({ hits: i, mult: table[i] || 0 });
    }
    return result;
  };

  // Get cell style
  const getCellStyle = (num: number) => {
    const isSelected = selectedNumbers.includes(num);
    const isDrawn = drawnNumbers.includes(num);
    const isHit = isSelected && isDrawn;
    const isMiss = isDrawn && !isSelected;

    if (isHit) {
      return 'bg-purple-500 text-white border-purple-400';
    }
    if (isSelected) {
      return 'bg-purple-600 text-white border-purple-500';
    }
    if (isMiss) {
      return 'bg-slate-600 text-slate-300 border-slate-500';
    }
    return 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600 hover:border-slate-500';
  };

  const payouts = getPayouts();

  return (
    <div className="min-h-screen bg-[#1a1d29] text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
        <button onClick={() => router.push('/casino')} className="text-slate-400 hover:text-white text-sm">
          ← Back
        </button>
        <span className="text-purple-400 font-bold text-lg">KENO</span>
        <div className="text-green-400 font-bold">${balance.toLocaleString()}</div>
      </div>

      {/* Result Banner */}
      {gamePhase === 'result' && (
        <div className={`mx-4 mt-3 py-2 px-4 rounded-lg text-center font-bold ${
          winAmount > 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {winAmount > 0 
            ? `🎉 Win! ${hitCount}/${selectedNumbers.length} hits = $${winAmount.toLocaleString()}`
            : `No Win - ${hitCount}/${selectedNumbers.length} hits`
          }
        </div>
      )}

      {/* Main Layout */}
      <div className="flex flex-col lg:flex-row gap-4 p-4">
        
        {/* Left Panel - Controls */}
        <div className="lg:w-64 flex-shrink-0 space-y-3">
          {/* Mode Toggle */}
          <div className="flex bg-slate-800 rounded-lg p-1">
            <button className="flex-1 py-2 rounded-md text-sm font-medium bg-slate-700 text-white">
              Manual
            </button>
            <button className="flex-1 py-2 rounded-md text-sm font-medium text-slate-400">
              Auto
            </button>
          </div>

          {/* Amount */}
          <div>
            <label className="text-slate-400 text-xs mb-1 block">Amount</label>
            <div className="flex items-center gap-1">
              <div className="flex-1 flex items-center bg-slate-800 rounded-lg border border-slate-700 px-3 py-2">
                <input
                  type="number"
                  value={betAmount}
                  onChange={(e) => setBetAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  disabled={isPlaying}
                  className="flex-1 bg-transparent text-white outline-none w-full"
                />
                <span className="text-green-400 ml-2">G</span>
              </div>
              <button 
                onClick={() => !isPlaying && setBetAmount(Math.max(0, betAmount / 2))}
                disabled={isPlaying}
                className="px-3 py-2 bg-slate-800 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-50"
              >½</button>
              <button 
                onClick={() => !isPlaying && setBetAmount(betAmount * 2)}
                disabled={isPlaying}
                className="px-3 py-2 bg-slate-800 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-50"
              >2×</button>
            </div>
          </div>

          {/* Difficulty Dropdown */}
          <div className="relative">
            <label className="text-slate-400 text-xs mb-1 block">Difficulty</label>
            <button 
              onClick={() => !isPlaying && setShowDiffDropdown(!showDiffDropdown)}
              disabled={isPlaying}
              className="w-full flex items-center justify-between bg-slate-800 rounded-lg border border-slate-700 px-3 py-2 text-white disabled:opacity-50"
            >
              <span className="capitalize">{riskLevel}</span>
              <span className="text-slate-400">▼</span>
            </button>
            {showDiffDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg overflow-hidden z-10">
                {(['low', 'medium', 'high', 'classic'] as RiskLevel[]).map(level => (
                  <button
                    key={level}
                    onClick={() => { setRiskLevel(level); setShowDiffDropdown(false); }}
                    className={`w-full px-3 py-2 text-left capitalize hover:bg-slate-700 ${
                      riskLevel === level ? 'bg-slate-700 text-white' : 'text-slate-300'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Random Pick */}
          <button
            onClick={randomPick}
            disabled={isPlaying}
            className="w-full py-2.5 bg-slate-800 rounded-lg border border-slate-700 text-white font-medium hover:bg-slate-700 disabled:opacity-50"
          >
            Random Pick
          </button>

          {/* Clear Table */}
          <button
            onClick={clearTable}
            disabled={isPlaying}
            className="w-full py-2.5 bg-slate-800 rounded-lg border border-slate-700 text-white font-medium hover:bg-slate-700 disabled:opacity-50"
          >
            Clear Table
          </button>

          {/* Fast Spins */}
          <div className="flex items-center justify-between bg-slate-800 rounded-lg border border-slate-700 px-3 py-2">
            <span className="text-slate-300 text-sm">Fast spins</span>
            <button
              onClick={() => setFastSpins(!fastSpins)}
              className={`w-10 h-5 rounded-full transition-colors ${fastSpins ? 'bg-purple-500' : 'bg-slate-600'}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full transition-transform ${fastSpins ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* Play Button */}
          <button
            onClick={play}
            disabled={selectedNumbers.length === 0 || isPlaying || betAmount > balance || betAmount <= 0}
            className={`w-full py-3 rounded-lg font-bold text-lg transition-all ${
              selectedNumbers.length > 0 && !isPlaying && betAmount <= balance && betAmount > 0
                ? 'bg-green-500 hover:bg-green-400 text-white'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            {isPlaying ? 'Drawing...' : 'Play'}
          </button>
        </div>

        {/* Right Panel - Game Grid */}
        <div className="flex-1 flex flex-col">
          {/* Numbers Grid - 8 columns */}
          <div className="grid grid-cols-8 gap-2">
            {Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1).map(num => (
              <button
                key={num}
                onClick={() => toggleNumber(num)}
                disabled={isPlaying}
                className={`aspect-square rounded-lg border-2 font-bold text-lg transition-all ${getCellStyle(num)} disabled:cursor-default`}
              >
                {num}
              </button>
            ))}
          </div>

          {/* Payout Preview Row */}
          {selectedNumbers.length > 0 && (
            <div className="mt-4">
              <div className="flex gap-1 overflow-x-auto pb-2">
                {payouts.map(({ hits, mult }) => (
                  <div 
                    key={hits}
                    className={`flex-1 min-w-[70px] py-3 rounded-lg text-center border ${
                      gamePhase === 'result' && hitCount === hits && mult > 0
                        ? 'bg-green-500/20 border-green-500'
                        : 'bg-slate-800 border-slate-700'
                    }`}
                  >
                    <div className={`text-lg font-bold ${mult > 0 ? 'text-white' : 'text-slate-500'}`}>
                      {mult > 0 ? `${mult}×` : '0.00×'}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-1 mt-1">
                {payouts.map(({ hits }) => (
                  <div key={hits} className="flex-1 min-w-[70px] text-center">
                    <span className="text-xs text-slate-500">{hits}× 🎯</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="flex gap-4 mt-4 justify-center">
            <div className="text-center">
              <div className="text-slate-500 text-xs">Selected</div>
              <div className="text-purple-400 font-bold text-xl">{selectedNumbers.length}</div>
            </div>
            <div className="text-center">
              <div className="text-slate-500 text-xs">Drawn</div>
              <div className="text-blue-400 font-bold text-xl">{drawnNumbers.length}</div>
            </div>
            <div className="text-center">
              <div className="text-slate-500 text-xs">Hits</div>
              <div className="text-green-400 font-bold text-xl">{hitCount}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
