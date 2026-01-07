'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCasino } from '../CasinoContext';

type RiskLevel = 'low' | 'medium' | 'high' | 'classic';

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
  const [showDiff, setShowDiff] = useState(false);

  useEffect(() => {
    if (balance < 1000 && !isPlaying) checkAndReload();
  }, [balance, isPlaying, checkAndReload]);

  const toggleNumber = (num: number) => {
    if (isPlaying) return;
    setSelectedNumbers(prev => {
      if (prev.includes(num)) return prev.filter(n => n !== num);
      if (prev.length < 10) return [...prev, num];
      return prev;
    });
  };

  const randomPick = () => {
    if (isPlaying) return;
    const nums: number[] = [];
    while (nums.length < 5) {
      const n = Math.floor(Math.random() * 40) + 1;
      if (!nums.includes(n)) nums.push(n);
    }
    setSelectedNumbers(nums);
  };

  const clearTable = () => {
    if (isPlaying) return;
    setSelectedNumbers([]);
    setDrawnNumbers([]);
    setGamePhase('idle');
    setWinAmount(0);
    setHitCount(0);
  };

  const play = async () => {
    if (selectedNumbers.length === 0 || isPlaying || betAmount > balance || betAmount <= 0) return;

    setIsPlaying(true);
    setGamePhase('drawing');
    setWinAmount(0);
    setHitCount(0);
    setDrawnNumbers([]);
    setBalance(balance - betAmount);
    recordBet(betAmount);
    
    const drawn: number[] = [];
    while (drawn.length < 10) {
      const n = Math.floor(Math.random() * 40) + 1;
      if (!drawn.includes(n)) drawn.push(n);
    }

    if (fastSpins) {
      setDrawnNumbers(drawn);
    } else {
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 80));
        setDrawnNumbers(prev => [...prev, drawn[i]]);
      }
    }

    await new Promise(r => setTimeout(r, 100));
    
    const hits = drawn.filter(n => selectedNumbers.includes(n)).length;
    setHitCount(hits);
    
    const table = PAYOUT_TABLES[riskLevel][selectedNumbers.length] || {};
    const mult = table[hits] || 0;
    const win = mult * betAmount;
    
    setWinAmount(win);
    if (win > 0) setBalance(balance - betAmount + win);
    
    setGamePhase('result');
    setIsPlaying(false);
  };

  const getCellStyle = (num: number) => {
    const isSelected = selectedNumbers.includes(num);
    const isDrawn = drawnNumbers.includes(num);
    
    if (isSelected && isDrawn) {
      // HIT - bright green
      return 'bg-green-500 text-white border-green-400 shadow-lg shadow-green-500/50';
    }
    if (isSelected) {
      // Selected but not drawn yet - purple
      return 'bg-purple-600 text-white border-purple-500';
    }
    if (isDrawn) {
      // Drawn but not selected - show as MISS with red tint
      return 'bg-red-900/40 text-red-400 border-red-700/50';
    }
    // Default
    return 'bg-slate-700/80 text-slate-300 border-slate-600 hover:bg-slate-600';
  };

  const payouts = selectedNumbers.length > 0 
    ? Array.from({ length: selectedNumbers.length + 1 }, (_, i) => ({
        hits: i,
        mult: (PAYOUT_TABLES[riskLevel][selectedNumbers.length] || {})[i] || 0
      }))
    : [];

  return (
    <div className="h-screen flex flex-col bg-[#1a1d29] text-white overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-slate-700/50">
        <button onClick={() => router.push('/casino')} className="text-slate-400 hover:text-white text-sm">← Back</button>
        <span className="text-purple-400 font-bold">KENO</span>
        <div className="text-green-400 font-bold text-sm">${balance.toLocaleString()}</div>
      </div>

      {/* Result Banner */}
      {gamePhase === 'result' && (
        <div className={`flex-shrink-0 mx-2 mt-2 py-2 rounded-lg text-center text-sm font-bold ${
          winAmount > 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {winAmount > 0 ? `🎉 ${hitCount} hits = $${winAmount.toLocaleString()}` : `No Win - ${hitCount}/${selectedNumbers.length} hits`}
        </div>
      )}

      {/* Main Content - constrained for desktop */}
      <div className="flex-1 flex flex-col lg:flex-row p-2 gap-2 min-h-0 overflow-hidden max-w-6xl mx-auto w-full">
        
        {/* Controls - Left on desktop, bottom on mobile */}
        <div className="lg:w-44 flex-shrink-0 flex flex-col gap-1.5 order-2 lg:order-1">
          {/* Mode */}
          <div className="flex bg-slate-800 rounded p-0.5">
            <div className="flex-1 py-1.5 text-center text-xs font-medium bg-slate-700 rounded text-white">Manual</div>
            <div className="flex-1 py-1.5 text-center text-xs font-medium text-slate-500">Auto</div>
          </div>

          {/* Amount */}
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(Math.max(0, parseFloat(e.target.value) || 0))}
              disabled={isPlaying}
              className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-white outline-none min-w-0"
            />
            <button onClick={() => !isPlaying && setBetAmount(Math.max(0, betAmount / 2))} disabled={isPlaying}
              className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs disabled:opacity-50">½</button>
            <button onClick={() => !isPlaying && setBetAmount(betAmount * 2)} disabled={isPlaying}
              className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs disabled:opacity-50">2×</button>
          </div>

          {/* Difficulty */}
          <div className="relative">
            <button onClick={() => !isPlaying && setShowDiff(!showDiff)} disabled={isPlaying}
              className="w-full flex items-center justify-between bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm capitalize disabled:opacity-50">
              {riskLevel} <span className="text-slate-500">▼</span>
            </button>
            {showDiff && (
              <div className="absolute top-full left-0 right-0 mt-0.5 bg-slate-800 border border-slate-700 rounded overflow-hidden z-20">
                {(['low', 'medium', 'high', 'classic'] as RiskLevel[]).map(l => (
                  <button key={l} onClick={() => { setRiskLevel(l); setShowDiff(false); }}
                    className={`w-full px-2 py-1.5 text-left text-sm capitalize hover:bg-slate-700 ${riskLevel === l ? 'bg-slate-700' : ''}`}>
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Buttons */}
          <button onClick={randomPick} disabled={isPlaying}
            className="py-1.5 bg-slate-800 border border-slate-700 rounded text-sm hover:bg-slate-700 disabled:opacity-50">Random Pick</button>
          <button onClick={clearTable} disabled={isPlaying}
            className="py-1.5 bg-slate-800 border border-slate-700 rounded text-sm hover:bg-slate-700 disabled:opacity-50">Clear Table</button>

          {/* Fast Spins */}
          <div className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded px-2 py-1.5">
            <span className="text-xs text-slate-400">Fast spins</span>
            <button onClick={() => setFastSpins(!fastSpins)}
              className={`w-8 h-4 rounded-full ${fastSpins ? 'bg-green-500' : 'bg-slate-600'}`}>
              <div className={`w-3 h-3 bg-white rounded-full transition-transform ${fastSpins ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* Play */}
          <button onClick={play}
            disabled={selectedNumbers.length === 0 || isPlaying || betAmount > balance || betAmount <= 0}
            className={`py-2 rounded font-bold transition-all ${
              selectedNumbers.length > 0 && !isPlaying && betAmount <= balance && betAmount > 0
                ? 'bg-green-500 hover:bg-green-400 text-white' : 'bg-slate-700 text-slate-500'
            }`}>
            {isPlaying ? 'Drawing...' : 'Play'}
          </button>
        </div>

        {/* Game Grid */}
        <div className="flex-1 flex flex-col min-h-0 order-1 lg:order-2 lg:max-h-[calc(100vh-120px)]">
          {/* 8x5 Grid */}
          <div className="flex-1 grid grid-cols-8 grid-rows-5 gap-1 min-h-0">
            {Array.from({ length: 40 }, (_, i) => i + 1).map(num => {
              const isMiss = drawnNumbers.includes(num) && !selectedNumbers.includes(num);
              return (
                <button
                  key={num}
                  onClick={() => toggleNumber(num)}
                  disabled={isPlaying}
                  className={`relative rounded border text-sm sm:text-base font-bold transition-all ${getCellStyle(num)} disabled:cursor-default`}
                >
                  {num}
                  {isMiss && (
                    <span className="absolute inset-0 flex items-center justify-center text-red-500 text-2xl sm:text-3xl font-bold opacity-80">✕</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Payout Row */}
          {selectedNumbers.length > 0 && (
            <div className="flex-shrink-0 mt-2 flex gap-0.5 overflow-x-auto">
              {payouts.map(({ hits, mult }) => (
                <div key={hits} className={`flex-1 min-w-[40px] py-1.5 rounded text-center text-xs ${
                  gamePhase === 'result' && hitCount === hits && mult > 0
                    ? 'bg-green-500/30 border border-green-500' : 'bg-slate-800 border border-slate-700'
                }`}>
                  <div className={`font-bold ${mult > 0 ? 'text-white' : 'text-slate-600'}`}>
                    {mult > 0 ? `${mult}×` : '0×'}
                  </div>
                  <div className="text-[10px] text-slate-500">{hits}🎯</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
