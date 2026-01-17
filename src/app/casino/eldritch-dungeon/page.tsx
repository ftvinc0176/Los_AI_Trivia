'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useCasino } from '../CasinoContext'
import { useRouter } from 'next/navigation'

// =============================================
// ELDRITCH DUNGEON - Print Studios Recreation
// 8x8 Cluster Pays | RTP 96.10% | Very High Vol
// Max Win: 20,000x | Bet: 0.10 - 50.00
// =============================================

type SymbolType = 'highRed' | 'highBlue' | 'highGreen' | 'highPurple' | 'midSkull' | 'midEye' | 'lowRune1' | 'lowRune2' | 'lowRune3' | 'lowRune4' | 'wild' | 'warrior'
type HeroType = 'arcanist' | 'ranger' | 'mauler'
type EnemyType = 'nightwing' | 'elderwing' | 'nightfang' | 'elderfang'
type GamePhase = 'idle' | 'spinning' | 'cascading' | 'battle' | 'spectralEffect' | 'treasureHall' | 'oldOne'

interface SymbolConfig {
  label: string
  tier: 'high' | 'mid' | 'low' | 'special'
  gradient: string
  glow: string
  payouts: Record<number, number>
}

// Paytable designed for 96.10% RTP with very high volatility
const SYMBOLS: Record<SymbolType, SymbolConfig> = {
  highRed:    { label: 'R', tier: 'high', gradient: 'from-red-500 via-red-600 to-red-900', glow: 'shadow-red-500/50', payouts: { 5: 1, 8: 4, 12: 20, 20: 100, 30: 500 } },
  highBlue:   { label: 'B', tier: 'high', gradient: 'from-blue-400 via-blue-600 to-blue-900', glow: 'shadow-blue-500/50', payouts: { 5: 1, 8: 4, 12: 20, 20: 100, 30: 500 } },
  highGreen:  { label: 'G', tier: 'high', gradient: 'from-emerald-400 via-emerald-600 to-emerald-900', glow: 'shadow-emerald-500/50', payouts: { 5: 0.8, 8: 3, 12: 15, 20: 75, 30: 400 } },
  highPurple: { label: 'P', tier: 'high', gradient: 'from-purple-400 via-purple-600 to-purple-900', glow: 'shadow-purple-500/50', payouts: { 5: 0.8, 8: 3, 12: 15, 20: 75, 30: 400 } },
  midSkull:   { label: 'S', tier: 'mid', gradient: 'from-gray-300 via-gray-500 to-gray-800', glow: 'shadow-gray-400/50', payouts: { 5: 0.5, 8: 2, 12: 8, 20: 40, 30: 200 } },
  midEye:     { label: 'E', tier: 'mid', gradient: 'from-violet-400 via-violet-600 to-violet-900', glow: 'shadow-violet-500/50', payouts: { 5: 0.5, 8: 2, 12: 8, 20: 40, 30: 200 } },
  lowRune1:   { label: '1', tier: 'low', gradient: 'from-slate-500 via-slate-700 to-slate-900', glow: 'shadow-slate-500/30', payouts: { 5: 0.2, 8: 0.8, 12: 3, 20: 15, 30: 75 } },
  lowRune2:   { label: '2', tier: 'low', gradient: 'from-zinc-500 via-zinc-700 to-zinc-900', glow: 'shadow-zinc-500/30', payouts: { 5: 0.2, 8: 0.8, 12: 3, 20: 15, 30: 75 } },
  lowRune3:   { label: '3', tier: 'low', gradient: 'from-stone-500 via-stone-700 to-stone-900', glow: 'shadow-stone-500/30', payouts: { 5: 0.2, 8: 0.8, 12: 3, 20: 15, 30: 75 } },
  lowRune4:   { label: '4', tier: 'low', gradient: 'from-neutral-500 via-neutral-700 to-neutral-900', glow: 'shadow-neutral-500/30', payouts: { 5: 0.2, 8: 0.8, 12: 3, 20: 15, 30: 75 } },
  wild:       { label: 'W', tier: 'special', gradient: 'from-yellow-300 via-amber-500 to-orange-600', glow: 'shadow-yellow-400/70', payouts: { 5: 10, 8: 50, 12: 250, 20: 1000, 30: 5000 } },
  warrior:    { label: '+', tier: 'special', gradient: 'from-amber-400 via-orange-500 to-red-700', glow: 'shadow-orange-500/70', payouts: {} }
}

const REGULAR_SYMBOLS: SymbolType[] = ['highRed', 'highBlue', 'highGreen', 'highPurple', 'midSkull', 'midEye', 'lowRune1', 'lowRune2', 'lowRune3', 'lowRune4']

// Weighted symbol distribution for RTP control
const SYMBOL_WEIGHTS: Record<SymbolType, number> = {
  highRed: 8, highBlue: 8, highGreen: 10, highPurple: 10,
  midSkull: 14, midEye: 14,
  lowRune1: 18, lowRune2: 18, lowRune3: 18, lowRune4: 18,
  wild: 0, warrior: 0
}

const HEROES: Record<HeroType, { 
  name: string
  title: string
  baseStats: { vitality: number; force: number; crit: number; guard: number }
  color: string
  accent: string
  ability: string
}> = {
  arcanist: { 
    name: 'Arcanist', title: 'Master of Arcane', 
    baseStats: { vitality: 100, force: 15, crit: 15, guard: 5 },
    color: 'from-purple-600 to-indigo-900', accent: 'purple',
    ability: 'Arcane Blast: +25% crit damage'
  },
  ranger: { 
    name: 'Ranger', title: 'Swift Hunter',
    baseStats: { vitality: 80, force: 20, crit: 25, guard: 3 },
    color: 'from-green-600 to-teal-900', accent: 'green',
    ability: 'Quick Shot: Double attack chance'
  },
  mauler: { 
    name: 'Mauler', title: 'Brutal Warrior',
    baseStats: { vitality: 150, force: 25, crit: 5, guard: 10 },
    color: 'from-red-600 to-orange-900', accent: 'red',
    ability: 'Berserker: Damage increases as HP drops'
  }
}

const ENEMIES: Record<EnemyType, {
  name: string
  hp: number
  damage: number
  reward: { type: 'transform' | 'wilds'; count: number }
  tier: 'normal' | 'elite'
}> = {
  nightwing:  { name: 'Nightwing', hp: 30, damage: 8, reward: { type: 'transform', count: 10 }, tier: 'normal' },
  elderwing:  { name: 'Elderwing', hp: 50, damage: 12, reward: { type: 'transform', count: 19 }, tier: 'elite' },
  nightfang:  { name: 'Nightfang', hp: 40, damage: 10, reward: { type: 'wilds', count: 4 }, tier: 'normal' },
  elderfang:  { name: 'Elderfang', hp: 60, damage: 15, reward: { type: 'wilds', count: 10 }, tier: 'elite' }
}

interface GridCell {
  id: string
  symbol: SymbolType
  isWinning: boolean
  isCascading: boolean
  isNew: boolean
  isTransformed: boolean
  multiplier?: number
}

interface TreasureCoin {
  id: string
  value: number
  size: 1 | 2 | 3 | 4
  row: number
  col: number
}

interface TreasureCell {
  unlocked: boolean
  hasKey: boolean
  coin: TreasureCoin | null
}

interface PowerRelic {
  vitality: number
  force: number
  crit: number
  guard: number
}

interface BattleState {
  enemy: EnemyType
  enemyHp: number
  enemyMaxHp: number
  heroHp: number
  heroMaxHp: number
  log: string[]
  turn: number
  isPlayerTurn: boolean
}

interface GameState {
  phase: GamePhase
  grid: GridCell[][]
  cascadeLevel: number
  totalWin: number
  spinWin: number
  pendingReward: { type: 'transform' | 'wilds'; count: number } | null
}

// Coin values for Treasure Hall
const COIN_VALUES = [1, 2, 3, 5, 8, 10, 15, 20, 25, 50, 100, 250, 500, 1000]
const COIN_WEIGHTS = [25, 20, 15, 12, 10, 8, 5, 3, 2, 1, 0.5, 0.3, 0.15, 0.05]

export default function EldritchDungeon() {
  const { balance, setBalance, recordBet } = useCasino()
  const router = useRouter()
  
  // Core state
  const [gameState, setGameState] = useState<GameState>({
    phase: 'idle',
    grid: [],
    cascadeLevel: 0,
    totalWin: 0,
    spinWin: 0,
    pendingReward: null
  })
  
  const [betAmount, setBetAmount] = useState(1)
  const [autoPlay, setAutoPlay] = useState(false)
  const [turboMode, setTurboMode] = useState(false)
  
  // Hero & Stats
  const [selectedHero, setSelectedHero] = useState<HeroType>('arcanist')
  const [heroUnlocks, setHeroUnlocks] = useState<Record<HeroType, boolean>>({ arcanist: true, ranger: false, mauler: false })
  const [powerRelics, setPowerRelics] = useState<PowerRelic>({ vitality: 0, force: 0, crit: 0, guard: 0 })
  const [totalRelicsCollected, setTotalRelicsCollected] = useState(0)
  
  // Battle state
  const [battleState, setBattleState] = useState<BattleState | null>(null)
  
  // Treasure Hall state
  const [treasureGrid, setTreasureGrid] = useState<TreasureCell[][]>([])
  const [treasureLives, setTreasureLives] = useState(3)
  const [treasureTotal, setTreasureTotal] = useState(0)
  const [treasureMultiplier, setTreasureMultiplier] = useState(1)
  const [oldOneDefeated, setOldOneDefeated] = useState(false)
  
  // UI state
  const [showPaytable, setShowPaytable] = useState(false)
  const [showHeroSelect, setShowHeroSelect] = useState(false)
  const [showFeatureBuy, setShowFeatureBuy] = useState(false)
  const [showBigWin, setShowBigWin] = useState(false)
  const [bigWinAmount, setBigWinAmount] = useState(0)
  const [message, setMessage] = useState('')
  
  // Session stats
  const [sessionSpins, setSessionSpins] = useState(0)
  const [sessionWins, setSessionWins] = useState(0)
  
  const autoPlayRef = useRef(false)
  const animationSpeed = turboMode ? 150 : 350

  // ============== SYMBOL GENERATION ==============
  const getWeightedSymbol = useCallback((includeSpecials = false): SymbolType => {
    const rand = Math.random()
    
    if (includeSpecials) {
      if (rand < 0.008) return 'wild' // 0.8% wild
      if (rand < 0.015) return 'warrior' // 0.7% warrior
    }
    
    const totalWeight = Object.entries(SYMBOL_WEIGHTS)
      .filter(([sym]) => REGULAR_SYMBOLS.includes(sym as SymbolType))
      .reduce((sum, [, w]) => sum + w, 0)
    
    let cumulative = 0
    const roll = Math.random() * totalWeight
    
    for (const sym of REGULAR_SYMBOLS) {
      cumulative += SYMBOL_WEIGHTS[sym]
      if (roll <= cumulative) return sym
    }
    
    return 'lowRune1'
  }, [])

  const createCell = useCallback((row: number, col: number, includeSpecials = true): GridCell => ({
    id: `${row}-${col}-${Date.now()}-${Math.random()}`,
    symbol: getWeightedSymbol(includeSpecials),
    isWinning: false,
    isCascading: false,
    isNew: false,
    isTransformed: false
  }), [getWeightedSymbol])

  // ============== GRID INITIALIZATION ==============
  const initializeGrid = useCallback((): GridCell[][] => {
    const grid: GridCell[][] = []
    for (let row = 0; row < 8; row++) {
      const rowCells: GridCell[] = []
      for (let col = 0; col < 8; col++) {
        rowCells.push(createCell(row, col, true))
      }
      grid.push(rowCells)
    }
    return grid
  }, [createCell])

  useEffect(() => {
    setGameState(prev => ({ ...prev, grid: initializeGrid() }))
  }, [initializeGrid])

  useEffect(() => { autoPlayRef.current = autoPlay }, [autoPlay])

  // ============== CLUSTER FINDING (DFS) ==============
  const findClusters = useCallback((grid: GridCell[][]): { symbol: SymbolType; cells: [number, number][] }[] => {
    const visited = new Set<string>()
    const clusters: { symbol: SymbolType; cells: [number, number][] }[] = []
    
    const dfs = (row: number, col: number, targetSymbol: SymbolType, cluster: [number, number][]) => {
      const key = `${row},${col}`
      if (visited.has(key)) return
      if (row < 0 || row >= 8 || col < 0 || col >= 8) return
      
      const cell = grid[row][col]
      const isMatch = cell.symbol === targetSymbol || cell.symbol === 'wild'
      if (!isMatch) return
      
      visited.add(key)
      cluster.push([row, col])
      
      // Only horizontal and vertical adjacency (not diagonal)
      dfs(row - 1, col, targetSymbol, cluster)
      dfs(row + 1, col, targetSymbol, cluster)
      dfs(row, col - 1, targetSymbol, cluster)
      dfs(row, col + 1, targetSymbol, cluster)
    }
    
    // Find all clusters
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const key = `${row},${col}`
        const cell = grid[row][col]
        
        if (!visited.has(key) && cell.symbol !== 'wild' && cell.symbol !== 'warrior') {
          const cluster: [number, number][] = []
          dfs(row, col, cell.symbol, cluster)
          
          if (cluster.length >= 5) {
            clusters.push({ symbol: cell.symbol, cells: cluster })
          }
        }
      }
    }
    
    return clusters
  }, [])

  // ============== CHECK FOR WARRIOR TRIGGER ==============
  const checkWarriorBattle = useCallback((grid: GridCell[][], winningCells: Set<string>): boolean => {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (grid[row][col].symbol === 'warrior') {
          // Check if any adjacent cell is a winning cell
          const adjacents = [
            [row - 1, col], [row + 1, col],
            [row, col - 1], [row, col + 1]
          ]
          for (const [ar, ac] of adjacents) {
            if (winningCells.has(`${ar},${ac}`)) {
              return true
            }
          }
        }
      }
    }
    return false
  }, [])

  // ============== CALCULATE WIN ==============
  const calculateClusterWin = useCallback((clusters: { symbol: SymbolType; cells: [number, number][] }[]): number => {
    let total = 0
    for (const cluster of clusters) {
      const config = SYMBOLS[cluster.symbol]
      const size = cluster.cells.length
      
      // Find appropriate payout tier
      let payout = 0
      if (size >= 30) payout = config.payouts[30] || config.payouts[20] || 0
      else if (size >= 20) payout = config.payouts[20] || 0
      else if (size >= 12) payout = config.payouts[12] || 0
      else if (size >= 8) payout = config.payouts[8] || 0
      else if (size >= 5) payout = config.payouts[5] || 0
      
      total += payout * betAmount
    }
    return total
  }, [betAmount])

  // ============== CASCADE LOGIC ==============
  const performCascade = useCallback(async (currentGrid: GridCell[][]): Promise<GridCell[][]> => {
    const newGrid = currentGrid.map(row => row.map(cell => ({ ...cell, isCascading: false, isNew: false })))
    
    // For each column, remove cascading cells and drop new ones from top
    for (let col = 0; col < 8; col++) {
      const remaining: GridCell[] = []
      for (let row = 7; row >= 0; row--) {
        if (!newGrid[row][col].isWinning) {
          remaining.push({ ...newGrid[row][col], isWinning: false })
        }
      }
      
      // Fill from bottom up
      const needed = 8 - remaining.length
      for (let row = 7; row >= 0; row--) {
        if (row >= needed) {
          newGrid[row][col] = remaining[7 - row]
        } else {
          newGrid[row][col] = { ...createCell(row, col, true), isNew: true }
        }
      }
    }
    
    return newGrid
  }, [createCell])

  // ============== APPLY SPECTRAL EFFECT ==============
  const applySpectralEffect = useCallback((grid: GridCell[][], reward: { type: 'transform' | 'wilds'; count: number }): GridCell[][] => {
    const newGrid = grid.map(row => row.map(cell => ({ ...cell })))
    
    if (reward.type === 'transform') {
      // Pick a random high-paying symbol to transform to
      const targetSymbol = ['highRed', 'highBlue', 'highGreen', 'highPurple'][Math.floor(Math.random() * 4)] as SymbolType
      
      // Get all non-special positions
      const positions: [number, number][] = []
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          if (newGrid[row][col].symbol !== 'wild' && newGrid[row][col].symbol !== 'warrior') {
            positions.push([row, col])
          }
        }
      }
      
      // Shuffle and take required count
      const shuffled = positions.sort(() => Math.random() - 0.5).slice(0, reward.count)
      for (const [row, col] of shuffled) {
        newGrid[row][col] = { ...newGrid[row][col], symbol: targetSymbol, isTransformed: true }
      }
    } else {
      // Add wilds
      const positions: [number, number][] = []
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          if (newGrid[row][col].symbol !== 'wild' && newGrid[row][col].symbol !== 'warrior') {
            positions.push([row, col])
          }
        }
      }
      
      const shuffled = positions.sort(() => Math.random() - 0.5).slice(0, reward.count)
      for (const [row, col] of shuffled) {
        newGrid[row][col] = { ...newGrid[row][col], symbol: 'wild', isTransformed: true }
      }
    }
    
    return newGrid
  }, [])

  // ============== BATTLE SYSTEM ==============
  const getHeroStats = useCallback(() => {
    const base = HEROES[selectedHero].baseStats
    return {
      vitality: base.vitality + powerRelics.vitality,
      force: base.force + powerRelics.force,
      crit: base.crit + powerRelics.crit,
      guard: base.guard + powerRelics.guard
    }
  }, [selectedHero, powerRelics])

  const startBattle = useCallback((enemyType: EnemyType) => {
    const enemy = ENEMIES[enemyType]
    const stats = getHeroStats()
    
    setBattleState({
      enemy: enemyType,
      enemyHp: enemy.hp,
      enemyMaxHp: enemy.hp,
      heroHp: stats.vitality,
      heroMaxHp: stats.vitality,
      log: [`A ${enemy.name} emerges from the shadows!`],
      turn: 1,
      isPlayerTurn: true
    })
    
    setGameState(prev => ({ ...prev, phase: 'battle' }))
  }, [getHeroStats])

  const processBattleTurn = useCallback(() => {
    if (!battleState) return
    
    const stats = getHeroStats()
    const enemy = ENEMIES[battleState.enemy]
    
    setBattleState(prev => {
      if (!prev) return null
      
      let newState = { ...prev }
      const newLog = [...prev.log]
      
      if (prev.isPlayerTurn) {
        // Player attacks
        const isCrit = Math.random() * 100 < stats.crit
        let damage = stats.force
        
        // Arcanist bonus
        if (selectedHero === 'arcanist' && isCrit) damage *= 1.25
        // Mauler bonus
        if (selectedHero === 'mauler') {
          const hpPercent = prev.heroHp / prev.heroMaxHp
          damage *= 1 + (1 - hpPercent) * 0.5
        }
        // Ranger double attack
        const doubleAttack = selectedHero === 'ranger' && Math.random() < 0.3
        
        damage = Math.floor(damage * (isCrit ? 2 : 1))
        newState.enemyHp = Math.max(0, prev.enemyHp - damage)
        newLog.push(`You deal ${damage} damage${isCrit ? ' (CRITICAL!)' : ''}${doubleAttack ? ' x2!' : ''}`)
        
        if (doubleAttack && newState.enemyHp > 0) {
          const secondDamage = Math.floor(stats.force * 0.8)
          newState.enemyHp = Math.max(0, newState.enemyHp - secondDamage)
          newLog.push(`Quick Shot: +${secondDamage} damage!`)
        }
        
        if (newState.enemyHp <= 0) {
          newLog.push(`Victory! ${enemy.name} defeated!`)
          newState.isPlayerTurn = false
        } else {
          newState.isPlayerTurn = false
        }
      } else {
        // Enemy attacks
        const blocked = Math.random() * 100 < stats.guard * 2
        const damage = blocked ? Math.floor(enemy.damage * 0.3) : enemy.damage
        newState.heroHp = Math.max(0, prev.heroHp - damage)
        newLog.push(`${enemy.name} attacks for ${damage} damage${blocked ? ' (BLOCKED!)' : ''}`)
        
        if (newState.heroHp <= 0) {
          newLog.push('You have fallen...')
        } else {
          newState.turn++
          newState.isPlayerTurn = true
        }
      }
      
      return { ...newState, log: newLog }
    })
  }, [battleState, getHeroStats, selectedHero])

  // Battle turn automation
  useEffect(() => {
    if (!battleState || gameState.phase !== 'battle') return
    
    const timeout = setTimeout(() => {
      if (battleState.enemyHp <= 0) {
        // Victory - apply reward and continue to treasure hall
        const enemy = ENEMIES[battleState.enemy]
        setGameState(prev => ({ ...prev, phase: 'spectralEffect', pendingReward: enemy.reward }))
        setBattleState(null)
        setMessage(`${enemy.name} defeated! ${enemy.reward.type === 'transform' ? `${enemy.reward.count} symbols transform!` : `${enemy.reward.count} Wilds added!`}`)
        
        // Unlock heroes based on battles won
        if (!heroUnlocks.ranger && Math.random() < 0.3) {
          setHeroUnlocks(prev => ({ ...prev, ranger: true }))
          setMessage(prev => prev + ' RANGER UNLOCKED!')
        }
        if (!heroUnlocks.mauler && heroUnlocks.ranger && Math.random() < 0.2) {
          setHeroUnlocks(prev => ({ ...prev, mauler: true }))
          setMessage(prev => prev + ' MAULER UNLOCKED!')
        }
        
        setTimeout(() => startTreasureHall(), 2000)
      } else if (battleState.heroHp <= 0) {
        // Defeat
        setBattleState(null)
        setGameState(prev => ({ ...prev, phase: 'idle' }))
        setMessage('Battle lost... The dungeon claims another soul.')
      } else {
        processBattleTurn()
      }
    }, 1200)
    
    return () => clearTimeout(timeout)
  }, [battleState, gameState.phase, processBattleTurn, heroUnlocks])

  // ============== TREASURE HALL ==============
  const startTreasureHall = useCallback(() => {
    // Initialize 8x8 grid with 6 unlocked center positions
    const grid: TreasureCell[][] = []
    for (let row = 0; row < 8; row++) {
      const rowCells: TreasureCell[] = []
      for (let col = 0; col < 8; col++) {
        // Unlock center 2x3 area
        const isCenter = (row >= 3 && row <= 4) && (col >= 2 && col <= 4)
        rowCells.push({ unlocked: isCenter, hasKey: false, coin: null })
      }
      rowCells.push()
      grid.push(rowCells)
    }
    
    setTreasureGrid(grid)
    setTreasureLives(3)
    setTreasureTotal(0)
    setTreasureMultiplier(1)
    setOldOneDefeated(false)
    setGameState(prev => ({ ...prev, phase: 'treasureHall' }))
    setMessage('Welcome to the Treasure Hall!')
  }, [])

  const getRandomCoinValue = useCallback((): number => {
    const totalWeight = COIN_WEIGHTS.reduce((a, b) => a + b, 0)
    let roll = Math.random() * totalWeight
    for (let i = 0; i < COIN_VALUES.length; i++) {
      roll -= COIN_WEIGHTS[i]
      if (roll <= 0) return COIN_VALUES[i]
    }
    return COIN_VALUES[0]
  }, [])

  const processTreasureSpin = useCallback(() => {
    let landedSomething = false
    
    setTreasureGrid(prev => {
      const newGrid = prev.map(row => row.map(cell => ({ ...cell })))
      
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const cell = newGrid[row][col]
          if (cell.unlocked && !cell.coin && !cell.hasKey) {
            const rand = Math.random()
            if (rand < 0.12) {
              // Coin lands
              cell.coin = {
                id: `coin-${row}-${col}-${Date.now()}`,
                value: getRandomCoinValue(),
                size: 1,
                row, col
              }
              landedSomething = true
            } else if (rand < 0.15) {
              // Key lands
              cell.hasKey = true
              landedSomething = true
            }
          }
        }
      }
      
      // Process keys - unlock adjacent cells
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          if (newGrid[row][col].hasKey) {
            const adjacents = [[row-1,col],[row+1,col],[row,col-1],[row,col+1]]
            for (const [ar, ac] of adjacents) {
              if (ar >= 0 && ar < 8 && ac >= 0 && ac < 8) {
                newGrid[ar][ac].unlocked = true
              }
            }
            newGrid[row][col].hasKey = false // Key consumed
          }
        }
      }
      
      // Merge adjacent coins
      const merged = new Set<string>()
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const cell = newGrid[row][col]
          if (cell.coin && !merged.has(`${row},${col}`)) {
            // Check for 2x2 merge opportunity
            if (row < 7 && col < 7) {
              const canMerge = [[row,col+1],[row+1,col],[row+1,col+1]].every(([r,c]) => 
                newGrid[r][c].coin && !merged.has(`${r},${c}`)
              )
              if (canMerge) {
                const totalValue = cell.coin.value + 
                  newGrid[row][col+1].coin!.value +
                  newGrid[row+1][col].coin!.value +
                  newGrid[row+1][col+1].coin!.value
                
                // Upgrade to size 2
                cell.coin = { ...cell.coin, value: totalValue * 2, size: 2 }
                newGrid[row][col+1].coin = null
                newGrid[row+1][col].coin = null
                newGrid[row+1][col+1].coin = null
                merged.add(`${row},${col}`)
                merged.add(`${row},${col+1}`)
                merged.add(`${row+1},${col}`)
                merged.add(`${row+1},${col+1}`)
              }
            }
          }
        }
      }
      
      return newGrid
    })
    
    // Calculate total
    let total = 0
    let unlockedCount = 0
    treasureGrid.forEach(row => row.forEach(cell => {
      if (cell.coin) total += cell.coin.value
      if (cell.unlocked) unlockedCount++
    }))
    setTreasureTotal(total * betAmount)
    
    if (landedSomething) {
      setTreasureLives(3) // Reset lives
    } else {
      setTreasureLives(prev => {
        const newLives = prev - 1
        if (newLives <= 0) {
          // Check for Old One trigger
          if (unlockedCount >= 48 || Math.random() < 0.15) {
            setGameState(prev => ({ ...prev, phase: 'oldOne' }))
            setMessage('THE OLD ONE AWAKENS!')
          } else {
            completeTreasureHall()
          }
        }
        return newLives
      })
    }
  }, [treasureGrid, betAmount, getRandomCoinValue])

  const defeatOldOne = useCallback(() => {
    setOldOneDefeated(true)
    setTreasureMultiplier(2)
    
    // Add 4x4 colossal coin (worth 1000x bet)
    const colossalValue = 1000 * betAmount
    setTreasureTotal(prev => prev + colossalValue)
    setMessage(`THE OLD ONE DEFEATED! 4x4 Colossal Coin: $${colossalValue.toFixed(2)} + 2x Multiplier!`)
    
    setTimeout(() => completeTreasureHall(), 3000)
  }, [betAmount])

  const completeTreasureHall = useCallback(() => {
    const finalWin = treasureTotal * treasureMultiplier
    setGameState(prev => ({ 
      ...prev, 
      phase: 'idle',
      totalWin: prev.totalWin + finalWin
    }))
    setBalance(balance + finalWin)
    setSessionWins(prev => prev + finalWin)
    
    if (finalWin >= betAmount * 50) {
      setBigWinAmount(finalWin)
      setShowBigWin(true)
      setTimeout(() => setShowBigWin(false), 4000)
    }
    
    setMessage(`Treasure Hall Complete! Won: $${finalWin.toFixed(2)}`)
  }, [treasureTotal, treasureMultiplier, betAmount, balance, setBalance])

  // Treasure Hall automation
  useEffect(() => {
    if (gameState.phase === 'treasureHall' && treasureLives > 0) {
      const timeout = setTimeout(processTreasureSpin, 1500)
      return () => clearTimeout(timeout)
    }
  }, [gameState.phase, treasureLives, processTreasureSpin])

  useEffect(() => {
    if (gameState.phase === 'oldOne') {
      const timeout = setTimeout(defeatOldOne, 3000)
      return () => clearTimeout(timeout)
    }
  }, [gameState.phase, defeatOldOne])

  // ============== MAIN SPIN LOGIC ==============
  const spin = useCallback(async () => {
    if (gameState.phase !== 'idle' || betAmount > balance) return
    
    setGameState(prev => ({ ...prev, phase: 'spinning', totalWin: 0, spinWin: 0, cascadeLevel: 0 }))
    setBalance(balance - betAmount)
    recordBet(betAmount)
    setSessionSpins(prev => prev + 1)
    setMessage('')
    
    // Generate new grid
    let grid = initializeGrid()
    setGameState(prev => ({ ...prev, grid }))
    
    await new Promise(r => setTimeout(r, animationSpeed * 2))
    
    // Process cascades
    let cascadeLevel = 0
    let totalSpinWin = 0
    let battleTriggered = false
    
    while (true) {
      const clusters = findClusters(grid)
      if (clusters.length === 0) break
      
      cascadeLevel++
      const winAmount = calculateClusterWin(clusters)
      totalSpinWin += winAmount
      
      // Collect power relics from wins
      const relicGain = Math.floor(winAmount / betAmount / 10)
      if (relicGain > 0) {
        setPowerRelics(prev => ({
          vitality: prev.vitality + relicGain,
          force: prev.force + Math.floor(relicGain / 2),
          crit: prev.crit + Math.floor(relicGain / 3),
          guard: prev.guard + Math.floor(relicGain / 4)
        }))
        setTotalRelicsCollected(prev => prev + relicGain)
      }
      
      // Mark winning cells
      const winningCells = new Set<string>()
      for (const cluster of clusters) {
        for (const [row, col] of cluster.cells) {
          winningCells.add(`${row},${col}`)
          grid[row][col] = { ...grid[row][col], isWinning: true }
        }
      }
      
      setGameState(prev => ({ 
        ...prev, 
        grid: [...grid.map(r => [...r])], 
        cascadeLevel,
        spinWin: totalSpinWin,
        phase: 'cascading'
      }))
      
      // Check for warrior battle trigger
      if (!battleTriggered && checkWarriorBattle(grid, winningCells)) {
        battleTriggered = true
      }
      
      await new Promise(r => setTimeout(r, animationSpeed))
      
      // Cascade
      grid = await performCascade(grid)
      setGameState(prev => ({ ...prev, grid: [...grid.map(r => [...r])] }))
      
      await new Promise(r => setTimeout(r, animationSpeed))
    }
    
    // Apply wins
    if (totalSpinWin > 0) {
      const cappedWin = Math.min(totalSpinWin, betAmount * 20000)
      setBalance(prev => prev + cappedWin)
      setSessionWins(prev => prev + cappedWin)
      setGameState(prev => ({ ...prev, totalWin: cappedWin }))
      
      if (cappedWin >= betAmount * 50) {
        setBigWinAmount(cappedWin)
        setShowBigWin(true)
        setTimeout(() => setShowBigWin(false), 3000)
      }
    }
    
    // Trigger battle if warrior was adjacent to a win
    if (battleTriggered && Math.random() < 0.4) {
      const enemies: EnemyType[] = ['nightwing', 'nightfang', 'elderwing', 'elderfang']
      const weights = [40, 30, 20, 10]
      let roll = Math.random() * 100
      let enemyType: EnemyType = 'nightwing'
      for (let i = 0; i < enemies.length; i++) {
        roll -= weights[i]
        if (roll <= 0) { enemyType = enemies[i]; break }
      }
      
      await new Promise(r => setTimeout(r, 500))
      startBattle(enemyType)
      return
    }
    
    setGameState(prev => ({ ...prev, phase: 'idle' }))
    
    // Auto play
    if (autoPlayRef.current && balance >= betAmount) {
      setTimeout(() => spin(), 1000)
    }
  }, [gameState.phase, betAmount, balance, initializeGrid, findClusters, calculateClusterWin, checkWarriorBattle, performCascade, startBattle, animationSpeed, recordBet, setBalance])

  // ============== FEATURE BUY ==============
  const buyFeature = useCallback((tier: number) => {
    const costs = [17.3, 45.5, 83.6, 143.7, 218]
    const cost = costs[tier - 1] * betAmount
    
    if (balance >= cost) {
      setBalance(balance - cost)
      recordBet(cost)
      setShowFeatureBuy(false)
      setMessage('Entering the Dungeon directly...')
      setTimeout(() => startTreasureHall(), 1000)
    }
  }, [balance, betAmount, setBalance, recordBet, startTreasureHall])

  // ============== RENDER ==============
  const renderCell = (cell: GridCell, row: number, col: number) => {
    const config = SYMBOLS[cell.symbol]
    return (
      <div
        key={cell.id}
        className={`
          aspect-square rounded-md flex items-center justify-center font-bold text-white
          bg-gradient-to-br ${config.gradient}
          transition-all duration-200
          ${cell.isWinning ? `ring-2 ring-yellow-400 animate-pulse shadow-lg ${config.glow}` : ''}
          ${cell.isNew ? 'animate-bounce' : ''}
          ${cell.isTransformed ? 'ring-2 ring-purple-400' : ''}
          ${config.tier === 'special' ? 'ring-1 ring-white/30' : ''}
          text-xs sm:text-sm md:text-base
        `}
      >
        {config.label}
      </div>
    )
  }

  const stats = getHeroStats()
  const hero = HEROES[selectedHero]

  return (
    <div className={`min-h-screen flex flex-col bg-gradient-to-b from-gray-950 via-slate-900 to-gray-950`}>
      {/* Header */}
      <header className="flex-shrink-0 bg-gradient-to-r from-gray-900/90 via-purple-900/30 to-gray-900/90 px-3 py-2 border-b border-purple-500/30">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button onClick={() => router.push('/casino')} className="text-white/70 hover:text-white text-sm">
            Exit
          </button>
          <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-red-400 via-purple-400 to-red-400 bg-clip-text text-transparent">
            ELDRITCH DUNGEON
          </h1>
          <div className="flex gap-2">
            <button onClick={() => setShowHeroSelect(true)} className="text-xs px-2 py-1 bg-purple-900/50 rounded text-purple-300 hover:bg-purple-800/50">
              {hero.name}
            </button>
            <button onClick={() => setShowPaytable(true)} className="text-xs px-2 py-1 bg-gray-800/50 rounded text-gray-300 hover:bg-gray-700/50">
              Info
            </button>
          </div>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="flex-shrink-0 bg-black/40 px-3 py-1 border-b border-gray-800">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs">
          <div className="flex gap-3">
            <span className="text-red-400">HP:{stats.vitality}</span>
            <span className="text-orange-400">ATK:{stats.force}</span>
            <span className="text-yellow-400">CRT:{stats.crit}%</span>
            <span className="text-blue-400">DEF:{stats.guard}</span>
          </div>
          <div className="text-purple-400">
            Relics: {totalRelicsCollected}
          </div>
        </div>
      </div>

      {/* Main Game Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-2 sm:p-4 gap-2">
        {/* Win Display */}
        <div className="text-center min-h-[3rem]">
          {gameState.spinWin > 0 && (
            <div className="text-xl sm:text-2xl font-bold text-yellow-400">
              WIN: ${gameState.spinWin.toFixed(2)}
            </div>
          )}
          {gameState.cascadeLevel > 0 && (
            <div className="text-xs text-cyan-400">Cascade x{gameState.cascadeLevel}</div>
          )}
          {message && (
            <div className="text-sm text-purple-300 animate-pulse">{message}</div>
          )}
        </div>

        {/* Grid */}
        <div className="w-full max-w-md lg:max-w-lg xl:max-w-xl">
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-xl p-2 shadow-2xl border border-gray-700">
            <div className="grid grid-cols-8 gap-0.5 sm:gap-1">
              {gameState.grid.map((row, ri) =>
                row.map((cell, ci) => (
                  <div key={`${ri}-${ci}`}>{renderCell(cell, ri, ci)}</div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Total Win */}
        {gameState.totalWin > 0 && gameState.phase === 'idle' && (
          <div className="text-lg font-bold text-yellow-300">
            TOTAL: ${gameState.totalWin.toFixed(2)}
          </div>
        )}
      </main>

      {/* Controls */}
      <footer className="flex-shrink-0 bg-gray-900/95 border-t border-purple-500/30 px-3 py-2">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
          <button
            onClick={() => setShowFeatureBuy(true)}
            disabled={gameState.phase !== 'idle'}
            className="px-3 py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 rounded-lg text-xs font-bold text-white"
          >
            BUY
          </button>

          <div className="text-center flex-1">
            <div className="text-[10px] text-gray-500">BALANCE</div>
            <div className="text-sm font-bold text-white">${balance.toLocaleString()}</div>
          </div>

          <div className="flex items-center gap-1 bg-gray-800 rounded-lg px-2 py-1">
            <button
              onClick={() => setBetAmount(Math.max(0.1, +(betAmount / 2).toFixed(2)))}
              disabled={gameState.phase !== 'idle'}
              className="w-6 h-6 rounded bg-purple-700 text-white text-sm disabled:opacity-50"
            >-</button>
            <div className="w-14 text-center">
              <div className="text-[10px] text-gray-500">BET</div>
              <div className="text-sm font-bold text-white">${betAmount.toFixed(2)}</div>
            </div>
            <button
              onClick={() => setBetAmount(Math.min(50, +(betAmount * 2).toFixed(2)))}
              disabled={gameState.phase !== 'idle'}
              className="w-6 h-6 rounded bg-purple-700 text-white text-sm disabled:opacity-50"
            >+</button>
          </div>

          <button
            onClick={spin}
            disabled={gameState.phase !== 'idle' || betAmount > balance}
            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-500 hover:to-indigo-600 disabled:opacity-50 rounded-xl font-bold text-white border border-purple-400"
          >
            {gameState.phase === 'idle' ? 'SPIN' : '...'}
          </button>

          <div className="flex flex-col gap-1">
            <button
              onClick={() => setAutoPlay(!autoPlay)}
              className={`px-2 py-1 rounded text-[10px] font-bold ${autoPlay ? 'bg-green-600' : 'bg-gray-700'} text-white`}
            >
              {autoPlay ? 'STOP' : 'AUTO'}
            </button>
            <button
              onClick={() => setTurboMode(!turboMode)}
              className={`px-2 py-1 rounded text-[10px] font-bold ${turboMode ? 'bg-yellow-600' : 'bg-gray-700'} text-white`}
            >
              FAST
            </button>
          </div>
        </div>
      </footer>

      {/* Battle Overlay */}
      {battleState && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl p-6 max-w-md w-full border border-red-500/50">
            <h2 className="text-2xl font-bold text-center text-red-400 mb-4">DUNGEON BATTLE</h2>
            
            <div className="flex justify-between items-center mb-4">
              <div className="text-center flex-1">
                <div className="text-3xl font-bold text-white mb-1">{HEROES[selectedHero].name[0]}</div>
                <div className="text-xs text-white/70">{HEROES[selectedHero].name}</div>
                <div className="w-full h-2 bg-gray-700 rounded-full mt-2">
                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${(battleState.heroHp / battleState.heroMaxHp) * 100}%` }} />
                </div>
                <div className="text-xs text-green-400 mt-1">{battleState.heroHp}/{battleState.heroMaxHp}</div>
              </div>
              
              <div className="text-2xl text-yellow-400 font-bold px-4">VS</div>
              
              <div className="text-center flex-1">
                <div className="text-3xl font-bold text-white mb-1">{ENEMIES[battleState.enemy].name[0]}</div>
                <div className="text-xs text-white/70">{ENEMIES[battleState.enemy].name}</div>
                <div className="w-full h-2 bg-gray-700 rounded-full mt-2">
                  <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${(battleState.enemyHp / battleState.enemyMaxHp) * 100}%` }} />
                </div>
                <div className="text-xs text-red-400 mt-1">{battleState.enemyHp}/{battleState.enemyMaxHp}</div>
              </div>
            </div>
            
            <div className="bg-black/50 rounded-lg p-3 h-32 overflow-y-auto">
              {battleState.log.map((log, i) => (
                <div key={i} className="text-xs text-gray-300 mb-1">{log}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Treasure Hall Overlay */}
      {(gameState.phase === 'treasureHall' || gameState.phase === 'oldOne') && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-b from-amber-900/50 to-gray-950 rounded-2xl p-4 max-w-lg w-full border border-amber-500/50">
            <h2 className="text-xl font-bold text-center text-amber-400 mb-2">
              {gameState.phase === 'oldOne' ? 'THE OLD ONE' : 'TREASURE HALL'}
            </h2>
            
            <div className="flex justify-between mb-2 text-sm">
              <div className="text-white">Lives: {'O'.repeat(treasureLives)}{'X'.repeat(3 - treasureLives)}</div>
              <div className="text-amber-400 font-bold">
                Total: ${(treasureTotal * treasureMultiplier).toFixed(2)}
                {treasureMultiplier > 1 && <span className="text-yellow-300"> (x{treasureMultiplier})</span>}
              </div>
            </div>
            
            <div className="grid grid-cols-8 gap-1 bg-black/50 rounded-lg p-2">
              {treasureGrid.map((row, ri) =>
                row.map((cell, ci) => (
                  <div
                    key={`${ri}-${ci}`}
                    className={`aspect-square rounded flex items-center justify-center text-[10px] font-bold
                      ${!cell.unlocked ? 'bg-gray-800 text-gray-600' : 
                        cell.coin ? 'bg-gradient-to-br from-yellow-500 to-amber-600 text-white' :
                        cell.hasKey ? 'bg-gradient-to-br from-purple-500 to-purple-700 text-white' :
                        'bg-gray-700'}
                    `}
                  >
                    {!cell.unlocked && 'X'}
                    {cell.coin && cell.coin.value}
                    {cell.hasKey && 'K'}
                  </div>
                ))
              )}
            </div>
            
            {gameState.phase === 'oldOne' && (
              <div className="text-center mt-4 text-red-400 animate-pulse text-lg font-bold">
                Defeating The Old One...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Big Win */}
      {showBigWin && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="text-center animate-bounce">
            <div className="text-5xl sm:text-7xl font-bold text-yellow-400">BIG WIN!</div>
            <div className="text-4xl sm:text-6xl font-bold text-white mt-4">${bigWinAmount.toFixed(2)}</div>
          </div>
        </div>
      )}

      {/* Feature Buy Modal */}
      {showFeatureBuy && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowFeatureBuy(false)}>
          <div className="bg-gray-900 rounded-2xl p-4 max-w-sm w-full border border-amber-500/50" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-amber-400 text-center mb-4">FEATURE BET</h2>
            <p className="text-xs text-gray-400 text-center mb-4">Buy direct entry to Treasure Hall</p>
            <div className="grid grid-cols-5 gap-2 mb-4">
              {[1, 2, 3, 4, 5].map(tier => {
                const costs = [17.3, 45.5, 83.6, 143.7, 218]
                const cost = costs[tier - 1] * betAmount
                return (
                  <button
                    key={tier}
                    onClick={() => buyFeature(tier)}
                    disabled={balance < cost}
                    className="p-2 bg-gray-800 rounded-lg border border-gray-700 hover:border-amber-500 disabled:opacity-50"
                  >
                    <div className="text-lg font-bold text-amber-400">{tier}</div>
                    <div className="text-[10px] text-gray-400">${cost.toFixed(2)}</div>
                  </button>
                )
              })}
            </div>
            <button onClick={() => setShowFeatureBuy(false)} className="w-full py-2 bg-gray-800 text-gray-400 rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {/* Hero Select Modal */}
      {showHeroSelect && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowHeroSelect(false)}>
          <div className="bg-gray-900 rounded-2xl p-4 max-w-md w-full border border-purple-500/50" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-purple-400 text-center mb-4">SELECT HERO</h2>
            <div className="grid grid-cols-3 gap-3">
              {(Object.keys(HEROES) as HeroType[]).map(key => {
                const h = HEROES[key]
                const unlocked = heroUnlocks[key]
                return (
                  <button
                    key={key}
                    onClick={() => { if (unlocked) { setSelectedHero(key); setShowHeroSelect(false) } }}
                    disabled={!unlocked}
                    className={`p-3 rounded-xl border transition-all ${
                      unlocked
                        ? selectedHero === key
                          ? 'border-yellow-400 bg-yellow-400/10'
                          : 'border-gray-700 hover:border-purple-500'
                        : 'border-gray-800 opacity-50'
                    }`}
                  >
                    <div className={`text-3xl font-bold mb-1 bg-gradient-to-br ${h.color} bg-clip-text text-transparent`}>{h.name[0]}</div>
                    <div className="text-sm font-bold text-white">{h.name}</div>
                    <div className="text-[10px] text-gray-400">{h.title}</div>
                    <div className="text-[10px] text-purple-400 mt-1">{h.ability}</div>
                    {!unlocked && <div className="text-[10px] text-red-400 mt-1">LOCKED</div>}
                  </button>
                )
              })}
            </div>
            <button onClick={() => setShowHeroSelect(false)} className="w-full mt-4 py-2 bg-gray-800 text-gray-400 rounded-lg">Close</button>
          </div>
        </div>
      )}

      {/* Paytable Modal */}
      {showPaytable && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={() => setShowPaytable(false)}>
          <div className="bg-gray-900 rounded-2xl p-4 max-w-lg w-full border border-purple-500/50 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-purple-400 text-center mb-4">GAME INFO</h2>
            
            <div className="space-y-4 text-sm">
              <div>
                <h3 className="text-amber-400 font-bold mb-2">Cluster Pays (5+ adjacent)</h3>
                {REGULAR_SYMBOLS.map(sym => (
                  <div key={sym} className="flex justify-between bg-gray-800/50 rounded p-1 mb-1">
                    <span className={`font-bold bg-gradient-to-r ${SYMBOLS[sym].gradient} bg-clip-text text-transparent`}>{SYMBOLS[sym].label}</span>
                    <span className="text-[10px] text-gray-400">
                      5:{SYMBOLS[sym].payouts[5]}x | 8:{SYMBOLS[sym].payouts[8]}x | 12:{SYMBOLS[sym].payouts[12]}x | 20+:{SYMBOLS[sym].payouts[20]}x
                    </span>
                  </div>
                ))}
              </div>
              
              <div>
                <h3 className="text-amber-400 font-bold mb-2">Special Symbols</h3>
                <div className="text-xs text-gray-400">
                  <p><span className="text-yellow-400 font-bold">W</span> - Wild: Substitutes all symbols</p>
                  <p><span className="text-orange-400 font-bold">+</span> - Warrior: Triggers battle when adjacent to wins</p>
                </div>
              </div>
              
              <div>
                <h3 className="text-amber-400 font-bold mb-2">Features</h3>
                <div className="text-xs text-gray-400 space-y-1">
                  <p><strong>Cascading Wins:</strong> Winning symbols vanish, new ones drop</p>
                  <p><strong>Dungeon Battle:</strong> Warrior adjacent to win triggers RPG battle</p>
                  <p><strong>Spectral Effects:</strong> Win battles to transform symbols or add Wilds</p>
                  <p><strong>Treasure Hall:</strong> Hold and Win bonus with coin merging</p>
                  <p><strong>The Old One:</strong> Final boss awards 4x4 Colossal + 2x Multiplier</p>
                  <p><strong>Power Relics:</strong> Collect stats from wins to boost hero</p>
                </div>
              </div>
              
              <div className="text-center text-xs text-gray-500 border-t border-gray-700 pt-2">
                RTP: 96.10% | Max Win: 20,000x | Volatility: Very High
              </div>
            </div>
            
            <button onClick={() => setShowPaytable(false)} className="w-full mt-4 py-2 bg-gray-800 text-gray-400 rounded-lg">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
