'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useCasino } from '../CasinoContext'
import { useRouter } from 'next/navigation'
import * as PIXI from 'pixi.js'

// =====================================================================
// ELDRITCH DUNGEON - Pixi.js Game Engine Implementation
// Print Studios Recreation | 8x8 Cluster Pays | 96.10% RTP
// Very High Volatility | Max Win: 20,000x | Bet: 0.10 - 50.00
// =====================================================================

// Game Constants
const GAME_WIDTH = 1920
const GAME_HEIGHT = 1080
const GRID_SIZE = 8
const CELL_SIZE = 80
const GRID_OFFSET_X = 700
const GRID_OFFSET_Y = 150

// Symbol Types
type SymbolType = 'runeOrange' | 'runePurple' | 'runeBlue' | 'runeGreen' | 'portrait1' | 'portrait2' | 'potion' | 'tome' | 'wild' | 'warrior'
type HeroType = 'arcanist' | 'ranger' | 'mauler'
type EnemyType = 'nightwing' | 'elderwing' | 'nightfang' | 'elderfang'
type GamePhase = 'idle' | 'spinning' | 'cascading' | 'battle' | 'treasureHall' | 'oldOne'

// Symbol Configuration
interface SymbolConfig {
  color: number
  tier: 'low' | 'high' | 'special'
  label: string
  payouts: Record<number, number>
}

const SYMBOLS: Record<SymbolType, SymbolConfig> = {
  runeOrange: { color: 0xF97316, tier: 'low', label: 'O', payouts: { 5: 0.2, 8: 0.8, 12: 3, 20: 15, 30: 75 } },
  runePurple: { color: 0xA855F7, tier: 'low', label: 'P', payouts: { 5: 0.2, 8: 0.8, 12: 3, 20: 15, 30: 75 } },
  runeBlue:   { color: 0x3B82F6, tier: 'low', label: 'B', payouts: { 5: 0.2, 8: 0.8, 12: 3, 20: 15, 30: 75 } },
  runeGreen:  { color: 0x22C55E, tier: 'low', label: 'G', payouts: { 5: 0.2, 8: 0.8, 12: 3, 20: 15, 30: 75 } },
  portrait1:  { color: 0xEF4444, tier: 'high', label: 'H1', payouts: { 5: 1, 8: 4, 12: 20, 20: 100, 30: 500 } },
  portrait2:  { color: 0x8B5CF6, tier: 'high', label: 'H2', payouts: { 5: 0.8, 8: 3, 12: 15, 20: 75, 30: 400 } },
  potion:     { color: 0x06B6D4, tier: 'high', label: 'PT', payouts: { 5: 0.6, 8: 2, 12: 10, 20: 50, 30: 250 } },
  tome:       { color: 0x78350F, tier: 'high', label: 'TM', payouts: { 5: 0.5, 8: 1.5, 12: 8, 20: 40, 30: 200 } },
  wild:       { color: 0xFBBF24, tier: 'special', label: 'W', payouts: { 5: 10, 8: 50, 12: 250, 20: 1000, 30: 5000 } },
  warrior:    { color: 0xF59E0B, tier: 'special', label: '+', payouts: {} }
}

const REGULAR_SYMBOLS: SymbolType[] = ['runeOrange', 'runePurple', 'runeBlue', 'runeGreen', 'portrait1', 'portrait2', 'potion', 'tome']

// Symbol weights for RTP control
const SYMBOL_WEIGHTS: Record<SymbolType, number> = {
  runeOrange: 16, runePurple: 16, runeBlue: 16, runeGreen: 16,
  portrait1: 8, portrait2: 10, potion: 12, tome: 14,
  wild: 0, warrior: 0
}

// Hero Configuration
interface HeroConfig {
  name: string
  title: string
  color: number
  baseStats: { vitality: number; force: number; crit: number; guard: number }
  ability: string
}

const HEROES: Record<HeroType, HeroConfig> = {
  arcanist: {
    name: 'Arcanist', title: 'Master of Arcane', color: 0x7C3AED,
    baseStats: { vitality: 100, force: 15, crit: 15, guard: 5 },
    ability: '+25% Crit Damage'
  },
  ranger: {
    name: 'Ranger', title: 'Swift Hunter', color: 0x059669,
    baseStats: { vitality: 80, force: 20, crit: 25, guard: 3 },
    ability: 'Double Attack Chance'
  },
  mauler: {
    name: 'Mauler', title: 'Brutal Warrior', color: 0xDC2626,
    baseStats: { vitality: 150, force: 25, crit: 5, guard: 10 },
    ability: 'Berserker Rage'
  }
}

// Enemy Configuration
interface EnemyConfig {
  name: string
  hp: number
  damage: number
  reward: { type: 'transform' | 'wilds'; count: number }
  color: number
}

const ENEMIES: Record<EnemyType, EnemyConfig> = {
  nightwing:  { name: 'Nightwing', hp: 30, damage: 8, reward: { type: 'transform', count: 10 }, color: 0x1F2937 },
  elderwing:  { name: 'Elderwing', hp: 50, damage: 12, reward: { type: 'transform', count: 19 }, color: 0x4C1D95 },
  nightfang:  { name: 'Nightfang', hp: 40, damage: 10, reward: { type: 'wilds', count: 4 }, color: 0x7F1D1D },
  elderfang:  { name: 'Elderfang', hp: 60, damage: 15, reward: { type: 'wilds', count: 10 }, color: 0x9D174D }
}

// =====================================================================
// GAME ENGINE CLASSES
// =====================================================================

// Particle System for effects
class ParticleEffect {
  container: PIXI.Container
  particles: PIXI.Graphics[] = []
  
  constructor(parent: PIXI.Container, x: number, y: number, color: number, count: number) {
    this.container = new PIXI.Container()
    this.container.position.set(x, y)
    parent.addChild(this.container)
    
    for (let i = 0; i < count; i++) {
      const particle = new PIXI.Graphics()
      particle.beginFill(color, 0.8)
      particle.drawCircle(0, 0, 3 + Math.random() * 4)
      particle.endFill()
      
      const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5
      const speed = 2 + Math.random() * 4
      ;(particle as unknown as Record<string, number>).vx = Math.cos(angle) * speed
      ;(particle as unknown as Record<string, number>).vy = Math.sin(angle) * speed
      ;(particle as unknown as Record<string, number>).life = 1
      
      this.particles.push(particle)
      this.container.addChild(particle)
    }
  }
  
  update(delta: number): boolean {
    let alive = false
    for (const p of this.particles) {
      const data = p as unknown as Record<string, number>
      data.life -= delta * 0.02
      if (data.life > 0) {
        alive = true
        p.x += data.vx
        p.y += data.vy
        data.vy += 0.1 // gravity
        p.alpha = data.life
        p.scale.set(data.life)
      }
    }
    if (!alive) {
      this.container.destroy({ children: true })
    }
    return alive
  }
}

// Symbol Sprite Class
class SymbolSprite {
  container: PIXI.Container
  background: PIXI.Graphics
  label: PIXI.Text
  symbolType: SymbolType
  row: number
  col: number
  targetY: number = 0
  velocity: number = 0
  isDropping: boolean = false
  isWinning: boolean = false
  winPulse: number = 0
  
  constructor(symbolType: SymbolType, row: number, col: number) {
    this.symbolType = symbolType
    this.row = row
    this.col = col
    
    this.container = new PIXI.Container()
    
    // Stone tile background
    this.background = new PIXI.Graphics()
    this.drawBackground()
    this.container.addChild(this.background)
    
    // Symbol label
    const config = SYMBOLS[symbolType]
    this.label = new PIXI.Text({
      text: config.label,
      style: {
        fontFamily: 'Arial Black',
        fontSize: 28,
        fill: 0xFFFFFF,
        fontWeight: 'bold'
      }
    })
    this.label.anchor.set(0.5)
    this.label.position.set(CELL_SIZE / 2, CELL_SIZE / 2)
    this.container.addChild(this.label)
    
    this.updatePosition()
  }
  
  drawBackground() {
    const config = SYMBOLS[this.symbolType]
    this.background.clear()
    
    // Stone tile effect
    this.background.beginFill(0x2D2D2D)
    this.background.drawRoundedRect(2, 2, CELL_SIZE - 4, CELL_SIZE - 4, 8)
    this.background.endFill()
    
    // Inner colored area
    this.background.beginFill(config.color, 0.8)
    this.background.drawRoundedRect(6, 6, CELL_SIZE - 12, CELL_SIZE - 12, 6)
    this.background.endFill()
    
    // Highlight
    this.background.beginFill(0xFFFFFF, 0.1)
    this.background.drawRoundedRect(6, 6, CELL_SIZE - 12, 20, 6)
    this.background.endFill()
    
    // Border
    this.background.lineStyle(2, 0x4A4A4A)
    this.background.drawRoundedRect(2, 2, CELL_SIZE - 4, CELL_SIZE - 4, 8)
  }
  
  updatePosition() {
    this.container.x = GRID_OFFSET_X + this.col * CELL_SIZE
    this.container.y = GRID_OFFSET_Y + this.row * CELL_SIZE
  }
  
  setSymbol(symbolType: SymbolType) {
    this.symbolType = symbolType
    const config = SYMBOLS[symbolType]
    this.label.text = config.label
    this.drawBackground()
  }
  
  startDrop(targetRow: number, delay: number) {
    this.container.y = GRID_OFFSET_Y - (CELL_SIZE * 2) - (delay * CELL_SIZE)
    this.targetY = GRID_OFFSET_Y + targetRow * CELL_SIZE
    this.row = targetRow
    this.isDropping = true
    this.velocity = 0
  }
  
  update(delta: number): boolean {
    if (this.isDropping) {
      this.velocity += 0.8 * delta // Gravity
      this.container.y += this.velocity
      
      if (this.container.y >= this.targetY) {
        this.container.y = this.targetY
        this.isDropping = false
        this.velocity = 0
        // Bounce effect
        this.container.scale.y = 0.9
        return true // Signal landing
      }
    }
    
    // Bounce recovery
    if (this.container.scale.y < 1) {
      this.container.scale.y += 0.05 * delta
      if (this.container.scale.y > 1) this.container.scale.y = 1
    }
    
    // Win pulse effect
    if (this.isWinning) {
      this.winPulse += delta * 0.1
      const scale = 1 + Math.sin(this.winPulse) * 0.1
      this.container.scale.set(scale)
      this.background.alpha = 0.7 + Math.sin(this.winPulse) * 0.3
    }
    
    return false
  }
  
  setWinning(winning: boolean) {
    this.isWinning = winning
    if (!winning) {
      this.container.scale.set(1)
      this.background.alpha = 1
      this.winPulse = 0
    }
  }
  
  destroy() {
    this.container.destroy({ children: true })
  }
}

// Hero Character Class
class HeroCharacter {
  container: PIXI.Container
  body: PIXI.Graphics
  breathOffset: number = 0
  hero: HeroType
  isAttacking: boolean = false
  attackFrame: number = 0
  
  constructor(hero: HeroType) {
    this.hero = hero
    this.container = new PIXI.Container()
    this.container.position.set(200, 400)
    
    
    this.body = new PIXI.Graphics()
    this.draw()
    this.container.addChild(this.body)
    
    // Name label
    const config = HEROES[hero]
    const nameText = new PIXI.Text({
      text: config.name,
      style: {
        fontFamily: 'Arial Black',
        fontSize: 24,
        fill: config.color,
        fontWeight: 'bold'
      }
    })
    nameText.anchor.set(0.5)
    nameText.position.set(0, 180)
    this.container.addChild(nameText)
    
    // Title
    const titleText = new PIXI.Text({
      text: config.title,
      style: {
        fontFamily: 'Arial',
        fontSize: 14,
        fill: 0x888888
      }
    })
    titleText.anchor.set(0.5)
    titleText.position.set(0, 205)
    this.container.addChild(titleText)
  }
  
  draw() {
    const config = HEROES[this.hero]
    this.body.clear()
    
    // Shadow
    this.body.beginFill(0x000000, 0.3)
    this.body.drawEllipse(0, 160, 60, 20)
    this.body.endFill()
    
    // Body
    this.body.beginFill(config.color)
    this.body.drawRoundedRect(-50, -100, 100, 200, 20)
    this.body.endFill()
    
    // Head
    this.body.beginFill(0xFFDBBD)
    this.body.drawCircle(0, -120, 40)
    this.body.endFill()
    
    // Eyes
    this.body.beginFill(0x000000)
    this.body.drawCircle(-15, -125, 5)
    this.body.drawCircle(15, -125, 5)
    this.body.endFill()
    
    // Weapon based on class
    this.body.beginFill(0x808080)
    if (this.hero === 'arcanist') {
      // Staff
      this.body.drawRect(55, -80, 8, 160)
      this.body.beginFill(0x7C3AED)
      this.body.drawCircle(59, -90, 15)
    } else if (this.hero === 'ranger') {
      // Bow
      this.body.drawRect(55, -60, 6, 120)
    } else {
      // Axe
      this.body.drawRect(55, -60, 10, 100)
      this.body.beginFill(0xA0A0A0)
      this.body.moveTo(55, -50)
      this.body.lineTo(85, -30)
      this.body.lineTo(85, 10)
      this.body.lineTo(55, 30)
    }
    this.body.endFill()
  }
  
  update(delta: number) {
    // Idle breathing animation
    this.breathOffset += delta * 0.03
    this.body.y = Math.sin(this.breathOffset) * 3
    
    // Attack animation
    if (this.isAttacking) {
      this.attackFrame += delta
      this.container.x = 200 + Math.sin(this.attackFrame * 0.5) * 30
      if (this.attackFrame > 20) {
        this.isAttacking = false
        this.attackFrame = 0
        this.container.x = 200
      }
    }
  }
  
  attack() {
    this.isAttacking = true
    this.attackFrame = 0
  }
  
  setHero(hero: HeroType) {
    this.hero = hero
    this.draw()
    // Update name and title
    const config = HEROES[hero]
    const children = this.container.children
    if (children.length >= 3) {
      (children[1] as PIXI.Text).text = config.name
      ;(children[1] as PIXI.Text).style.fill = config.color
      ;(children[2] as PIXI.Text).text = config.title
    }
  }
}

// Main Game Component
export default function EldritchDungeon() {
  const { balance, setBalance, recordBet } = useCasino()
  const router = useRouter()
  const canvasRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<PIXI.Application | null>(null)
  const gameRef = useRef<GameEngine | null>(null)
  
  // Game State
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [betAmount, setBetAmount] = useState(1)
  const [totalWin, setTotalWin] = useState(0)
  const [message, setMessage] = useState('')
  const [selectedHero, setSelectedHero] = useState<HeroType>('arcanist')
  const [heroUnlocks, setHeroUnlocks] = useState({ arcanist: true, ranger: false, mauler: false })
  const [powerRelics, setPowerRelics] = useState({ vitality: 0, force: 0, crit: 0, guard: 0 })
  const [showPaytable, setShowPaytable] = useState(false)
  const [showHeroSelect, setShowHeroSelect] = useState(false)
  const [autoPlay, setAutoPlay] = useState(false)
  
  // Battle State
  const [battleState, setBattleState] = useState<{
    enemy: EnemyType
    enemyHp: number
    heroHp: number
    log: string[]
  } | null>(null)
  
  // Treasure Hall State
  const [treasureState, setTreasureState] = useState<{
    lives: number
    total: number
    multiplier: number
    grid: Array<Array<{ unlocked: boolean; coin: number | null }>>
  } | null>(null)
  
  const autoPlayRef = useRef(false)
  
  // Game Engine Class
  class GameEngine {
    app: PIXI.Application
    gridContainer: PIXI.Container
    effectsContainer: PIXI.Container
    uiContainer: PIXI.Container
    symbols: SymbolSprite[][] = []
    hero: HeroCharacter
    particles: ParticleEffect[] = []
    dustParticles: PIXI.Graphics[] = []
    torchLights: PIXI.Graphics[] = []
    
    gridData: SymbolType[][] = []
    isAnimating: boolean = false
    
    constructor(app: PIXI.Application) {
      this.app = app
      
      // Background
      const bg = new PIXI.Graphics()
      bg.beginFill(0x0A0A0A)
      bg.drawRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
      bg.endFill()
      app.stage.addChild(bg)
      
      // Dungeon background elements
      this.createDungeonBackground()
      
      // Containers
      this.gridContainer = new PIXI.Container()
      this.effectsContainer = new PIXI.Container()
      this.uiContainer = new PIXI.Container()
      
      app.stage.addChild(this.gridContainer)
      app.stage.addChild(this.effectsContainer)
      app.stage.addChild(this.uiContainer)
      
      // Grid background
      this.createGridBackground()
      
      
      // Initialize grid
      this.initializeGrid()
      
      // Hero
      this.hero = new HeroCharacter(selectedHero)
      app.stage.addChild(this.hero.container)
      
      // Game loop
      app.ticker.add((ticker) => this.update(ticker.deltaTime))
    }
    
    createDungeonBackground() {
      // Dark stone walls
      const walls = new PIXI.Graphics()
      walls.beginFill(0x1A1A1A)
      walls.drawRect(0, 0, 500, GAME_HEIGHT)
      walls.endFill()
      
      // Stone texture effect
      for (let i = 0; i < 50; i++) {
        walls.beginFill(0x222222, 0.5)
        walls.drawRect(
          Math.random() * 480,
          Math.random() * GAME_HEIGHT,
          20 + Math.random() * 40,
          10 + Math.random() * 20
        )
        walls.endFill()
      }
      this.app.stage.addChild(walls)
      
      // Torches
      for (let i = 0; i < 3; i++) {
        const torch = new PIXI.Graphics()
        torch.beginFill(0x8B4513)
        torch.drawRect(-5, 0, 10, 40)
        torch.endFill()
        torch.position.set(100 + i * 150, 100 + i * 200)
        this.app.stage.addChild(torch)
        
        const flame = new PIXI.Graphics()
        flame.beginFill(0xFF6600, 0.8)
        flame.drawEllipse(0, -20, 15, 25)
        flame.endFill()
        flame.position.set(100 + i * 150, 100 + i * 200)
        this.app.stage.addChild(flame)
        this.torchLights.push(flame)
      }
      
      // Floating dust particles
      for (let i = 0; i < 30; i++) {
        const dust = new PIXI.Graphics()
        dust.beginFill(0xFFFFFF, 0.3)
        dust.drawCircle(0, 0, 1 + Math.random() * 2)
        dust.endFill()
        dust.position.set(Math.random() * GAME_WIDTH, Math.random() * GAME_HEIGHT)
        ;(dust as unknown as Record<string, number>).vx = (Math.random() - 0.5) * 0.5
        ;(dust as unknown as Record<string, number>).vy = -0.2 - Math.random() * 0.3
        this.app.stage.addChild(dust)
        this.dustParticles.push(dust)
      }
    }
    
    createGridBackground() {
      const gridBg = new PIXI.Graphics()
      
      // Outer frame
      gridBg.beginFill(0x2D2D2D)
      gridBg.drawRoundedRect(
        GRID_OFFSET_X - 20,
        GRID_OFFSET_Y - 20,
        GRID_SIZE * CELL_SIZE + 40,
        GRID_SIZE * CELL_SIZE + 40,
        15
      )
      gridBg.endFill()
      
      // Inner area
      gridBg.beginFill(0x1A1A1A)
      gridBg.drawRoundedRect(
        GRID_OFFSET_X - 10,
        GRID_OFFSET_Y - 10,
        GRID_SIZE * CELL_SIZE + 20,
        GRID_SIZE * CELL_SIZE + 20,
        10
      )
      gridBg.endFill()
      
      // Grid lines
      gridBg.lineStyle(1, 0x333333)
      for (let i = 0; i <= GRID_SIZE; i++) {
        gridBg.moveTo(GRID_OFFSET_X + i * CELL_SIZE, GRID_OFFSET_Y)
        gridBg.lineTo(GRID_OFFSET_X + i * CELL_SIZE, GRID_OFFSET_Y + GRID_SIZE * CELL_SIZE)
        gridBg.moveTo(GRID_OFFSET_X, GRID_OFFSET_Y + i * CELL_SIZE)
        gridBg.lineTo(GRID_OFFSET_X + GRID_SIZE * CELL_SIZE, GRID_OFFSET_Y + i * CELL_SIZE)
      }
      
      this.gridContainer.addChild(gridBg)
    }
    
    getWeightedSymbol(includeSpecials: boolean = false): SymbolType {
      const rand = Math.random()
      if (includeSpecials) {
        if (rand < 0.008) return 'wild'
        if (rand < 0.015) return 'warrior'
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
      
      return 'runeOrange'
    }
    
    initializeGrid() {
      this.gridData = []
      this.symbols = []
      
      for (let row = 0; row < GRID_SIZE; row++) {
        this.gridData[row] = []
        this.symbols[row] = []
        
        for (let col = 0; col < GRID_SIZE; col++) {
          const symbolType = this.getWeightedSymbol(true)
          this.gridData[row][col] = symbolType
          
          const sprite = new SymbolSprite(symbolType, row, col)
          this.symbols[row][col] = sprite
          this.gridContainer.addChild(sprite.container)
        }
      }
    }
    
    update(delta: number) {
      // Update hero
      this.hero.update(delta)
      
      // Update symbols
      for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
          this.symbols[row][col]?.update(delta)
        }
      }
      
      // Update particles
      this.particles = this.particles.filter(p => p.update(delta))
      
      // Update dust
      for (const dust of this.dustParticles) {
        const data = dust as unknown as Record<string, number>
        dust.x += data.vx
        dust.y += data.vy
        if (dust.y < -10) {
          dust.y = GAME_HEIGHT + 10
          dust.x = Math.random() * GAME_WIDTH
        }
        if (dust.x < -10) dust.x = GAME_WIDTH + 10
        if (dust.x > GAME_WIDTH + 10) dust.x = -10
      }
      
      // Update torch flames
      for (const flame of this.torchLights) {
        flame.scale.x = 0.9 + Math.sin(Date.now() * 0.01 + flame.x) * 0.2
        flame.scale.y = 0.9 + Math.cos(Date.now() * 0.015 + flame.y) * 0.15
        flame.alpha = 0.7 + Math.sin(Date.now() * 0.02) * 0.3
      }
    }
    
    async spin(): Promise<{ win: number; battleTriggered: EnemyType | null }> {
      this.isAnimating = true
      
      // Generate new symbols and drop them
      for (let col = 0; col < GRID_SIZE; col++) {
        for (let row = 0; row < GRID_SIZE; row++) {
          const symbolType = this.getWeightedSymbol(true)
          this.gridData[row][col] = symbolType
          this.symbols[row][col].setSymbol(symbolType)
          this.symbols[row][col].startDrop(row, (GRID_SIZE - row) + col * 0.3)
        }
      }
      
      // Wait for drops
      await new Promise(r => setTimeout(r, 800))
      
      // Process cascades
      let totalWin = 0
      let battleTriggered: EnemyType | null = null
      let cascadeCount = 0
      
      while (true) {
        const clusters = this.findClusters()
        if (clusters.length === 0) break
        
        cascadeCount++
        const winAmount = this.calculateWin(clusters)
        totalWin += winAmount
        
        // Check for warrior trigger
        if (!battleTriggered) {
          battleTriggered = this.checkWarriorTrigger(clusters)
        }
        
        // Mark winning symbols
        const winningCells = new Set<string>()
        for (const cluster of clusters) {
          for (const [row, col] of cluster.cells) {
            winningCells.add(`${row},${col}`)
            this.symbols[row][col].setWinning(true)
            
            // Particle effect
            const effect = new ParticleEffect(
              this.effectsContainer,
              GRID_OFFSET_X + col * CELL_SIZE + CELL_SIZE / 2,
              GRID_OFFSET_Y + row * CELL_SIZE + CELL_SIZE / 2,
              SYMBOLS[cluster.symbol].color,
              15
            )
            this.particles.push(effect)
          }
        }
        
        // Hero attack animation
        if (totalWin > 0) {
          this.hero.attack()
        }
        
        await new Promise(r => setTimeout(r, 500))
        
        // Cascade
        await this.cascade(winningCells)
        
        await new Promise(r => setTimeout(r, 300))
      }
      
      this.isAnimating = false
      return { win: totalWin, battleTriggered }
    }
    
    findClusters(): { symbol: SymbolType; cells: [number, number][] }[] {
      const visited = new Set<string>()
      const clusters: { symbol: SymbolType; cells: [number, number][] }[] = []
      
      const dfs = (row: number, col: number, targetSymbol: SymbolType, cluster: [number, number][]) => {
        const key = `${row},${col}`
        if (visited.has(key) || row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return
        
        const cell = this.gridData[row][col]
        if (cell !== targetSymbol && cell !== 'wild') return
        
        visited.add(key)
        cluster.push([row, col])
        
        dfs(row - 1, col, targetSymbol, cluster)
        dfs(row + 1, col, targetSymbol, cluster)
        dfs(row, col - 1, targetSymbol, cluster)
        dfs(row, col + 1, targetSymbol, cluster)
      }
      
      for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
          const key = `${row},${col}`
          const cell = this.gridData[row][col]
          
          if (!visited.has(key) && cell !== 'wild' && cell !== 'warrior') {
            const cluster: [number, number][] = []
            dfs(row, col, cell, cluster)
            
            if (cluster.length >= 5) {
              clusters.push({ symbol: cell, cells: cluster })
            }
          }
        }
      }
      
      return clusters
    }
    
    calculateWin(clusters: { symbol: SymbolType; cells: [number, number][] }[]): number {
      let total = 0
      for (const cluster of clusters) {
        const config = SYMBOLS[cluster.symbol]
        const size = cluster.cells.length
        
        let payout = 0
        if (size >= 30) payout = config.payouts[30] || config.payouts[20] || 0
        else if (size >= 20) payout = config.payouts[20] || 0
        else if (size >= 12) payout = config.payouts[12] || 0
        else if (size >= 8) payout = config.payouts[8] || 0
        else if (size >= 5) payout = config.payouts[5] || 0
        
        total += payout * betAmount
      }
      return total
    }
    
    checkWarriorTrigger(clusters: { symbol: SymbolType; cells: [number, number][] }[]): EnemyType | null {
      const winningCells = new Set<string>()
      for (const cluster of clusters) {
        for (const [row, col] of cluster.cells) {
          winningCells.add(`${row},${col}`)
        }
      }
      
      for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
          if (this.gridData[row][col] === 'warrior') {
            const adjacents = [[row-1,col],[row+1,col],[row,col-1],[row,col+1]]
            for (const [ar, ac] of adjacents) {
              if (winningCells.has(`${ar},${ac}`)) {
                if (Math.random() < 0.4) {
                  const enemies: EnemyType[] = ['nightwing', 'nightfang', 'elderwing', 'elderfang']
                  const weights = [40, 30, 20, 10]
                  let roll = Math.random() * 100
                  for (let i = 0; i < enemies.length; i++) {
                    roll -= weights[i]
                    if (roll <= 0) return enemies[i]
                  }
                  return 'nightwing'
                }
              }
            }
          }
        }
      }
      return null
    }
    
    async cascade(winningCells: Set<string>) {
      // Clear winning symbols
      for (const key of winningCells) {
        const [row, col] = key.split(',').map(Number)
        this.symbols[row][col].setWinning(false)
      }
      
      // For each column, drop symbols down
      for (let col = 0; col < GRID_SIZE; col++) {
        const remaining: SymbolType[] = []
        for (let row = GRID_SIZE - 1; row >= 0; row--) {
          if (!winningCells.has(`${row},${col}`)) {
            remaining.push(this.gridData[row][col])
          }
        }
        
        // Fill from bottom
        const needed = GRID_SIZE - remaining.length
        for (let i = 0; i < needed; i++) {
          remaining.unshift(this.getWeightedSymbol(true))
        }
        
        // Update grid and animate
        for (let row = 0; row < GRID_SIZE; row++) {
          const newSymbol = remaining[row]
          this.gridData[row][col] = newSymbol
          this.symbols[row][col].setSymbol(newSymbol)
          
          if (row < needed) {
            this.symbols[row][col].startDrop(row, needed - row)
          } else {
            // Slide down existing
            this.symbols[row][col].container.y = GRID_OFFSET_Y + row * CELL_SIZE
          }
        }
      }
      
      await new Promise(r => setTimeout(r, 500))
    }
    
    applySpectralEffect(reward: { type: 'transform' | 'wilds'; count: number }) {
      const positions: [number, number][] = []
      for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
          if (this.gridData[row][col] !== 'wild' && this.gridData[row][col] !== 'warrior') {
            positions.push([row, col])
          }
        }
      }
      
      const shuffled = positions.sort(() => Math.random() - 0.5).slice(0, reward.count)
      
      if (reward.type === 'transform') {
        const targetSymbol = ['portrait1', 'portrait2'][Math.floor(Math.random() * 2)] as SymbolType
        for (const [row, col] of shuffled) {
          this.gridData[row][col] = targetSymbol
          this.symbols[row][col].setSymbol(targetSymbol)
          
          const effect = new ParticleEffect(
            this.effectsContainer,
            GRID_OFFSET_X + col * CELL_SIZE + CELL_SIZE / 2,
            GRID_OFFSET_Y + row * CELL_SIZE + CELL_SIZE / 2,
            0x8B5CF6,
            10
          )
          this.particles.push(effect)
        }
      } else {
        for (const [row, col] of shuffled) {
          this.gridData[row][col] = 'wild'
          this.symbols[row][col].setSymbol('wild')
          
          const effect = new ParticleEffect(
            this.effectsContainer,
            GRID_OFFSET_X + col * CELL_SIZE + CELL_SIZE / 2,
            GRID_OFFSET_Y + row * CELL_SIZE + CELL_SIZE / 2,
            0xFBBF24,
            10
          )
          this.particles.push(effect)
        }
      }
    }
    
    setHero(hero: HeroType) {
      this.hero.setHero(hero)
    }
    
    destroy() {
      this.app.destroy(true, { children: true, texture: true })
    }
  }
  
  // Initialize Pixi.js
  useEffect(() => {
    if (!canvasRef.current || appRef.current) return
    
    const initPixi = async () => {
      const app = new PIXI.Application()
      
      await app.init({
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        backgroundColor: 0x0A0A0A,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true
      })
      
      canvasRef.current!.appendChild(app.canvas as HTMLCanvasElement)
      
      // Responsive scaling
      const resize = () => {
        const parent = canvasRef.current!
        const scale = Math.min(parent.clientWidth / GAME_WIDTH, parent.clientHeight / GAME_HEIGHT)
        ;(app.canvas as HTMLCanvasElement).style.width = `${GAME_WIDTH * scale}px`
        ;(app.canvas as HTMLCanvasElement).style.height = `${GAME_HEIGHT * scale}px`
      }
      
      resize()
      window.addEventListener('resize', resize)
      
      appRef.current = app
      gameRef.current = new GameEngine(app)
    }
    
    initPixi()
    
    return () => {
      gameRef.current?.destroy()
      appRef.current = null
      gameRef.current = null
    }
  }, [])
  
  // Update hero when selection changes
  useEffect(() => {
    gameRef.current?.setHero(selectedHero)
  }, [selectedHero])
  
  // Auto play
  useEffect(() => {
    autoPlayRef.current = autoPlay
  }, [autoPlay])
  
  // Spin handler
  const handleSpin = useCallback(async () => {
    if (phase !== 'idle' || betAmount > balance || !gameRef.current) return
    
    setPhase('spinning')
    setMessage('')
    setTotalWin(0)
    
    // Deduct bet
    setBalance(balance - betAmount)
    recordBet(betAmount)
    
    // Perform spin
    const result = await gameRef.current.spin()
    
    // Apply win
    if (result.win > 0) {
      const cappedWin = Math.min(result.win, betAmount * 20000)
      setTotalWin(cappedWin)
      setBalance(balance - betAmount + cappedWin)
      
      // Collect power relics
      const relicGain = Math.floor(result.win / betAmount / 10)
      if (relicGain > 0) {
        setPowerRelics(prev => ({
          vitality: prev.vitality + relicGain,
          force: prev.force + Math.floor(relicGain / 2),
          crit: prev.crit + Math.floor(relicGain / 3),
          guard: prev.guard + Math.floor(relicGain / 4)
        }))
      }
    }
    
    // Check for battle
    if (result.battleTriggered) {
      setPhase('battle')
      const enemy = ENEMIES[result.battleTriggered]
      const stats = HEROES[selectedHero].baseStats
      setBattleState({
        enemy: result.battleTriggered,
        enemyHp: enemy.hp,
        heroHp: stats.vitality + powerRelics.vitality,
        log: [`A ${enemy.name} emerges from the shadows!`]
      })
      return
    }
    
    setPhase('idle')
    
    // Auto play
    if (autoPlayRef.current && balance >= betAmount) {
      setTimeout(() => handleSpin(), 1500)
    }
  }, [phase, betAmount, balance, setBalance, recordBet, selectedHero, powerRelics])
  
  // Battle processing
  useEffect(() => {
    if (phase !== 'battle' || !battleState || !gameRef.current) return
    
    const timeout = setTimeout(() => {
      const stats = HEROES[selectedHero].baseStats
      const totalForce = stats.force + powerRelics.force
      const totalCrit = stats.crit + powerRelics.crit
      const totalGuard = stats.guard + powerRelics.guard
      
      const isCrit = Math.random() * 100 < totalCrit
      const damage = Math.floor(totalForce * (isCrit ? 2 : 1))
      const newEnemyHp = Math.max(0, battleState.enemyHp - damage)
      
      setBattleState(prev => {
        if (!prev) return null
        const newLog = [...prev.log, `You deal ${damage} damage${isCrit ? ' (CRITICAL!)' : ''}!`]
        
        if (newEnemyHp <= 0) {
          newLog.push('Victory!')
          return { ...prev, enemyHp: 0, log: newLog }
        }
        
        // Enemy attacks
        const enemy = ENEMIES[prev.enemy]
        const blocked = Math.random() * 100 < totalGuard * 2
        const enemyDamage = blocked ? Math.floor(enemy.damage * 0.3) : enemy.damage
        const newHeroHp = Math.max(0, prev.heroHp - enemyDamage)
        newLog.push(`${enemy.name} deals ${enemyDamage} damage${blocked ? ' (BLOCKED!)' : ''}!`)
        
        return { ...prev, enemyHp: newEnemyHp, heroHp: newHeroHp, log: newLog }
      })
    }, 1200)
    
    return () => clearTimeout(timeout)
  }, [phase, battleState, selectedHero, powerRelics])
  
  // Battle end check
  useEffect(() => {
    if (!battleState) return
    
    if (battleState.enemyHp <= 0) {
      const timeout = setTimeout(() => {
        const enemy = ENEMIES[battleState.enemy]
        gameRef.current?.applySpectralEffect(enemy.reward)
        setMessage(`${enemy.name} defeated! ${enemy.reward.type === 'transform' ? `${enemy.reward.count} symbols transform!` : `${enemy.reward.count} Wilds added!`}`)
        setBattleState(null)
        
        // Unlock heroes
        if (!heroUnlocks.ranger && Math.random() < 0.3) {
          setHeroUnlocks(prev => ({ ...prev, ranger: true }))
        }
        if (heroUnlocks.ranger && !heroUnlocks.mauler && Math.random() < 0.2) {
          setHeroUnlocks(prev => ({ ...prev, mauler: true }))
        }
        
        // Start Treasure Hall
        setTimeout(() => {
          setPhase('treasureHall')
          const grid = []
          for (let row = 0; row < 8; row++) {
            const r = []
            for (let col = 0; col < 8; col++) {
              const isCenter = row >= 2 && row <= 5 && col >= 2 && col <= 5
              r.push({ unlocked: isCenter, coin: null })
            }
            grid.push(r)
          }
          setTreasureState({ lives: 3, total: 0, multiplier: 1, grid })
        }, 2000)
      }, 1500)
      
      return () => clearTimeout(timeout)
    }
    
    if (battleState.heroHp <= 0) {
      const timeout = setTimeout(() => {
        setMessage('Battle lost...')
        setBattleState(null)
        setPhase('idle')
      }, 1500)
      
      return () => clearTimeout(timeout)
    }
  }, [battleState, heroUnlocks])
  
  // Treasure Hall processing
  useEffect(() => {
    if (phase !== 'treasureHall' || !treasureState) return
    
    const timeout = setTimeout(() => {
      let landed = false
      const newGrid = treasureState.grid.map(row => row.map(cell => ({ ...cell })))
      
      // Place coins/keys
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          if (newGrid[row][col].unlocked && newGrid[row][col].coin === null) {
            const rand = Math.random()
            if (rand < 0.12) {
              const values = [1, 2, 3, 5, 10, 25, 50, 100]
              const weights = [30, 25, 20, 12, 8, 3, 1.5, 0.5]
              let roll = Math.random() * 100
              let value = 1
              for (let i = 0; i < values.length; i++) {
                roll -= weights[i]
                if (roll <= 0) { value = values[i]; break }
              }
              newGrid[row][col].coin = value * betAmount
              landed = true
            } else if (rand < 0.15) {
              // Key - unlock adjacent
              const adj = [[row-1,col],[row+1,col],[row,col-1],[row,col+1]]
              for (const [ar, ac] of adj) {
                if (ar >= 0 && ar < 8 && ac >= 0 && ac < 8) {
                  newGrid[ar][ac].unlocked = true
                }
              }
              landed = true
            }
          }
        }
      }
      
      // Calculate total
      let total = 0
      let unlockedCount = 0
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          if (newGrid[row][col].coin) total += newGrid[row][col].coin!
          if (newGrid[row][col].unlocked) unlockedCount++
        }
      }
      
      const newLives = landed ? 3 : treasureState.lives - 1
      
      if (newLives <= 0) {
        // End or Old One
        if (unlockedCount >= 48 || Math.random() < 0.15) {
          // Old One
          setPhase('oldOne')
          setMessage('THE OLD ONE AWAKENS!')
          setTimeout(() => {
            const finalTotal = (total + 1000 * betAmount) * 2
            setTotalWin(finalTotal)
            setBalance(balance + finalTotal)
            setMessage(`The Old One defeated! Won: $${finalTotal.toFixed(2)}`)
            setTreasureState(null)
            setPhase('idle')
          }, 3000)
        } else {
          const finalTotal = total * treasureState.multiplier
          setTotalWin(finalTotal)
          setBalance(balance + finalTotal)
          setMessage(`Treasure Hall complete! Won: $${finalTotal.toFixed(2)}`)
          setTreasureState(null)
          setPhase('idle')
        }
        return
      }
      
      setTreasureState({ ...treasureState, lives: newLives, total, grid: newGrid })
    }, 1200)
    
    return () => clearTimeout(timeout)
  }, [phase, treasureState, betAmount, balance, setBalance])
  
  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 bg-gradient-to-r from-gray-900 via-purple-900/30 to-gray-900 px-4 py-2 border-b border-purple-500/30 flex items-center justify-between">
        <button onClick={() => router.push('/casino')} className="text-white/70 hover:text-white px-4 py-2">
          Exit
        </button>
        <h1 className="text-xl font-bold bg-gradient-to-r from-red-400 via-purple-400 to-red-400 bg-clip-text text-transparent">
          ELDRITCH DUNGEON
        </h1>
        <div className="flex gap-2">
          <button onClick={() => setShowHeroSelect(true)} className="text-xs px-3 py-1 bg-purple-900/50 rounded text-purple-300">
            {HEROES[selectedHero].name}
          </button>
          <button onClick={() => setShowPaytable(true)} className="text-xs px-3 py-1 bg-gray-800/50 rounded text-gray-300">
            Info
          </button>
        </div>
      </header>

      {/* Power Relics HUD */}
      <div className="absolute top-16 left-4 bg-black/60 rounded-lg p-3 border border-gray-700 z-10">
        <div className="text-xs text-purple-400 font-bold mb-2">POWER RELICS</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="text-red-400">HP: +{powerRelics.vitality}</div>
          <div className="text-orange-400">ATK: +{powerRelics.force}</div>
          <div className="text-yellow-400">CRT: +{powerRelics.crit}%</div>
          <div className="text-blue-400">DEF: +{powerRelics.guard}</div>
        </div>
      </div>

      {/* Game Canvas */}
      <main className="flex-1 flex items-center justify-center overflow-hidden">
        <div ref={canvasRef} className="relative w-full h-full flex items-center justify-center" />
      </main>

      {/* Win Display */}
      {totalWin > 0 && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 text-center z-20">
          <div className="text-4xl font-bold text-yellow-400 animate-bounce drop-shadow-lg">
            WIN: ${totalWin.toFixed(2)}
          </div>
        </div>
      )}

      {/* Message Display */}
      {message && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 text-center z-20">
          <div className="text-2xl font-bold text-purple-400 animate-pulse drop-shadow-lg">
            {message}
          </div>
        </div>
      )}

      {/* Controls */}
      <footer className="flex-shrink-0 bg-gradient-to-t from-gray-950 to-gray-900 border-t border-purple-500/30 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          {/* Balance */}
          <div className="text-center">
            <div className="text-xs text-gray-500">BALANCE</div>
            <div className="text-lg font-bold text-white">${balance.toLocaleString()}</div>
          </div>

          {/* Bet Controls */}
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
            <button
              onClick={() => setBetAmount(Math.max(0.1, +(betAmount / 2).toFixed(2)))}
              disabled={phase !== 'idle'}
              className="w-8 h-8 rounded bg-purple-700 text-white font-bold disabled:opacity-50"
            >-</button>
            <div className="w-20 text-center">
              <div className="text-xs text-gray-500">BET</div>
              <div className="text-lg font-bold text-white">${betAmount.toFixed(2)}</div>
            </div>
            <button
              onClick={() => setBetAmount(Math.min(50, +(betAmount * 2).toFixed(2)))}
              disabled={phase !== 'idle'}
              className="w-8 h-8 rounded bg-purple-700 text-white font-bold disabled:opacity-50"
            >+</button>
          </div>

          {/* Spin Button */}
          <button
            onClick={handleSpin}
            disabled={phase !== 'idle' || betAmount > balance}
            className="px-12 py-3 bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-500 hover:to-indigo-600 disabled:opacity-50 rounded-xl font-bold text-xl text-white border-2 border-purple-400 shadow-lg shadow-purple-500/30"
          >
            {phase === 'idle' ? 'SPIN' : phase.toUpperCase()}
          </button>

          {/* Auto Play */}
          <button
            onClick={() => setAutoPlay(!autoPlay)}
            className={`px-4 py-2 rounded-lg font-bold ${autoPlay ? 'bg-green-600' : 'bg-gray-700'} text-white`}
          >
            {autoPlay ? 'STOP' : 'AUTO'}
          </button>
        </div>
      </footer>

      {/* Battle Overlay */}
      {battleState && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl p-8 max-w-lg w-full border-2 border-red-500/50">
            <h2 className="text-3xl font-bold text-center text-red-400 mb-6">DUNGEON BATTLE</h2>
            
            <div className="flex justify-between items-center mb-6">
              <div className="text-center flex-1">
                <div className="text-5xl font-bold text-white mb-2">{HEROES[selectedHero].name[0]}</div>
                <div className="text-sm text-white/70">{HEROES[selectedHero].name}</div>
                <div className="w-full h-4 bg-gray-700 rounded-full mt-2">
                  <div 
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${(battleState.heroHp / (HEROES[selectedHero].baseStats.vitality + powerRelics.vitality)) * 100}%` }}
                  />
                </div>
                <div className="text-sm text-green-400 mt-1">{battleState.heroHp} HP</div>
              </div>
              
              <div className="text-4xl text-yellow-400 font-bold px-6">VS</div>
              
              <div className="text-center flex-1">
                <div className="text-5xl font-bold text-white mb-2">{ENEMIES[battleState.enemy].name[0]}</div>
                <div className="text-sm text-white/70">{ENEMIES[battleState.enemy].name}</div>
                <div className="w-full h-4 bg-gray-700 rounded-full mt-2">
                  <div 
                    className="h-full bg-red-500 rounded-full transition-all"
                    style={{ width: `${(battleState.enemyHp / ENEMIES[battleState.enemy].hp) * 100}%` }}
                  />
                </div>
                <div className="text-sm text-red-400 mt-1">{battleState.enemyHp} HP</div>
              </div>
            </div>
            
            <div className="bg-black/50 rounded-lg p-4 h-40 overflow-y-auto">
              {battleState.log.map((log, i) => (
                <div key={i} className="text-sm text-gray-300 mb-1">{log}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Treasure Hall Overlay */}
      {treasureState && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-b from-amber-900/50 to-gray-950 rounded-2xl p-6 max-w-xl w-full border-2 border-amber-500/50">
            <h2 className="text-2xl font-bold text-center text-amber-400 mb-4">
              {phase === 'oldOne' ? 'THE OLD ONE' : 'TREASURE HALL'}
            </h2>
            
            <div className="flex justify-between mb-4">
              <div className="text-white">Lives: {'O'.repeat(treasureState.lives)}{'X'.repeat(3 - treasureState.lives)}</div>
              <div className="text-amber-400 font-bold">Total: ${treasureState.total.toFixed(2)}</div>
            </div>
            
            <div className="grid grid-cols-8 gap-1 bg-black/50 rounded-lg p-2">
              {treasureState.grid.map((row, ri) =>
                row.map((cell, ci) => (
                  <div
                    key={`${ri}-${ci}`}
                    className={`aspect-square rounded flex items-center justify-center text-xs font-bold transition-all
                      ${!cell.unlocked ? 'bg-gray-800 text-gray-600' : 
                        cell.coin ? 'bg-gradient-to-br from-yellow-500 to-amber-600 text-white animate-pulse' :
                        'bg-gray-700'}
                    `}
                  >
                    {!cell.unlocked && 'X'}
                    {cell.coin && `$${cell.coin}`}
                  </div>
                ))
              )}
            </div>
            
            {phase === 'oldOne' && (
              <div className="text-center mt-4 text-2xl font-bold text-red-400 animate-pulse">
                Defeating The Old One...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hero Select Modal */}
      {showHeroSelect && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowHeroSelect(false)}>
          <div className="bg-gray-900 rounded-2xl p-6 max-w-lg w-full border border-purple-500/50" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-bold text-purple-400 text-center mb-6">SELECT HERO</h2>
            <div className="grid grid-cols-3 gap-4">
              {(Object.keys(HEROES) as HeroType[]).map(key => {
                const h = HEROES[key]
                const unlocked = heroUnlocks[key]
                return (
                  <button
                    key={key}
                    onClick={() => { if (unlocked) { setSelectedHero(key); setShowHeroSelect(false) } }}
                    disabled={!unlocked}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      unlocked
                        ? selectedHero === key
                          ? 'border-yellow-400 bg-yellow-400/10'
                          : 'border-gray-700 hover:border-purple-500'
                        : 'border-gray-800 opacity-50'
                    }`}
                  >
                    <div className="text-4xl font-bold text-white mb-2">{h.name[0]}</div>
                    <div className="text-sm font-bold text-white">{h.name}</div>
                    <div className="text-xs text-gray-400">{h.title}</div>
                    <div className="text-xs text-purple-400 mt-2">{h.ability}</div>
                    {!unlocked && <div className="text-xs text-red-400 mt-1">LOCKED</div>}
                  </button>
                )
              })}
            </div>
            <button onClick={() => setShowHeroSelect(false)} className="w-full mt-6 py-2 bg-gray-800 text-gray-400 rounded-lg">Close</button>
          </div>
        </div>
      )}

      {/* Paytable Modal */}
      {showPaytable && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={() => setShowPaytable(false)}>
          <div className="bg-gray-900 rounded-2xl p-6 max-w-lg w-full border border-purple-500/50 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-bold text-purple-400 text-center mb-4">GAME INFO</h2>
            
            <div className="space-y-4 text-sm">
              <div>
                <h3 className="text-amber-400 font-bold mb-2">Cluster Pays (5+ adjacent)</h3>
                {REGULAR_SYMBOLS.map(sym => (
                  <div key={sym} className="flex justify-between bg-gray-800/50 rounded p-2 mb-1">
                    <span className="font-bold" style={{ color: `#${SYMBOLS[sym].color.toString(16).padStart(6, '0')}` }}>
                      {SYMBOLS[sym].label}
                    </span>
                    <span className="text-xs text-gray-400">
                      5:{SYMBOLS[sym].payouts[5]}x | 8:{SYMBOLS[sym].payouts[8]}x | 12:{SYMBOLS[sym].payouts[12]}x | 20+:{SYMBOLS[sym].payouts[20]}x
                    </span>
                  </div>
                ))}
              </div>
              
              <div>
                <h3 className="text-amber-400 font-bold mb-2">Features</h3>
                <div className="text-xs text-gray-400 space-y-1">
                  <p><strong>Cascading Wins:</strong> Winning symbols shatter, new ones drop</p>
                  <p><strong>Dungeon Battle:</strong> Warrior adjacent to win triggers RPG battle</p>
                  <p><strong>Spectral Effects:</strong> Win battles to transform symbols or add Wilds</p>
                  <p><strong>Treasure Hall:</strong> Hold and Win with coin merging</p>
                  <p><strong>The Old One:</strong> Final boss - 4x4 Colossal Coin + 2x Multiplier</p>
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
