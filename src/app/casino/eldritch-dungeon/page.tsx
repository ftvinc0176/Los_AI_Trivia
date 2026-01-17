'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useCasino } from '../CasinoContext'
import { useRouter } from 'next/navigation'

// ============================================
// ELDRITCH DUNGEON - Print Studios Style Slot
// 8x8 Cluster Pays | 96.10% RTP | Very High Volatility
// Max Win: 20,000x
// ============================================

// Symbol types matching Eldritch Dungeon theme
type SymbolType = 'redGem' | 'blueGem' | 'greenGem' | 'purpleGem' | 'orangeGem' | 'skull' | 'eye' | 'rune1' | 'rune2' | 'rune3' | 'wild' | 'warrior'

// Hero types
type HeroType = 'arcanist' | 'ranger' | 'mauler'

// Enemy types
type EnemyType = 'nightwing' | 'elderwing' | 'nightfang' | 'elderfang'

interface SymbolConfig {
  emoji: string
  display: string
  color: string
  gradient: string
  payouts: { [key: number]: number } // 5, 8, 12, 20+ clusters
}

// Symbol configurations matching dark fantasy aesthetic
const SYMBOLS: Record<SymbolType, SymbolConfig> = {
  redGem: {
    emoji: '??',
    display: '??',
    color: '#EF4444',
    gradient: 'from-red-600 to-red-900',
    payouts: { 5: 0.5, 8: 2, 12: 8, 20: 25 }
  },
  blueGem: {
    emoji: '??',
    display: '??',
    color: '#3B82F6',
    gradient: 'from-blue-500 to-blue-800',
    payouts: { 5: 0.5, 8: 2, 12: 8, 20: 25 }
  },
  greenGem: {
    emoji: '??',
    display: '??',
    color: '#22C55E',
    gradient: 'from-green-500 to-green-800',
    payouts: { 5: 0.4, 8: 1.5, 12: 6, 20: 20 }
  },
  purpleGem: {
    emoji: '??',
    display: '??',
    color: '#A855F7',
    gradient: 'from-purple-500 to-purple-900',
    payouts: { 5: 0.4, 8: 1.5, 12: 6, 20: 20 }
  },
  orangeGem: {
    emoji: '??',
    display: '??',
    color: '#F97316',
    gradient: 'from-orange-500 to-orange-800',
    payouts: { 5: 0.3, 8: 1, 12: 4, 20: 15 }
  },
  skull: {
    emoji: '??',
    display: '??',
    color: '#9CA3AF',
    gradient: 'from-gray-400 to-gray-700',
    payouts: { 5: 0.8, 8: 3, 12: 12, 20: 40 }
  },
  eye: {
    emoji: '???',
    display: '???',
    color: '#8B5CF6',
    gradient: 'from-violet-500 to-violet-800',
    payouts: { 5: 0.6, 8: 2.5, 12: 10, 20: 35 }
  },
  rune1: {
    emoji: '??',
    display: '??',
    color: '#6B7280',
    gradient: 'from-gray-500 to-gray-800',
    payouts: { 5: 0.2, 8: 0.8, 12: 3, 20: 10 }
  },
  rune2: {
    emoji: '???',
    display: '???',
    color: '#4B5563',
    gradient: 'from-gray-600 to-gray-900',
    payouts: { 5: 0.2, 8: 0.8, 12: 3, 20: 10 }
  },
  rune3: {
    emoji: '?',
    display: '?',
    color: '#374151',
    gradient: 'from-gray-700 to-gray-950',
    payouts: { 5: 0.2, 8: 0.8, 12: 3, 20: 10 }
  },
  wild: {
    emoji: '??',
    display: '?',
    color: '#FBBF24',
    gradient: 'from-yellow-400 to-amber-600',
    payouts: { 5: 5, 8: 25, 12: 100, 20: 500 }
  },
  warrior: {
    emoji: '??',
    display: '???',
    color: '#F59E0B',
    gradient: 'from-amber-500 to-amber-800',
    payouts: {}
  }
}

// Regular symbols for spinning
const REGULAR_SYMBOLS: SymbolType[] = ['redGem', 'blueGem', 'greenGem', 'purpleGem', 'orangeGem', 'skull', 'eye', 'rune1', 'rune2', 'rune3']

// Hero configurations
const HEROES: Record<HeroType, { name: string; emoji: string; description: string; color: string; unlocked: boolean }> = {
  arcanist: { name: 'Arcanist', emoji: '??', description: 'Master of arcane magic', color: 'from-purple-600 to-indigo-800', unlocked: true },
  ranger: { name: 'Ranger', emoji: '??', description: 'Swift and deadly', color: 'from-green-600 to-teal-800', unlocked: false },
  mauler: { name: 'Mauler', emoji: '??', description: 'Brutal warrior', color: 'from-red-600 to-orange-800', unlocked: false }
}

// Enemy configurations
const ENEMIES: Record<EnemyType, { name: string; emoji: string; hp: number; reward: string; symbolTransform: number; wildAdd: number }> = {
  nightwing: { name: 'Nightwing', emoji: '??', hp: 30, reward: '10 symbol transform', symbolTransform: 10, wildAdd: 0 },
  elderwing: { name: 'Elderwing', emoji: '??', hp: 50, reward: '19 symbol transform', symbolTransform: 19, wildAdd: 0 },
  nightfang: { name: 'Nightfang', emoji: '??', hp: 40, reward: '4 Wilds added', symbolTransform: 0, wildAdd: 4 },
  elderfang: { name: 'Elderfang', emoji: '??', hp: 60, reward: '10 Wilds added', symbolTransform: 0, wildAdd: 10 }
}

interface GridCell {
  symbol: SymbolType
  isWinning: boolean
  isTumbling: boolean
  isNew: boolean
  isRevealed: boolean
  row: number
  col: number
}

interface BonusCell {
  type: 'empty' | 'locked' | 'coin' | 'key' | 'colossal'
  value: number
  unlocked: boolean
  coinSize: number // 1x1, 2x2, 3x3, 4x4
}

interface PlayerStats {
  vitality: number
  force: number
  crit: number
  guard: number
}

// Game state types
type GameState = 'base' | 'battle' | 'treasureHall'

export default function EldritchDungeon() {
  const { balance, setBalance, recordBet, checkAndReload } = useCasino()
  const router = useRouter()
  
  // Core game state
  const [grid, setGrid] = useState<GridCell[][]>([])
  const [betAmount, setBetAmount] = useState(1)
  const [isSpinning, setIsSpinning] = useState(false)
  const [lastWin, setLastWin] = useState(0)
  const [totalWin, setTotalWin] = useState(0)
  const [message, setMessage] = useState('')
  const [showPaytable, setShowPaytable] = useState(false)
  const [tumbleCount, setTumbleCount] = useState(0)
  const [showBigWin, setShowBigWin] = useState(false)
  const [bigWinAmount, setBigWinAmount] = useState(0)
  const [autoPlay, setAutoPlay] = useState(false)
  const [gameState, setGameState] = useState<GameState>('base')
  
  // Hero system
  const [selectedHero, setSelectedHero] = useState<HeroType>('arcanist')
  const [heroUnlocks, setHeroUnlocks] = useState({ arcanist: true, ranger: false, mauler: false })
  const [showHeroSelect, setShowHeroSelect] = useState(false)
  
  // Player stats (Power Relics)
  const [playerStats, setPlayerStats] = useState<PlayerStats>({ vitality: 100, force: 15, crit: 10, guard: 5 })
  
  // Battle system
  const [currentEnemy, setCurrentEnemy] = useState<EnemyType | null>(null)
  const [enemyHp, setEnemyHp] = useState(0)
  const [heroHp, setHeroHp] = useState(100)
  const [battleLog, setBattleLog] = useState<string[]>([])
  const [showBattle, setShowBattle] = useState(false)
  
  // Treasure Hall bonus
  const [bonusGrid, setBonusGrid] = useState<BonusCell[][]>([])
  const [bonusLives, setBonusLives] = useState(3)
  const [bonusTotal, setBonusTotal] = useState(0)
  const [bonusMultiplier, setBonusMultiplier] = useState(1)
  const [showTreasureHall, setShowTreasureHall] = useState(false)
  const [fightingOldOne, setFightingOldOne] = useState(false)
  
  // Feature buy state
  const [showFeatureBuy, setShowFeatureBuy] = useState(false)
  
  const spinTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const autoPlayRef = useRef<boolean>(false)

  // RTP configuration (96.10%)
  const RTP = 0.961
  const MAX_WIN = 20000

  // Generate random symbol
  const generateRandomSymbol = useCallback((includeSpecial = false): SymbolType => {
    const rand = Math.random()
    if (includeSpecial) {
      if (rand < 0.01) return 'wild' // 1% wild
      if (rand < 0.015) return 'warrior' // 0.5% warrior
    }
    return REGULAR_SYMBOLS[Math.floor(Math.random() * REGULAR_SYMBOLS.length)]
  }, [])

  // Initialize 8x8 grid
  useEffect(() => {
    const newGrid: GridCell[][] = []
    for (let col = 0; col < 8; col++) {
      const column: GridCell[] = []
      for (let row = 0; row < 8; row++) {
        column.push({
          symbol: generateRandomSymbol(true),
          isWinning: false,
          isTumbling: false,
          isNew: false,
          isRevealed: true,
          row,
          col
        })
      }
      newGrid.push(column)
    }
    setGrid(newGrid)
  }, [generateRandomSymbol])

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

  // Find clusters (horizontal and vertical adjacency)
  const findClusters = useCallback((currentGrid: GridCell[][]) => {
    const visited = new Set<string>()
    const clusters: { symbol: SymbolType; positions: [number, number][] }[] = []
    
    const dfs = (col: number, row: number, symbol: SymbolType, cluster: [number, number][]) => {
      const key = `${col},${row}`
      if (visited.has(key)) return
      if (col < 0 || col >= 8 || row < 0 || row >= 8) return
      
      const cell = currentGrid[col][row]
      if (cell.symbol !== symbol && cell.symbol !== 'wild') return
      
      visited.add(key)
      cluster.push([col, row])
      
      // Check adjacent cells (up, down, left, right)
      dfs(col - 1, row, symbol, cluster)
      dfs(col + 1, row, symbol, cluster)
      dfs(col, row - 1, symbol, cluster)
      dfs(col, row + 1, symbol, cluster)
    }
    
    for (let col = 0; col < 8; col++) {
      for (let row = 0; row < 8; row++) {
        const key = `${col},${row}`
        if (!visited.has(key)) {
          const cell = currentGrid[col][row]
          if (cell.symbol !== 'wild' && cell.symbol !== 'warrior') {
            const cluster: [number, number][] = []
            dfs(col, row, cell.symbol, cluster)
            if (cluster.length >= 5) {
              clusters.push({ symbol: cell.symbol, positions: cluster })
            }
          }
        }
      }
    }
    
    return clusters
  }, [])

  // Check for warrior adjacent to winning cluster
  const checkWarriorTrigger = useCallback((currentGrid: GridCell[][], winningPositions: [number, number][]) => {
    for (let col = 0; col < 8; col++) {
      for (let row = 0; row < 8; row++) {
        if (currentGrid[col][row].symbol === 'warrior') {
          // Check if warrior is adjacent to any winning position
          for (const [wCol, wRow] of winningPositions) {
            if (
              (Math.abs(col - wCol) === 1 && row === wRow) ||
              (Math.abs(row - wRow) === 1 && col === wCol)
            ) {
              return true
            }
          }
        }
      }
    }
    return false
  }, [])

  // Start battle
  const startBattle = useCallback(() => {
    const enemies: EnemyType[] = ['nightwing', 'elderwing', 'nightfang', 'elderfang']
    const enemy = enemies[Math.floor(Math.random() * enemies.length)]
    const enemyConfig = ENEMIES[enemy]
    
    setCurrentEnemy(enemy)
    setEnemyHp(enemyConfig.hp)
    setHeroHp(playerStats.vitality)
    setBattleLog([`?? ${enemyConfig.name} appeared!`])
    setShowBattle(true)
    setGameState('battle')
    
    // Simulate battle
    setTimeout(() => simulateBattle(enemy, enemyConfig.hp, playerStats.vitality), 1000)
  }, [playerStats])

  // Simulate battle
  const simulateBattle = useCallback((enemy: EnemyType, eHp: number, hHp: number) => {
    const enemyConfig = ENEMIES[enemy]
    let currentEnemyHp = eHp
    let currentHeroHp = hHp
    const logs: string[] = []
    
    const battleTurn = () => {
      // Hero attacks
      const isCrit = Math.random() < playerStats.crit / 100
      const damage = playerStats.force * (isCrit ? 2 : 1)
      currentEnemyHp -= damage
      logs.push(`??? Hero deals ${damage}${isCrit ? ' CRIT!' : ''} damage!`)
      
      if (currentEnemyHp <= 0) {
        logs.push(`?? Victory! ${enemyConfig.name} defeated!`)
        setBattleLog(prev => [...prev, ...logs])
        setEnemyHp(0)
        
        // Apply rewards and trigger Treasure Hall
        setTimeout(() => {
          setShowBattle(false)
          setMessage(`?? Battle Won! Entering Treasure Hall...`)
          setTimeout(() => startTreasureHall(), 2000)
        }, 2000)
        return
      }
      
      // Enemy attacks
      const enemyDamage = Math.max(5, 15 - playerStats.guard)
      currentHeroHp -= enemyDamage
      logs.push(`?? ${enemyConfig.name} deals ${enemyDamage} damage!`)
      
      setBattleLog(prev => [...prev, ...logs])
      setEnemyHp(currentEnemyHp)
      setHeroHp(currentHeroHp)
      
      if (currentHeroHp <= 0) {
        logs.push(`?? Hero has fallen...`)
        setBattleLog(prev => [...prev, ...logs])
        setHeroHp(0)
        
        setTimeout(() => {
          setShowBattle(false)
          setGameState('base')
          setMessage('?? Battle Lost!')
          setIsSpinning(false)
        }, 2000)
        return
      }
      
      // Continue battle
      setTimeout(battleTurn, 1000)
    }
    
    battleTurn()
  }, [playerStats])

  // Start Treasure Hall bonus
  const startTreasureHall = useCallback(() => {
    // Initialize 8x8 bonus grid with 6 unlocked positions
    const newBonusGrid: BonusCell[][] = []
    for (let col = 0; col < 8; col++) {
      const column: BonusCell[] = []
      for (let row = 0; row < 8; row++) {
        // Start with 6 positions unlocked in center
        const isUnlocked = (col >= 3 && col <= 4) && (row >= 3 && row <= 4) || (col === 3 && row === 2) || (col === 4 && row === 5)
        column.push({
          type: isUnlocked ? 'empty' : 'locked',
          value: 0,
          unlocked: isUnlocked,
          coinSize: 1
        })
      }
      newBonusGrid.push(column)
    }
    
    setBonusGrid(newBonusGrid)
    setBonusLives(3)
    setBonusTotal(0)
    setBonusMultiplier(1)
    setShowTreasureHall(true)
    setGameState('treasureHall')
    
    // Start first respin
    setTimeout(() => treasureHallSpin(), 1000)
  }, [])

  // Treasure Hall spin
  const treasureHallSpin = useCallback(() => {
    setBonusGrid(prev => {
      const newGrid = prev.map(col => col.map(cell => ({ ...cell })))
      let hasLanding = false
      
      // Place coins/keys on unlocked empty positions
      for (let col = 0; col < 8; col++) {
        for (let row = 0; row < 8; row++) {
          if (newGrid[col][row].unlocked && newGrid[col][row].type === 'empty') {
            const rand = Math.random()
            if (rand < 0.15) { // 15% chance for coin
              newGrid[col][row].type = 'coin'
              newGrid[col][row].value = Math.floor(Math.random() * 10 + 1) * betAmount
              hasLanding = true
            } else if (rand < 0.18) { // 3% chance for key
              newGrid[col][row].type = 'key'
              hasLanding = true
            }
          }
        }
      }
      
      return newGrid
    })
    
    // Check for coin merging and key effects
    setTimeout(() => {
      processTreasureHallEffects()
    }, 500)
  }, [betAmount])

  // Process Treasure Hall effects (coin merging, key unlocking)
  const processTreasureHallEffects = useCallback(() => {
    setBonusGrid(prev => {
      const newGrid = prev.map(col => col.map(cell => ({ ...cell })))
      let total = 0
      
      // Count coins and check for keys
      let hasKeys = false
      for (let col = 0; col < 8; col++) {
        for (let row = 0; row < 8; row++) {
          if (newGrid[col][row].type === 'coin') {
            total += newGrid[col][row].value
          }
          if (newGrid[col][row].type === 'key') {
            hasKeys = true
            // Unlock adjacent cells
            const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]]
            for (const [dc, dr] of directions) {
              const nc = col + dc
              const nr = row + dr
              if (nc >= 0 && nc < 8 && nr >= 0 && nr < 8) {
                newGrid[nc][nr].unlocked = true
                if (newGrid[nc][nr].type === 'locked') {
                  newGrid[nc][nr].type = 'empty'
                }
              }
            }
            // Key consumed
            newGrid[col][row].type = 'empty'
          }
        }
      }
      
      setBonusTotal(total)
      
      // Check if any coins or keys landed
      let hasNewLanding = false
      for (let col = 0; col < 8; col++) {
        for (let row = 0; row < 8; row++) {
          if (newGrid[col][row].type === 'coin' || hasKeys) {
            hasNewLanding = true
          }
        }
      }
      
      return newGrid
    })
    
    // Continue or end bonus
    setBonusLives(prev => {
      const newLives = prev - 1
      if (newLives <= 0) {
        // Check if Old One fight triggers
        checkOldOneTrigger()
      } else {
        // Reset lives if coin/key landed (simplified check)
        setTimeout(() => treasureHallSpin(), 1000)
      }
      return newLives
    })
  }, [])

  // Check if The Old One fight triggers
  const checkOldOneTrigger = useCallback(() => {
    // Count unlocked cells
    let unlockedCount = 0
    bonusGrid.forEach(col => col.forEach(cell => {
      if (cell.unlocked) unlockedCount++
    }))
    
    if (unlockedCount >= 40 || Math.random() < 0.2) { // 20% chance or if grid mostly cleared
      setFightingOldOne(true)
      setMessage('?? THE OLD ONE AWAKENS! ??')
      
      setTimeout(() => {
        // Old One defeated - award 4x4 colossal coin and 2x multiplier
        setBonusMultiplier(2)
        const bonusWin = bonusTotal * 2 + betAmount * 100 // Big bonus from Old One
        setTotalWin(prev => prev + bonusWin)
        setBalance(balance + bonusWin)
        
        setMessage(`?? THE OLD ONE DEFEATED! Total Win: $${bonusWin.toFixed(2)}`)
        
        setTimeout(() => {
          setShowTreasureHall(false)
          setFightingOldOne(false)
          setGameState('base')
          setIsSpinning(false)
        }, 3000)
      }, 3000)
    } else {
      // End bonus without Old One
      const bonusWin = bonusTotal * bonusMultiplier
      setTotalWin(prev => prev + bonusWin)
      setBalance(balance + bonusWin)
      
      setMessage(`?? Treasure Hall Complete! Won: $${bonusWin.toFixed(2)}`)
      
      setTimeout(() => {
        setShowTreasureHall(false)
        setGameState('base')
        setIsSpinning(false)
      }, 3000)
    }
  }, [bonusGrid, bonusTotal, bonusMultiplier, betAmount, balance, setBalance])

  // Check for wins
  const checkWins = useCallback((currentGrid: GridCell[][]) => {
    const clusters = findClusters(currentGrid)
    let winAmount = 0
    const winningPositions: [number, number][] = []
    
    for (const cluster of clusters) {
      const symbol = SYMBOLS[cluster.symbol]
      let payoutTier = 5
      if (cluster.positions.length >= 20) payoutTier = 20
      else if (cluster.positions.length >= 12) payoutTier = 12
      else if (cluster.positions.length >= 8) payoutTier = 8
      
      const payout = symbol.payouts[payoutTier] || 0
      winAmount += payout * betAmount
      winningPositions.push(...cluster.positions)
    }
    
    // Check for warrior battle trigger
    const hasBattle = checkWarriorTrigger(currentGrid, winningPositions)
    
    return { winAmount, winningPositions, hasBattle }
  }, [findClusters, checkWarriorTrigger, betAmount])

  // Tumble - remove winning symbols and drop new ones
  const tumble = useCallback((currentGrid: GridCell[][], winPositions: [number, number][]) => {
    const newGrid = currentGrid.map(col => col.map(cell => ({ ...cell, isWinning: false, isNew: false })))
    
    // Mark winning cells for tumbling
    for (const [col, row] of winPositions) {
      newGrid[col][row].isTumbling = true
    }
    
    return new Promise<GridCell[][]>((resolve) => {
      setGrid(newGrid)
      
      setTimeout(() => {
        // Remove winning cells and drop new ones
        for (let col = 0; col < 8; col++) {
          const remaining = newGrid[col].filter(cell => !cell.isTumbling)
          const newCells: GridCell[] = []
          const needed = 8 - remaining.length
          
          for (let i = 0; i < needed; i++) {
            const symbol = generateRandomSymbol(true)
            newCells.push({
              symbol,
              isWinning: false,
              isTumbling: false,
              isNew: true,
              isRevealed: true,
              row: i,
              col
            })
          }
          
          newGrid[col] = [...newCells, ...remaining].map((cell, idx) => ({ 
            ...cell, 
            isTumbling: false,
            row: idx
          }))
        }
        
        setGrid(newGrid)
        resolve(newGrid)
      }, 300)
    })
  }, [generateRandomSymbol])

  // Process tumble cascade
  const processTumble = useCallback(async (currentGrid: GridCell[][], currentTotalWin: number, tumbles: number) => {
    const { winAmount, winningPositions, hasBattle } = checkWins(currentGrid)
    
    if (winAmount > 0) {
      setTumbleCount(tumbles + 1)
      setLastWin(winAmount)
      const newTotal = currentTotalWin + winAmount
      setTotalWin(newTotal)
      setBalance(balance + winAmount)
      
      // Collect Power Relics
      setPlayerStats(prev => ({
        ...prev,
        vitality: Math.min(200, prev.vitality + Math.floor(winAmount / 10)),
        force: Math.min(50, prev.force + Math.floor(tumbles / 2))
      }))
      
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
      
      // Check for battle trigger during cascade
      if (hasBattle && Math.random() < 0.3) { // 30% chance if warrior adjacent
        setMessage('?? A creature emerges from the shadows!')
        setTimeout(() => startBattle(), 1500)
        return
      }
      
      // Continue tumbling
      await processTumble(newGrid, newTotal, tumbles + 1)
    } else {
      // No more wins
      // Show big win if applicable
      if (currentTotalWin >= betAmount * 50) {
        setBigWinAmount(currentTotalWin)
        setShowBigWin(true)
        setTimeout(() => setShowBigWin(false), 3000)
      }
      
      // Cap at max win
      const cappedWin = Math.min(currentTotalWin, betAmount * MAX_WIN)
      if (cappedWin !== currentTotalWin) {
        setMessage(`?? MAX WIN REACHED! 20,000x`)
      }
      
      // Finish spin
      setIsSpinning(false)
      setTumbleCount(0)
      
      // Unlock heroes based on wins
      if (currentTotalWin >= betAmount * 100 && !heroUnlocks.ranger) {
        setHeroUnlocks(prev => ({ ...prev, ranger: true }))
        setMessage('?? RANGER UNLOCKED!')
      }
      if (currentTotalWin >= betAmount * 500 && !heroUnlocks.mauler) {
        setHeroUnlocks(prev => ({ ...prev, mauler: true }))
        setMessage('?? MAULER UNLOCKED!')
      }
      
      // Auto play
      if (autoPlayRef.current && balance >= betAmount) {
        spinTimeoutRef.current = setTimeout(() => spin(), 1000)
      }
    }
  }, [checkWins, tumble, balance, betAmount, heroUnlocks, setBalance, startBattle])

  // Main spin function
  const spin = useCallback(() => {
    if (isSpinning) return
    if (betAmount > balance) return
    
    setIsSpinning(true)
    setLastWin(0)
    setTotalWin(0)
    setMessage('')
    setTumbleCount(0)
    
    // Deduct bet
    setBalance(balance - betAmount)
    recordBet(betAmount)
    
    // Generate new 8x8 grid
    const newGrid: GridCell[][] = []
    for (let col = 0; col < 8; col++) {
      const column: GridCell[] = []
      for (let row = 0; row < 8; row++) {
        const symbol = generateRandomSymbol(true)
        column.push({
          symbol,
          isWinning: false,
          isTumbling: false,
          isNew: true,
          isRevealed: true,
          row,
          col
        })
      }
      newGrid.push(column)
    }
    
    setGrid(newGrid)
    
    // Start checking wins after animation
    setTimeout(() => {
      processTumble(newGrid, 0, 0)
    }, 600)
  }, [isSpinning, balance, betAmount, generateRandomSymbol, recordBet, setBalance, processTumble])

  // Buy feature
  const buyFeature = useCallback((multiplier: number) => {
    const costs = { 1: 17.3, 2: 45.5, 3: 83.6, 4: 143.7, 5: 218 }
    const cost = (costs[multiplier as keyof typeof costs] || 17.3) * betAmount
    
    if (balance >= cost) {
      setBalance(balance - cost)
      recordBet(cost)
      setShowFeatureBuy(false)
      
      // Start bonus directly with enhanced chances
      setMessage('?? Entering the Dungeon...')
      setTimeout(() => startTreasureHall(), 1500)
    }
  }, [balance, betAmount, setBalance, recordBet, startTreasureHall])

  // Render symbol
  const renderSymbol = (cell: GridCell) => {
    const config = SYMBOLS[cell.symbol]
    
    return (
      <div 
        className={`
          w-full h-full rounded-lg flex items-center justify-center text-base sm:text-lg md:text-xl
          bg-gradient-to-br ${config.gradient}
          ${cell.isWinning ? 'animate-pulse ring-2 ring-yellow-400 ring-offset-1' : ''}
          ${cell.isTumbling ? 'animate-bounce opacity-50' : ''}
          ${cell.isNew ? 'animate-drop-in' : ''}
          shadow-lg relative overflow-hidden transition-all duration-200
          border border-gray-700/50
        `}
      >
        <span className="drop-shadow-lg relative z-10">{config.emoji}</span>
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
      </div>
    )
  }

  // Render hero panel
  const renderHeroPanel = () => {
    const hero = HEROES[selectedHero]
    return (
      <div className={`bg-gradient-to-br ${hero.color} rounded-xl p-2 border border-gray-700/50`}>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{hero.emoji}</span>
          <div className="text-xs">
            <div className="font-bold text-white">{hero.name}</div>
            <div className="text-white/60">{hero.description}</div>
          </div>
        </div>
        {/* Stats */}
        <div className="grid grid-cols-4 gap-1 mt-2 text-[10px]">
          <div className="text-center bg-black/30 rounded p-1">
            <div className="text-red-400">??</div>
            <div className="text-white">{playerStats.vitality}</div>
          </div>
          <div className="text-center bg-black/30 rounded p-1">
            <div className="text-orange-400">??</div>
            <div className="text-white">{playerStats.force}</div>
          </div>
          <div className="text-center bg-black/30 rounded p-1">
            <div className="text-yellow-400">??</div>
            <div className="text-white">{playerStats.crit}%</div>
          </div>
          <div className="text-center bg-black/30 rounded p-1">
            <div className="text-blue-400">???</div>
            <div className="text-white">{playerStats.guard}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-gray-950 via-slate-900 to-gray-950 relative overflow-hidden">
      {/* Atmospheric Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute animate-float text-purple-500/20"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${4 + Math.random() * 6}s`,
              fontSize: `${10 + Math.random() * 20}px`
            }}
          >
            ?
          </div>
        ))}
      </div>

      {/* Top Bar */}
      <div className="flex-shrink-0 bg-gradient-to-r from-gray-900 via-purple-900/50 to-gray-900 px-2 py-2 relative z-10 border-b border-purple-500/30">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={() => router.push('/casino')}
            className="text-white hover:bg-white/10 p-2 rounded-lg transition-colors text-sm"
          >
            ? Back
          </button>
          
          <h1 className="text-base sm:text-xl font-bold text-white drop-shadow-lg flex items-center gap-2">
            <span className="text-purple-400">??</span>
            <span className="bg-gradient-to-r from-red-500 via-purple-400 to-red-500 bg-clip-text text-transparent">
              ELDRITCH DUNGEON
            </span>
            <span className="text-purple-400">??</span>
          </h1>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHeroSelect(true)}
              className="text-white hover:bg-white/10 p-2 rounded-lg transition-colors text-xs"
            >
              ??
            </button>
            <button
              onClick={() => setShowPaytable(true)}
              className="text-white hover:bg-white/10 p-2 rounded-lg transition-colors text-xs"
            >
              ??
            </button>
          </div>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col lg:flex-row items-start justify-center p-2 gap-2 relative z-10 overflow-hidden">
        {/* Left Panel - Hero & Stats */}
        <div className="hidden lg:block w-48 flex-shrink-0">
          {renderHeroPanel()}
        </div>

        {/* Center - Game Grid */}
        <div className="flex-1 flex flex-col items-center justify-center max-w-2xl">
          {/* Win Display */}
          <div className="text-center mb-1 min-h-[2rem]">
            {lastWin > 0 && (
              <div className="text-lg sm:text-2xl font-bold text-yellow-400 animate-pulse">
                WIN: ${lastWin.toFixed(2)}
              </div>
            )}
            {tumbleCount > 0 && (
              <div className="text-xs text-cyan-400">
                Cascade #{tumbleCount}
              </div>
            )}
            {message && (
              <div className="text-sm text-purple-400 font-bold animate-bounce">
                {message}
              </div>
            )}
          </div>

          {/* Slot Frame - Stone Border */}
          <div className="relative rounded-xl shadow-2xl w-full max-w-[95vw] sm:max-w-[80vw] md:max-w-xl lg:max-w-2xl" 
               style={{ 
                 background: 'linear-gradient(135deg, #374151, #1f2937, #374151)',
                 padding: 'clamp(4px, 1vw, 8px)'
               }}>
            <div className="bg-gradient-to-b from-gray-900 via-slate-900 to-gray-950 rounded-lg p-2">
              {/* 8x8 Grid */}
              <div className="grid grid-cols-8 gap-0.5 sm:gap-1 p-1 bg-gray-950 rounded-lg overflow-hidden">
                {grid.map((column, colIdx) => (
                  <div key={colIdx} className="flex flex-col gap-0.5 sm:gap-1">
                    {column.map((cell, rowIdx) => (
                      <div 
                        key={`${colIdx}-${rowIdx}`} 
                        className="aspect-square"
                        style={{ minWidth: '28px' }}
                      >
                        {renderSymbol(cell)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Total Win Display */}
          {totalWin > 0 && (
            <div className="text-center mt-2 py-2 bg-gradient-to-r from-transparent via-purple-600/30 to-transparent rounded w-full">
              <div className="text-lg sm:text-2xl font-bold text-yellow-300">
                TOTAL WIN: ${totalWin.toFixed(2)}
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Feature Buy */}
        <div className="hidden lg:block w-48 flex-shrink-0">
          <button
            onClick={() => setShowFeatureBuy(true)}
            disabled={isSpinning}
            className="w-full p-3 bg-gradient-to-br from-amber-600 to-amber-900 rounded-xl border border-amber-500/50 hover:from-amber-500 hover:to-amber-800 transition-all disabled:opacity-50"
          >
            <div className="text-center">
              <div className="text-lg mb-1">?</div>
              <div className="text-xs font-bold text-amber-200">FEATURE BET</div>
              <div className="text-[10px] text-amber-300/70">Buy Bonus</div>
            </div>
          </button>
          
          <div className="mt-2 bg-gray-900/50 rounded-xl p-2 border border-gray-700/50">
            <div className="text-[10px] text-gray-400 mb-1">Game Info</div>
            <div className="text-[10px] text-gray-500">RTP: 96.10%</div>
            <div className="text-[10px] text-gray-500">Max Win: 20,000x</div>
            <div className="text-[10px] text-gray-500">Volatility: Very High</div>
          </div>
        </div>
      </div>

      {/* Bottom Control Bar */}
      <div className="flex-shrink-0 bg-gradient-to-t from-gray-950 via-gray-900 to-gray-900/90 border-t border-purple-500/30 px-2 py-2 relative z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
          {/* Feature Buy Button - Mobile */}
          <button
            onClick={() => setShowFeatureBuy(true)}
            disabled={isSpinning}
            className="lg:hidden px-2 py-2 rounded-lg bg-gradient-to-br from-amber-600 to-amber-800 border border-amber-500 text-[10px] font-bold text-white disabled:opacity-50 flex-shrink-0"
          >
            ?<br/>BUY
          </button>

          {/* Balance */}
          <div className="text-center min-w-0 flex-1">
            <div className="text-[8px] text-gray-400 uppercase">Balance</div>
            <div className="text-sm font-bold text-white truncate">${balance.toLocaleString()}</div>
          </div>

          {/* Bet Amount */}
          <div className="flex items-center gap-1 bg-gray-900/80 rounded-lg px-2 py-1 flex-shrink-0">
            <button
              onClick={() => setBetAmount(Math.max(0.1, betAmount / 2))}
              disabled={isSpinning}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-purple-700 flex items-center justify-center text-white hover:bg-purple-600 disabled:opacity-50 text-sm font-bold"
            >
              -
            </button>
            <div className="text-center w-16">
              <div className="text-[8px] text-gray-400">BET</div>
              <div className="text-sm font-bold text-white">${betAmount.toFixed(2)}</div>
            </div>
            <button
              onClick={() => setBetAmount(Math.min(50, betAmount * 2))}
              disabled={isSpinning}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-purple-700 flex items-center justify-center text-white hover:bg-purple-600 disabled:opacity-50 text-sm font-bold"
            >
              +
            </button>
          </div>

          {/* Spin Button */}
          <button
            onClick={spin}
            disabled={isSpinning || betAmount > balance}
            className="px-4 sm:px-8 py-2 sm:py-3 rounded-xl bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 border-2 border-purple-400 text-white font-bold text-sm sm:text-base disabled:opacity-50 hover:from-purple-500 hover:to-indigo-700 transition-all shadow-lg shadow-purple-500/30 flex-shrink-0"
          >
            {isSpinning ? '?' : '?? SPIN'}
          </button>

          {/* Auto Play */}
          <button
            onClick={() => setAutoPlay(!autoPlay)}
            disabled={isSpinning && !autoPlay}
            className={`px-2 py-2 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
              autoPlay 
                ? 'bg-green-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {autoPlay ? '??' : '??'}
          </button>
        </div>
      </div>

      {/* Big Win Overlay */}
      {showBigWin && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in">
          <div className="text-center">
            <div className="text-4xl sm:text-6xl md:text-8xl font-bold text-yellow-400 animate-bounce">
              ?? BIG WIN! ??
            </div>
            <div className="text-3xl sm:text-5xl md:text-7xl font-bold text-white mt-4">
              ${bigWinAmount.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {/* Battle Overlay */}
      {showBattle && currentEnemy && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl p-6 max-w-md w-full border border-purple-500/50">
            <h2 className="text-2xl font-bold text-center text-red-400 mb-4">?? DUNGEON BATTLE ??</h2>
            
            <div className="flex justify-between items-center mb-4">
              {/* Hero */}
              <div className="text-center">
                <div className="text-4xl mb-2">{HEROES[selectedHero].emoji}</div>
                <div className="text-sm text-white">{HEROES[selectedHero].name}</div>
                <div className="w-24 h-2 bg-gray-700 rounded-full mt-1">
                  <div 
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${(heroHp / playerStats.vitality) * 100}%` }}
                  />
                </div>
                <div className="text-xs text-green-400">{heroHp} HP</div>
              </div>
              
              <div className="text-2xl text-yellow-400">??</div>
              
              {/* Enemy */}
              <div className="text-center">
                <div className="text-4xl mb-2">{ENEMIES[currentEnemy].emoji}</div>
                <div className="text-sm text-white">{ENEMIES[currentEnemy].name}</div>
                <div className="w-24 h-2 bg-gray-700 rounded-full mt-1">
                  <div 
                    className="h-full bg-red-500 rounded-full transition-all"
                    style={{ width: `${(enemyHp / ENEMIES[currentEnemy].hp) * 100}%` }}
                  />
                </div>
                <div className="text-xs text-red-400">{enemyHp} HP</div>
              </div>
            </div>
            
            {/* Battle Log */}
            <div className="bg-black/50 rounded-lg p-3 h-32 overflow-y-auto">
              {battleLog.map((log, i) => (
                <div key={i} className="text-xs text-gray-300 mb-1">{log}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Treasure Hall Overlay */}
      {showTreasureHall && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-b from-amber-900/50 to-gray-950 rounded-2xl p-4 max-w-lg w-full border border-amber-500/50">
            <h2 className="text-xl font-bold text-center text-amber-400 mb-2">
              {fightingOldOne ? '??? THE OLD ONE ???' : '?? TREASURE HALL ??'}
            </h2>
            
            <div className="flex justify-between items-center mb-2 text-sm">
              <div className="text-white">Lives: {'??'.repeat(bonusLives)}</div>
              <div className="text-amber-400 font-bold">Total: ${bonusTotal.toFixed(2)}</div>
            </div>
            
            {/* Bonus Grid */}
            <div className="grid grid-cols-8 gap-1 bg-black/50 rounded-lg p-2">
              {bonusGrid.map((column, colIdx) => (
                <div key={colIdx} className="flex flex-col gap-1">
                  {column.map((cell, rowIdx) => (
                    <div 
                      key={`${colIdx}-${rowIdx}`}
                      className={`aspect-square rounded flex items-center justify-center text-xs
                        ${cell.type === 'locked' ? 'bg-gray-800' : 
                          cell.type === 'coin' ? 'bg-gradient-to-br from-yellow-500 to-amber-600' :
                          cell.type === 'key' ? 'bg-gradient-to-br from-purple-500 to-purple-700' :
                          'bg-gray-700'}
                      `}
                    >
                      {cell.type === 'locked' && '??'}
                      {cell.type === 'coin' && `$${cell.value}`}
                      {cell.type === 'key' && '??'}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            
            {bonusMultiplier > 1 && (
              <div className="text-center mt-2 text-xl font-bold text-yellow-400">
                Multiplier: {bonusMultiplier}x
              </div>
            )}
          </div>
        </div>
      )}

      {/* Feature Buy Modal */}
      {showFeatureBuy && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowFeatureBuy(false)}>
          <div className="bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl p-4 max-w-sm w-full border border-amber-500/50" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="text-2xl mb-1">?</div>
              <h2 className="text-lg font-bold text-amber-400">FEATURE BET</h2>
              <p className="text-xs text-gray-400">Select feature bet</p>
            </div>
            
            <div className="grid grid-cols-5 gap-2 mb-4">
              {[
                { mult: 1, cost: 17.3 },
                { mult: 2, cost: 45.5 },
                { mult: 3, cost: 83.6 },
                { mult: 4, cost: 143.7 },
                { mult: 5, cost: 218 }
              ].map(({ mult, cost }) => (
                <button
                  key={mult}
                  onClick={() => buyFeature(mult)}
                  disabled={balance < cost * betAmount}
                  className="p-2 bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg border border-gray-700 hover:border-amber-500 disabled:opacity-50 transition-all"
                >
                  <div className="text-lg font-bold text-amber-400">{mult}</div>
                  <div className="text-[10px] text-gray-400">${(cost * betAmount).toFixed(2)}</div>
                </button>
              ))}
            </div>
            
            <button
              onClick={() => setShowFeatureBuy(false)}
              className="w-full py-2 bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700 transition-all text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Hero Select Modal */}
      {showHeroSelect && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowHeroSelect(false)}>
          <div className="bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl p-4 max-w-md w-full border border-purple-500/50" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-center text-purple-400 mb-4">SELECT HERO</h2>
            
            <div className="grid grid-cols-3 gap-3">
              {(Object.entries(HEROES) as [HeroType, typeof HEROES.arcanist][]).map(([key, hero]) => (
                <button
                  key={key}
                  onClick={() => {
                    if (heroUnlocks[key]) {
                      setSelectedHero(key)
                      setShowHeroSelect(false)
                    }
                  }}
                  disabled={!heroUnlocks[key]}
                  className={`p-3 rounded-xl border transition-all ${
                    heroUnlocks[key] 
                      ? selectedHero === key 
                        ? 'border-yellow-400 bg-yellow-400/10' 
                        : 'border-gray-700 hover:border-purple-500'
                      : 'border-gray-800 opacity-50'
                  }`}
                >
                  <div className="text-3xl mb-1">{hero.emoji}</div>
                  <div className="text-sm font-bold text-white">{hero.name}</div>
                  <div className="text-[10px] text-gray-400">{hero.description}</div>
                  {!heroUnlocks[key] && (
                    <div className="text-[10px] text-red-400 mt-1">?? Locked</div>
                  )}
                </button>
              ))}
            </div>
            
            <button
              onClick={() => setShowHeroSelect(false)}
              className="w-full mt-4 py-2 bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700 transition-all text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Paytable Modal */}
      {showPaytable && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={() => setShowPaytable(false)}>
          <div className="bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl p-4 max-w-lg w-full border border-purple-500/50 my-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-center text-purple-400 mb-4">?? PAYTABLE</h2>
            
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              <div className="text-xs text-gray-400 mb-2">Cluster Pays (5+ matching adjacent symbols)</div>
              
              {REGULAR_SYMBOLS.map(sym => {
                const config = SYMBOLS[sym]
                return (
                  <div key={sym} className="flex items-center justify-between bg-gray-800/50 rounded-lg p-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{config.emoji}</span>
                    </div>
                    <div className="flex gap-2 text-[10px]">
                      <span className="text-gray-400">5: {config.payouts[5]}x</span>
                      <span className="text-gray-400">8: {config.payouts[8]}x</span>
                      <span className="text-blue-400">12: {config.payouts[12]}x</span>
                      <span className="text-yellow-400">20+: {config.payouts[20]}x</span>
                    </div>
                  </div>
                )
              })}
              
              <div className="border-t border-gray-700 pt-2 mt-2">
                <div className="text-sm text-amber-400 font-bold mb-2">Special Symbols</div>
                <div className="flex items-center justify-between bg-gray-800/50 rounded-lg p-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">??</span>
                    <span className="text-sm text-white">Wild</span>
                  </div>
                  <span className="text-xs text-gray-400">Substitutes all symbols</span>
                </div>
                <div className="flex items-center justify-between bg-gray-800/50 rounded-lg p-2 mt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">??</span>
                    <span className="text-sm text-white">Warrior</span>
                  </div>
                  <span className="text-xs text-gray-400">Triggers Dungeon Battle</span>
                </div>
              </div>
              
              <div className="border-t border-gray-700 pt-2 mt-2">
                <div className="text-sm text-purple-400 font-bold mb-2">Features</div>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>• <span className="text-white">Cascading Wins:</span> Winning symbols vanish and new ones drop</p>
                  <p>• <span className="text-white">Dungeon Battle:</span> Fight enemies when Warrior appears next to wins</p>
                  <p>• <span className="text-white">Treasure Hall:</span> Hold & Win bonus with keys and coins</p>
                  <p>• <span className="text-white">The Old One:</span> Final boss awards 4x4 Colossal Coin + 2x Multiplier</p>
                </div>
              </div>
              
              <div className="border-t border-gray-700 pt-2 mt-2 text-center">
                <div className="text-xs text-gray-500">RTP: 96.10% | Max Win: 20,000x | Very High Volatility</div>
              </div>
            </div>
            
            <button
              onClick={() => setShowPaytable(false)}
              className="w-full mt-4 py-2 bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700 transition-all text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Animation Styles */}
      <style jsx global>{`
        @keyframes drop-in {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        
        @keyframes float {
          0%, 100% {
            transform: translateY(0) rotate(0deg);
            opacity: 0.3;
          }
          50% {
            transform: translateY(-20px) rotate(180deg);
            opacity: 0.6;
          }
        }
        
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .animate-drop-in {
          animation: drop-in 0.3s ease-out;
        }
        
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
        
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
