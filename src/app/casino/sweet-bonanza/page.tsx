'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useCasino } from '../CasinoContext'
import { useRouter } from 'next/navigation'

// Symbol types matching real game
type SymbolType = 'banana' | 'grapes' | 'watermelon' | 'plum' | 'apple' | 'blueCandy' | 'greenCandy' | 'pinkCandy' | 'scatter' | 'bomb'

interface SymbolConfig {
  emoji: string
  color: string
  gradient: string
  payouts: { [key: number]: number }
}

// Symbol configurations matching real game visuals
const SYMBOLS: Record<SymbolType, SymbolConfig> = {
  banana: {
    emoji: '🍌',
    color: '#FFE135',
    gradient: 'from-yellow-400 to-yellow-600',
    payouts: { 8: 0.5, 10: 2, 12: 8 }
  },
  grapes: {
    emoji: '🍇',
    color: '#6B21A8',
    gradient: 'from-purple-500 to-purple-700',
    payouts: { 8: 0.8, 10: 3, 12: 12 }
  },
  watermelon: {
    emoji: '🍉',
    color: '#22C55E',
    gradient: 'from-green-500 to-red-500',
    payouts: { 8: 1, 10: 5, 12: 25 }
  },
  plum: {
    emoji: '🍑',
    color: '#F472B6',
    gradient: 'from-pink-400 to-pink-600',
    payouts: { 8: 0.4, 10: 1.5, 12: 6 }
  },
  apple: {
    emoji: '🍎',
    color: '#EF4444',
    gradient: 'from-red-500 to-red-700',
    payouts: { 8: 0.75, 10: 2.5, 12: 10 }
  },
  blueCandy: {
    emoji: '💎',
    color: '#3B82F6',
    gradient: 'from-blue-400 to-blue-600',
    payouts: { 8: 0.25, 10: 1, 12: 4 }
  },
  greenCandy: {
    emoji: '🍀',
    color: '#22C55E',
    gradient: 'from-green-400 to-green-600',
    payouts: { 8: 0.25, 10: 1, 12: 4 }
  },
  pinkCandy: {
    emoji: '🍬',
    color: '#EC4899',
    gradient: 'from-pink-400 to-pink-500',
    payouts: { 8: 0.25, 10: 1, 12: 4 }
  },
  scatter: {
    emoji: '🍭',
    color: '#FBBF24',
    gradient: 'from-amber-400 to-pink-500',
    payouts: { 4: 3, 5: 5, 6: 100 }
  },
  bomb: {
    emoji: '💣',
    color: '#1F2937',
    gradient: 'from-gray-600 to-gray-800',
    payouts: {}
  }
}

// Regular symbols for spinning (no scatter/bomb)
const REGULAR_SYMBOLS: SymbolType[] = ['banana', 'grapes', 'watermelon', 'plum', 'apple', 'blueCandy', 'greenCandy', 'pinkCandy']

// Multiplier values for bombs
const BOMB_MULTIPLIERS = [2, 2, 2, 3, 3, 3, 5, 5, 5, 10, 10, 15, 15, 25, 50, 100]

interface GridCell {
  symbol: SymbolType
  isWinning: boolean
  isTumbling: boolean
  isNew: boolean
  isRevealed: boolean
  multiplier?: number
}

// Column reveal delays (left to right)
const COLUMN_DELAYS = [0, 150, 300, 450, 600, 750]

export default function SweetBonanza() {
  const { balance, setBalance, recordBet, checkAndReload } = useCasino()
  const router = useRouter()
  
  const [grid, setGrid] = useState<GridCell[][]>([])
  const [betAmount, setBetAmount] = useState(1)
  const [isSpinning, setIsSpinning] = useState(false)
  const [lastWin, setLastWin] = useState(0)
  const [totalWin, setTotalWin] = useState(0)
  const [message, setMessage] = useState('')
  const [showPaytable, setShowPaytable] = useState(false)
  const [freeSpins, setFreeSpins] = useState(0)
  const [freeSpinMultiplier, setFreeSpinMultiplier] = useState(1)
  const [tumbleCount, setTumbleCount] = useState(0)
  const [showBigWin, setShowBigWin] = useState(false)
  const [bigWinAmount, setBigWinAmount] = useState(0)
  const [autoPlay, setAutoPlay] = useState(false)
  const [columnsRevealed, setColumnsRevealed] = useState<boolean[]>([true, true, true, true, true, true])
  const [bonusTotalWin, setBonusTotalWin] = useState(0)
  const [bonusCost, setBonusCost] = useState(0)
  const [showBonusComplete, setShowBonusComplete] = useState(false)
  
  const spinTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const autoPlayRef = useRef<boolean>(false)
  const columnTimeoutsRef = useRef<NodeJS.Timeout[]>([])
  const bonusTotalRef = useRef(0)

  // Generate random symbol
  const generateRandomSymbol = useCallback((includeSpecial = false): SymbolType => {
    const rand = Math.random()
    if (includeSpecial) {
      if (rand < 0.02) return 'scatter' // 2% scatter
      if (rand < 0.05) return 'bomb' // 3% bomb
    }
    return REGULAR_SYMBOLS[Math.floor(Math.random() * REGULAR_SYMBOLS.length)]
  }, [])

  // Initialize grid
  useEffect(() => {
    const newGrid: GridCell[][] = []
    for (let col = 0; col < 6; col++) {
      const column: GridCell[] = []
      for (let row = 0; row < 5; row++) {
        column.push({
          symbol: generateRandomSymbol(true),
          isWinning: false,
          isTumbling: false,
          isNew: false,
          isRevealed: true
        })
      }
      newGrid.push(column)
    }
    setGrid(newGrid)
  }, [generateRandomSymbol])

  // Cleanup column timeouts
  useEffect(() => {
    return () => {
      columnTimeoutsRef.current.forEach(t => clearTimeout(t))
    }
  }, [])

  // Update autoplay ref
  useEffect(() => {
    autoPlayRef.current = autoPlay
  }, [autoPlay])

  // Cleanup
  useEffect(() => {
    return () => {
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current)
    }
  }, [])

  // Check for wins (cluster pays - 8+ matching symbols anywhere)
  const checkWins = useCallback((currentGrid: GridCell[][]) => {
    const symbolCounts: { [key in SymbolType]?: { count: number, positions: [number, number][] } } = {}
    const bombPositions: [number, number][] = []
    let scatterCount = 0
    
    // Count symbols
    for (let col = 0; col < 6; col++) {
      for (let row = 0; row < 5; row++) {
        const cell = currentGrid[col][row]
        if (cell.symbol === 'scatter') {
          scatterCount++
        } else if (cell.symbol === 'bomb') {
          bombPositions.push([col, row])
        } else {
          if (!symbolCounts[cell.symbol]) {
            symbolCounts[cell.symbol] = { count: 0, positions: [] }
          }
          symbolCounts[cell.symbol]!.count++
          symbolCounts[cell.symbol]!.positions.push([col, row])
        }
      }
    }
    
    let winAmount = 0
    const winningPositions: [number, number][] = []
    
    // Check for wins (8+ matching)
    for (const [symbolType, data] of Object.entries(symbolCounts)) {
      if (data && data.count >= 8) {
        const symbol = SYMBOLS[symbolType as SymbolType]
        let payoutTier = 8
        if (data.count >= 12) payoutTier = 12
        else if (data.count >= 10) payoutTier = 10
        
        const payout = symbol.payouts[payoutTier] || 0
        winAmount += payout * betAmount
        winningPositions.push(...data.positions)
      }
    }
    
    // Apply bomb multipliers
    let totalMultiplier = 1
    if (winAmount > 0 && bombPositions.length > 0) {
      for (const [col, row] of bombPositions) {
        const cell = currentGrid[col][row]
        if (cell.multiplier) {
          totalMultiplier *= cell.multiplier
          winningPositions.push([col, row])
        }
      }
    }
    
    // Apply free spin multiplier
    if (freeSpins > 0) {
      totalMultiplier *= freeSpinMultiplier
    }
    
    winAmount *= totalMultiplier
    
    return { winAmount, winningPositions, scatterCount }
  }, [betAmount, freeSpins, freeSpinMultiplier])

  // Tumble - remove winning symbols and drop new ones
  const tumble = useCallback((currentGrid: GridCell[][], winPositions: [number, number][]) => {
    const newGrid = currentGrid.map(col => col.map(cell => ({ ...cell, isWinning: false, isNew: false })))
    
    // Mark winning cells
    for (const [col, row] of winPositions) {
      newGrid[col][row].isTumbling = true
    }
    
    return new Promise<GridCell[][]>((resolve) => {
      setGrid(newGrid)
      
      setTimeout(() => {
        // Remove winning cells and drop new ones
        for (let col = 0; col < 6; col++) {
          const remaining = newGrid[col].filter(cell => !cell.isTumbling)
          const newCells: GridCell[] = []
          const needed = 5 - remaining.length
          
          for (let i = 0; i < needed; i++) {
            const symbol = generateRandomSymbol(freeSpins > 0)
            newCells.push({
              symbol,
              isWinning: false,
              isTumbling: false,
              isNew: true,
              isRevealed: true,
              multiplier: symbol === 'bomb' ? BOMB_MULTIPLIERS[Math.floor(Math.random() * BOMB_MULTIPLIERS.length)] : undefined
            })
          }
          
          newGrid[col] = [...newCells, ...remaining].map(cell => ({ ...cell, isTumbling: false }))
        }
        
        setGrid(newGrid)
        resolve(newGrid)
      }, 300)
    })
  }, [generateRandomSymbol, freeSpins])

  // Process tumble cascade
  const processTumble = useCallback(async (currentGrid: GridCell[][], currentTotalWin: number, tumbles: number) => {
    const { winAmount, winningPositions, scatterCount } = checkWins(currentGrid)
    
    if (winAmount > 0) {
      setTumbleCount(tumbles + 1)
      setLastWin(winAmount)
      const newTotal = currentTotalWin + winAmount
      setTotalWin(newTotal)
      setBalance(balance + winAmount)
      
      // Mark winning positions
      const markedGrid = currentGrid.map((col, colIdx) =>
        col.map((cell, rowIdx) => ({
          ...cell,
          isWinning: winningPositions.some(([c, r]) => c === colIdx && r === rowIdx)
        }))
      )
      setGrid(markedGrid)
      
      // Wait then tumble
      await new Promise(resolve => setTimeout(resolve, 500))
      const newGrid = await tumble(markedGrid, winningPositions)
      
      // Continue tumbling
      await processTumble(newGrid, newTotal, tumbles + 1)
    } else {
      // No more wins - check scatters for free spins
      if (scatterCount >= 4 && freeSpins === 0) {
        const spinsToAward = scatterCount === 4 ? 10 : scatterCount === 5 ? 12 : 15
        setFreeSpins(spinsToAward)
        setFreeSpinMultiplier(1)
        setMessage(`🎉 ${spinsToAward} FREE SPINS! 🎉`)
      }
      
      // Show big win if applicable
      if (currentTotalWin >= betAmount * 15) {
        setBigWinAmount(currentTotalWin)
        setShowBigWin(true)
        setTimeout(() => setShowBigWin(false), 3000)
      }
      
      // Finish spin
      setIsSpinning(false)
      setTumbleCount(0)
      
      // Handle free spins
      if (freeSpins > 0) {
        const newFreeSpins = freeSpins - 1
        // Track bonus total
        bonusTotalRef.current += currentTotalWin
        setBonusTotalWin(bonusTotalRef.current)
        
        if (newFreeSpins <= 0) {
          // Bonus complete - show summary
          setFreeSpins(0)
          setShowBonusComplete(true)
          setTimeout(() => {
            setShowBonusComplete(false)
            bonusTotalRef.current = 0
            setBonusTotalWin(0)
            setBonusCost(0)
          }, 4000)
        } else {
          setFreeSpins(newFreeSpins)
          if (autoPlayRef.current) {
            spinTimeoutRef.current = setTimeout(() => spin(), 1000)
          }
        }
      } else {
        // Auto play
        if (autoPlayRef.current && balance >= betAmount) {
          spinTimeoutRef.current = setTimeout(() => spin(), 1000)
        }
      }
    }
  }, [checkWins, tumble, balance, betAmount, freeSpins, setBalance])

  // Main spin function
  const spin = useCallback(() => {
    if (isSpinning) return
    if (freeSpins === 0 && betAmount > balance) return
    
    setIsSpinning(true)
    setLastWin(0)
    setTotalWin(0)
    setMessage('')
    
    // Deduct bet (unless free spin)
    if (freeSpins === 0) {
      setBalance(balance - betAmount)
      recordBet(betAmount)
    }
    
    // Clear any existing column timeouts
    columnTimeoutsRef.current.forEach(t => clearTimeout(t))
    columnTimeoutsRef.current = []
    
    // Reset all columns to hidden
    setColumnsRevealed([false, false, false, false, false, false])
    
    // Generate new grid
    const newGrid: GridCell[][] = []
    for (let col = 0; col < 6; col++) {
      const column: GridCell[] = []
      for (let row = 0; row < 5; row++) {
        const symbol = generateRandomSymbol(freeSpins > 0)
        column.push({
          symbol,
          isWinning: false,
          isTumbling: false,
          isNew: true,
          isRevealed: false,
          multiplier: symbol === 'bomb' ? BOMB_MULTIPLIERS[Math.floor(Math.random() * BOMB_MULTIPLIERS.length)] : undefined
        })
      }
      newGrid.push(column)
    }
    
    setGrid(newGrid)
    
    // Reveal columns one at a time (left to right)
    COLUMN_DELAYS.forEach((delay, colIdx) => {
      const timeout = setTimeout(() => {
        setColumnsRevealed(prev => {
          const next = [...prev]
          next[colIdx] = true
          return next
        })
        setGrid(prev => {
          const updated = [...prev]
          updated[colIdx] = updated[colIdx].map(cell => ({ ...cell, isRevealed: true }))
          return updated
        })
      }, delay)
      columnTimeoutsRef.current.push(timeout)
    })
    
    // Start checking wins after all columns revealed
    setTimeout(() => {
      processTumble(newGrid, 0, 0)
    }, COLUMN_DELAYS[5] + 400)
  }, [isSpinning, balance, betAmount, freeSpins, generateRandomSymbol, recordBet, setBalance, processTumble])

  // Buy feature
  const buyFeature = useCallback(() => {
    const cost = betAmount * 100
    if (balance >= cost) {
      setBalance(balance - cost)
      recordBet(cost)
      setBonusCost(cost)
      bonusTotalRef.current = 0
      setBonusTotalWin(0)
      setFreeSpins(10)
      setFreeSpinMultiplier(1)
      setMessage('🎰 BONUS BOUGHT! 10 FREE SPINS! 🎰')
      spin()
    }
  }, [balance, betAmount, setBalance, recordBet, spin])

  // Render symbol
  const renderSymbol = (cell: GridCell, colIdx: number) => {
    const config = SYMBOLS[cell.symbol]
    const isColumnRevealed = columnsRevealed[colIdx]
    
    return (
      <div 
        className={`
          w-full h-full rounded-xl flex items-center justify-center text-2xl sm:text-3xl md:text-4xl lg:text-5xl
          bg-gradient-to-br ${config.gradient}
          ${cell.isWinning ? 'animate-pulse ring-2 sm:ring-4 ring-yellow-400 ring-offset-1 sm:ring-offset-2' : ''}
          ${cell.isTumbling ? 'animate-bounce opacity-50' : ''}
          ${isColumnRevealed && cell.isNew ? 'animate-drop-in' : ''}
          ${!isColumnRevealed ? 'opacity-0 -translate-y-full' : ''}
          shadow-lg relative overflow-hidden transition-all duration-300
        `}
      >
        <span className="drop-shadow-lg relative z-10">{config.emoji}</span>
        {cell.symbol === 'bomb' && cell.multiplier && (
          <span className="absolute bottom-0.5 right-1 text-xs sm:text-sm font-bold text-yellow-400 bg-black/70 rounded px-1">
            x{cell.multiplier}
          </span>
        )}
        <div className="absolute inset-0 bg-white/20 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-pink-300 via-blue-200 to-purple-300 relative overflow-hidden">
      {/* Snowflakes/Sparkles Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(30)].map((_, i) => (
          <div
            key={i}
            className="absolute animate-float text-white text-opacity-60"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${3 + Math.random() * 4}s`,
              fontSize: `${8 + Math.random() * 12}px`
            }}
          >
            ✨
          </div>
        ))}
      </div>

      {/* Top Bar */}
      <div className="flex-shrink-0 bg-gradient-to-r from-pink-500 via-purple-500 to-pink-500 px-2 py-2 sm:py-3 relative z-10">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <button
            onClick={() => router.push('/casino')}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors text-sm sm:text-base"
          >
            ← Back
          </button>
          
          <h1 className="text-base sm:text-xl font-bold text-white drop-shadow-lg flex items-center gap-1 sm:gap-2">
            🍬 Sweet Bonanza 🍭
          </h1>
          
          <button
            onClick={() => setShowPaytable(true)}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors text-xs sm:text-sm"
          >
            Paytable
          </button>
        </div>
      </div>

      {/* Free Spins Banner */}
      {freeSpins > 0 && (
        <div className="flex-shrink-0 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 px-4 py-2 text-center relative z-10">
          <span className="text-lg sm:text-xl font-bold text-white drop-shadow animate-pulse">
            🎰 FREE SPINS: {freeSpins} | MULTIPLIER: x{freeSpinMultiplier} 🎰
          </span>
        </div>
      )}

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-1 sm:p-2 md:p-4 relative z-10 min-h-0">
        {/* Slot Frame - Candy Cane Border */}
        <div className="relative rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-[95vw] sm:max-w-[85vw] md:max-w-2xl lg:max-w-3xl" 
             style={{ 
               background: 'repeating-linear-gradient(45deg, #ff69b4, #ff69b4 10px, white 10px, white 20px)',
               padding: 'clamp(6px, 1.5vw, 12px)'
             }}>
          <div className="bg-gradient-to-b from-purple-900 via-indigo-900 to-purple-900 rounded-xl sm:rounded-2xl p-2 sm:p-3 md:p-4">
            {/* Win Display */}
            <div className="text-center mb-1 sm:mb-2 min-h-[2rem] sm:min-h-[2.5rem]">
              {lastWin > 0 && (
                <div className="text-lg sm:text-2xl md:text-3xl font-bold text-yellow-400 animate-pulse">
                  WIN: ${lastWin.toFixed(2)}
                </div>
              )}
              {tumbleCount > 0 && (
                <div className="text-xs sm:text-sm text-cyan-400">
                  Tumble #{tumbleCount}
                </div>
              )}
              {message && (
                <div className="text-sm sm:text-lg md:text-xl text-pink-400 font-bold animate-bounce">
                  {message}
                </div>
              )}
            </div>

            {/* Grid - Responsive sizing */}
            <div className="grid grid-cols-6 gap-1 sm:gap-2 md:gap-2.5 p-1 sm:p-2 md:p-3 bg-purple-950 rounded-lg sm:rounded-xl overflow-hidden">
              {grid.map((column, colIdx) => (
                <div key={colIdx} className="flex flex-col gap-1 sm:gap-2 md:gap-2.5">
                  {column.map((cell, rowIdx) => (
                    <div 
                      key={`${colIdx}-${rowIdx}`} 
                      className="aspect-square"
                      style={{ minWidth: '40px' }}
                    >
                      {renderSymbol(cell, colIdx)}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Total Win Display */}
            {totalWin > 0 && (
              <div className="text-center mt-2 py-2 bg-gradient-to-r from-transparent via-yellow-600/50 to-transparent rounded">
                <div className="text-lg sm:text-2xl md:text-3xl font-bold text-yellow-300">
                  TOTAL WIN: ${totalWin.toFixed(2)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Control Bar */}
      <div className="flex-shrink-0 bg-gradient-to-t from-purple-900 via-purple-800 to-purple-700 border-t-4 border-pink-500 px-2 sm:px-4 py-2 sm:py-3 relative z-10">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          {/* Buy Feature Button */}
          <button
            onClick={buyFeature}
            disabled={isSpinning || balance < betAmount * 100 || freeSpins > 0}
            className="px-2 sm:px-4 py-2 sm:py-3 rounded-lg bg-gradient-to-br from-amber-500 to-red-600 border-2 border-amber-400 text-[10px] sm:text-xs font-bold text-white disabled:opacity-50 hover:scale-105 transition-transform flex-shrink-0 shadow-lg"
          >
            BUY BONUS<br/>
            <span className="text-amber-200">${(betAmount * 100).toFixed(0)}</span>
          </button>

          {/* Balance */}
          <div className="text-center min-w-0 flex-1">
            <div className="text-[8px] sm:text-xs text-pink-300 uppercase">Balance</div>
            <div className="text-sm sm:text-lg font-bold text-white truncate">${balance.toLocaleString()}</div>
          </div>

          {/* Bet Amount */}
          <div className="flex items-center gap-1 sm:gap-2 bg-purple-900/80 rounded-lg px-2 sm:px-3 py-1 flex-shrink-0">
            <button
              onClick={() => setBetAmount(Math.max(1, betAmount - 5))}
              disabled={isSpinning || freeSpins > 0}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-pink-600 flex items-center justify-center text-white hover:bg-pink-500 disabled:opacity-50 text-lg sm:text-xl font-bold"
            >
              −
            </button>
            <div className="text-center min-w-14 sm:min-w-20">
              <div className="text-[8px] sm:text-xs text-pink-300 uppercase">Bet</div>
              <div className="text-sm sm:text-lg font-bold text-white">${betAmount.toFixed(2)}</div>
            </div>
            <button
              onClick={() => setBetAmount(Math.min(balance, betAmount + 5))}
              disabled={isSpinning || freeSpins > 0}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-pink-600 flex items-center justify-center text-white hover:bg-pink-500 disabled:opacity-50 text-lg sm:text-xl font-bold"
            >
              +
            </button>
          </div>

          {/* Spin Button */}
          <button
            onClick={spin}
            disabled={isSpinning || (betAmount > balance && freeSpins === 0)}
            className={`
              w-14 h-14 sm:w-16 sm:h-16 rounded-full border-4 flex items-center justify-center flex-shrink-0
              transition-all transform hover:scale-105 disabled:opacity-50 disabled:transform-none shadow-xl
              ${freeSpins > 0
                ? 'bg-gradient-to-br from-yellow-400 to-amber-600 border-yellow-300 animate-pulse'
                : 'bg-gradient-to-br from-green-500 to-emerald-700 border-green-400 hover:border-green-300'}
            `}
          >
            {isSpinning ? (
              <div className="w-6 h-6 sm:w-7 sm:h-7 border-3 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="text-2xl sm:text-3xl">▶</span>
            )}
          </button>

          {/* Auto Play Toggle */}
          <button
            onClick={() => setAutoPlay(!autoPlay)}
            disabled={isSpinning}
            className={`
              w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 flex items-center justify-center text-[10px] sm:text-xs font-bold 
              transition-all flex-shrink-0
              ${autoPlay 
                ? 'bg-gradient-to-br from-cyan-500 to-blue-600 border-cyan-400 text-white' 
                : 'bg-purple-800 border-purple-600 text-purple-300 hover:border-purple-400'}
            `}
          >
            AUTO<br/>{autoPlay ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Big Win Popup */}
      {showBigWin && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="text-center animate-bounce">
            <div className="text-4xl sm:text-6xl font-bold text-yellow-400 mb-4 animate-pulse">
              🎉 BIG WIN! 🎉
            </div>
            <div className="text-5xl sm:text-7xl font-black bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-500 bg-clip-text text-transparent">
              ${bigWinAmount.toFixed(2)}
            </div>
            <div className="text-xl sm:text-2xl text-white mt-4">
              {bigWinAmount >= betAmount * 50 ? '🍬 SWEET! 🍬' : '✨ TASTY WIN! ✨'}
            </div>
          </div>
        </div>
      )}

      {/* Bonus Complete Popup */}
      {showBonusComplete && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
          <div className="text-center p-6 sm:p-8">
            <div className="text-3xl sm:text-5xl font-bold text-pink-400 mb-4 animate-pulse">
              🍭 BONUS COMPLETE! 🍭
            </div>
            <div className="text-4xl sm:text-6xl font-black text-white mb-4">
              ${bonusTotalWin.toFixed(2)}
            </div>
            {bonusCost > 0 && (
              <div className={`text-xl sm:text-2xl font-bold ${bonusTotalWin >= bonusCost ? 'text-green-400' : 'text-red-400'}`}>
                {bonusTotalWin >= bonusCost ? (
                  <>📈 {(((bonusTotalWin - bonusCost) / bonusCost) * 100).toFixed(0)}% ROI</>
                ) : (
                  <>📉 {(((bonusCost - bonusTotalWin) / bonusCost) * 100).toFixed(0)}% Loss</>
                )}
              </div>
            )}
            <div className="text-sm sm:text-base text-gray-400 mt-2">
              {bonusCost > 0 ? `Bonus Cost: $${bonusCost.toFixed(0)}` : 'Free Spins Triggered'}
            </div>
          </div>
        </div>
      )}

      {/* Paytable Modal */}
      {showPaytable && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-purple-900 to-pink-900 rounded-2xl p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto border-4 border-pink-400">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl sm:text-2xl font-bold text-pink-300">🍭 Paytable</h2>
              <button
                onClick={() => setShowPaytable(false)}
                className="text-white text-2xl hover:text-pink-400"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4 text-white text-sm sm:text-base">
              {/* Rules */}
              <div className="bg-purple-800/50 p-3 rounded-lg">
                <h3 className="font-bold text-pink-300 mb-2">How to Win</h3>
                <ul className="list-disc list-inside space-y-1 text-purple-200">
                  <li>Match 8+ symbols anywhere for wins</li>
                  <li>Wins cause a tumble - new symbols drop</li>
                  <li>💣 Bombs multiply wins during tumbles</li>
                  <li>4+ 🍭 Scatters trigger Free Spins</li>
                </ul>
              </div>

              {/* Symbols */}
              <div className="bg-purple-800/50 p-3 rounded-lg">
                <h3 className="font-bold text-pink-300 mb-2">Symbol Payouts (per bet)</h3>
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(SYMBOLS).filter(([key]) => key !== 'bomb' && key !== 'scatter').map(([key, config]) => (
                    <div key={key} className="flex items-center justify-between bg-purple-700/50 p-2 rounded">
                      <span className="text-xl">{config.emoji}</span>
                      <span className="text-purple-200">
                        8+: x{config.payouts[8]} | 10+: x{config.payouts[10]} | 12+: x{config.payouts[12]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Scatter */}
              <div className="bg-amber-800/50 p-3 rounded-lg">
                <h3 className="font-bold text-amber-300 mb-2">🍭 Scatter</h3>
                <p>4 = 10 Free Spins | 5 = 12 Free Spins | 6 = 15 Free Spins</p>
              </div>

              {/* Bombs */}
              <div className="bg-gray-800/50 p-3 rounded-lg">
                <h3 className="font-bold text-gray-300 mb-2">💣 Multiplier Bombs</h3>
                <p>Appear during free spins. Multiply all wins by 2x to 100x!</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes drop-in {
          0% {
            transform: translateY(-150%);
            opacity: 0;
          }
          60% {
            transform: translateY(10%);
            opacity: 1;
          }
          80% {
            transform: translateY(-5%);
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }
        
        @keyframes float {
          0%, 100% {
            transform: translateY(0) rotate(0deg);
            opacity: 0.4;
          }
          50% {
            transform: translateY(-20px) rotate(180deg);
            opacity: 0.8;
          }
        }
        
        .animate-drop-in {
          animation: drop-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
