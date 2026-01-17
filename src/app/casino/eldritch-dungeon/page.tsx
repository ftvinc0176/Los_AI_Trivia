'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useCasino } from '../CasinoContext'
import { useRouter } from 'next/navigation'

declare global {
  interface Window {
    Phaser: typeof import('phaser')
    gameBalance: number
    gameBetAmount: number
    onWin: (amount: number) => void
    onBet: (amount: number) => void
  }
}

const GAME_WIDTH = 1280
const GAME_HEIGHT = 720
const GRID_COLS = 8
const GRID_ROWS = 8
const TILE_SIZE = 64
const GRID_X = 350
const GRID_Y = 80
const PLINTH_X = GRID_X - 100
const EXIT_COL = GRID_COLS - 1

type SymbolType = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'white' | 'wild' | 'warrior'
type GameState = 'IDLE' | 'SPINNING' | 'TUMBLING' | 'HERO_MOVING' | 'COMBAT' | 'BONUS_TRANSITION' | 'TREASURE_HALL' | 'SPIN_COMPLETE'
type HeroState = 'ON_PLINTH' | 'ACTIVE' | 'FIGHTING' | 'REACHED_EXIT' | 'DEAD'
type SpinPhase = 'WAITING' | 'SYMBOLS_DROPPING' | 'FINDING_WINS' | 'CLEARING_WINS' | 'HERO_PATHFINDING' | 'REFILLING' | 'FINISHED'

const SYMBOL_PAYOUTS: Record<SymbolType, Record<number, number>> = {
  red: { 5: 0.2, 8: 0.8, 12: 3, 20: 15, 30: 75 },
  blue: { 5: 0.2, 8: 0.8, 12: 3, 20: 15, 30: 75 },
  green: { 5: 0.3, 8: 1, 12: 4, 20: 20, 30: 100 },
  yellow: { 5: 0.4, 8: 1.5, 12: 6, 20: 30, 30: 150 },
  purple: { 5: 0.5, 8: 2, 12: 8, 20: 40, 30: 200 },
  white: { 5: 1, 8: 4, 12: 20, 20: 100, 30: 500 },
  wild: { 5: 5, 8: 25, 12: 100, 20: 500, 30: 2500 },
  warrior: {}
}

const SYMBOL_WEIGHTS = [20, 20, 18, 15, 12, 8, 2, 3]
const REGULAR_SYMBOLS: SymbolType[] = ['red', 'blue', 'green', 'yellow', 'purple', 'white']

export default function EldritchDungeon() {
  const { balance, setBalance, recordBet } = useCasino()
  const router = useRouter()
  const gameContainerRef = useRef<HTMLDivElement>(null)
  const gameInstanceRef = useRef<Phaser.Game | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [betAmount, setBetAmount] = useState(1)
  const [totalWin, setTotalWin] = useState(0)
  const [gameState, setGameState] = useState<GameState>('IDLE')
  const [showPaytable, setShowPaytable] = useState(false)
  const [showBonusBuy, setShowBonusBuy] = useState(false)

  useEffect(() => {
    window.gameBalance = balance
    window.gameBetAmount = betAmount
    window.onWin = (amount: number) => {
      setTotalWin(prev => prev + amount)
      setBalance(balance + amount)
    }
    window.onBet = (amount: number) => {
      setBalance(balance - amount)
      recordBet(amount)
    }
  }, [balance, betAmount, setBalance, recordBet])

  useEffect(() => {
    if (typeof window === 'undefined' || gameInstanceRef.current) return

    const initPhaser = async () => {
      const Phaser = (await import('phaser')).default
      window.Phaser = Phaser

      class BootScene extends Phaser.Scene {
        constructor() { super({ key: 'BootScene' }) }

        init() {
          this.createAllTextures()
          this.createAllAnimations()
          this.createAudioSystem()
        }

        createAudioSystem() {
          // Create audio context for procedural sounds
          const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
          
          // Store audio context globally for other scenes
          this.registry.set('audioContext', audioContext)
          
          // Create sound generator functions
          const createOscillatorSound = (freq: number, duration: number, type: OscillatorType = 'sine') => {
            const oscillator = audioContext.createOscillator()
            const gainNode = audioContext.createGain()
            oscillator.connect(gainNode)
            gainNode.connect(audioContext.destination)
            oscillator.frequency.value = freq
            oscillator.type = type
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration)
            oscillator.start()
            oscillator.stop(audioContext.currentTime + duration)
          }
          
          // Register sound functions
          this.registry.set('playWinSound', () => createOscillatorSound(880, 0.15, 'square'))
          this.registry.set('playHitSound', () => createOscillatorSound(150, 0.1, 'sawtooth'))
          this.registry.set('playCritSound', () => { createOscillatorSound(1200, 0.1, 'square'); createOscillatorSound(1400, 0.15, 'square') })
          this.registry.set('playSpinSound', () => createOscillatorSound(440, 0.2, 'triangle'))
          this.registry.set('playBossSound', () => { createOscillatorSound(100, 0.3, 'sawtooth'); createOscillatorSound(80, 0.4, 'sawtooth') })
          this.registry.set('playVictorySound', () => { createOscillatorSound(523, 0.2, 'sine'); setTimeout(() => createOscillatorSound(659, 0.2, 'sine'), 100); setTimeout(() => createOscillatorSound(784, 0.3, 'sine'), 200) })
          this.registry.set('playRelicSound', () => createOscillatorSound(1000, 0.2, 'sine'))
          this.registry.set('playTransitionSound', () => { createOscillatorSound(200, 0.5, 'triangle'); createOscillatorSound(300, 0.3, 'triangle') })
        }

        createAllTextures() {
          const bg = this.make.graphics({ x: 0, y: 0 })
          bg.fillGradientStyle(0x1a0a0a, 0x1a0a0a, 0x2a1a1a, 0x2a1a1a)
          bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
          for (let i = 0; i < 50; i++) {
            bg.fillStyle(0x333333, Math.random() * 0.3)
            bg.fillCircle(Math.random() * GAME_WIDTH, Math.random() * GAME_HEIGHT, Math.random() * 3 + 1)
          }
          bg.generateTexture('background', GAME_WIDTH, GAME_HEIGHT)
          bg.destroy()

          const tile = this.make.graphics({ x: 0, y: 0 })
          tile.fillStyle(0x3a3a4a)
          tile.fillRoundedRect(2, 2, 60, 60, 4)
          tile.fillStyle(0x4a4a5a)
          tile.fillRoundedRect(4, 4, 56, 56, 3)
          tile.lineStyle(1, 0x2a2a3a)
          tile.strokeRoundedRect(2, 2, 60, 60, 4)
          tile.generateTexture('tile', 64, 64)
          tile.destroy()

          // Empty/shattered tile texture
          const emptyTile = this.make.graphics({ x: 0, y: 0 })
          emptyTile.fillStyle(0x2a1a2a, 0.5)
          emptyTile.fillRoundedRect(2, 2, 60, 60, 4)
          emptyTile.lineStyle(2, 0x6a3a6a, 0.7)
          emptyTile.strokeRoundedRect(2, 2, 60, 60, 4)
          emptyTile.generateTexture('emptyTile', 64, 64)
          emptyTile.destroy()

          const knightGfx = this.make.graphics({ x: 0, y: 0 })
          for (let i = 0; i < 20; i++) {
            const offsetX = (i % 10) * 64
            const offsetY = Math.floor(i / 10) * 64
            knightGfx.fillStyle(0xC0A000)
            knightGfx.fillRoundedRect(offsetX + 18, offsetY + 20, 28, 35, 6)
            knightGfx.fillStyle(0xFFDBBD)
            knightGfx.fillCircle(offsetX + 32, offsetY + 14, 10)
            knightGfx.fillStyle(0x808080)
            knightGfx.fillRoundedRect(offsetX + 22, offsetY + 4, 20, 12, 3)
            knightGfx.fillStyle(0xC0C0C0)
            if (i >= 12 && i < 20) {
              knightGfx.fillRect(offsetX + 46, offsetY + 18 + (i % 4) * 2, 14, 4)
            } else {
              knightGfx.fillRect(offsetX + 44, offsetY + 28, 4, 24)
            }
            knightGfx.fillStyle(0x8B4513)
            knightGfx.fillRoundedRect(offsetX + 8, offsetY + 24, 12, 20, 3)
            knightGfx.fillStyle(0x654321)
            const legOffset = (i >= 4 && i < 12) ? Math.sin(i * 0.8) * 3 : 0
            knightGfx.fillRect(offsetX + 22, offsetY + 52, 8, 10)
            knightGfx.fillRect(offsetX + 34 + legOffset, offsetY + 52, 8, 10)
          }
          knightGfx.generateTexture('knight', 640, 128)
          knightGfx.destroy()
          for (let i = 0; i < 20; i++) {
            this.textures.get('knight').add(i, 0, (i % 10) * 64, Math.floor(i / 10) * 64, 64, 64)
          }

          const dragonGfx = this.make.graphics({ x: 0, y: 0 })
          for (let i = 0; i < 8; i++) {
            const offsetX = (i % 4) * 96
            const offsetY = Math.floor(i / 4) * 96
            dragonGfx.fillStyle(0x8B0000)
            dragonGfx.fillRoundedRect(offsetX + 20, offsetY + 35, 60, 45, 10)
            dragonGfx.fillStyle(0x6B0000)
            dragonGfx.fillRoundedRect(offsetX + 60, offsetY + 25, 30, 28, 6)
            dragonGfx.fillStyle(0xFFFF00)
            dragonGfx.fillCircle(offsetX + 78, offsetY + 35, 5)
            dragonGfx.fillStyle(0x000000)
            dragonGfx.fillCircle(offsetX + 80, offsetY + 35, 2)
            dragonGfx.fillStyle(0x1a1a1a)
            dragonGfx.fillTriangle(offsetX + 65, offsetY + 20, offsetX + 60, offsetY + 30, offsetX + 70, offsetY + 30)
            dragonGfx.fillTriangle(offsetX + 80, offsetY + 20, offsetX + 75, offsetY + 30, offsetX + 85, offsetY + 30)
            dragonGfx.fillStyle(0x4a0000)
            const wingY = offsetY + 18 + (i % 2) * 4
            dragonGfx.fillTriangle(offsetX + 40, wingY, offsetX + 20, offsetY + 40, offsetX + 55, offsetY + 40)
            if (i >= 4) {
              dragonGfx.fillStyle(0xFF4500)
              dragonGfx.fillTriangle(offsetX + 88, offsetY + 38, offsetX + 95, offsetY + 32, offsetX + 95, offsetY + 44)
            }
            dragonGfx.fillStyle(0x6B0000)
            dragonGfx.fillRect(offsetX + 30, offsetY + 75, 12, 15)
            dragonGfx.fillRect(offsetX + 55, offsetY + 75, 12, 15)
          }
          dragonGfx.generateTexture('dragon', 384, 192)
          dragonGfx.destroy()
          for (let i = 0; i < 8; i++) {
            this.textures.get('dragon').add(i, 0, (i % 4) * 96, Math.floor(i / 4) * 96, 96, 96)
          }

          const gemColors = [0xEF4444, 0x3B82F6, 0x22C55E, 0xFBBF24, 0xA855F7, 0xFFFFFF, 0xFFD700, 0xFF6600]
          const gemsGfx = this.make.graphics({ x: 0, y: 0 })
          for (let i = 0; i < 8; i++) {
            const gx = i * 64
            gemsGfx.fillStyle(gemColors[i])
            gemsGfx.beginPath()
            gemsGfx.moveTo(gx + 32, 6)
            gemsGfx.lineTo(gx + 54, 32)
            gemsGfx.lineTo(gx + 32, 58)
            gemsGfx.lineTo(gx + 10, 32)
            gemsGfx.closePath()
            gemsGfx.fillPath()
            gemsGfx.fillStyle(0xFFFFFF, 0.35)
            gemsGfx.beginPath()
            gemsGfx.moveTo(gx + 32, 10)
            gemsGfx.lineTo(gx + 46, 28)
            gemsGfx.lineTo(gx + 32, 36)
            gemsGfx.lineTo(gx + 22, 28)
            gemsGfx.closePath()
            gemsGfx.fillPath()
            if (i === 7) {
              gemsGfx.fillStyle(0x1a1a1a)
              gemsGfx.fillRoundedRect(gx + 24, 20, 16, 20, 3)
              gemsGfx.fillStyle(0xFFD700)
              gemsGfx.fillCircle(gx + 32, 28, 4)
            }
            if (i === 6) {
              gemsGfx.fillStyle(0x1a1a1a)
              for (let j = 0; j < 5; j++) {
                const angle = (j * 72 - 90) * Math.PI / 180
                const x = gx + 32 + Math.cos(angle) * 8
                const y = 32 + Math.sin(angle) * 8
                gemsGfx.fillCircle(x, y, 3)
              }
            }
          }
          gemsGfx.generateTexture('gems', 512, 64)
          gemsGfx.destroy()
          for (let i = 0; i < 8; i++) {
            this.textures.get('gems').add(i, 0, i * 64, 0, 64, 64)
          }

          const plinth = this.make.graphics({ x: 0, y: 0 })
          plinth.fillStyle(0x4a4a4a)
          plinth.fillRoundedRect(0, 40, 80, 40, 5)
          plinth.fillStyle(0x5a5a5a)
          plinth.fillRoundedRect(5, 0, 70, 45, 5)
          plinth.fillStyle(0x6a6a6a)
          plinth.fillRoundedRect(10, 5, 60, 35, 4)
          plinth.generateTexture('plinth', 80, 80)
          plinth.destroy()

          const portal = this.make.graphics({ x: 0, y: 0 })
          portal.fillStyle(0x7C3AED, 0.8)
          portal.fillEllipse(40, 64, 60, 120)
          portal.fillStyle(0x9333EA, 0.6)
          portal.fillEllipse(40, 64, 45, 100)
          portal.fillStyle(0xC084FC, 0.4)
          portal.fillEllipse(40, 64, 30, 80)
          portal.generateTexture('portal', 80, 128)
          portal.destroy()

          // Exit door texture
          const exitDoor = this.make.graphics({ x: 0, y: 0 })
          exitDoor.fillStyle(0x4a3a2a)
          exitDoor.fillRoundedRect(5, 10, 54, 108, 8)
          exitDoor.fillStyle(0x6a5a4a)
          exitDoor.fillRoundedRect(10, 15, 44, 98, 6)
          exitDoor.lineStyle(3, 0xC0A000)
          exitDoor.strokeRoundedRect(10, 15, 44, 98, 6)
          exitDoor.fillStyle(0xFFD700)
          exitDoor.fillCircle(45, 64, 5)
          exitDoor.generateTexture('exitDoor', 64, 128)
          exitDoor.destroy()
        }

        createAllAnimations() {
          this.anims.create({ key: 'knight_idle', frames: this.anims.generateFrameNumbers('knight', { start: 0, end: 3 }), frameRate: 8, repeat: -1 })
          this.anims.create({ key: 'knight_walk', frames: this.anims.generateFrameNumbers('knight', { start: 4, end: 11 }), frameRate: 12, repeat: -1 })
          this.anims.create({ key: 'knight_attack', frames: this.anims.generateFrameNumbers('knight', { start: 12, end: 19 }), frameRate: 15, repeat: 0 })
          this.anims.create({ key: 'dragon_idle', frames: this.anims.generateFrameNumbers('dragon', { start: 0, end: 3 }), frameRate: 6, repeat: -1 })
          this.anims.create({ key: 'dragon_attack', frames: this.anims.generateFrameNumbers('dragon', { start: 4, end: 7 }), frameRate: 10, repeat: 0 })
        }

        preload() {
          const loadingText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Entering Dungeon...', { fontSize: '24px', color: '#9333EA' }).setOrigin(0.5)
          this.tweens.add({ targets: loadingText, alpha: { from: 0.3, to: 1 }, duration: 400, yoyo: true, repeat: -1 })
          this.load.on('complete', () => loadingText.destroy())
        }

        create() {
          this.time.delayedCall(200, () => {
            this.scene.start('GameScene')
            setIsLoading(false)
          })
        }
      }

      class GameScene extends Phaser.Scene {
        // State machine
        private currentState: GameState = 'IDLE'
        private spinPhase: SpinPhase = 'WAITING'
        private heroState: HeroState = 'ON_PLINTH'
        
        // Grid data
        private grid: Phaser.GameObjects.Sprite[][] = []
        private gridData: (SymbolType | null)[][] = []  // null = empty/cleared tile
        private tileBackgrounds: Phaser.GameObjects.Image[][] = []
        
        // Hero
        private hero!: Phaser.GameObjects.Sprite
        private plinth!: Phaser.GameObjects.Sprite
        private portal!: Phaser.GameObjects.Sprite
        private exitDoor!: Phaser.GameObjects.Image
        private heroCol = -1  // -1 = on plinth
        private heroRow = 3
        private heroStats = { hp: 100, maxHp: 100, attack: 15, crit: 10, defense: 5 }
        
        // Monster - Hidden Layer System
        private monster: Phaser.GameObjects.Sprite | null = null
        private monsterHpBar: Phaser.GameObjects.Graphics | null = null
        private monsterStats = { hp: 50, maxHp: 50, attack: 12 }
        private monsterCol = -1
        private monsterRow = -1
        private monsterMap: boolean[][] = []  // Hidden monster positions
        private revealedMonsters: { row: number; col: number; defeated: boolean }[] = []
        
        // Power Relics (persistent buffs)
        private relics = { vitality: 0, strength: 0, fury: 0, protection: 0 }
        private relicHUD!: Phaser.GameObjects.Container
        private relicTexts: { [key: string]: Phaser.GameObjects.Text } = {}
        
        // UI
        private particles!: Phaser.GameObjects.Particles.ParticleEmitter
        private winText!: Phaser.GameObjects.Text
        private heroStatsPanel!: Phaser.GameObjects.Container
        private heroHpBar!: Phaser.GameObjects.Graphics
        
        // Spin tracking
        private totalSpinWin = 0
        private tumbleCount = 0
        private spinActive = false  // True while a spin sequence is in progress
        private exitRow = 3  // Row where the exit is placed
        private spectralEffectPending = false

        constructor() { super({ key: 'GameScene' }) }

        create() {
          const bg = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'background')
          bg.setDisplaySize(GAME_WIDTH, GAME_HEIGHT)

          const gridBg = this.add.graphics()
          gridBg.fillStyle(0x1a1a2a, 0.95)
          gridBg.fillRoundedRect(GRID_X - 15, GRID_Y - 15, GRID_COLS * TILE_SIZE + 30, GRID_ROWS * TILE_SIZE + 30, 12)
          gridBg.lineStyle(3, 0x4a4a6a)
          gridBg.strokeRoundedRect(GRID_X - 15, GRID_Y - 15, GRID_COLS * TILE_SIZE + 30, GRID_ROWS * TILE_SIZE + 30, 12)

          // Create tile backgrounds
          for (let row = 0; row < GRID_ROWS; row++) {
            this.tileBackgrounds[row] = []
            for (let col = 0; col < GRID_COLS; col++) {
              const tile = this.add.image(GRID_X + col * TILE_SIZE + TILE_SIZE / 2, GRID_Y + row * TILE_SIZE + TILE_SIZE / 2, 'tile')
              tile.setAlpha(0.6)
              this.tileBackgrounds[row][col] = tile
            }
          }

          this.initializeGrid()

          // Plinth (hero starting position)
          this.plinth = this.add.sprite(PLINTH_X, GRID_Y + this.heroRow * TILE_SIZE + TILE_SIZE / 2 + 10, 'plinth')
          this.plinth.setScale(0.9)
          this.plinth.setDepth(5)

          // Hero on plinth
          this.hero = this.add.sprite(PLINTH_X, GRID_Y + this.heroRow * TILE_SIZE + TILE_SIZE / 2 - 10, 'knight', 0)
          this.hero.setScale(1.0)
          this.hero.setDepth(15)
          this.hero.play('knight_idle')
          this.heroCol = -1

          // Exit door on right side
          this.exitDoor = this.add.image(GRID_X + GRID_COLS * TILE_SIZE + 30, GRID_Y + this.exitRow * TILE_SIZE + TILE_SIZE / 2, 'exitDoor')
          this.exitDoor.setDepth(5)

          // Portal (hidden, appears when hero reaches exit)
          this.portal = this.add.sprite(GRID_X + GRID_COLS * TILE_SIZE + 50, GRID_Y + this.exitRow * TILE_SIZE + TILE_SIZE / 2, 'portal')
          this.portal.setAlpha(0)
          this.portal.setScale(1.2)
          this.portal.setDepth(4)

          this.particles = this.add.particles(0, 0, 'gems', {
            frame: [0, 1, 2, 3, 4, 5],
            lifespan: 800,
            speed: { min: 80, max: 200 },
            scale: { start: 0.3, end: 0 },
            gravityY: 150,
            emitting: false
          })
          this.particles.setDepth(20)

          this.winText = this.add.text(GRID_X + (GRID_COLS * TILE_SIZE) / 2, 40, '', {
            fontSize: '28px', fontFamily: 'Arial Black', color: '#FFD700', stroke: '#000000', strokeThickness: 4
          }).setOrigin(0.5)

          this.add.text(GRID_X + (GRID_COLS * TILE_SIZE) / 2, GRID_Y + GRID_ROWS * TILE_SIZE + 40, 'ELDRITCH DUNGEON', {
            fontSize: '24px', fontFamily: 'Arial Black', color: '#9333EA', stroke: '#000000', strokeThickness: 3
          }).setOrigin(0.5)

          this.createHeroPanel()
          this.createRelicHUD()
          this.createDustParticles()

          this.heroState = 'ON_PLINTH'
          this.heroCol = -1
        }

        // ========== RELIC HUD ==========
        createRelicHUD() {
          this.relicHUD = this.add.container(50, 300)
          
          const panel = this.add.graphics()
          panel.fillStyle(0x1a1a1a, 0.9)
          panel.fillRoundedRect(0, 0, 160, 120, 8)
          panel.lineStyle(2, 0x7C3AED)
          panel.strokeRoundedRect(0, 0, 160, 120, 8)
          this.relicHUD.add(panel)

          const title = this.add.text(80, 12, 'RELICS', { fontSize: '12px', fontFamily: 'Arial Black', color: '#7C3AED' }).setOrigin(0.5)
          this.relicHUD.add(title)

          const relicTypes = [
            { key: 'vitality', label: 'VIT', color: '#22C55E', y: 32 },
            { key: 'strength', label: 'STR', color: '#EF4444', y: 52 },
            { key: 'fury', label: 'FRY', color: '#FBBF24', y: 72 },
            { key: 'protection', label: 'PRT', color: '#3B82F6', y: 92 }
          ]
          
          relicTypes.forEach(r => {
            const label = this.add.text(10, r.y, r.label + ':', { fontSize: '11px', color: r.color })
            const value = this.add.text(60, r.y, '0', { fontSize: '11px', color: '#FFFFFF' })
            this.relicTexts[r.key] = value
            this.relicHUD.add([label, value])
          })
        }

        updateRelicHUD() {
          this.relicTexts['vitality']?.setText('+' + this.relics.vitality)
          this.relicTexts['strength']?.setText('+' + this.relics.strength)
          this.relicTexts['fury']?.setText('+' + this.relics.fury)
          this.relicTexts['protection']?.setText('+' + this.relics.protection)
        }

        // ========== HIDDEN MONSTER LAYER ==========
        generateMonsterMap() {
          this.monsterMap = []
          this.revealedMonsters = []
          
          // Initialize empty map
          for (let row = 0; row < GRID_ROWS; row++) {
            this.monsterMap[row] = []
            for (let col = 0; col < GRID_COLS; col++) {
              this.monsterMap[row][col] = false
            }
          }
          
          // Place 3-5 hidden monsters randomly (not on col 0 or 7)
          const monsterCount = Phaser.Math.Between(3, 5)
          let placed = 0
          while (placed < monsterCount) {
            const row = Phaser.Math.Between(0, GRID_ROWS - 1)
            const col = Phaser.Math.Between(1, GRID_COLS - 2)  // Avoid edges
            if (!this.monsterMap[row][col]) {
              this.monsterMap[row][col] = true
              placed++
            }
          }
        }

        checkForRevealedMonsters(clearedCells: Set<string>): { row: number; col: number }[] {
          const revealed: { row: number; col: number }[] = []
          
          clearedCells.forEach(key => {
            const [row, col] = key.split(',').map(Number)
            if (this.monsterMap[row] && this.monsterMap[row][col]) {
              // Monster was hidden here - reveal it!
              this.monsterMap[row][col] = false  // Remove from map
              revealed.push({ row, col })
            }
          })
          
          return revealed
        }

        async revealMonster(row: number, col: number) {
          const x = GRID_X + col * TILE_SIZE + TILE_SIZE / 2
          const y = GRID_Y + row * TILE_SIZE + TILE_SIZE / 2
          
          // Crack/reveal animation on tile
          const crack = this.add.graphics()
          crack.lineStyle(3, 0xFF4500)
          crack.strokeCircle(x, y, 20)
          crack.setDepth(15)
          
          this.tweens.add({
            targets: crack, alpha: 0, scaleX: 2, scaleY: 2, duration: 300,
            onComplete: () => crack.destroy()
          })
          
          // Spawn monster sprite
          this.monster = this.add.sprite(x, y, 'dragon', 0)
          this.monster.setScale(0.3)
          this.monster.setAlpha(0)
          this.monster.setFlipX(true)
          this.monster.setDepth(12)
          
          // Rise up animation
          this.tweens.add({
            targets: this.monster, alpha: 1, scale: 0.8, y: y - 10, duration: 400, ease: 'Back.easeOut'
          })
          
          this.monster.play('dragon_idle')
          this.monsterCol = col
          this.monsterRow = row
          this.monsterStats.hp = this.monsterStats.maxHp
          
          // Create HP bar
          this.monsterHpBar = this.add.graphics()
          this.monsterHpBar.setDepth(13)
          this.updateMonsterHpBar()
          
          this.revealedMonsters.push({ row, col, defeated: false })
          
          await this.delay(400)
        }

        hasPathToMonster(monsterRow: number, monsterCol: number): boolean {
          if (this.heroCol < 0) return false
          
          // BFS to check if there's a path of empty tiles
          const visited = new Set<string>()
          const queue: { row: number; col: number }[] = [{ row: this.heroRow, col: this.heroCol }]
          visited.add(this.heroRow + ',' + this.heroCol)
          
          while (queue.length > 0) {
            const current = queue.shift()!
            
            if (current.row === monsterRow && current.col === monsterCol) {
              return true
            }
            
            const neighbors = [
              { row: current.row - 1, col: current.col },
              { row: current.row + 1, col: current.col },
              { row: current.row, col: current.col - 1 },
              { row: current.row, col: current.col + 1 }
            ]
            
            for (const n of neighbors) {
              const key = n.row + ',' + n.col
              if (visited.has(key)) continue
              if (n.row < 0 || n.row >= GRID_ROWS || n.col < 0 || n.col >= GRID_COLS) continue
              
              // Can traverse empty tiles or the monster's tile
              if (this.gridData[n.row][n.col] === null || (n.row === monsterRow && n.col === monsterCol)) {
                visited.add(key)
                queue.push(n)
              }
            }
          }
          
          return false
        }

        createHeroPanel() {
          this.heroStatsPanel = this.add.container(50, 150)
          
          const panel = this.add.graphics()
          panel.fillStyle(0x1a1a1a, 0.9)
          panel.fillRoundedRect(0, 0, 160, 130, 8)
          panel.lineStyle(2, 0xC0A000)
          panel.strokeRoundedRect(0, 0, 160, 130, 8)
          this.heroStatsPanel.add(panel)

          const title = this.add.text(80, 12, 'ARCANIST', { fontSize: '14px', fontFamily: 'Arial Black', color: '#C0A000' }).setOrigin(0.5)
          this.heroStatsPanel.add(title)

          const hpLabel = this.add.text(10, 32, 'HP:', { fontSize: '12px', color: '#EF4444' })
          this.heroStatsPanel.add(hpLabel)

          const hpBarBg = this.add.graphics()
          hpBarBg.fillStyle(0x333333)
          hpBarBg.fillRect(40, 32, 110, 14)
          this.heroStatsPanel.add(hpBarBg)

          this.heroHpBar = this.add.graphics()
          this.heroHpBar.fillStyle(0x22C55E)
          this.heroHpBar.fillRect(42, 34, 106, 10)
          this.heroStatsPanel.add(this.heroHpBar)

          const stats = [
            { label: 'ATK:', value: '15', color: '#F97316', y: 54 },
            { label: 'CRT:', value: '10%', color: '#FBBF24', y: 72 },
            { label: 'DEF:', value: '5', color: '#3B82F6', y: 90 }
          ]
          stats.forEach(s => {
            const label = this.add.text(10, s.y, s.label, { fontSize: '11px', color: s.color })
            const value = this.add.text(50, s.y, s.value, { fontSize: '11px', color: '#FFFFFF' })
            this.heroStatsPanel.add([label, value])
          })

          const subtitle = this.add.text(80, 115, 'Master of Arcane', { fontSize: '9px', color: '#666666' }).setOrigin(0.5)
          this.heroStatsPanel.add(subtitle)
        }

        createDustParticles() {
          for (let i = 0; i < 15; i++) {
            const dust = this.add.circle(Phaser.Math.Between(0, GAME_WIDTH), Phaser.Math.Between(0, GAME_HEIGHT), Phaser.Math.Between(1, 2), 0xFFFFFF, 0.2)
            this.tweens.add({
              targets: dust, y: dust.y - 80, alpha: 0, duration: Phaser.Math.Between(3000, 5000), repeat: -1,
              onRepeat: () => { dust.x = Phaser.Math.Between(0, GAME_WIDTH); dust.y = GAME_HEIGHT + 10; dust.alpha = 0.2 }
            })
          }
        }

        getRandomSymbol(includeSpecials = false): SymbolType {
          const rand = Math.random()
          if (includeSpecials) {
            if (rand < 0.02) return 'wild'
            if (rand < 0.05) return 'warrior'
          }
          const totalWeight = SYMBOL_WEIGHTS.slice(0, 6).reduce((a, b) => a + b, 0)
          let cumulative = 0
          const roll = Math.random() * totalWeight
          for (let i = 0; i < REGULAR_SYMBOLS.length; i++) {
            cumulative += SYMBOL_WEIGHTS[i]
            if (roll <= cumulative) return REGULAR_SYMBOLS[i]
          }
          return 'red'
        }

        getGemFrame(symbol: SymbolType | null): number {
          if (!symbol) return 0
          const frames: Record<SymbolType, number> = { red: 0, blue: 1, green: 2, yellow: 3, purple: 4, white: 5, wild: 6, warrior: 7 }
          return frames[symbol] ?? 0
        }

        initializeGrid() {
          this.gridData = []
          this.grid = []
          for (let row = 0; row < GRID_ROWS; row++) {
            this.gridData[row] = []
            this.grid[row] = []
            for (let col = 0; col < GRID_COLS; col++) {
              const symbol = this.getRandomSymbol(col > 0)
              this.gridData[row][col] = symbol
              const sprite = this.add.sprite(GRID_X + col * TILE_SIZE + TILE_SIZE / 2, GRID_Y + row * TILE_SIZE + TILE_SIZE / 2, 'gems', this.getGemFrame(symbol))
              sprite.setScale(0.85)
              sprite.setDepth(10)
              if (symbol === 'wild') sprite.setTint(0xFFD700)
              else if (symbol === 'warrior') sprite.setTint(0xFF8800)
              this.grid[row][col] = sprite
            }
          }
        }

        // ========== MAIN SPIN FUNCTION ==========
        async spin() {
          if (this.currentState !== 'IDLE' || this.spinActive) return
          if (window.gameBalance < window.gameBetAmount) return

          // Play spin sound
          const playSpin = this.registry.get('playSpinSound')
          if (playSpin) playSpin()

          // NEW SPIN - Deduct balance first
          this.spinActive = true
          this.currentState = 'SPINNING'
          setGameState('SPINNING')
          this.spinPhase = 'SYMBOLS_DROPPING'
          this.totalSpinWin = 0
          this.tumbleCount = 0
          this.winText.setText('')
          window.onBet(window.gameBetAmount)

          // HERO PERSISTENCE: Only reset hero if they reached exit, died, or never entered grid
          // If hero is ACTIVE (mid-grid from previous spin), they stay in their position!
          const shouldResetHero = this.heroState === 'REACHED_EXIT' || 
                                   this.heroState === 'DEAD' || 
                                   this.heroState === 'ON_PLINTH'
          
          if (shouldResetHero) {
            this.resetHeroToPlinth()
            
            // Also reset monster and exit row for fresh start
            if (this.monster) {
              this.monster.destroy()
              this.monster = null
              if (this.monsterHpBar) { this.monsterHpBar.destroy(); this.monsterHpBar = null }
            }
            this.monsterCol = -1
            this.monsterRow = -1
            
            // Randomize exit row only for fresh starts
            this.exitRow = Phaser.Math.Between(1, GRID_ROWS - 2)
            this.exitDoor.setY(GRID_Y + this.exitRow * TILE_SIZE + TILE_SIZE / 2)
            this.portal.setY(GRID_Y + this.exitRow * TILE_SIZE + TILE_SIZE / 2)
          } else {
            // Hero stays in place - make sure they're visible and animating
            this.hero.setAlpha(1)
            this.hero.play('knight_idle')
          }
          
          this.portal.setAlpha(0)

          // Reset hero stats
          this.heroStats.hp = this.heroStats.maxHp
          this.monsterStats.hp = this.monsterStats.maxHp
          this.updateHeroHpBar()

          // Generate hidden monster map for this spin
          this.generateMonsterMap()

          // STEP A: Explicit cleanup - clear all ghost sprites
          await this.clearAndDropNewSymbols()

          // Start tumble sequence
          await this.runTumbleSequence()
        }

        resetHeroToPlinth() {
          this.heroCol = -1
          this.heroRow = 3
          this.heroState = 'ON_PLINTH'
          this.hero.setPosition(PLINTH_X, GRID_Y + this.heroRow * TILE_SIZE + TILE_SIZE / 2 - 10)
          this.hero.setAlpha(1)
          this.hero.setScale(1)
          this.hero.setDepth(15)
          this.hero.play('knight_idle')
        }

        // STEP A & B: Explicit cleanup and refill buffer
        async clearAndDropNewSymbols() {
          // STEP A: Destroy ALL existing sprites to prevent ghost tiles
          for (let row = 0; row < GRID_ROWS; row++) {
            for (let col = 0; col < GRID_COLS; col++) {
              if (this.grid[row] && this.grid[row][col]) {
                this.grid[row][col].destroy()
              }
              // Reset tile backgrounds
              if (this.tileBackgrounds[row] && this.tileBackgrounds[row][col]) {
                this.tileBackgrounds[row][col].setTexture('tile')
                this.tileBackgrounds[row][col].setAlpha(0.6)
              }
            }
          }

          // Reinitialize grid arrays
          this.gridData = []
          this.grid = []

          // STEP B: Spawn symbols OFF-SCREEN and tween them down
          for (let row = 0; row < GRID_ROWS; row++) {
            this.gridData[row] = []
            this.grid[row] = []
            for (let col = 0; col < GRID_COLS; col++) {
              const symbol = this.getRandomSymbol(col > 0)
              this.gridData[row][col] = symbol
              
              // Spawn off-screen (Y = -100 to -800)
              const startY = GRID_Y - (GRID_ROWS - row) * TILE_SIZE - 100
              const targetY = GRID_Y + row * TILE_SIZE + TILE_SIZE / 2
              
              const sprite = this.add.sprite(
                GRID_X + col * TILE_SIZE + TILE_SIZE / 2,
                startY,
                'gems',
                this.getGemFrame(symbol)
              )
              sprite.setScale(0.85)
              sprite.setDepth(10)
              sprite.setAlpha(1)
              if (symbol === 'wild') sprite.setTint(0xFFD700)
              else if (symbol === 'warrior') sprite.setTint(0xFF8800)
              
              this.grid[row][col] = sprite

              // Tween drop animation
              this.tweens.add({
                targets: sprite,
                y: targetY,
                duration: 350 + col * 40,
                delay: col * 60,
                ease: 'Cubic.easeOut',
                onComplete: () => {
                  this.tweens.add({ targets: sprite, scaleY: 0.7, duration: 40, yoyo: true })
                }
              })
            }
          }

          // STEP C: Validate array - ensure no nulls after drop
          await this.delay(500 + GRID_COLS * 60)
          this.validateGrid()
        }

        // STEP C: Validate grid has no holes
        validateGrid() {
          for (let row = 0; row < GRID_ROWS; row++) {
            for (let col = 0; col < GRID_COLS; col++) {
              // Check for null data
              if (this.gridData[row][col] === null || this.gridData[row][col] === undefined) {
                const fallbackSymbol = this.getRandomSymbol(col > 0)
                this.gridData[row][col] = fallbackSymbol
              }
              // Check for null sprite
              if (!this.grid[row][col] || !this.grid[row][col].active) {
                const symbol = this.gridData[row][col] || 'red'
                const sprite = this.add.sprite(
                  GRID_X + col * TILE_SIZE + TILE_SIZE / 2,
                  GRID_Y + row * TILE_SIZE + TILE_SIZE / 2,
                  'gems',
                  this.getGemFrame(symbol)
                )
                sprite.setScale(0.85)
                sprite.setDepth(10)
                if (symbol === 'wild') sprite.setTint(0xFFD700)
                else if (symbol === 'warrior') sprite.setTint(0xFF8800)
                this.grid[row][col] = sprite
              }
            }
          }
        }

        // ========== TUMBLE SEQUENCE ==========
        async runTumbleSequence() {
          this.currentState = 'TUMBLING'
          setGameState('TUMBLING')

          while (true) {
            this.spinPhase = 'FINDING_WINS'
            
            // Step 1: Find all winning clusters
            const clusters = this.findClusters()
            
            if (clusters.length === 0) {
              // NO MORE WINS - Spin sequence ends
              this.spinPhase = 'FINISHED'
              break
            }

            this.tumbleCount++
            
            // Step 2: Calculate and display win
            const winAmount = this.calculateWin(clusters)
            this.totalSpinWin += winAmount
            if (winAmount > 0) {
              const playWin = this.registry.get('playWinSound')
              if (playWin) playWin()
              this.winText.setText('WIN: $' + this.totalSpinWin.toFixed(2))
              this.tweens.add({ targets: this.winText, scale: { from: 1.2, to: 1 }, duration: 150 })
            }

            // Step 3: Check for warrior activation
            let warriorActivated = false
            let warriorPos: { row: number; col: number } | null = null
            for (let row = 0; row < GRID_ROWS; row++) {
              for (let col = 0; col < GRID_COLS; col++) {
                if (this.gridData[row][col] === 'warrior') {
                  const adjacents = [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]
                  for (const [ar, ac] of adjacents) {
                    for (const cluster of clusters) {
                      if (cluster.cells.some(([r, c]) => r === ar && c === ac)) {
                        warriorActivated = true
                        warriorPos = { row, col }
                        break
                      }
                    }
                    if (warriorActivated) break
                  }
                }
                if (warriorActivated) break
              }
              if (warriorActivated) break
            }

            // Step 4: Clear winning symbols and mark as empty
            this.spinPhase = 'CLEARING_WINS'
            const clearedCells = new Set<string>()
            for (const cluster of clusters) {
              for (const [row, col] of cluster.cells) {
                clearedCells.add(row + ',' + col)
                this.gridData[row][col] = null  // Mark as empty
                const sprite = this.grid[row][col]
                this.tweens.add({ targets: sprite, scale: 1.1, alpha: 0, duration: 200 })
                this.particles.emitParticleAt(sprite.x, sprite.y, 8)
                
                // Show empty tile background
                this.tileBackgrounds[row][col].setTexture('emptyTile')
                this.tileBackgrounds[row][col].setAlpha(1)
              }
            }

            await this.delay(300)

            // Step 5: CHECK FOR REVEALED MONSTERS (Hidden Layer System)
            const revealedNow = this.checkForRevealedMonsters(clearedCells)
            for (const mon of revealedNow) {
              await this.revealMonster(mon.row, mon.col)
              
              // If hero is on grid, check if path exists to monster
              if (this.heroCol >= 0 && this.hasPathToMonster(mon.row, mon.col)) {
                // Dash to monster and fight!
                await this.dashToMonster(mon.row, mon.col)
                await this.doCombat()
                
                if (this.heroStats.hp <= 0) {
                  this.heroState = 'DEAD'
                  break
                }
                
                // After defeating monster, trigger battle reward!
                await this.triggerBattleReward()
              }
            }
            
            if (this.heroState === 'DEAD') break

            // Step 6: HERO PATHFINDING - Move through ALL connected empty tiles toward exit
            this.spinPhase = 'HERO_PATHFINDING'
            
            // If warrior activated and hero on plinth, enter grid
            if (warriorActivated && warriorPos && this.heroState === 'ON_PLINTH') {
              this.heroState = 'ACTIVE'
              this.heroRow = warriorPos.row
              await this.moveHeroToCell(0, this.heroRow)
            }

            // If hero is on grid, pathfind through empty tiles
            if (this.heroCol >= 0) {
              const targetCell = this.findFurthestReachableCell()
              if (targetCell && (targetCell.col > this.heroCol || targetCell.row !== this.heroRow)) {
                await this.moveHeroToCell(targetCell.col, targetCell.row)
              }
            }

            // Step 6: Check if hero reached exit
            if (this.heroCol >= EXIT_COL) {
              this.heroState = 'REACHED_EXIT'
              await this.delay(200)
              // Refill before going to bonus
              await this.refillGrid()
              await this.triggerTreasureHall()
              return
            }

            // Step 7: Refill grid (cascade down + new symbols from top)
            this.spinPhase = 'REFILLING'
            await this.refillGrid()
            
            await this.delay(200)
          }

          // Spin sequence complete
          this.finishSpin()
        }

        // Find the furthest cell the hero can reach through connected empty tiles
        findFurthestReachableCell(): { col: number; row: number } | null {
          if (this.heroCol < 0) return null

          // BFS to find all reachable empty cells
          const visited = new Set<string>()
          const queue: { col: number; row: number }[] = []
          let furthestCell: { col: number; row: number } | null = null
          let maxProgress = this.heroCol

          // Start from hero's current position
          queue.push({ col: this.heroCol, row: this.heroRow })
          visited.add(this.heroCol + ',' + this.heroRow)

          while (queue.length > 0) {
            const current = queue.shift()!
            
            // Track the cell that gets us closest to the exit
            // Prefer higher column, then prefer row closer to exit row
            if (current.col > maxProgress || 
                (current.col === maxProgress && furthestCell && 
                 Math.abs(current.row - this.exitRow) < Math.abs(furthestCell.row - this.exitRow))) {
              maxProgress = current.col
              furthestCell = current
            }

            // Check all 4 neighbors (prioritize right, then up/down toward exit)
            const neighbors = [
              { col: current.col + 1, row: current.row },  // Right
              { col: current.col, row: current.row + (current.row < this.exitRow ? 1 : -1) },  // Toward exit row
              { col: current.col, row: current.row + (current.row < this.exitRow ? -1 : 1) },  // Away from exit row
              { col: current.col - 1, row: current.row }   // Left (less preferred)
            ]

            for (const neighbor of neighbors) {
              const key = neighbor.col + ',' + neighbor.row
              if (visited.has(key)) continue
              if (neighbor.col < 0 || neighbor.col >= GRID_COLS || neighbor.row < 0 || neighbor.row >= GRID_ROWS) continue
              
              // Can only move through empty tiles
              if (this.gridData[neighbor.row][neighbor.col] === null) {
                visited.add(key)
                queue.push(neighbor)
              }
            }
          }

          return furthestCell
        }

        async moveHeroToCell(targetCol: number, targetRow: number) {
          this.currentState = 'HERO_MOVING'
          setGameState('HERO_MOVING')
          this.hero.play('knight_walk')
          this.hero.setDepth(20)  // Ensure hero renders above grid

          // Animate hero moving tile by tile
          const path = this.getPathToCell(targetCol, targetRow)
          
          for (const cell of path) {
            const targetX = GRID_X + cell.col * TILE_SIZE + TILE_SIZE / 2
            const targetY = GRID_Y + cell.row * TILE_SIZE + TILE_SIZE / 2

            await new Promise<void>(resolve => {
              this.tweens.add({
                targets: this.hero, x: targetX, y: targetY, duration: 120, ease: 'Linear',
                onComplete: () => {
                  this.heroCol = cell.col
                  this.heroRow = cell.row
                  resolve()
                }
              })
            })
          }

          this.hero.play('knight_idle')
          // Hero stays ACTIVE after moving (important for persistence!)
          this.heroState = 'ACTIVE'
          this.currentState = 'TUMBLING'
          setGameState('TUMBLING')
        }

        getPathToCell(targetCol: number, targetRow: number): { col: number; row: number }[] {
          const path: { col: number; row: number }[] = []
          let currentCol = this.heroCol
          let currentRow = this.heroRow

          while (currentCol !== targetCol || currentRow !== targetRow) {
            // Move horizontally first, then vertically
            if (currentCol < targetCol) {
              currentCol++
            } else if (currentCol > targetCol) {
              currentCol--
            } else if (currentRow < targetRow) {
              currentRow++
            } else if (currentRow > targetRow) {
              currentRow--
            }
            path.push({ col: currentCol, row: currentRow })
          }

          return path
        }

        async refillGrid() {
          // For each column, move existing symbols down and add new ones from top
          for (let col = 0; col < GRID_COLS; col++) {
            const remaining: { symbol: SymbolType; sprite: Phaser.GameObjects.Sprite; oldRow: number }[] = []
            
            // Collect non-empty cells from bottom to top
            for (let row = GRID_ROWS - 1; row >= 0; row--) {
              if (this.gridData[row][col] !== null && this.grid[row][col] && this.grid[row][col].active) {
                remaining.push({ 
                  symbol: this.gridData[row][col]!, 
                  sprite: this.grid[row][col],
                  oldRow: row
                })
              }
            }

            const emptyCount = GRID_ROWS - remaining.length

            // Reassign grid data and animate
            for (let row = GRID_ROWS - 1; row >= 0; row--) {
              const targetY = GRID_Y + row * TILE_SIZE + TILE_SIZE / 2
              
              // Reset tile background
              if (this.tileBackgrounds[row] && this.tileBackgrounds[row][col]) {
                this.tileBackgrounds[row][col].setTexture('tile')
                this.tileBackgrounds[row][col].setAlpha(0.6)
              }

              if (row >= emptyCount && remaining.length > 0) {
                // Use existing symbol
                const remainingIndex = GRID_ROWS - 1 - row
                if (remainingIndex < remaining.length) {
                  const item = remaining[remainingIndex]
                  this.gridData[row][col] = item.symbol
                  this.grid[row][col] = item.sprite
                  
                  if (item.oldRow !== row) {
                    this.tweens.add({ targets: item.sprite, y: targetY, duration: 200, ease: 'Cubic.easeOut' })
                  }
                } else {
                  // Fallback: create new symbol
                  this.spawnNewSymbolAt(row, col, targetY, emptyCount - row)
                }
              } else {
                // New symbol from top - create fresh sprite
                this.spawnNewSymbolAt(row, col, targetY, emptyCount - row)
              }
            }
          }

          await this.delay(350)
          // Validate after refill
          this.validateGrid()
        }

        spawnNewSymbolAt(row: number, col: number, targetY: number, dropDistance: number) {
          const symbol = this.getRandomSymbol(col > 0)
          this.gridData[row][col] = symbol
          
          // Destroy old sprite if exists
          if (this.grid[row] && this.grid[row][col] && this.grid[row][col].active) {
            this.grid[row][col].destroy()
          }
          
          // Create new sprite off-screen
          const startY = GRID_Y - dropDistance * TILE_SIZE - 80
          const sprite = this.add.sprite(
            GRID_X + col * TILE_SIZE + TILE_SIZE / 2,
            startY,
            'gems',
            this.getGemFrame(symbol)
          )
          sprite.setScale(0.85)
          sprite.setDepth(10)
          sprite.setAlpha(1)
          if (symbol === 'wild') sprite.setTint(0xFFD700)
          else if (symbol === 'warrior') sprite.setTint(0xFF8800)
          
          this.grid[row][col] = sprite

          this.tweens.add({
            targets: sprite,
            y: targetY,
            duration: 300,
            ease: 'Cubic.easeOut',
            onComplete: () => {
              this.tweens.add({ targets: sprite, scaleY: 0.75, duration: 35, yoyo: true })
            }
          })
        }

        finishSpin() {
          // Final validation to prevent holes
          this.validateGrid()
          
          // Award wins
          if (this.totalSpinWin > 0) {
            const cappedWin = Math.min(this.totalSpinWin, window.gameBetAmount * 20000)
            window.onWin(cappedWin)
            if (cappedWin >= window.gameBetAmount * 15) this.showBigWin(cappedWin)
          }

          // KEEP the hero in place until next spin!
          // Don't reset hero position here
          
          this.spinActive = false
          this.currentState = 'IDLE'
          setGameState('IDLE')
          this.spinPhase = 'WAITING'
        }

        spawnMonster() {
          this.monsterCol = Math.min(GRID_COLS - 2, this.heroCol + Phaser.Math.Between(2, 4))
          if (this.monsterCol < 2) this.monsterCol = Math.floor(GRID_COLS / 2)
          this.monsterRow = this.exitRow  // Monster blocks path to exit
          
          const monsterX = GRID_X + this.monsterCol * TILE_SIZE + TILE_SIZE / 2
          const monsterY = GRID_Y + this.monsterRow * TILE_SIZE + TILE_SIZE / 2
          
          this.monster = this.add.sprite(monsterX, monsterY, 'dragon', 0)
          this.monster.setScale(0.8)
          this.monster.setFlipX(true)
          this.monster.play('dragon_idle')
          this.monster.setDepth(12)
          
          this.monster.setAlpha(0)
          this.monster.setScale(0.3)
          this.tweens.add({ targets: this.monster, alpha: 1, scale: 0.8, duration: 400, ease: 'Back.easeOut' })

          this.monsterHpBar = this.add.graphics()
          this.monsterHpBar.setDepth(13)
          this.updateMonsterHpBar()
        }

        updateHeroHpBar() {
          if (!this.heroHpBar) return
          this.heroHpBar.clear()
          this.heroHpBar.fillStyle(0x333333)
          this.heroHpBar.fillRect(42, 34, 106, 10)
          this.heroHpBar.fillStyle(0x22C55E)
          this.heroHpBar.fillRect(42, 34, 106 * (this.heroStats.hp / this.heroStats.maxHp), 10)
        }

        updateMonsterHpBar() {
          if (!this.monsterHpBar || !this.monster) return
          this.monsterHpBar.clear()
          this.monsterHpBar.fillStyle(0x333333)
          this.monsterHpBar.fillRect(this.monster.x - 30, this.monster.y - 45, 60, 8)
          this.monsterHpBar.fillStyle(0xEF4444)
          this.monsterHpBar.fillRect(this.monster.x - 28, this.monster.y - 43, 56 * (this.monsterStats.hp / this.monsterStats.maxHp), 4)
        }

        async doCombat() {
          this.currentState = 'COMBAT'
          setGameState('COMBAT')

          while (this.monsterStats.hp > 0 && this.heroStats.hp > 0) {
            const isCrit = Math.random() < (this.heroStats.crit / 100)
            const heroDamage = Math.floor(this.heroStats.attack * (isCrit ? 2 : 1))
            this.monsterStats.hp = Math.max(0, this.monsterStats.hp - heroDamage)
            
            this.hero.play('knight_attack')
            // Play sound
            if (isCrit) {
              const playCrit = this.registry.get('playCritSound')
              if (playCrit) playCrit()
            } else {
              const playHit = this.registry.get('playHitSound')
              if (playHit) playHit()
            }
            this.showDamageNumber(this.monster!.x, this.monster!.y - 20, heroDamage, isCrit)
            this.updateMonsterHpBar()
            this.tweens.add({ targets: this.monster, x: this.monster!.x + 15, duration: 50, yoyo: true, repeat: 2 })
            
            await this.delay(400)
            this.hero.play('knight_idle')
            
            if (this.monsterStats.hp <= 0) break
            
            const monsterDamage = Math.max(1, this.monsterStats.attack - this.heroStats.defense)
            this.heroStats.hp = Math.max(0, this.heroStats.hp - monsterDamage)
            
            if (this.monster) this.monster.play('dragon_attack')
            const playHit = this.registry.get('playHitSound')
            if (playHit) playHit()
            this.showDamageNumber(this.hero.x, this.hero.y - 20, monsterDamage, false)
            this.updateHeroHpBar()
            this.tweens.add({ targets: this.hero, x: this.hero.x - 15, duration: 50, yoyo: true, repeat: 2 })
            
            await this.delay(400)
            if (this.monster) this.monster.play('dragon_idle')
            await this.delay(200)
          }

          if (this.monsterStats.hp <= 0) {
            const playVictory = this.registry.get('playVictorySound')
            if (playVictory) playVictory()
            
            const bonus = window.gameBetAmount * 10
            window.onWin(bonus)
            this.totalSpinWin += bonus
            this.winText.setText('WIN: $' + this.totalSpinWin.toFixed(2))
            
            if (this.monster) {
              this.particles.emitParticleAt(this.monster.x, this.monster.y, 20)
              this.tweens.add({
                targets: this.monster, alpha: 0, scale: 0.2, angle: 180, duration: 400,
                onComplete: () => { this.monster?.destroy(); this.monster = null }
              })
              if (this.monsterHpBar) { this.monsterHpBar.destroy(); this.monsterHpBar = null }
            }
            
            await this.delay(500)
            
            const victoryText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'MONSTER DEFEATED!\n+$' + bonus.toFixed(2), {
              fontSize: '36px', fontFamily: 'Arial Black', color: '#22C55E', stroke: '#000000', strokeThickness: 5, align: 'center'
            }).setOrigin(0.5)
            this.tweens.add({
              targets: victoryText, scale: { from: 0.5, to: 1.1 }, duration: 300, yoyo: true,
              onComplete: () => { this.tweens.add({ targets: victoryText, alpha: 0, duration: 400, onComplete: () => victoryText.destroy() }) }
            })
            await this.delay(800)
          } else {
            const defeatText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'HERO DEFEATED...', {
              fontSize: '36px', fontFamily: 'Arial Black', color: '#EF4444', stroke: '#000000', strokeThickness: 5
            }).setOrigin(0.5)
            this.tweens.add({ targets: this.hero, alpha: 0.3, duration: 500 })
            await this.delay(1500)
            defeatText.destroy()
          }

          this.currentState = 'TUMBLING'
          setGameState('TUMBLING')
        }

        showDamageNumber(x: number, y: number, damage: number, isCrit: boolean) {
          const text = this.add.text(x, y, '-' + damage, {
            fontSize: isCrit ? '28px' : '20px', fontFamily: 'Arial Black',
            color: isCrit ? '#FFD700' : '#FFFFFF', stroke: '#000000', strokeThickness: 3
          }).setOrigin(0.5)
          this.tweens.add({ targets: text, y: y - 40, alpha: 0, duration: 700, onComplete: () => text.destroy() })
        }

        // ========== DASH TO MONSTER ==========
        async dashToMonster(monsterRow: number, monsterCol: number) {
          this.currentState = 'HERO_MOVING'
          setGameState('HERO_MOVING')
          this.hero.play('knight_walk')
          
          const targetX = GRID_X + monsterCol * TILE_SIZE + TILE_SIZE / 2 - 40
          const targetY = GRID_Y + monsterRow * TILE_SIZE + TILE_SIZE / 2
          
          // Fast dash animation
          await new Promise<void>(resolve => {
            this.tweens.add({
              targets: this.hero,
              x: targetX,
              y: targetY,
              duration: 250,
              ease: 'Cubic.easeOut',
              onComplete: () => {
                this.heroCol = monsterCol
                this.heroRow = monsterRow
                this.hero.play('knight_idle')
                resolve()
              }
            })
          })
          
          // Trail effect
          const trail = this.add.graphics()
          trail.lineStyle(3, 0xFFD700, 0.5)
          trail.lineBetween(this.hero.x - 100, this.hero.y, targetX, targetY)
          this.tweens.add({
            targets: trail, alpha: 0, duration: 300,
            onComplete: () => trail.destroy()
          })
        }

        // ========== BATTLE REWARDS ==========
        async triggerBattleReward() {
          // Drop Power Relic
          await this.dropPowerRelic()
          
          // 70% chance for Spectral Effect
          if (Math.random() < 0.7) {
            const effectType = Phaser.Math.Between(0, 3)
            
            switch (effectType) {
              case 0:
                await this.spectralNightfang()
                break
              case 1:
                await this.spectralNightwing()
                break
              case 2:
                await this.companionStrike()
                break
              case 3:
                await this.spectralElderfang()
                break
            }
          }
        }

        async dropPowerRelic() {
          const relicTypes = ['vitality', 'strength', 'fury', 'protection'] as const
          const relicType = relicTypes[Phaser.Math.Between(0, 3)]
          const amount = Phaser.Math.Between(1, 3)
          
          // Apply relic bonus
          this.relics[relicType] += amount
          
          // Apply to hero stats
          switch (relicType) {
            case 'vitality':
              this.heroStats.maxHp += amount * 10
              this.heroStats.hp = Math.min(this.heroStats.hp + amount * 10, this.heroStats.maxHp)
              break
            case 'strength':
              this.heroStats.attack += amount * 2
              break
            case 'fury':
              this.heroStats.crit += amount * 3
              break
            case 'protection':
              this.heroStats.defense += amount
              break
          }
          
          this.updateHeroHpBar()
          this.updateRelicHUD()
          
          // Fly-to animation from monster corpse to HUD
          const relicIcon = this.add.circle(this.hero.x, this.hero.y - 20, 12, 
            relicType === 'vitality' ? 0x22C55E :
            relicType === 'strength' ? 0xEF4444 :
            relicType === 'fury' ? 0xFBBF24 : 0x3B82F6
          )
          relicIcon.setDepth(25)
          
          const relicText = this.add.text(this.hero.x, this.hero.y - 20, '+' + amount, {
            fontSize: '14px', fontFamily: 'Arial Black', color: '#FFFFFF'
          }).setOrigin(0.5).setDepth(26)
          
          await new Promise<void>(resolve => {
            this.tweens.add({
              targets: [relicIcon, relicText],
              x: 130, y: relicType === 'vitality' ? 332 : relicType === 'strength' ? 352 : relicType === 'fury' ? 372 : 392,
              scale: 0.5, duration: 600, ease: 'Cubic.easeIn',
              onComplete: () => {
                relicIcon.destroy()
                relicText.destroy()
                resolve()
              }
            })
          })
        }

        // SPECTRAL EFFECTS
        async spectralNightfang() {
          // Spawn 4-6 Wild Warriors on random non-winning tiles
          const overlay = this.add.graphics()
          overlay.fillStyle(0x7C3AED, 0.3)
          overlay.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
          overlay.setDepth(30)
          
          const effectText = this.add.text(GAME_WIDTH / 2, 50, 'NIGHTFANG!', {
            fontSize: '32px', fontFamily: 'Arial Black', color: '#FFD700', stroke: '#000000', strokeThickness: 4
          }).setOrigin(0.5).setDepth(31)
          
          await this.delay(300)
          
          const wildCount = Phaser.Math.Between(4, 6)
          let placed = 0
          const attempts = 0
          
          while (placed < wildCount && attempts < 50) {
            const row = Phaser.Math.Between(0, GRID_ROWS - 1)
            const col = Phaser.Math.Between(1, GRID_COLS - 1)
            
            if (this.gridData[row][col] !== null && this.gridData[row][col] !== 'wild' && this.gridData[row][col] !== 'warrior') {
              // Transform to wild warrior
              this.gridData[row][col] = 'warrior'
              const sprite = this.grid[row][col]
              if (sprite && sprite.active) {
                sprite.setFrame(this.getGemFrame('warrior'))
                sprite.setTint(0xFF8800)
                
                // Ghost helmet fly animation
                const ghost = this.add.sprite(this.hero.x, this.hero.y, 'gems', 7)
                ghost.setTint(0xFFFFFF)
                ghost.setAlpha(0.7)
                ghost.setScale(0.5)
                ghost.setDepth(32)
                
                this.tweens.add({
                  targets: ghost, x: sprite.x, y: sprite.y, alpha: 0, scale: 1, duration: 400,
                  onComplete: () => ghost.destroy()
                })
              }
              placed++
            }
          }
          
          await this.delay(500)
          overlay.destroy()
          effectText.destroy()
        }

        async spectralElderfang() {
          // Spawn 8-10 Wilds
          const overlay = this.add.graphics()
          overlay.fillStyle(0xFFD700, 0.2)
          overlay.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
          overlay.setDepth(30)
          
          const effectText = this.add.text(GAME_WIDTH / 2, 50, 'ELDERFANG!', {
            fontSize: '32px', fontFamily: 'Arial Black', color: '#FFD700', stroke: '#000000', strokeThickness: 4
          }).setOrigin(0.5).setDepth(31)
          
          await this.delay(300)
          
          const wildCount = Phaser.Math.Between(8, 10)
          let placed = 0
          
          for (let i = 0; i < 60 && placed < wildCount; i++) {
            const row = Phaser.Math.Between(0, GRID_ROWS - 1)
            const col = Phaser.Math.Between(0, GRID_COLS - 1)
            
            if (this.gridData[row][col] !== null && this.gridData[row][col] !== 'wild') {
              this.gridData[row][col] = 'wild'
              const sprite = this.grid[row][col]
              if (sprite && sprite.active) {
                sprite.setFrame(this.getGemFrame('wild'))
                sprite.setTint(0xFFD700)
                this.particles.emitParticleAt(sprite.x, sprite.y, 5)
              }
              placed++
            }
          }
          
          await this.delay(500)
          overlay.destroy()
          effectText.destroy()
        }

        async spectralNightwing() {
          // Transform 10-15 symbols to match a random high-pay symbol
          const overlay = this.add.graphics()
          overlay.fillStyle(0x9333EA, 0.3)
          overlay.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
          overlay.setDepth(30)
          
          const effectText = this.add.text(GAME_WIDTH / 2, 50, 'NIGHTWING!', {
            fontSize: '32px', fontFamily: 'Arial Black', color: '#C084FC', stroke: '#000000', strokeThickness: 4
          }).setOrigin(0.5).setDepth(31)
          
          await this.delay(300)
          
          // Pick a high-value symbol currently on grid
          const highPaySymbols: SymbolType[] = ['white', 'purple', 'yellow']
          let targetSymbol: SymbolType = 'purple'
          
          for (const sym of highPaySymbols) {
            for (let row = 0; row < GRID_ROWS; row++) {
              for (let col = 0; col < GRID_COLS; col++) {
                if (this.gridData[row][col] === sym) {
                  targetSymbol = sym
                  break
                }
              }
            }
          }
          
          const transformCount = Phaser.Math.Between(10, 15)
          let transformed = 0
          
          for (let i = 0; i < 80 && transformed < transformCount; i++) {
            const row = Phaser.Math.Between(0, GRID_ROWS - 1)
            const col = Phaser.Math.Between(0, GRID_COLS - 1)
            
            if (this.gridData[row][col] !== null && 
                this.gridData[row][col] !== targetSymbol && 
                this.gridData[row][col] !== 'wild' && 
                this.gridData[row][col] !== 'warrior') {
              this.gridData[row][col] = targetSymbol
              const sprite = this.grid[row][col]
              if (sprite && sprite.active) {
                sprite.setFrame(this.getGemFrame(targetSymbol))
                sprite.setTint(0xFFFFFF)
                this.tweens.add({ targets: sprite, scale: 1.1, duration: 100, yoyo: true })
              }
              transformed++
            }
          }
          
          await this.delay(500)
          overlay.destroy()
          effectText.destroy()
        }

        async companionStrike() {
          // Hero-specific ultimate attack that transforms tiles
          const strikeType = Phaser.Math.Between(0, 2)
          
          const overlay = this.add.graphics()
          overlay.fillStyle(0xC0A000, 0.3)
          overlay.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
          overlay.setDepth(30)
          
          let strikeName = ''
          
          switch (strikeType) {
            case 0:
              strikeName = 'ARCANIST STRIKE!'
              await this.arcanistStrike()
              break
            case 1:
              strikeName = 'RANGER STRIKE!'
              await this.rangerStrike()
              break
            case 2:
              strikeName = 'MAULER STRIKE!'
              await this.maulerStrike()
              break
          }
          
          const effectText = this.add.text(GAME_WIDTH / 2, 50, strikeName, {
            fontSize: '32px', fontFamily: 'Arial Black', color: '#C0A000', stroke: '#000000', strokeThickness: 4
          }).setOrigin(0.5).setDepth(31)
          
          // Hero attack animation
          this.hero.play('knight_attack')
          await this.delay(400)
          this.hero.play('knight_idle')
          
          await this.delay(300)
          overlay.destroy()
          effectText.destroy()
        }

        async arcanistStrike() {
          // Transform 11-16 symbols in a cluster + destroy neighbors
          const centerRow = Phaser.Math.Between(2, GRID_ROWS - 3)
          const centerCol = Phaser.Math.Between(2, GRID_COLS - 3)
          const targetSymbol = REGULAR_SYMBOLS[Phaser.Math.Between(3, 5)]
          
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const row = centerRow + dr
              const col = centerCol + dc
              if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
                if (Math.abs(dr) <= 1 && Math.abs(dc) <= 1) {
                  // Inner area - transform
                  this.gridData[row][col] = targetSymbol
                  const sprite = this.grid[row][col]
                  if (sprite && sprite.active) {
                    sprite.setFrame(this.getGemFrame(targetSymbol))
                    this.particles.emitParticleAt(sprite.x, sprite.y, 3)
                  }
                } else if (Math.random() < 0.5) {
                  // Outer area - destroy some
                  this.gridData[row][col] = null
                  const sprite = this.grid[row][col]
                  if (sprite && sprite.active) {
                    this.tweens.add({ targets: sprite, alpha: 0, scale: 0.5, duration: 200 })
                  }
                }
              }
            }
          }
        }

        async rangerStrike() {
          // Transform a full horizontal row
          const targetRow = Phaser.Math.Between(1, GRID_ROWS - 2)
          const targetSymbol = REGULAR_SYMBOLS[Phaser.Math.Between(3, 5)]
          
          for (let col = 0; col < GRID_COLS; col++) {
            this.gridData[targetRow][col] = targetSymbol
            const sprite = this.grid[targetRow][col]
            if (sprite && sprite.active) {
              sprite.setFrame(this.getGemFrame(targetSymbol))
              this.tweens.add({ targets: sprite, scaleX: 1.2, duration: 50, yoyo: true, delay: col * 30 })
            }
          }
        }

        async maulerStrike() {
          // Transform two 2x2 areas
          const targetSymbol = REGULAR_SYMBOLS[Phaser.Math.Between(3, 5)]
          
          for (let i = 0; i < 2; i++) {
            const startRow = Phaser.Math.Between(1, GRID_ROWS - 3)
            const startCol = Phaser.Math.Between(1, GRID_COLS - 3)
            
            for (let dr = 0; dr < 2; dr++) {
              for (let dc = 0; dc < 2; dc++) {
                const row = startRow + dr
                const col = startCol + dc
                this.gridData[row][col] = targetSymbol
                const sprite = this.grid[row][col]
                if (sprite && sprite.active) {
                  sprite.setFrame(this.getGemFrame(targetSymbol))
                  this.particles.emitParticleAt(sprite.x, sprite.y, 4)
                }
              }
            }
          }
        }

        async triggerTreasureHall() {
          this.currentState = 'BONUS_TRANSITION'
          setGameState('BONUS_TRANSITION')
          
          // Play transition sound
          const playTransition = this.registry.get('playTransitionSound')
          if (playTransition) playTransition()

          this.tweens.add({ targets: this.portal, alpha: 1, duration: 500 })
          await this.delay(300)

          this.hero.play('knight_walk')
          await new Promise<void>(resolve => {
            this.tweens.add({
              targets: this.hero, x: this.portal.x, y: this.portal.y, duration: 600, ease: 'Linear',
              onComplete: () => resolve()
            })
          })

          this.tweens.add({ targets: this.hero, alpha: 0, scale: 0.5, duration: 300 })
          this.cameras.main.flash(500, 124, 58, 237)
          await this.delay(500)

          this.spinActive = false
          // Go to Dungeon Battle first, then Treasure Hall
          this.scene.start('DungeonBattleScene', { 
            totalWin: this.totalSpinWin, 
            heroStats: this.heroStats,
            relics: this.relics
          })
        }

        findClusters(): { symbol: SymbolType; cells: [number, number][] }[] {
          const visited = new Set<string>()
          const clusters: { symbol: SymbolType; cells: [number, number][] }[] = []

          const dfs = (row: number, col: number, targetSymbol: SymbolType, cluster: [number, number][]) => {
            const key = row + ',' + col
            if (visited.has(key) || row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) return
            const cell = this.gridData[row][col]
            if (cell === null) return
            if (cell !== targetSymbol && cell !== 'wild') return
            visited.add(key)
            cluster.push([row, col])
            dfs(row - 1, col, targetSymbol, cluster)
            dfs(row + 1, col, targetSymbol, cluster)
            dfs(row, col - 1, targetSymbol, cluster)
            dfs(row, col + 1, targetSymbol, cluster)
          }

          for (let row = 0; row < GRID_ROWS; row++) {
            for (let col = 0; col < GRID_COLS; col++) {
              const key = row + ',' + col
              const cell = this.gridData[row][col]
              if (!visited.has(key) && cell !== null && cell !== 'wild' && cell !== 'warrior') {
                const cluster: [number, number][] = []
                dfs(row, col, cell, cluster)
                if (cluster.length >= 5) clusters.push({ symbol: cell, cells: cluster })
              }
            }
          }
          return clusters
        }

        calculateWin(clusters: { symbol: SymbolType; cells: [number, number][] }[]): number {
          let total = 0
          for (const cluster of clusters) {
            const payouts = SYMBOL_PAYOUTS[cluster.symbol]
            const size = cluster.cells.length
            let payout = 0
            if (size >= 30) payout = payouts[30] || payouts[20] || 0
            else if (size >= 20) payout = payouts[20] || 0
            else if (size >= 12) payout = payouts[12] || 0
            else if (size >= 8) payout = payouts[8] || 0
            else if (size >= 5) payout = payouts[5] || 0
            total += payout * window.gameBetAmount
          }
          return total
        }

        showBigWin(amount: number) {
          const text = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'BIG WIN!\n$' + amount.toFixed(2), {
            fontSize: '56px', fontFamily: 'Arial Black', color: '#FFD700', stroke: '#000000', strokeThickness: 7, align: 'center'
          }).setOrigin(0.5)
          this.tweens.add({
            targets: text, scale: { from: 0.4, to: 1.15 }, duration: 400, yoyo: true, repeat: 2,
            onComplete: () => { this.tweens.add({ targets: text, alpha: 0, duration: 250, onComplete: () => text.destroy() }) }
          })
        }

        triggerBonusDirect() {
          this.heroCol = EXIT_COL
          this.heroRow = this.exitRow
          this.heroState = 'REACHED_EXIT'
          this.hero.setPosition(GRID_X + EXIT_COL * TILE_SIZE + TILE_SIZE / 2, GRID_Y + this.exitRow * TILE_SIZE + TILE_SIZE / 2)
          this.triggerTreasureHall()
        }

        delay(ms: number): Promise<void> { return new Promise(resolve => this.time.delayedCall(ms, resolve)) }
      }

      // ========== DUNGEON BATTLE SCENE ==========
      class DungeonBattleScene extends Phaser.Scene {
        private heroStats = { hp: 100, maxHp: 100, attack: 15, crit: 10, defense: 5 }
        private relics = { vitality: 0, strength: 0, fury: 0, protection: 0 }
        private totalWin = 0
        private currentLevel = 1
        private totalLevels = 3
        private bonusMultiplier = 1
        
        private hero!: Phaser.GameObjects.Sprite
        private enemy!: Phaser.GameObjects.Sprite
        private heroHpBar!: Phaser.GameObjects.Graphics
        private enemyHpBar!: Phaser.GameObjects.Graphics
        private levelText!: Phaser.GameObjects.Text
        private statusText!: Phaser.GameObjects.Text
        private multiplierText!: Phaser.GameObjects.Text
        
        private enemyStats = { hp: 50, maxHp: 50, attack: 10, name: 'Nightwing' }
        private particles!: Phaser.GameObjects.Particles.ParticleEmitter

        constructor() { super({ key: 'DungeonBattleScene' }) }

        init(data: { totalWin?: number; heroStats?: { hp: number; maxHp: number; attack: number; crit: number; defense: number }; relics?: { vitality: number; strength: number; fury: number; protection: number } }) {
          this.totalWin = data?.totalWin || 0
          this.heroStats = data?.heroStats ? { ...data.heroStats } : { hp: 100, maxHp: 100, attack: 15, crit: 10, defense: 5 }
          this.relics = data?.relics || { vitality: 0, strength: 0, fury: 0, protection: 0 }
          this.currentLevel = 1
          this.bonusMultiplier = 1
          
          // Apply relics to stats
          this.heroStats.maxHp += this.relics.vitality * 10
          this.heroStats.hp = this.heroStats.maxHp
          this.heroStats.attack += this.relics.strength * 2
          this.heroStats.crit += this.relics.fury * 3
          this.heroStats.defense += this.relics.protection
        }

        create() {
          // Dark dungeon background
          const bg = this.add.graphics()
          bg.fillGradientStyle(0x0a0a1a, 0x0a0a1a, 0x1a1a3a, 0x1a1a3a)
          bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
          
          // Add atmospheric particles
          for (let i = 0; i < 20; i++) {
            const dust = this.add.circle(Phaser.Math.Between(0, GAME_WIDTH), Phaser.Math.Between(0, GAME_HEIGHT), Phaser.Math.Between(1, 2), 0x7C3AED, 0.3)
            this.tweens.add({
              targets: dust, y: dust.y - 100, alpha: 0, duration: Phaser.Math.Between(3000, 5000), repeat: -1,
              onRepeat: () => { dust.x = Phaser.Math.Between(0, GAME_WIDTH); dust.y = GAME_HEIGHT + 10; dust.alpha = 0.3 }
            })
          }

          // Level indicator
          this.levelText = this.add.text(GAME_WIDTH / 2, 30, 'DUNGEON LEVEL 1/3', {
            fontSize: '28px', fontFamily: 'Arial Black', color: '#7C3AED', stroke: '#000000', strokeThickness: 4
          }).setOrigin(0.5)

          // Multiplier display
          this.multiplierText = this.add.text(GAME_WIDTH / 2, 65, 'BONUS MULTIPLIER: x1', {
            fontSize: '18px', fontFamily: 'Arial Black', color: '#FFD700', stroke: '#000000', strokeThickness: 3
          }).setOrigin(0.5)

          // Status text
          this.statusText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 50, 'Prepare for battle!', {
            fontSize: '20px', fontFamily: 'Arial Black', color: '#FFFFFF', stroke: '#000000', strokeThickness: 3
          }).setOrigin(0.5)

          // Create hero
          this.hero = this.add.sprite(300, GAME_HEIGHT / 2 + 50, 'knight', 0)
          this.hero.setScale(2)
          this.hero.play('knight_idle')

          // Create relic stats panel
          this.createRelicPanel()

          // Create hero HP bar
          this.createHeroHpBar()

          // Particles
          this.particles = this.add.particles(0, 0, 'gems', {
            frame: [0, 1, 2, 3, 4, 5],
            lifespan: 800,
            speed: { min: 80, max: 200 },
            scale: { start: 0.4, end: 0 },
            gravityY: 150,
            emitting: false
          })
          this.particles.setDepth(20)

          // Start first battle after delay
          this.time.delayedCall(1000, () => this.startLevel())
        }

        createRelicPanel() {
          const panel = this.add.graphics()
          panel.fillStyle(0x1a1a1a, 0.9)
          panel.fillRoundedRect(30, 120, 180, 150, 8)
          panel.lineStyle(2, 0x7C3AED)
          panel.strokeRoundedRect(30, 120, 180, 150, 8)

          this.add.text(120, 135, 'HERO STATS', { fontSize: '14px', fontFamily: 'Arial Black', color: '#7C3AED' }).setOrigin(0.5)
          
          const stats = [
            { label: 'HP:', value: this.heroStats.hp + '/' + this.heroStats.maxHp, color: '#22C55E', y: 160 },
            { label: 'ATK:', value: this.heroStats.attack.toString(), color: '#EF4444', y: 185 },
            { label: 'CRT:', value: this.heroStats.crit + '%', color: '#FBBF24', y: 210 },
            { label: 'DEF:', value: this.heroStats.defense.toString(), color: '#3B82F6', y: 235 }
          ]
          
          stats.forEach(s => {
            this.add.text(45, s.y, s.label, { fontSize: '14px', color: s.color })
            this.add.text(100, s.y, s.value, { fontSize: '14px', color: '#FFFFFF' })
          })
        }

        createHeroHpBar() {
          this.heroHpBar = this.add.graphics()
          this.heroHpBar.setDepth(15)
          this.updateHeroHpBar()
        }

        updateHeroHpBar() {
          this.heroHpBar.clear()
          const x = this.hero.x - 60
          const y = this.hero.y - 100
          this.heroHpBar.fillStyle(0x333333)
          this.heroHpBar.fillRect(x, y, 120, 16)
          this.heroHpBar.fillStyle(0x22C55E)
          this.heroHpBar.fillRect(x + 2, y + 2, 116 * (this.heroStats.hp / this.heroStats.maxHp), 12)
          this.heroHpBar.lineStyle(2, 0xFFFFFF)
          this.heroHpBar.strokeRect(x, y, 120, 16)
        }

        createEnemyHpBar() {
          this.enemyHpBar = this.add.graphics()
          this.enemyHpBar.setDepth(15)
          this.updateEnemyHpBar()
        }

        updateEnemyHpBar() {
          if (!this.enemyHpBar || !this.enemy) return
          this.enemyHpBar.clear()
          const x = this.enemy.x - 60
          const y = this.enemy.y - 80
          this.enemyHpBar.fillStyle(0x333333)
          this.enemyHpBar.fillRect(x, y, 120, 16)
          this.enemyHpBar.fillStyle(0xEF4444)
          this.enemyHpBar.fillRect(x + 2, y + 2, 116 * (this.enemyStats.hp / this.enemyStats.maxHp), 12)
          this.enemyHpBar.lineStyle(2, 0xFFFFFF)
          this.enemyHpBar.strokeRect(x, y, 120, 16)
          
          // Enemy name
          this.add.text(this.enemy.x, y - 20, this.enemyStats.name, {
            fontSize: '16px', fontFamily: 'Arial Black', color: '#EF4444', stroke: '#000000', strokeThickness: 2
          }).setOrigin(0.5)
        }

        startLevel() {
          this.levelText.setText('DUNGEON LEVEL ' + this.currentLevel + '/' + this.totalLevels)
          
          // Determine enemy based on level
          if (this.currentLevel === 3) {
            // Final Boss - "The Old One"
            this.enemyStats = { hp: 200, maxHp: 200, attack: 25, name: 'THE OLD ONE' }
            this.statusText.setText('?? FINAL BOSS APPROACHES! ??')
            const playBoss = this.registry.get('playBossSound')
            if (playBoss) playBoss()
          } else if (this.currentLevel === 2) {
            // Mini-boss
            this.enemyStats = { hp: 100, maxHp: 100, attack: 18, name: 'ELDERFANG' }
            this.statusText.setText('Mini-Boss: Elderfang awakens!')
          } else {
            // Regular enemy
            this.enemyStats = { hp: 60 + this.currentLevel * 20, maxHp: 60 + this.currentLevel * 20, attack: 10 + this.currentLevel * 3, name: 'NIGHTWING' }
            this.statusText.setText('A Nightwing blocks your path!')
          }

          // Spawn enemy with animation
          this.enemy = this.add.sprite(GAME_WIDTH - 300, GAME_HEIGHT / 2 + 50, 'dragon', 0)
          this.enemy.setScale(this.currentLevel === 3 ? 2.5 : 1.8)
          this.enemy.setFlipX(true)
          this.enemy.setAlpha(0)
          this.enemy.play('dragon_idle')

          this.tweens.add({
            targets: this.enemy, alpha: 1, x: GAME_WIDTH - 350, duration: 800, ease: 'Back.easeOut',
            onComplete: () => {
              this.createEnemyHpBar()
              this.time.delayedCall(500, () => this.doBattle())
            }
          })
        }

        async doBattle() {
          while (this.enemyStats.hp > 0 && this.heroStats.hp > 0) {
            // Hero attacks
            const isCrit = Math.random() < (this.heroStats.crit / 100)
            const heroDamage = Math.floor(this.heroStats.attack * (isCrit ? 2.5 : 1))
            this.enemyStats.hp = Math.max(0, this.enemyStats.hp - heroDamage)
            
            this.hero.play('knight_attack')
            if (isCrit) {
              const playCrit = this.registry.get('playCritSound')
              if (playCrit) playCrit()
            } else {
              const playHit = this.registry.get('playHitSound')
              if (playHit) playHit()
            }
            
            this.showDamageNumber(this.enemy.x, this.enemy.y - 50, heroDamage, isCrit)
            this.updateEnemyHpBar()
            this.tweens.add({ targets: this.enemy, x: this.enemy.x + 20, duration: 50, yoyo: true, repeat: 2 })
            
            await this.delay(400)
            this.hero.play('knight_idle')
            
            if (this.enemyStats.hp <= 0) break
            
            // Enemy attacks
            const enemyDamage = Math.max(1, this.enemyStats.attack - this.heroStats.defense)
            this.heroStats.hp = Math.max(0, this.heroStats.hp - enemyDamage)
            
            this.enemy.play('dragon_attack')
            const playHit = this.registry.get('playHitSound')
            if (playHit) playHit()
            
            this.showDamageNumber(this.hero.x, this.hero.y - 50, enemyDamage, false)
            this.updateHeroHpBar()
            this.tweens.add({ targets: this.hero, x: this.hero.x - 20, duration: 50, yoyo: true, repeat: 2 })
            
            await this.delay(400)
            this.enemy.play('dragon_idle')
            await this.delay(200)
          }

          if (this.enemyStats.hp <= 0) {
            await this.onEnemyDefeated()
          } else {
            await this.onHeroDefeated()
          }
        }

        async onEnemyDefeated() {
          const playVictory = this.registry.get('playVictorySound')
          if (playVictory) playVictory()
          
          // Bonus for defeating enemy
          const levelBonus = this.currentLevel === 3 ? 50 : (this.currentLevel === 2 ? 20 : 10)
          this.bonusMultiplier += levelBonus / 10
          this.multiplierText.setText('BONUS MULTIPLIER: x' + this.bonusMultiplier.toFixed(1))
          
          // Enemy death animation
          this.particles.emitParticleAt(this.enemy.x, this.enemy.y, 30)
          this.tweens.add({
            targets: this.enemy, alpha: 0, scale: 0.3, angle: 180, duration: 500,
            onComplete: () => { this.enemy.destroy(); if (this.enemyHpBar) this.enemyHpBar.destroy() }
          })

          // Victory message
          const victoryText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, this.enemyStats.name + ' DEFEATED!\n+' + levelBonus + '% Multiplier', {
            fontSize: '36px', fontFamily: 'Arial Black', color: '#22C55E', stroke: '#000000', strokeThickness: 5, align: 'center'
          }).setOrigin(0.5)
          
          this.tweens.add({
            targets: victoryText, scale: { from: 0.5, to: 1.1 }, duration: 300, yoyo: true,
            onComplete: () => {
              this.tweens.add({ targets: victoryText, alpha: 0, duration: 400, onComplete: () => victoryText.destroy() })
            }
          })

          // Drop power relic
          await this.delay(800)
          await this.dropRelic()
          
          // Progress to next level or Treasure Hall
          if (this.currentLevel < this.totalLevels) {
            this.currentLevel++
            await this.showStaircaseTransition()
            this.startLevel()
          } else {
            // Final boss defeated - go to Treasure Hall!
            await this.showFinalVictory()
          }
        }

        async dropRelic() {
          const relicTypes = ['VIT +1', 'STR +1', 'FRY +2%', 'PRT +1']
          const relicType = relicTypes[Phaser.Math.Between(0, 3)]
          
          const playRelic = this.registry.get('playRelicSound')
          if (playRelic) playRelic()
          
          const relicText = this.add.text(this.enemy?.x || GAME_WIDTH / 2, this.enemy?.y || GAME_HEIGHT / 2, '?? ' + relicType, {
            fontSize: '24px', fontFamily: 'Arial Black', color: '#FFD700', stroke: '#000000', strokeThickness: 3
          }).setOrigin(0.5)
          
          this.tweens.add({
            targets: relicText, y: relicText.y - 80, alpha: 0, duration: 1000,
            onComplete: () => relicText.destroy()
          })
          
          // Apply relic
          if (relicType.includes('VIT')) { this.heroStats.maxHp += 10; this.heroStats.hp = Math.min(this.heroStats.hp + 10, this.heroStats.maxHp) }
          else if (relicType.includes('STR')) this.heroStats.attack += 2
          else if (relicType.includes('FRY')) this.heroStats.crit += 2
          else if (relicType.includes('PRT')) this.heroStats.defense += 1
          
          this.updateHeroHpBar()
          await this.delay(500)
        }

        async showStaircaseTransition() {
          const playTransition = this.registry.get('playTransitionSound')
          if (playTransition) playTransition()
          
          this.statusText.setText('Descending deeper into the dungeon...')
          
          // Screen pan effect
          this.cameras.main.fade(500, 0, 0, 0)
          await this.delay(500)
          this.cameras.main.fadeIn(500)
          await this.delay(500)
        }

        async showFinalVictory() {
          // Epic victory screen
          const overlay = this.add.graphics()
          overlay.fillStyle(0x000000, 0.8)
          overlay.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
          
          const title = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80, '?? THE OLD ONE VANQUISHED! ??', {
            fontSize: '40px', fontFamily: 'Arial Black', color: '#FFD700', stroke: '#000000', strokeThickness: 6
          }).setOrigin(0.5)
          
          const multiplierFinal = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'FINAL MULTIPLIER: x' + (this.bonusMultiplier * 2).toFixed(1), {
            fontSize: '32px', fontFamily: 'Arial Black', color: '#22C55E', stroke: '#000000', strokeThickness: 5
          }).setOrigin(0.5)
          
          const proceed = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 80, 'ENTERING TREASURE HALL...', {
            fontSize: '24px', fontFamily: 'Arial Black', color: '#FFFFFF', stroke: '#000000', strokeThickness: 4
          }).setOrigin(0.5)
          
          this.tweens.add({ targets: [title, multiplierFinal, proceed], scale: { from: 0.5, to: 1 }, duration: 500 })
          
          const playVictory = this.registry.get('playVictorySound')
          if (playVictory) playVictory()
          
          await this.delay(3000)
          
          // Proceed to Treasure Hall with bonus multiplier
          this.scene.start('TreasureHallScene', {
            totalWin: this.totalWin,
            heroStats: this.heroStats,
            bonusMultiplier: this.bonusMultiplier * 2  // Double for defeating final boss
          })
        }

        async onHeroDefeated() {
          this.statusText.setText('Hero has fallen... But the treasure awaits!')
          
          this.tweens.add({ targets: this.hero, alpha: 0.3, y: this.hero.y + 30, duration: 500 })
          
          await this.delay(2000)
          
          // Still go to Treasure Hall but with reduced multiplier
          this.scene.start('TreasureHallScene', {
            totalWin: this.totalWin,
            heroStats: this.heroStats,
            bonusMultiplier: Math.max(1, this.bonusMultiplier * 0.5)  // Reduced for defeat
          })
        }

        showDamageNumber(x: number, y: number, damage: number, isCrit: boolean) {
          const text = this.add.text(x, y, '-' + damage, {
            fontSize: isCrit ? '32px' : '24px', fontFamily: 'Arial Black',
            color: isCrit ? '#FFD700' : '#FFFFFF', stroke: '#000000', strokeThickness: 3
          }).setOrigin(0.5)
          if (isCrit) {
            this.add.text(x, y - 25, 'CRITICAL!', {
              fontSize: '14px', fontFamily: 'Arial Black', color: '#FF6600', stroke: '#000000', strokeThickness: 2
            }).setOrigin(0.5)
          }
          this.tweens.add({ targets: text, y: y - 50, alpha: 0, duration: 800, onComplete: () => text.destroy() })
        }

        delay(ms: number): Promise<void> { return new Promise(resolve => this.time.delayedCall(ms, resolve)) }
      }

      class TreasureHallScene extends Phaser.Scene {
        private grid: Phaser.GameObjects.Graphics[][] = []
        private gridData: { unlocked: boolean; coin: number | null; merged?: boolean }[][] = []
        private total = 0
        private multiplier = 1
        private bonusMultiplier = 1  // From dungeon battles
        private livesText!: Phaser.GameObjects.Text
        private totalText!: Phaser.GameObjects.Text
        private multiplierText!: Phaser.GameObjects.Text
        private coinTexts: Phaser.GameObjects.Text[][] = []
        private spinsLeft = 3

        constructor() { super({ key: 'TreasureHallScene' }) }

        init(data: { totalWin?: number; heroStats?: unknown; bonusMultiplier?: number }) {
          this.spinsLeft = 3
          this.total = 0
          this.multiplier = 1
          this.bonusMultiplier = data?.bonusMultiplier || 1
        }

        create() {
          // Play victory music
          const playVictory = this.registry.get('playVictorySound')
          if (playVictory) playVictory()
          
          const bg = this.add.graphics()
          bg.fillGradientStyle(0x8B4513, 0x8B4513, 0xDAA520, 0xDAA520)
          bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

          for (let i = 0; i < 30; i++) {
            const sparkle = this.add.circle(Phaser.Math.Between(0, GAME_WIDTH), Phaser.Math.Between(0, GAME_HEIGHT), Phaser.Math.Between(1, 3), 0xFFFFFF, 0.5)
            this.tweens.add({ targets: sparkle, alpha: { from: 0.2, to: 0.8 }, duration: Phaser.Math.Between(500, 1500), yoyo: true, repeat: -1 })
          }

          this.add.text(GAME_WIDTH / 2, 40, 'TREASURE HALL', { fontSize: '42px', fontFamily: 'Arial Black', color: '#FFD700', stroke: '#000000', strokeThickness: 5 }).setOrigin(0.5)
          this.livesText = this.add.text(100, 95, 'Spins: 3', { fontSize: '22px', color: '#FFFFFF' })
          this.totalText = this.add.text(GAME_WIDTH - 100, 95, 'Total: $0.00', { fontSize: '22px', color: '#FFD700', fontFamily: 'Arial Black' }).setOrigin(1, 0)
          this.multiplierText = this.add.text(GAME_WIDTH / 2, 95, 'MULTIPLIER: x1', { fontSize: '20px', color: '#FF6600', fontFamily: 'Arial Black' }).setOrigin(0.5)

          this.initGrid()
          this.time.delayedCall(800, () => this.processSpin())
        }

        initGrid() {
          const offsetX = GAME_WIDTH / 2 - (GRID_COLS * 55) / 2
          const offsetY = 150
          this.gridData = []
          this.grid = []
          this.coinTexts = []

          for (let row = 0; row < GRID_ROWS; row++) {
            this.gridData[row] = []
            this.grid[row] = []
            this.coinTexts[row] = []
            for (let col = 0; col < GRID_COLS; col++) {
              const isCenter = row >= 2 && row <= 5 && col >= 2 && col <= 5
              this.gridData[row][col] = { unlocked: isCenter, coin: null }
              const cell = this.add.graphics()
              cell.fillStyle(isCenter ? 0x5a4a3a : 0x3a2a1a)
              cell.fillRoundedRect(offsetX + col * 55, offsetY + row * 55, 50, 50, 6)
              if (!isCenter) {
                cell.lineStyle(2, 0x2a1a0a)
                cell.strokeRoundedRect(offsetX + col * 55, offsetY + row * 55, 50, 50, 6)
              }
              this.grid[row][col] = cell
              this.coinTexts[row][col] = this.add.text(offsetX + col * 55 + 25, offsetY + row * 55 + 25, '', { fontSize: '11px', color: '#1a1a1a', fontFamily: 'Arial Black' }).setOrigin(0.5)
            }
          }
        }

        async processSpin() {
          let landed = false
          const offsetX = GAME_WIDTH / 2 - (GRID_COLS * 55) / 2
          const offsetY = 150

          for (let row = 0; row < GRID_ROWS; row++) {
            for (let col = 0; col < GRID_COLS; col++) {
              if (this.gridData[row][col].unlocked && this.gridData[row][col].coin === null) {
                const rand = Math.random()
                if (rand < 0.14) {
                  const values = [1, 2, 3, 5, 10, 25, 50]
                  const value = values[Math.floor(Math.random() * values.length)] * window.gameBetAmount
                  this.gridData[row][col].coin = value
                  this.grid[row][col].clear()
                  this.grid[row][col].fillStyle(0xFFD700)
                  this.grid[row][col].fillRoundedRect(offsetX + col * 55, offsetY + row * 55, 50, 50, 6)
                  this.grid[row][col].lineStyle(2, 0xFFA500)
                  this.grid[row][col].strokeRoundedRect(offsetX + col * 55, offsetY + row * 55, 50, 50, 6)
                  this.coinTexts[row][col].setText('$' + value.toFixed(0))
                  this.tweens.add({ targets: this.grid[row][col], scale: { from: 0.6, to: 1 }, duration: 180 })
                  landed = true
                } else if (rand < 0.18) {
                  const adj = [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]
                  for (const [ar, ac] of adj) {
                    if (ar >= 0 && ar < GRID_ROWS && ac >= 0 && ac < GRID_COLS && !this.gridData[ar][ac].unlocked) {
                      this.gridData[ar][ac].unlocked = true
                      this.grid[ar][ac].clear()
                      this.grid[ar][ac].fillStyle(0x5a4a3a)
                      this.grid[ar][ac].fillRoundedRect(offsetX + ac * 55, offsetY + ar * 55, 50, 50, 6)
                      this.tweens.add({ targets: this.grid[ar][ac], scale: { from: 0.5, to: 1 }, duration: 200 })
                    }
                  }
                  landed = true
                } else if (rand < 0.20) {
                  this.multiplier++
                  this.multiplierText.setText('MULTIPLIER: x' + this.multiplier)
                  landed = true
                }
              }
            }
          }

          this.checkMerge(offsetX, offsetY)

          this.total = 0
          for (let row = 0; row < GRID_ROWS; row++) {
            for (let col = 0; col < GRID_COLS; col++) {
              if (this.gridData[row][col].coin) this.total += this.gridData[row][col].coin!
            }
          }
          this.totalText.setText('Total: $' + (this.total * this.multiplier).toFixed(2))

          if (landed) this.spinsLeft = 3
          else this.spinsLeft--

          const livesDisplay = '?'.repeat(Math.max(0, this.spinsLeft)) + '?'.repeat(3 - Math.max(0, this.spinsLeft))
          this.livesText.setText('Spins: ' + livesDisplay)

          if (this.spinsLeft <= 0) {
            await this.delay(400)
            this.endBonus()
            return
          }

          await this.delay(800)
          this.processSpin()
        }

        checkMerge(offsetX: number, offsetY: number) {
          for (let row = 0; row < GRID_ROWS - 1; row++) {
            for (let col = 0; col < GRID_COLS - 1; col++) {
              const c1 = this.gridData[row][col]
              const c2 = this.gridData[row][col + 1]
              const c3 = this.gridData[row + 1][col]
              const c4 = this.gridData[row + 1][col + 1]
              if (c1.coin && c2.coin && c3.coin && c4.coin) {
                const mergedValue = (c1.coin + c2.coin + c3.coin + c4.coin) * 2
                c1.coin = mergedValue
                c2.coin = null
                c3.coin = null
                c4.coin = null
                this.coinTexts[row][col + 1].setText('')
                this.coinTexts[row + 1][col].setText('')
                this.coinTexts[row + 1][col + 1].setText('')
                this.grid[row][col].clear()
                this.grid[row][col].fillStyle(0xFFD700)
                this.grid[row][col].fillRoundedRect(offsetX + col * 55, offsetY + row * 55, 105, 105, 8)
                this.grid[row][col].lineStyle(3, 0xFF8C00)
                this.grid[row][col].strokeRoundedRect(offsetX + col * 55, offsetY + row * 55, 105, 105, 8)
                this.coinTexts[row][col].setText('$' + mergedValue.toFixed(0))
                this.coinTexts[row][col].setFontSize(16)
                this.coinTexts[row][col].setPosition(offsetX + col * 55 + 52, offsetY + row * 55 + 52)
                this.tweens.add({ targets: this.grid[row][col], scale: { from: 0.85, to: 1 }, duration: 250, ease: 'Back.easeOut' })
              }
            }
          }
        }

        endBonus() {
          // Apply both in-game multiplier AND bonus multiplier from dungeon battles
          const finalWin = this.total * this.multiplier * this.bonusMultiplier
          window.onWin(finalWin)
          
          const playVictory = this.registry.get('playVictorySound')
          if (playVictory) playVictory()

          const overlay = this.add.graphics()
          overlay.fillStyle(0x000000, 0.7)
          overlay.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

          const text = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, 'TREASURE COLLECTED!', { fontSize: '40px', fontFamily: 'Arial Black', color: '#FFD700', stroke: '#000000', strokeThickness: 5 }).setOrigin(0.5)
          
          if (this.bonusMultiplier > 1) {
            const bonusText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'DUNGEON BONUS: x' + this.bonusMultiplier.toFixed(1), { fontSize: '24px', fontFamily: 'Arial Black', color: '#22C55E', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5)
            this.tweens.add({ targets: bonusText, scale: { from: 0.5, to: 1 }, duration: 400 })
          }
          
          const winText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, '$' + finalWin.toFixed(2), { fontSize: '56px', fontFamily: 'Arial Black', color: '#FFFFFF', stroke: '#000000', strokeThickness: 6 }).setOrigin(0.5)

          this.tweens.add({ targets: [text, winText], scale: { from: 0.5, to: 1 }, duration: 400 })
          this.time.delayedCall(3000, () => { this.scene.start('GameScene') })
        }

        delay(ms: number): Promise<void> { return new Promise(resolve => this.time.delayedCall(ms, resolve)) }
      }

      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.WEBGL,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        parent: gameContainerRef.current!,
        backgroundColor: '#0A0A0A',
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [BootScene, GameScene, DungeonBattleScene, TreasureHallScene],
        physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
        audio: { disableWebAudio: false }
      }

      gameInstanceRef.current = new Phaser.Game(config)
    }

    initPhaser()

    return () => {
      if (gameInstanceRef.current) {
        gameInstanceRef.current.destroy(true)
        gameInstanceRef.current = null
      }
    }
  }, [])

  const handleSpin = useCallback(() => {
    if (gameState !== 'IDLE' || balance < betAmount) return
    const game = gameInstanceRef.current
    if (game) {
      const scene = game.scene.getScene('GameScene') as { spin?: () => void }
      if (scene?.spin) scene.spin()
    }
  }, [gameState, balance, betAmount])

  const handleBonusBuy = useCallback((type: 'standard' | 'super' | 'mega') => {
    const costs = { standard: betAmount * 50, super: betAmount * 100, mega: betAmount * 200 }
    const cost = costs[type]
    if (balance < cost) return

    setBalance(balance - cost)
    recordBet(cost)
    setShowBonusBuy(false)

    const game = gameInstanceRef.current
    if (game) {
      const scene = game.scene.getScene('GameScene') as { triggerBonusDirect?: () => void }
      if (scene?.triggerBonusDirect) scene.triggerBonusDirect()
    }
  }, [balance, betAmount, setBalance, recordBet])

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <header className="flex-shrink-0 bg-gradient-to-r from-gray-900 via-purple-900/30 to-gray-900 px-4 py-2 border-b border-purple-500/30 flex items-center justify-between">
        <button onClick={() => router.push('/casino')} className="text-white/70 hover:text-white px-4 py-2 transition">Exit</button>
        <h1 className="text-xl font-bold bg-gradient-to-r from-amber-400 via-purple-400 to-amber-400 bg-clip-text text-transparent">ELDRITCH DUNGEON</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowBonusBuy(true)} className="text-xs px-3 py-1 bg-amber-600/50 hover:bg-amber-600 rounded text-amber-200 transition">Buy Bonus</button>
          <button onClick={() => setShowPaytable(true)} className="text-xs px-3 py-1 bg-gray-800/50 hover:bg-gray-700 rounded text-gray-300 transition">Info</button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center overflow-hidden bg-black relative">
        {isLoading && (<div className="absolute inset-0 flex items-center justify-center bg-black z-50"><div className="text-purple-400 text-xl animate-pulse">Entering Dungeon...</div></div>)}
        <div ref={gameContainerRef} className="w-full h-full max-w-[1280px] max-h-[720px]" />
      </main>

      {totalWin > 0 && (<div className="absolute top-20 left-1/2 -translate-x-1/2 z-20"><div className="text-2xl font-bold text-yellow-400 animate-pulse">SESSION WIN: ${totalWin.toFixed(2)}</div></div>)}

      <footer className="flex-shrink-0 bg-gradient-to-t from-gray-950 to-gray-900 border-t border-purple-500/30 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="text-center"><div className="text-xs text-gray-500">BALANCE</div><div className="text-lg font-bold text-white">${balance.toLocaleString()}</div></div>
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
            <button onClick={() => setBetAmount(Math.max(0.1, +(betAmount / 2).toFixed(2)))} disabled={gameState !== 'IDLE'} className="w-8 h-8 rounded bg-purple-700 hover:bg-purple-600 text-white font-bold disabled:opacity-50 transition">-</button>
            <div className="w-20 text-center"><div className="text-xs text-gray-500">BET</div><div className="text-lg font-bold text-white">${betAmount.toFixed(2)}</div></div>
            <button onClick={() => setBetAmount(Math.min(100, +(betAmount * 2).toFixed(2)))} disabled={gameState !== 'IDLE'} className="w-8 h-8 rounded bg-purple-700 hover:bg-purple-600 text-white font-bold disabled:opacity-50 transition">+</button>
          </div>
          <button onClick={handleSpin} disabled={gameState !== 'IDLE' || betAmount > balance} className="px-12 py-3 bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-500 hover:to-indigo-600 disabled:opacity-50 rounded-xl font-bold text-xl text-white border-2 border-purple-400 shadow-lg shadow-purple-500/30 transition">{gameState === 'IDLE' ? 'SPIN' : gameState}</button>
          <div className="text-center"><div className="text-xs text-gray-500">STATE</div><div className="text-sm font-bold text-purple-400">{gameState}</div></div>
        </div>
      </footer>

      {/* Bonus Buy Modal */}
      {showBonusBuy && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4" onClick={() => setShowBonusBuy(false)}>
          <div className="bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl p-6 max-w-md w-full border border-amber-500/50" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-bold text-amber-400 text-center mb-6">BUY BONUS</h2>
            <div className="space-y-4">
              <button onClick={() => handleBonusBuy('standard')} disabled={balance < betAmount * 50} className="w-full p-4 bg-gradient-to-r from-amber-700 to-amber-800 hover:from-amber-600 hover:to-amber-700 disabled:opacity-40 rounded-xl border border-amber-500/50 transition">
                <div className="text-lg font-bold text-white">Standard Bonus</div>
                <div className="text-sm text-amber-200">3 spins to start - ${(betAmount * 50).toFixed(2)}</div>
              </button>
              <button onClick={() => handleBonusBuy('super')} disabled={balance < betAmount * 100} className="w-full p-4 bg-gradient-to-r from-purple-700 to-purple-800 hover:from-purple-600 hover:to-purple-700 disabled:opacity-40 rounded-xl border border-purple-500/50 transition">
                <div className="text-lg font-bold text-white">Super Bonus</div>
                <div className="text-sm text-purple-200">5 spins + 2x multi - ${(betAmount * 100).toFixed(2)}</div>
              </button>
              <button onClick={() => handleBonusBuy('mega')} disabled={balance < betAmount * 200} className="w-full p-4 bg-gradient-to-r from-red-700 to-red-800 hover:from-red-600 hover:to-red-700 disabled:opacity-40 rounded-xl border border-red-500/50 transition">
                <div className="text-lg font-bold text-white">MEGA Bonus</div>
                <div className="text-sm text-red-200">7 spins + 3x multi - ${(betAmount * 200).toFixed(2)}</div>
              </button>
            </div>
            <button onClick={() => setShowBonusBuy(false)} className="w-full mt-4 py-2 bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700 transition">Cancel</button>
          </div>
        </div>
      )}

      {/* Paytable Modal */}
      {showPaytable && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4" onClick={() => setShowPaytable(false)}>
          <div className="bg-gray-900 rounded-2xl p-6 max-w-lg w-full border border-purple-500/50 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-bold text-purple-400 text-center mb-4">GAME INFO</h2>
            <div className="space-y-4 text-sm">
              <div>
                <h3 className="text-amber-400 font-bold mb-2">How Hero Movement Works</h3>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>Hero starts on plinth (left of grid) in idle stance</p>
                  <p>Warrior Symbol + adjacent cluster = Hero enters the grid</p>
                  <p>Hero moves through ALL connected empty tiles toward the Exit</p>
                  <p>Empty tiles are created when winning clusters explode</p>
                  <p>Hero can move diagonally through empty spaces</p>
                  <p>Reach the Exit door (column 8) for Treasure Hall bonus!</p>
                </div>
              </div>
              <div>
                <h3 className="text-amber-400 font-bold mb-2">Symbol Payouts (5+ adjacent)</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-gray-800 p-2 rounded">Red/Blue: 0.2x - 75x</div>
                  <div className="bg-gray-800 p-2 rounded">Green: 0.3x - 100x</div>
                  <div className="bg-gray-800 p-2 rounded">Yellow: 0.4x - 150x</div>
                  <div className="bg-gray-800 p-2 rounded">Purple: 0.5x - 200x</div>
                  <div className="bg-gray-800 p-2 rounded">White: 1x - 500x</div>
                  <div className="bg-gray-800 p-2 rounded text-yellow-400">Wild: 5x - 2500x</div>
                </div>
              </div>
              <div>
                <h3 className="text-amber-400 font-bold mb-2">Treasure Hall Bonus</h3>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>Start with 3 spins - each coin resets to 3</p>
                  <p>Coins land on unlocked tiles and multiply by bet</p>
                  <p>2x2 coin groups MERGE and DOUBLE value!</p>
                  <p>Special symbols can increase multiplier</p>
                </div>
              </div>
              <div className="text-center text-xs text-gray-500 border-t border-gray-700 pt-2">RTP: 96.10% | Max Win: 20,000x | Volatility: Very High</div>
            </div>
            <button onClick={() => setShowPaytable(false)} className="w-full mt-4 py-2 bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700 transition">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
