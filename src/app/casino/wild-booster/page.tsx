'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useCasino } from '../CasinoContext'
import { useRouter } from 'next/navigation'

// Symbol types matching Wild Booster
type SymbolType = 'seven' | 'lemon' | 'strawberry' | 'orange' | 'cherry' | 'spade' | 'heart' | 'diamond' | 'clover' | 'wild' | 'scatter'

interface SymbolConfig {
  emoji: string
  display: string
  color: string
  gradient: string
  payouts: { [key: number]: number } // payouts for 3, 4, 5 of a kind
}

// Symbol configurations matching Wild Booster visuals
const SYMBOLS: Record<SymbolType, SymbolConfig> = {
  seven: {
    emoji: '7️⃣',
    display: '7',
    color: '#EF4444',
    gradient: 'from-red-500 to-red-700',
    payouts: { 3: 2.5, 4: 10, 5: 50 }
  },
  lemon: {
    emoji: '🍋',
    display: '🍋',
    color: '#FBBF24',
    gradient: 'from-yellow-400 to-yellow-600',
    payouts: { 3: 1.5, 4: 5, 5: 25 }
  },
  strawberry: {
    emoji: '🍓',
    display: '🍓',
    color: '#EF4444',
    gradient: 'from-red-400 to-red-600',
    payouts: { 3: 1.25, 4: 4, 5: 20 }
  },
  orange: {
    emoji: '🍊',
    display: '🍊',
    color: '#F97316',
    gradient: 'from-orange-400 to-orange-600',
    payouts: { 3: 1, 4: 3, 5: 15 }
  },
  cherry: {
    emoji: '🍒',
    display: '🍒',
    color: '#DC2626',
    gradient: 'from-red-500 to-pink-600',
    payouts: { 3: 0.8, 4: 2.5, 5: 12 }
  },
  spade: {
    emoji: '♠️',
    display: '♠',
    color: '#1F2937',
    gradient: 'from-gray-600 to-gray-800',
    payouts: { 3: 0.4, 4: 1.5, 5: 6 }
  },
  heart: {
    emoji: '♥️',
    display: '♥',
    color: '#EF4444',
    gradient: 'from-red-500 to-red-700',
    payouts: { 3: 0.4, 4: 1.5, 5: 6 }
  },
  diamond: {
    emoji: '♦️',
    display: '♦',
    color: '#3B82F6',
    gradient: 'from-blue-400 to-blue-600',
    payouts: { 3: 0.4, 4: 1.5, 5: 6 }
  },
  clover: {
    emoji: '🍀',
    display: '♣',
    color: '#22C55E',
    gradient: 'from-green-500 to-green-700',
    payouts: { 3: 0.4, 4: 1.5, 5: 6 }
  },
  wild: {
    emoji: '💎',
    display: '💎',
    color: '#60A5FA',
    gradient: 'from-blue-300 to-blue-500',
    payouts: { 3: 5, 4: 25, 5: 100 }
  },
  scatter: {
    emoji: '💠',
    display: '💠',
    color: '#A855F7',
    gradient: 'from-purple-400 to-pink-500',
    payouts: { 3: 0, 4: 0, 5: 0 } // Scatters trigger bonus
  }
}

// Regular symbols for spinning (no wild/scatter)
const REGULAR_SYMBOLS: SymbolType[] = ['seven', 'lemon', 'strawberry', 'orange', 'cherry', 'spade', 'heart', 'diamond', 'clover']

// Wild Boost multipliers
const WILD_BOOST_MULTIPLIERS = [2, 2, 2, 3, 3, 3, 5, 5, 5, 10, 10, 15, 25, 50, 100]

// 20 paylines definition (5 reels, positions 0-2 per reel)
const PAYLINES = [
  [1, 1, 1, 1, 1], // Middle row
  [0, 0, 0, 0, 0], // Top row
  [2, 2, 2, 2, 2], // Bottom row
  [0, 1, 2, 1, 0], // V shape
  [2, 1, 0, 1, 2], // Inverted V
  [0, 0, 1, 2, 2], // Diagonal down
  [2, 2, 1, 0, 0], // Diagonal up
  [1, 0, 0, 0, 1], // Top dip
  [1, 2, 2, 2, 1], // Bottom dip
  [0, 1, 1, 1, 0], // Slight top dip
  [2, 1, 1, 1, 2], // Slight bottom dip
  [1, 0, 1, 0, 1], // Zigzag top
  [1, 2, 1, 2, 1], // Zigzag bottom
  [0, 1, 0, 1, 0], // Wave top
  [2, 1, 2, 1, 2], // Wave bottom
  [0, 0, 1, 0, 0], // Top with center dip
  [2, 2, 1, 2, 2], // Bottom with center peak
  [1, 1, 0, 1, 1], // Middle with top peak
  [1, 1, 2, 1, 1], // Middle with bottom dip
  [0, 2, 0, 2, 0], // Alternating
]

interface ReelCell {
  symbol: SymbolType
  isWinning: boolean
  isSpinning: boolean
  isRevealed: boolean
  wildMultiplier?: number
}

interface WinLine {
  lineIndex: number
  positions: number[]
  symbol: SymbolType
  count: number
  payout: number
  multiplier: number
}

type BonusType = 'mega' | 'ultra' | null

interface BonusState {
  active: boolean
  type: BonusType
  spinsRemaining: number
  totalSpins: number
  currentMultiplier: number
  multiplierTrail: number[]
  scattersCollected: number
  totalWin: number
}

export default function WildBooster() {
  const { balance, setBalance, recordBet, checkAndReload } = useCasino()
  const router = useRouter()

  // Game state
  const [reels, setReels] = useState<ReelCell[][]>(() => 
    Array(5).fill(null).map(() => 
      Array(3).fill(null).map(() => ({
        symbol: REGULAR_SYMBOLS[Math.floor(Math.random() * REGULAR_SYMBOLS.length)],
        isWinning: false,
        isSpinning: false,
        isRevealed: true
      }))
    )
  )
  const [isSpinning, setIsSpinning] = useState(false)
  const [betAmount, setBetAmount] = useState(2)
  const [lastWin, setLastWin] = useState(0)
  const [totalWin, setTotalWin] = useState(0)
  const [winLines, setWinLines] = useState<WinLine[]>([])
  const [showWildBoost, setShowWildBoost] = useState(false)
  const [wildBoostMultiplier, setWildBoostMultiplier] = useState(1)
  const [showBonusChoice, setShowBonusChoice] = useState(false)
  const [bonusScatters, setBonusScatters] = useState(0)
  const [currentScatters, setCurrentScatters] = useState(0) // Track scatters on current grid
  const [bonus, setBonus] = useState<BonusState>({
    active: false,
    type: null,
    spinsRemaining: 0,
    totalSpins: 0,
    currentMultiplier: 1,
    multiplierTrail: [],
    scattersCollected: 0,
    totalWin: 0
  })
  const [showBonusComplete, setShowBonusComplete] = useState(false)
  const [autoPlay, setAutoPlay] = useState(false)
  const [turboMode, setTurboMode] = useState(false)
  const autoPlayRef = useRef(false)
  const spaceHeldRef = useRef(false)

  // Handle spacebar for turbo spin
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        spaceHeldRef.current = true
        setTurboMode(true)
        if (!isSpinning && !showBonusChoice) {
          spin()
        }
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false
        setTurboMode(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [isSpinning, showBonusChoice])

  // Generate random symbol
  const getRandomSymbol = useCallback((includeSpecial: boolean = false): SymbolType => {
    const rand = Math.random()
    if (includeSpecial) {
      if (rand < 0.02) return 'scatter' // 2% scatter
      if (rand < 0.08) return 'wild' // 6% wild
    }
    return REGULAR_SYMBOLS[Math.floor(Math.random() * REGULAR_SYMBOLS.length)]
  }, [])

  // Check for winning lines
  const checkWins = useCallback((grid: ReelCell[][]): WinLine[] => {
    const wins: WinLine[] = []
    
    PAYLINES.forEach((line, lineIndex) => {
      // Get symbols on this payline
      const lineSymbols = line.map((row, col) => grid[col][row].symbol)
      const lineMultipliers = line.map((row, col) => grid[col][row].wildMultiplier || 1)
      
      // Find longest match from left
      let matchSymbol: SymbolType | null = null
      let matchCount = 0
      let wildCount = 0
      let totalMultiplier = 1
      
      for (let i = 0; i < 5; i++) {
        const sym = lineSymbols[i]
        
        if (sym === 'scatter') break // Scatter breaks line
        
        if (sym === 'wild') {
          if (matchSymbol === null) {
            // Wild at start
            wildCount++
            matchCount++
            if (lineMultipliers[i] > 1) totalMultiplier *= lineMultipliers[i]
          } else {
            // Wild substituting
            matchCount++
            if (lineMultipliers[i] > 1) totalMultiplier *= lineMultipliers[i]
          }
        } else {
          if (matchSymbol === null) {
            matchSymbol = sym
            matchCount++
          } else if (sym === matchSymbol) {
            matchCount++
          } else {
            break
          }
        }
      }
      
      // If all wilds, use wild payout
      if (matchSymbol === null && wildCount > 0) {
        matchSymbol = 'wild'
      }
      
      // Check if winning (3+ matching)
      if (matchCount >= 3 && matchSymbol) {
        const basePayout = SYMBOLS[matchSymbol].payouts[matchCount] || 0
        if (basePayout > 0) {
          wins.push({
            lineIndex,
            positions: line.slice(0, matchCount),
            symbol: matchSymbol,
            count: matchCount,
            payout: basePayout,
            multiplier: totalMultiplier
          })
        }
      }
    })
    
    return wins
  }, [])

  // Count scatters on grid
  const countScatters = useCallback((grid: ReelCell[][]): number => {
    let count = 0
    grid.forEach(col => col.forEach(cell => {
      if (cell.symbol === 'scatter') count++
    }))
    return count
  }, [])

  // Spin function
  const spin = useCallback(async () => {
    if (isSpinning || (betAmount > balance && !bonus.active)) return

    // Deduct bet (not during free spins)
    if (!bonus.active) {
      setBalance(balance - betAmount)
      recordBet(betAmount)
      checkAndReload()
    }

    setIsSpinning(true)
    setLastWin(0)
    setWinLines([])
    setShowWildBoost(false)

    const spinDuration = turboMode ? 300 : 600
    const columnDelay = turboMode ? 50 : 100

    // Start spinning animation
    setReels(prev => prev.map(col => col.map(cell => ({
      ...cell,
      isSpinning: true,
      isWinning: false,
      isRevealed: false
    }))))

    // Generate final results
    const newReels: ReelCell[][] = Array(5).fill(null).map(() => 
      Array(3).fill(null).map(() => ({
        symbol: getRandomSymbol(true),
        isWinning: false,
        isSpinning: false,
        isRevealed: false
      }))
    )

    // Add wild multipliers during bonus
    if (bonus.active) {
      newReels.forEach(col => col.forEach(cell => {
        if (cell.symbol === 'wild') {
          cell.wildMultiplier = bonus.currentMultiplier
        }
      }))
    }

    // Reveal columns one by one
    for (let col = 0; col < 5; col++) {
      await new Promise(r => setTimeout(r, col === 0 ? spinDuration : columnDelay))
      setReels(prev => prev.map((c, i) => 
        i <= col 
          ? newReels[i].map(cell => ({ ...cell, isRevealed: true, isSpinning: false }))
          : prev[i]
      ))
    }

    // Check for wins
    const wins = checkWins(newReels)
    const scatters = countScatters(newReels)
    setCurrentScatters(scatters) // Track current scatter count

    // Check for wild boost (any wild in winning line)
    let wildBoost = 1
    const hasWildInWin = wins.some(w => 
      w.positions.some((row, col) => newReels[col][row].symbol === 'wild')
    )
    
    if (hasWildInWin && !bonus.active) {
      wildBoost = WILD_BOOST_MULTIPLIERS[Math.floor(Math.random() * WILD_BOOST_MULTIPLIERS.length)]
      if (wildBoost > 1) {
        setWildBoostMultiplier(wildBoost)
        setShowWildBoost(true)
        await new Promise(r => setTimeout(r, 1500))
        setShowWildBoost(false)
      }
    }

    // Calculate total win
    let spinWin = 0
    wins.forEach(win => {
      spinWin += win.payout * betAmount * win.multiplier * wildBoost
    })

    // Mark winning positions
    if (wins.length > 0) {
      const winningPositions = new Set<string>()
      wins.forEach(win => {
        win.positions.forEach((row, col) => {
          winningPositions.add(`${col}-${row}`)
        })
      })
      setReels(newReels.map((col, colIdx) => 
        col.map((cell, rowIdx) => ({
          ...cell,
          isWinning: winningPositions.has(`${colIdx}-${rowIdx}`),
          isRevealed: true
        }))
      ))
    }

    setWinLines(wins)
    setLastWin(spinWin)
    setTotalWin(t => t + spinWin)
    
    // Add winnings to balance (bet was already deducted at start)
    if (spinWin > 0) {
      setBalance(balance + spinWin)
    }

    // Handle bonus
    if (bonus.active) {
      // Update bonus state
      const newSpinsRemaining = bonus.spinsRemaining - 1
      const newScattersCollected = bonus.scattersCollected + scatters
      
      // Check for multiplier upgrades
      let newMultiplier = bonus.currentMultiplier
      let newTrailIndex = bonus.multiplierTrail.indexOf(bonus.currentMultiplier)
      
      // Each 3 scatters advances the multiplier
      const upgradesEarned = Math.floor(newScattersCollected / 3) - Math.floor(bonus.scattersCollected / 3)
      if (upgradesEarned > 0 && newTrailIndex < bonus.multiplierTrail.length - 1) {
        newTrailIndex = Math.min(bonus.multiplierTrail.length - 1, newTrailIndex + upgradesEarned)
        newMultiplier = bonus.multiplierTrail[newTrailIndex]
        // Add 5 spins per upgrade
        setBonus(prev => ({
          ...prev,
          spinsRemaining: newSpinsRemaining + (upgradesEarned * 5),
          currentMultiplier: newMultiplier,
          scattersCollected: newScattersCollected,
          totalWin: prev.totalWin + spinWin
        }))
      } else {
        setBonus(prev => ({
          ...prev,
          spinsRemaining: newSpinsRemaining,
          scattersCollected: newScattersCollected,
          totalWin: prev.totalWin + spinWin
        }))
      }

      // Check if bonus complete
      if (newSpinsRemaining <= 0) {
        setBonus(prev => ({ ...prev, active: false }))
        setShowBonusComplete(true)
      }
    } else if (scatters >= 3) {
      // Trigger bonus choice
      setBonusScatters(scatters)
      setShowBonusChoice(true)
    }

    setIsSpinning(false)
  }, [isSpinning, betAmount, balance, bonus, turboMode, getRandomSymbol, checkWins, countScatters, setBalance, recordBet, checkAndReload])

  // Start bonus
  const startBonus = useCallback((type: BonusType) => {
    if (!type) return
    
    const megaTrail = [2, 5, 10, 100]
    const ultraTrail = [3, 6, 12, 50]
    const trail = type === 'mega' ? megaTrail : ultraTrail
    const baseSpins = 5 + (bonusScatters - 3) * 2 // 5 base + 2 per extra scatter

    setBonus({
      active: true,
      type,
      spinsRemaining: baseSpins,
      totalSpins: baseSpins,
      currentMultiplier: trail[0],
      multiplierTrail: trail,
      scattersCollected: 0,
      totalWin: 0
    })
    setShowBonusChoice(false)
    setTotalWin(0)
  }, [bonusScatters])

  // Buy bonus
  const buyBonus = useCallback(() => {
    const cost = betAmount * 75
    if (balance >= cost) {
      setBalance(balance - cost)
      recordBet(cost)
      setBonusScatters(3 + Math.floor(Math.random() * 3)) // 3-5 scatters
      setShowBonusChoice(true)
    }
  }, [balance, betAmount, setBalance, recordBet])

  // Auto-play handler
  useEffect(() => {
    autoPlayRef.current = autoPlay
    if (autoPlay && !isSpinning && !showBonusChoice && !showBonusComplete) {
      const timeout = setTimeout(() => {
        if (autoPlayRef.current && balance >= betAmount) {
          spin()
        } else {
          setAutoPlay(false)
        }
      }, turboMode ? 500 : 1000)
      return () => clearTimeout(timeout)
    }
  }, [autoPlay, isSpinning, showBonusChoice, showBonusComplete, balance, betAmount, turboMode, spin])

  // Render symbol
  const renderSymbol = (cell: ReelCell, colIdx: number, rowIdx: number) => {
    const config = SYMBOLS[cell.symbol]
    const isSpecial = cell.symbol === 'wild' || cell.symbol === 'scatter'
    const isScatter = cell.symbol === 'scatter'
    
    return (
      <div
        key={`${colIdx}-${rowIdx}`}
        className={`
          relative w-full aspect-square flex items-center justify-center
          rounded-lg border-2 transition-all duration-200
          ${cell.isSpinning ? 'animate-pulse bg-gray-800' : ''}
          ${cell.isWinning ? 'border-yellow-400 shadow-lg shadow-yellow-400/50 animate-pulse' : 'border-gray-700/50'}
          ${isScatter ? 'bg-gradient-to-br from-purple-600 via-pink-500 to-purple-600 border-purple-400 shadow-lg shadow-purple-500/50' : ''}
          ${cell.symbol === 'wild' ? 'bg-gradient-to-br ' + config.gradient : ''}
          ${!isSpecial ? 'bg-gray-800/80' : ''}
        `}
      >
        {cell.isRevealed && !cell.isSpinning && (
          <>
            {cell.symbol === 'seven' ? (
              <span className="text-3xl sm:text-4xl md:text-5xl font-bold text-red-500 drop-shadow-lg" 
                    style={{ textShadow: '0 0 10px #ef4444' }}>
                7
              </span>
            ) : isScatter ? (
              <div className="flex flex-col items-center">
                <span className="text-2xl sm:text-3xl md:text-4xl drop-shadow-lg animate-pulse" style={{ textShadow: '0 0 15px #a855f7' }}>
                  💠
                </span>
                <span className="text-[8px] sm:text-[10px] font-bold text-white bg-purple-600/80 px-1 rounded absolute bottom-1">
                  SCATTER
                </span>
              </div>
            ) : (
              <span className="text-2xl sm:text-3xl md:text-4xl drop-shadow-lg">
                {config.emoji}
              </span>
            )}
            {cell.wildMultiplier && cell.wildMultiplier > 1 && (
              <div className="absolute -top-1 -right-1 bg-yellow-500 text-black text-xs font-bold px-1 rounded">
                {cell.wildMultiplier}×
              </div>
            )}
          </>
        )}
        {cell.isSpinning && (
          <div className="text-2xl sm:text-3xl animate-spin">❓</div>
        )}
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-purple-900 via-violet-900 to-purple-900 text-white overflow-hidden">
      {/* Animated background sparkles */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              opacity: 0.3 + Math.random() * 0.4
            }}
          />
        ))}
      </div>

      {/* Compact Header */}
      <div className="flex-shrink-0 bg-black/40 border-b border-purple-500/30 px-2 py-1.5 flex items-center justify-between relative z-10">
        <button onClick={() => router.push('/casino')} className="text-gray-400 hover:text-white text-sm">
          ← Back
        </button>
        <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-yellow-400 via-orange-400 to-red-400 bg-clip-text text-transparent">
          💎 WILD BOOSTER 💎
        </h1>
        <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 px-2 py-1 rounded-lg border border-yellow-500/30">
          <span className="text-yellow-400 font-bold text-sm">${balance.toLocaleString()}</span>
        </div>
      </div>

      {/* Free Spins Banner */}
      {bonus.active && (
        <div className="flex-shrink-0 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 px-2 py-1 flex items-center justify-center gap-4 text-sm animate-pulse">
          <span className="font-bold">{bonus.type === 'mega' ? '🚀 MEGA BOOST' : '⚡ ULTRA BOOST'}</span>
          <span className="bg-black/30 px-2 py-0.5 rounded">Spins: {bonus.spinsRemaining}</span>
          <span className="bg-yellow-500 text-black px-2 py-0.5 rounded font-bold">{bonus.currentMultiplier}×</span>
          <span className="text-yellow-300">Win: ${bonus.totalWin.toFixed(2)}</span>
        </div>
      )}

      {/* Main Game Area */}
      <div className="flex-1 flex items-center justify-center p-2 sm:p-4 overflow-hidden relative z-10">
        <div className="flex items-stretch gap-2 max-w-5xl w-full h-full max-h-[650px]">
          
          {/* Left Panel - Wild Boost */}
          <div className="hidden sm:flex flex-col items-center justify-center w-20 bg-gradient-to-b from-red-900/80 to-red-950/80 rounded-xl border-2 border-yellow-600/50 p-2">
            <div className="text-center">
              <div className="text-xs text-yellow-400 font-bold mb-1">WILD</div>
              <div className="text-lg font-bold text-red-400">BOOST</div>
              <div className="mt-2 text-2xl">💎</div>
              <div className="mt-2 text-xs text-gray-300">2× - 100×</div>
            </div>
          </div>

          {/* Center - Reel Grid */}
          <div className="flex-1 flex flex-col">
            {/* Gold Frame Container */}
            <div className="flex-1 bg-gradient-to-b from-yellow-600 via-yellow-700 to-yellow-800 rounded-xl p-1 sm:p-2 shadow-2xl border-4 border-yellow-500/50">
              <div className="h-full bg-gray-900/95 rounded-lg p-2 sm:p-3">
                {/* 5x3 Grid */}
                <div className="grid grid-cols-5 gap-1 sm:gap-2 h-full">
                  {reels.map((col, colIdx) => (
                    <div key={colIdx} className="flex flex-col gap-1 sm:gap-2">
                      {col.map((cell, rowIdx) => renderSymbol(cell, colIdx, rowIdx))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Win Display */}
            {lastWin > 0 ? (
              <div className="text-center py-2 animate-bounce">
                <span className="text-xl sm:text-2xl font-bold text-yellow-400 drop-shadow-lg">
                  🎉 WIN ${lastWin.toFixed(2)} 🎉
                </span>
              </div>
            ) : (
              /* Scatter Progress Indicator */
              <div className="py-2 flex flex-col items-center justify-center">
                <div className="flex items-center gap-2 bg-black/40 px-4 py-2 rounded-xl border border-purple-500/30">
                  <div className="flex items-center gap-1">
                    {[0, 1, 2].map((i) => (
                      <div 
                        key={i}
                        className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center border-2 transition-all ${
                          currentScatters > i 
                            ? 'bg-gradient-to-br from-purple-500 to-pink-500 border-yellow-400 animate-pulse shadow-lg shadow-purple-500/50' 
                            : 'bg-gray-800/50 border-gray-600'
                        }`}
                      >
                        <span className="text-lg sm:text-xl">{currentScatters > i ? '💠' : '◇'}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-center ml-2">
                    <div className="text-xs text-gray-400">SCATTERS</div>
                    <div className="text-sm font-bold text-purple-300">
                      {currentScatters}/3 = <span className="text-yellow-400">FREE SPINS!</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Buy Bonus */}
          <div className="hidden sm:flex flex-col items-center justify-center w-24 bg-gradient-to-b from-green-900/80 to-green-950/80 rounded-xl border-2 border-yellow-600/50 p-2">
            <div className="text-center">
              <div className="text-xs text-yellow-400 font-bold mb-1">BUY</div>
              <div className="text-sm font-bold text-green-400">FREE SPINS</div>
              <button
                onClick={buyBonus}
                disabled={balance < betAmount * 75 || isSpinning || bonus.active}
                className={`mt-2 px-2 py-1 rounded text-xs font-bold transition-all ${
                  balance >= betAmount * 75 && !isSpinning && !bonus.active
                    ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 text-white shadow-lg'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                ${(betAmount * 75).toFixed(0)}
              </button>
              <div className="mt-1 text-[10px] text-gray-400">(75× bet)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Wild Boost Animation */}
      {showWildBoost && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 animate-pulse">
          <div className="text-center">
            <div className="text-4xl sm:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 animate-bounce">
              WILD BOOST!
            </div>
            <div className="text-6xl sm:text-8xl font-bold text-yellow-400 mt-4 drop-shadow-lg" 
                 style={{ textShadow: '0 0 30px #fbbf24' }}>
              {wildBoostMultiplier}×
            </div>
          </div>
        </div>
      )}

      {/* Bonus Choice Modal */}
      {showBonusChoice && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/80 z-50">
          <div className="bg-gradient-to-br from-purple-900 to-violet-900 rounded-2xl p-6 max-w-md w-full mx-4 border-2 border-yellow-500/50">
            <h2 className="text-2xl font-bold text-center text-yellow-400 mb-2">
              🎰 SUPER BOOST BONUS! 🎰
            </h2>
            <p className="text-center text-gray-300 mb-4">
              {bonusScatters} Scatters! Choose your boost:
            </p>
            
            <div className="grid grid-cols-2 gap-4">
              {/* Mega Boost */}
              <button
                onClick={() => startBonus('mega')}
                className="bg-gradient-to-br from-red-600 to-orange-600 rounded-xl p-4 border-2 border-yellow-400/50 hover:border-yellow-400 transition-all hover:scale-105"
              >
                <div className="text-xl font-bold text-white mb-2">🚀 MEGA</div>
                <div className="text-sm text-gray-200 mb-2">Higher Max Multiplier</div>
                <div className="text-xs text-yellow-300">
                  2× → 5× → 10× → 100×
                </div>
                <div className="text-xs text-gray-300 mt-1">
                  {5 + (bonusScatters - 3) * 2} Free Spins
                </div>
              </button>

              {/* Ultra Boost */}
              <button
                onClick={() => startBonus('ultra')}
                className="bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl p-4 border-2 border-yellow-400/50 hover:border-yellow-400 transition-all hover:scale-105"
              >
                <div className="text-xl font-bold text-white mb-2">⚡ ULTRA</div>
                <div className="text-sm text-gray-200 mb-2">Higher Start Multiplier</div>
                <div className="text-xs text-yellow-300">
                  3× → 6× → 12× → 50×
                </div>
                <div className="text-xs text-gray-300 mt-1">
                  {5 + (bonusScatters - 3) * 2} Free Spins
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bonus Complete Modal */}
      {showBonusComplete && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/80 z-50">
          <div className="bg-gradient-to-br from-purple-900 to-violet-900 rounded-2xl p-6 max-w-sm w-full mx-4 border-2 border-yellow-500/50 text-center">
            <h2 className="text-2xl font-bold text-yellow-400 mb-4">
              🎉 BONUS COMPLETE! 🎉
            </h2>
            <div className="text-4xl font-bold text-green-400 mb-4">
              ${bonus.totalWin.toFixed(2)}
            </div>
            <div className="text-sm text-gray-300 mb-4">
              {bonus.totalSpins} Spins | Max Mult: {Math.max(...bonus.multiplierTrail.filter((_, i) => i <= bonus.multiplierTrail.indexOf(bonus.currentMultiplier)))}×
            </div>
            <button
              onClick={() => {
                setShowBonusComplete(false)
                setBonus({
                  active: false,
                  type: null,
                  spinsRemaining: 0,
                  totalSpins: 0,
                  currentMultiplier: 1,
                  multiplierTrail: [],
                  scattersCollected: 0,
                  totalWin: 0
                })
              }}
              className="px-6 py-2 bg-gradient-to-r from-green-500 to-green-600 rounded-xl font-bold hover:from-green-400 hover:to-green-500 transition-all"
            >
              CONTINUE
            </button>
          </div>
        </div>
      )}

      {/* Bottom Control Bar */}
      <div className="flex-shrink-0 bg-black/60 border-t border-purple-500/30 px-2 py-2 relative z-10">
        <div className="max-w-4xl mx-auto">
          {/* Mobile: Stacked layout */}
          <div className="flex items-center justify-between gap-2">
            {/* Bet Controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setBetAmount(Math.max(1, betAmount / 2))}
                disabled={isSpinning || bonus.active}
                className="px-2 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50 text-sm"
              >
                −
              </button>
              <div className="bg-gray-800 px-3 py-1 rounded min-w-[60px] text-center">
                <span className="text-xs text-gray-400">BET</span>
                <div className="font-bold text-yellow-400">${betAmount.toFixed(2)}</div>
              </div>
              <button
                onClick={() => setBetAmount(betAmount * 2)}
                disabled={isSpinning || bonus.active}
                className="px-2 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50 text-sm"
              >
                +
              </button>
            </div>

            {/* Spin Button */}
            <button
              onClick={spin}
              disabled={isSpinning || betAmount > balance || showBonusChoice}
              className={`px-6 py-2 rounded-xl font-bold text-lg transition-all ${
                !isSpinning && betAmount <= balance && !showBonusChoice
                  ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 shadow-lg shadow-green-500/30'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isSpinning ? '...' : bonus.active ? '🎰 FREE SPIN' : '🎰 SPIN'}
            </button>

            {/* Auto/Turbo */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setAutoPlay(!autoPlay)}
                disabled={isSpinning}
                className={`px-2 py-1 rounded text-xs font-semibold ${
                  autoPlay 
                    ? 'bg-yellow-500 text-black' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                AUTO
              </button>
              <div className="text-[10px] text-gray-500 hidden sm:block">
                HOLD SPACE FOR TURBO
              </div>
            </div>

            {/* Mobile Buy Bonus */}
            <button
              onClick={buyBonus}
              disabled={balance < betAmount * 75 || isSpinning || bonus.active}
              className={`sm:hidden px-2 py-1 rounded text-xs font-bold ${
                balance >= betAmount * 75 && !isSpinning && !bonus.active
                  ? 'bg-gradient-to-r from-green-500 to-green-600 text-white'
                  : 'bg-gray-700 text-gray-500'
              }`}
            >
              BUY ${(betAmount * 75).toFixed(0)}
            </button>
          </div>

          {/* Multiplier Trail during bonus */}
          {bonus.active && (
            <div className="flex flex-col items-center gap-2 mt-2">
              {/* Multiplier Trail */}
              <div className="flex items-center justify-center gap-2">
                <span className="text-xs text-gray-400">MULTIPLIER:</span>
                {bonus.multiplierTrail.map((mult, i) => (
                  <div
                    key={i}
                    className={`px-2 py-0.5 rounded text-xs font-bold ${
                      mult === bonus.currentMultiplier
                        ? 'bg-yellow-500 text-black animate-pulse'
                        : mult < bonus.currentMultiplier
                        ? 'bg-green-500/50 text-green-200'
                        : 'bg-gray-700 text-gray-400'
                    }`}
                  >
                    {mult}×
                  </div>
                ))}
              </div>
              
              {/* Scatter Progress - Prominent Display */}
              <div className="flex items-center gap-3 bg-gradient-to-r from-purple-900/60 to-pink-900/60 px-4 py-2 rounded-xl border border-purple-500/40">
                <div className="text-xs text-purple-300 font-medium">COLLECT 💠</div>
                <div className="flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <div 
                      key={i}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-all ${
                        bonus.scattersCollected % 3 > i 
                          ? 'bg-gradient-to-br from-purple-500 to-pink-500 border-yellow-400 shadow-lg shadow-purple-500/50' 
                          : 'bg-gray-800/80 border-gray-600'
                      }`}
                    >
                      <span className={`text-lg ${bonus.scattersCollected % 3 > i ? 'animate-pulse' : 'opacity-40'}`}>
                        {bonus.scattersCollected % 3 > i ? '💠' : '◇'}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col items-center">
                  <div className="text-yellow-400 font-bold text-sm">→ UPGRADE!</div>
                  <div className="text-[10px] text-gray-400">+5 Spins & Higher ×</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
