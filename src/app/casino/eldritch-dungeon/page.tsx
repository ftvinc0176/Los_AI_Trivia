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
const GRID_X = 480
const GRID_Y = 80

type SymbolType = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'white' | 'wild' | 'warrior'
type GameState = 'IDLE' | 'SPINNING' | 'CASCADE' | 'BATTLE_WALK' | 'COMBAT' | 'BONUS_TRANSITION' | 'TREASURE_HALL'

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

const SYMBOL_WEIGHTS = [20, 20, 18, 15, 12, 8, 0, 0]
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

        preload() {
          const width = this.cameras.main.width
          const height = this.cameras.main.height
          const progressBar = this.add.graphics()
          const progressBox = this.add.graphics()
          progressBox.fillStyle(0x222222, 0.8)
          progressBox.fillRect(width / 2 - 160, height / 2 - 25, 320, 50)
          const loadingText = this.add.text(width / 2, height / 2 - 50, 'Loading Dungeon...', { fontSize: '20px', color: '#ffffff' }).setOrigin(0.5)

          this.load.on('progress', (value: number) => {
            progressBar.clear()
            progressBar.fillStyle(0x7C3AED, 1)
            progressBar.fillRect(width / 2 - 150, height / 2 - 15, 300 * value, 30)
          })

          this.load.on('complete', () => {
            progressBar.destroy()
            progressBox.destroy()
            loadingText.destroy()
          })

          this.load.image('background', 'https://labs.phaser.io/assets/skies/space3.png')
          this.load.spritesheet('knight', 'https://labs.phaser.io/assets/sprites/knight.png', { frameWidth: 84, frameHeight: 84 })
          this.load.spritesheet('dragon', 'https://labs.phaser.io/assets/sprites/dragon.png', { frameWidth: 128, frameHeight: 128 })
          this.load.spritesheet('gems', 'https://labs.phaser.io/assets/sprites/gems.png', { frameWidth: 64, frameHeight: 64 })
          this.load.audio('battle', 'https://labs.phaser.io/assets/audio/Short/Dragon-Attack.mp3')
          this.load.audio('ping', 'https://labs.phaser.io/assets/audio/SoundEffects/p-ping.mp3')
        }

        create() {
          this.anims.create({ key: 'knight_idle', frames: this.anims.generateFrameNumbers('knight', { start: 0, end: 3 }), frameRate: 8, repeat: -1 })
          this.anims.create({ key: 'knight_walk', frames: this.anims.generateFrameNumbers('knight', { start: 4, end: 11 }), frameRate: 12, repeat: -1 })
          this.anims.create({ key: 'knight_attack', frames: this.anims.generateFrameNumbers('knight', { start: 12, end: 19 }), frameRate: 15, repeat: 0 })
          this.anims.create({ key: 'dragon_idle', frames: this.anims.generateFrameNumbers('dragon', { start: 0, end: 3 }), frameRate: 6, repeat: -1 })
          this.anims.create({ key: 'dragon_attack', frames: this.anims.generateFrameNumbers('dragon', { start: 4, end: 7 }), frameRate: 10, repeat: 0 })
          this.scene.start('GameScene')
          setIsLoading(false)
        }
      }

      class GameScene extends Phaser.Scene {
        private currentState: GameState = 'IDLE'
        private grid: Phaser.GameObjects.Sprite[][] = []
        private gridData: SymbolType[][] = []
        private hero!: Phaser.GameObjects.Sprite
        private particles!: Phaser.GameObjects.Particles.ParticleEmitter
        private winText!: Phaser.GameObjects.Text
        private totalSpinWin = 0
        private battleTriggered = false
        private warriorPosition: { row: number; col: number } | null = null

        constructor() { super({ key: 'GameScene' }) }

        create() {
          const bg = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'background')
          bg.setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
          bg.setTint(0x1a1a2e)

          const vignette = this.add.graphics()
          vignette.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.8, 0.8, 0, 0)
          vignette.fillRect(0, 0, 200, GAME_HEIGHT)
          vignette.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.8, 0.8)
          vignette.fillRect(GAME_WIDTH - 200, 0, 200, GAME_HEIGHT)

          const gridBg = this.add.graphics()
          gridBg.fillStyle(0x1F1F1F, 0.95)
          gridBg.fillRoundedRect(GRID_X - 20, GRID_Y - 20, GRID_COLS * TILE_SIZE + 40, GRID_ROWS * TILE_SIZE + 40, 15)
          gridBg.lineStyle(3, 0x4A4A4A)
          gridBg.strokeRoundedRect(GRID_X - 20, GRID_Y - 20, GRID_COLS * TILE_SIZE + 40, GRID_ROWS * TILE_SIZE + 40, 15)
          gridBg.lineStyle(1, 0x333333, 0.5)
          for (let i = 0; i <= GRID_COLS; i++) {
            gridBg.moveTo(GRID_X + i * TILE_SIZE, GRID_Y)
            gridBg.lineTo(GRID_X + i * TILE_SIZE, GRID_Y + GRID_ROWS * TILE_SIZE)
          }
          for (let i = 0; i <= GRID_ROWS; i++) {
            gridBg.moveTo(GRID_X, GRID_Y + i * TILE_SIZE)
            gridBg.lineTo(GRID_X + GRID_COLS * TILE_SIZE, GRID_Y + i * TILE_SIZE)
          }
          gridBg.strokePath()

          this.initializeGrid()

          this.hero = this.add.sprite(150, GRID_Y + 3 * TILE_SIZE + TILE_SIZE / 2, 'knight')
          this.hero.setScale(1.2)
          this.hero.play('knight_idle')

          const heroGlow = this.add.graphics()
          heroGlow.fillStyle(0x7C3AED, 0.3)
          heroGlow.fillCircle(150, GRID_Y + 3 * TILE_SIZE + TILE_SIZE / 2 + 30, 40)
          heroGlow.setDepth(-1)

          this.particles = this.add.particles(0, 0, 'gems', {
            frame: [0, 1, 2, 3, 4, 5],
            lifespan: 1000,
            speed: { min: 100, max: 300 },
            scale: { start: 0.4, end: 0 },
            gravityY: 200,
            emitting: false
          })

          this.winText = this.add.text(GRID_X + (GRID_COLS * TILE_SIZE) / 2, 30, '', {
            fontSize: '32px',
            fontFamily: 'Arial Black',
            color: '#FFD700',
            stroke: '#000000',
            strokeThickness: 4
          }).setOrigin(0.5)

          this.add.text(GRID_X + (GRID_COLS * TILE_SIZE) / 2, GRID_Y + GRID_ROWS * TILE_SIZE + 50, 'ELDRITCH DUNGEON', {
            fontSize: '28px',
            fontFamily: 'Arial Black',
            color: '#9333EA',
            stroke: '#000000',
            strokeThickness: 3
          }).setOrigin(0.5)

          this.createHeroPanel()
          this.createDustParticles()
        }

        createHeroPanel() {
          const panel = this.add.graphics()
          panel.fillStyle(0x1A1A1A, 0.9)
          panel.fillRoundedRect(20, 150, 200, 150, 10)
          panel.lineStyle(2, 0x7C3AED)
          panel.strokeRoundedRect(20, 150, 200, 150, 10)
          this.add.text(120, 165, 'ARCANIST', { fontSize: '16px', fontFamily: 'Arial Black', color: '#9333EA' }).setOrigin(0.5)
          this.add.text(30, 195, 'HP:', { fontSize: '14px', color: '#EF4444' })
          const hpBar = this.add.graphics()
          hpBar.fillStyle(0x333333)
          hpBar.fillRect(70, 193, 140, 16)
          hpBar.fillStyle(0x22C55E)
          hpBar.fillRect(72, 195, 136, 12)
          this.add.text(30, 220, 'ATK: 15', { fontSize: '12px', color: '#F97316' })
          this.add.text(120, 220, 'CRT: 10%', { fontSize: '12px', color: '#FBBF24' })
          this.add.text(30, 245, 'DEF: 5', { fontSize: '12px', color: '#3B82F6' })
          this.add.text(120, 275, 'Master of Arcane', { fontSize: '10px', color: '#888888' }).setOrigin(0.5)
        }

        createDustParticles() {
          for (let i = 0; i < 20; i++) {
            const dust = this.add.circle(Phaser.Math.Between(0, GAME_WIDTH), Phaser.Math.Between(0, GAME_HEIGHT), Phaser.Math.Between(1, 3), 0xFFFFFF, 0.3)
            this.tweens.add({
              targets: dust,
              y: dust.y - 100,
              alpha: 0,
              duration: Phaser.Math.Between(3000, 6000),
              repeat: -1,
              onRepeat: () => { dust.x = Phaser.Math.Between(0, GAME_WIDTH); dust.y = GAME_HEIGHT + 10; dust.alpha = 0.3 }
            })
          }
        }

        getRandomSymbol(includeSpecials = false): SymbolType {
          const rand = Math.random()
          if (includeSpecials) {
            if (rand < 0.008) return 'wild'
            if (rand < 0.015) return 'warrior'
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

        getGemFrame(symbol: SymbolType): number {
          switch (symbol) {
            case 'red': return 0
            case 'blue': return 1
            case 'green': return 2
            case 'yellow': return 3
            case 'purple': return 4
            case 'white': return 5
            case 'wild': return 5
            case 'warrior': return 4
            default: return 0
          }
        }

        initializeGrid() {
          this.gridData = []
          this.grid = []
          for (let row = 0; row < GRID_ROWS; row++) {
            this.gridData[row] = []
            this.grid[row] = []
            for (let col = 0; col < GRID_COLS; col++) {
              const symbol = this.getRandomSymbol(true)
              this.gridData[row][col] = symbol
              const sprite = this.add.sprite(GRID_X + col * TILE_SIZE + TILE_SIZE / 2, GRID_Y + row * TILE_SIZE + TILE_SIZE / 2, 'gems', this.getGemFrame(symbol))
              if (symbol === 'wild') { sprite.setTint(0xFFD700); sprite.setScale(1.1) }
              else if (symbol === 'warrior') { sprite.setTint(0xFF6600); sprite.setScale(1.1) }
              this.grid[row][col] = sprite
            }
          }
        }

        async spin() {
          if (this.currentState !== 'IDLE') return
          if (window.gameBalance < window.gameBetAmount) return
          this.currentState = 'SPINNING'
          setGameState('SPINNING')
          this.totalSpinWin = 0
          this.battleTriggered = false
          this.warriorPosition = null
          this.winText.setText('')
          window.onBet(window.gameBetAmount)
          try { this.sound.play('ping', { volume: 0.3 }) } catch (e) { console.log(e) }

          for (let col = 0; col < GRID_COLS; col++) {
            for (let row = 0; row < GRID_ROWS; row++) {
              const symbol = this.getRandomSymbol(true)
              this.gridData[row][col] = symbol
              if (symbol === 'warrior') this.warriorPosition = { row, col }
              const sprite = this.grid[row][col]
              const targetY = GRID_Y + row * TILE_SIZE + TILE_SIZE / 2
              sprite.y = GRID_Y - (GRID_ROWS - row) * TILE_SIZE - 100
              sprite.setFrame(this.getGemFrame(symbol))
              sprite.setScale(1)
              sprite.setTint(0xFFFFFF)
              if (symbol === 'wild') { sprite.setTint(0xFFD700); sprite.setScale(1.1) }
              else if (symbol === 'warrior') { sprite.setTint(0xFF6600); sprite.setScale(1.1) }
              this.tweens.add({
                targets: sprite,
                y: targetY,
                duration: 400 + col * 50,
                delay: col * 80,
                ease: 'Cubic.easeOut',
                onComplete: () => { this.tweens.add({ targets: sprite, scaleY: 0.8, duration: 50, yoyo: true, ease: 'Quad.easeOut' }) }
              })
            }
          }
          await this.delay(600 + GRID_COLS * 80)
          await this.processCascades()
        }

        async processCascades() {
          this.currentState = 'CASCADE'
          setGameState('CASCADE')
          while (true) {
            const clusters = this.findClusters()
            if (clusters.length === 0) break
            const winAmount = this.calculateWin(clusters)
            this.totalSpinWin += winAmount
            if (winAmount > 0) {
              this.winText.setText('WIN: $' + this.totalSpinWin.toFixed(2))
              this.tweens.add({ targets: this.winText, scale: { from: 1.3, to: 1 }, duration: 200 })
            }
            if (!this.battleTriggered && this.warriorPosition) {
              const { row, col } = this.warriorPosition
              const adjacents = [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]
              for (const [ar, ac] of adjacents) {
                for (const cluster of clusters) {
                  if (cluster.cells.some(([r, c]) => r === ar && c === ac)) {
                    this.battleTriggered = true
                    break
                  }
                }
              }
            }
            const winningCells = new Set<string>()
            for (const cluster of clusters) {
              for (const [row, col] of cluster.cells) {
                winningCells.add(row + ',' + col)
                const sprite = this.grid[row][col]
                this.tweens.add({ targets: sprite, scale: 1.3, duration: 200, yoyo: true, repeat: 2 })
                this.particles.emitParticleAt(sprite.x, sprite.y, 10)
              }
            }
            if (winAmount > 0) {
              this.hero.play('knight_attack')
              this.hero.once('animationcomplete', () => { this.hero.play('knight_idle') })
            }
            await this.delay(600)
            await this.cascade(winningCells)
            try { this.sound.play('ping', { volume: 0.2 }) } catch (e) { console.log(e) }
            await this.delay(400)
          }
          if (this.totalSpinWin > 0) {
            const cappedWin = Math.min(this.totalSpinWin, window.gameBetAmount * 20000)
            window.onWin(cappedWin)
            if (cappedWin >= window.gameBetAmount * 20) this.showBigWin(cappedWin)
          }
          if (this.battleTriggered && Math.random() < 0.4) {
            await this.startBattleWalk()
            return
          }
          this.currentState = 'IDLE'
          setGameState('IDLE')
        }

        findClusters(): { symbol: SymbolType; cells: [number, number][] }[] {
          const visited = new Set<string>()
          const clusters: { symbol: SymbolType; cells: [number, number][] }[] = []
          const dfs = (row: number, col: number, targetSymbol: SymbolType, cluster: [number, number][]) => {
            const key = row + ',' + col
            if (visited.has(key) || row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) return
            const cell = this.gridData[row][col]
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
              if (!visited.has(key) && cell !== 'wild' && cell !== 'warrior') {
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

        async cascade(winningCells: Set<string>) {
          for (let col = 0; col < GRID_COLS; col++) {
            const remaining: { symbol: SymbolType; sprite: Phaser.GameObjects.Sprite }[] = []
            for (let row = GRID_ROWS - 1; row >= 0; row--) {
              if (!winningCells.has(row + ',' + col)) {
                remaining.push({ symbol: this.gridData[row][col], sprite: this.grid[row][col] })
              }
            }
            const needed = GRID_ROWS - remaining.length
            for (let row = GRID_ROWS - 1; row >= 0; row--) {
              const targetY = GRID_Y + row * TILE_SIZE + TILE_SIZE / 2
              if (row >= needed) {
                const item = remaining[GRID_ROWS - 1 - row]
                this.gridData[row][col] = item.symbol
                this.grid[row][col] = item.sprite
                this.tweens.add({ targets: item.sprite, y: targetY, duration: 300, ease: 'Cubic.easeOut' })
              } else {
                const symbol = this.getRandomSymbol(true)
                this.gridData[row][col] = symbol
                if (symbol === 'warrior' && !this.warriorPosition) this.warriorPosition = { row, col }
                const sprite = this.grid[row][col]
                sprite.y = GRID_Y - (needed - row) * TILE_SIZE - 100
                sprite.setFrame(this.getGemFrame(symbol))
                sprite.setScale(1)
                sprite.setTint(0xFFFFFF)
                if (symbol === 'wild') { sprite.setTint(0xFFD700); sprite.setScale(1.1) }
                else if (symbol === 'warrior') { sprite.setTint(0xFF6600); sprite.setScale(1.1) }
                this.tweens.add({ targets: sprite, y: targetY, duration: 400, ease: 'Cubic.easeOut', onComplete: () => { this.tweens.add({ targets: sprite, scaleY: 0.85, duration: 50, yoyo: true }) } })
              }
            }
          }
        }

        async startBattleWalk() {
          this.currentState = 'BATTLE_WALK'
          setGameState('BATTLE_WALK')
          this.hero.play('knight_walk')
          const targetCol = this.warriorPosition?.col || GRID_COLS - 1
          const steps = targetCol + 1
          for (let step = 0; step <= steps; step++) {
            const targetX = GRID_X + step * TILE_SIZE + TILE_SIZE / 2
            await new Promise<void>(resolve => {
              this.tweens.add({ targets: this.hero, x: targetX, duration: 200, ease: 'Linear', onComplete: () => resolve() })
            })
          }
          this.cameras.main.shake(300, 0.01)
          this.hero.play('knight_idle')
          await this.delay(500)
          this.scene.start('BattleScene', { totalWin: this.totalSpinWin, heroStats: { hp: 100, attack: 15, crit: 10 } })
        }

        showBigWin(amount: number) {
          const text = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'BIG WIN!\n$' + amount.toFixed(2), { fontSize: '64px', fontFamily: 'Arial Black', color: '#FFD700', stroke: '#000000', strokeThickness: 8, align: 'center' }).setOrigin(0.5)
          this.tweens.add({ targets: text, scale: { from: 0.5, to: 1.2 }, duration: 500, yoyo: true, repeat: 2, onComplete: () => { this.tweens.add({ targets: text, alpha: 0, duration: 300, onComplete: () => text.destroy() }) } })
          for (let i = 0; i < 5; i++) {
            this.particles.emitParticleAt(Phaser.Math.Between(GRID_X, GRID_X + GRID_COLS * TILE_SIZE), Phaser.Math.Between(GRID_Y, GRID_Y + GRID_ROWS * TILE_SIZE), 30)
          }
        }

        delay(ms: number): Promise<void> { return new Promise(resolve => this.time.delayedCall(ms, resolve)) }
      }

      class BattleScene extends Phaser.Scene {
        private hero!: Phaser.GameObjects.Sprite
        private dragon!: Phaser.GameObjects.Sprite
        private heroHp = 100
        private dragonHp = 50
        private heroMaxHp = 100
        private dragonMaxHp = 50
        private heroHpBar!: Phaser.GameObjects.Graphics
        private dragonHpBar!: Phaser.GameObjects.Graphics
        private battleLog!: Phaser.GameObjects.Text
        private totalWin = 0

        constructor() { super({ key: 'BattleScene' }) }

        init(data: { totalWin: number; heroStats: { hp: number; attack: number; crit: number } }) {
          this.totalWin = data.totalWin
          this.heroMaxHp = data.heroStats.hp
          this.heroHp = this.heroMaxHp
          this.dragonHp = this.dragonMaxHp
        }

        create() {
          const bg = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'background')
          bg.setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
          bg.setTint(0x2D0000)
          try { this.sound.play('battle', { volume: 0.3, loop: true }) } catch (e) { console.log(e) }
          this.add.text(GAME_WIDTH / 2, 50, 'DUNGEON BATTLE', { fontSize: '48px', fontFamily: 'Arial Black', color: '#EF4444', stroke: '#000000', strokeThickness: 6 }).setOrigin(0.5)
          this.hero = this.add.sprite(250, GAME_HEIGHT / 2, 'knight')
          this.hero.setScale(2)
          this.hero.play('knight_idle')
          this.dragon = this.add.sprite(GAME_WIDTH - 250, GAME_HEIGHT / 2, 'dragon')
          this.dragon.setScale(2)
          this.dragon.setFlipX(true)
          this.dragon.play('dragon_idle')
          this.heroHpBar = this.add.graphics()
          this.dragonHpBar = this.add.graphics()
          this.updateHpBars()
          this.add.text(250, GAME_HEIGHT / 2 + 100, 'ARCANIST', { fontSize: '20px', color: '#22C55E' }).setOrigin(0.5)
          this.add.text(GAME_WIDTH - 250, GAME_HEIGHT / 2 + 100, 'ELDERWING', { fontSize: '20px', color: '#EF4444' }).setOrigin(0.5)
          this.battleLog = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 100, 'Battle begins!', { fontSize: '18px', color: '#FFFFFF' }).setOrigin(0.5)
          this.time.delayedCall(1000, () => this.processCombat())
        }

        updateHpBars() {
          this.heroHpBar.clear()
          this.heroHpBar.fillStyle(0x333333)
          this.heroHpBar.fillRect(150, GAME_HEIGHT / 2 - 80, 200, 20)
          this.heroHpBar.fillStyle(0x22C55E)
          this.heroHpBar.fillRect(152, GAME_HEIGHT / 2 - 78, 196 * (this.heroHp / this.heroMaxHp), 16)
          this.dragonHpBar.clear()
          this.dragonHpBar.fillStyle(0x333333)
          this.dragonHpBar.fillRect(GAME_WIDTH - 350, GAME_HEIGHT / 2 - 80, 200, 20)
          this.dragonHpBar.fillStyle(0xEF4444)
          this.dragonHpBar.fillRect(GAME_WIDTH - 348, GAME_HEIGHT / 2 - 78, 196 * (this.dragonHp / this.dragonMaxHp), 16)
        }

        async processCombat() {
          const isCrit = Math.random() < 0.1
          const damage = 15 * (isCrit ? 2 : 1)
          this.dragonHp = Math.max(0, this.dragonHp - damage)
          this.hero.play('knight_attack')
          this.hero.once('animationcomplete', () => this.hero.play('knight_idle'))
          this.showDamage(GAME_WIDTH - 250, GAME_HEIGHT / 2 - 50, damage, isCrit)
          this.battleLog.setText('You deal ' + damage + ' damage' + (isCrit ? ' (CRITICAL!)' : '') + '!')
          this.updateHpBars()
          this.tweens.add({ targets: this.dragon, x: this.dragon.x + 20, duration: 50, yoyo: true, repeat: 2 })
          await this.delay(1000)
          if (this.dragonHp <= 0) {
            this.battleLog.setText('Victory! The dragon is defeated!')
            await this.delay(1500)
            this.endBattle(true)
            return
          }
          const dragonDamage = 12
          this.heroHp = Math.max(0, this.heroHp - dragonDamage)
          this.dragon.play('dragon_attack')
          this.dragon.once('animationcomplete', () => this.dragon.play('dragon_idle'))
          this.showDamage(250, GAME_HEIGHT / 2 - 50, dragonDamage, false)
          this.battleLog.setText('Elderwing deals ' + dragonDamage + ' damage!')
          this.updateHpBars()
          this.tweens.add({ targets: this.hero, x: this.hero.x - 20, duration: 50, yoyo: true, repeat: 2 })
          await this.delay(1000)
          if (this.heroHp <= 0) {
            this.battleLog.setText('Defeated...')
            await this.delay(1500)
            this.endBattle(false)
            return
          }
          this.processCombat()
        }

        showDamage(x: number, y: number, damage: number, isCrit: boolean) {
          const text = this.add.text(x, y, '-' + damage, { fontSize: isCrit ? '36px' : '24px', fontFamily: 'Arial Black', color: isCrit ? '#FFD700' : '#FFFFFF', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5)
          this.tweens.add({ targets: text, y: y - 50, alpha: 0, duration: 800, onComplete: () => text.destroy() })
        }

        endBattle(victory: boolean) {
          this.sound.stopAll()
          if (victory) {
            const bonus = window.gameBetAmount * 50
            window.onWin(bonus)
            this.scene.start('TreasureHallScene', { totalWin: this.totalWin + bonus })
          } else {
            this.scene.start('GameScene')
          }
        }

        delay(ms: number): Promise<void> { return new Promise(resolve => this.time.delayedCall(ms, resolve)) }
      }

      class TreasureHallScene extends Phaser.Scene {
        private grid: Phaser.GameObjects.Graphics[][] = []
        private gridData: { unlocked: boolean; coin: number | null }[][] = []
        private lives = 3
        private total = 0
        private multiplier = 1
        private totalWin = 0
        private livesText!: Phaser.GameObjects.Text
        private totalText!: Phaser.GameObjects.Text
        private coinTexts: Phaser.GameObjects.Text[][] = []

        constructor() { super({ key: 'TreasureHallScene' }) }

        init(data: { totalWin: number }) { this.totalWin = data.totalWin }

        create() {
          const bg = this.add.graphics()
          bg.fillGradientStyle(0x8B4513, 0x8B4513, 0xDAA520, 0xDAA520)
          bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
          this.add.text(GAME_WIDTH / 2, 50, 'TREASURE HALL', { fontSize: '48px', fontFamily: 'Arial Black', color: '#FFD700', stroke: '#000000', strokeThickness: 6 }).setOrigin(0.5)
          this.livesText = this.add.text(100, 120, 'Lives: OOO', { fontSize: '24px', color: '#FFFFFF' })
          this.totalText = this.add.text(GAME_WIDTH - 100, 120, 'Total: $0.00', { fontSize: '24px', color: '#FFD700' }).setOrigin(1, 0)
          this.initGrid()
          this.time.delayedCall(1000, () => this.processSpin())
        }

        initGrid() {
          const offsetX = GAME_WIDTH / 2 - (GRID_COLS * 60) / 2
          const offsetY = 180
          for (let row = 0; row < GRID_ROWS; row++) {
            this.gridData[row] = []
            this.grid[row] = []
            this.coinTexts[row] = []
            for (let col = 0; col < GRID_COLS; col++) {
              const isCenter = row >= 2 && row <= 5 && col >= 2 && col <= 5
              this.gridData[row][col] = { unlocked: isCenter, coin: null }
              const cell = this.add.graphics()
              cell.fillStyle(isCenter ? 0x4A4A4A : 0x2A2A2A)
              cell.fillRoundedRect(offsetX + col * 60, offsetY + row * 60, 55, 55, 5)
              if (!isCenter) { cell.lineStyle(2, 0x333333); cell.strokeRoundedRect(offsetX + col * 60, offsetY + row * 60, 55, 55, 5) }
              this.grid[row][col] = cell
              this.coinTexts[row][col] = this.add.text(offsetX + col * 60 + 27, offsetY + row * 60 + 27, '', { fontSize: '12px', color: '#000000' }).setOrigin(0.5)
            }
          }
        }

        async processSpin() {
          let landed = false
          const offsetX = GAME_WIDTH / 2 - (GRID_COLS * 60) / 2
          const offsetY = 180
          for (let row = 0; row < GRID_ROWS; row++) {
            for (let col = 0; col < GRID_COLS; col++) {
              if (this.gridData[row][col].unlocked && this.gridData[row][col].coin === null) {
                const rand = Math.random()
                if (rand < 0.12) {
                  const values = [1, 2, 3, 5, 10, 25]
                  const value = values[Math.floor(Math.random() * values.length)] * window.gameBetAmount
                  this.gridData[row][col].coin = value
                  this.grid[row][col].clear()
                  this.grid[row][col].fillStyle(0xFFD700)
                  this.grid[row][col].fillRoundedRect(offsetX + col * 60, offsetY + row * 60, 55, 55, 5)
                  this.coinTexts[row][col].setText('$' + value.toFixed(0))
                  this.tweens.add({ targets: this.grid[row][col], scale: { from: 0.5, to: 1 }, duration: 200 })
                  landed = true
                } else if (rand < 0.15) {
                  const adj = [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]
                  for (const [ar, ac] of adj) {
                    if (ar >= 0 && ar < GRID_ROWS && ac >= 0 && ac < GRID_COLS) {
                      if (!this.gridData[ar][ac].unlocked) {
                        this.gridData[ar][ac].unlocked = true
                        this.grid[ar][ac].clear()
                        this.grid[ar][ac].fillStyle(0x4A4A4A)
                        this.grid[ar][ac].fillRoundedRect(offsetX + ac * 60, offsetY + ar * 60, 55, 55, 5)
                      }
                    }
                  }
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
          this.totalText.setText('Total: $' + this.total.toFixed(2))
          if (landed) this.lives = 3
          else this.lives--
          this.livesText.setText('Lives: ' + 'O'.repeat(Math.max(0, this.lives)) + 'X'.repeat(3 - Math.max(0, this.lives)))
          if (this.lives <= 0) {
            await this.delay(500)
            this.endBonus()
            return
          }
          await this.delay(1000)
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
                this.grid[row][col].fillRoundedRect(offsetX + col * 60, offsetY + row * 60, 115, 115, 5)
                this.coinTexts[row][col].setText('$' + mergedValue.toFixed(0))
                this.coinTexts[row][col].setFontSize(18)
                this.coinTexts[row][col].setPosition(offsetX + col * 60 + 57, offsetY + row * 60 + 57)
                this.tweens.add({ targets: this.grid[row][col], scale: { from: 0.8, to: 1 }, duration: 300, ease: 'Back.easeOut' })
              }
            }
          }
        }

        endBonus() {
          const finalWin = this.total * this.multiplier
          window.onWin(finalWin)
          const text = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'BONUS COMPLETE!\n$' + finalWin.toFixed(2), { fontSize: '48px', fontFamily: 'Arial Black', color: '#FFD700', stroke: '#000000', strokeThickness: 6, align: 'center' }).setOrigin(0.5)
          this.tweens.add({ targets: text, scale: { from: 0.5, to: 1 }, duration: 500 })
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
        scene: [BootScene, GameScene, BattleScene, TreasureHallScene],
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

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <header className="flex-shrink-0 bg-gradient-to-r from-gray-900 via-purple-900/30 to-gray-900 px-4 py-2 border-b border-purple-500/30 flex items-center justify-between">
        <button onClick={() => router.push('/casino')} className="text-white/70 hover:text-white px-4 py-2">Exit</button>
        <h1 className="text-xl font-bold bg-gradient-to-r from-red-400 via-purple-400 to-red-400 bg-clip-text text-transparent">ELDRITCH DUNGEON</h1>
        <button onClick={() => setShowPaytable(true)} className="text-xs px-3 py-1 bg-gray-800/50 rounded text-gray-300">Info</button>
      </header>
      <main className="flex-1 flex items-center justify-center overflow-hidden bg-black relative">
        {isLoading && (<div className="absolute inset-0 flex items-center justify-center bg-black z-50"><div className="text-purple-400 text-xl">Loading Dungeon...</div></div>)}
        <div ref={gameContainerRef} className="w-full h-full max-w-[1280px] max-h-[720px]" />
      </main>
      {totalWin > 0 && (<div className="absolute top-24 left-1/2 -translate-x-1/2 z-20"><div className="text-3xl font-bold text-yellow-400 animate-pulse">TOTAL WIN: ${totalWin.toFixed(2)}</div></div>)}
      <footer className="flex-shrink-0 bg-gradient-to-t from-gray-950 to-gray-900 border-t border-purple-500/30 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="text-center"><div className="text-xs text-gray-500">BALANCE</div><div className="text-lg font-bold text-white">${balance.toLocaleString()}</div></div>
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
            <button onClick={() => setBetAmount(Math.max(0.1, +(betAmount / 2).toFixed(2)))} disabled={gameState !== 'IDLE'} className="w-8 h-8 rounded bg-purple-700 text-white font-bold disabled:opacity-50">-</button>
            <div className="w-20 text-center"><div className="text-xs text-gray-500">BET</div><div className="text-lg font-bold text-white">${betAmount.toFixed(2)}</div></div>
            <button onClick={() => setBetAmount(Math.min(50, +(betAmount * 2).toFixed(2)))} disabled={gameState !== 'IDLE'} className="w-8 h-8 rounded bg-purple-700 text-white font-bold disabled:opacity-50">+</button>
          </div>
          <button onClick={handleSpin} disabled={gameState !== 'IDLE' || betAmount > balance} className="px-12 py-3 bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-500 hover:to-indigo-600 disabled:opacity-50 rounded-xl font-bold text-xl text-white border-2 border-purple-400 shadow-lg shadow-purple-500/30">{gameState === 'IDLE' ? 'SPIN' : gameState}</button>
          <div className="text-center"><div className="text-xs text-gray-500">STATE</div><div className="text-sm font-bold text-purple-400">{gameState}</div></div>
        </div>
      </footer>
      {showPaytable && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowPaytable(false)}>
          <div className="bg-gray-900 rounded-2xl p-6 max-w-lg w-full border border-purple-500/50 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-bold text-purple-400 text-center mb-4">GAME INFO</h2>
            <div className="space-y-4 text-sm">
              <div><h3 className="text-amber-400 font-bold mb-2">Cluster Pays (5+ adjacent)</h3><div className="grid grid-cols-2 gap-2 text-xs"><div className="bg-gray-800 p-2 rounded">Red/Blue: 0.2x - 75x</div><div className="bg-gray-800 p-2 rounded">Green: 0.3x - 100x</div><div className="bg-gray-800 p-2 rounded">Yellow: 0.4x - 150x</div><div className="bg-gray-800 p-2 rounded">Purple: 0.5x - 200x</div><div className="bg-gray-800 p-2 rounded">White: 1x - 500x</div><div className="bg-gray-800 p-2 rounded text-yellow-400">Wild: 5x - 2500x</div></div></div>
              <div><h3 className="text-amber-400 font-bold mb-2">Features</h3><div className="text-xs text-gray-400 space-y-1"><p><strong>Cascading Wins:</strong> Winning symbols explode, new ones drop with physics</p><p><strong>Hero Walking:</strong> When Warrior triggers battle, hero walks tile-by-tile across grid</p><p><strong>Dungeon Battle:</strong> Full RPG combat with attack/flinch animations and floating damage</p><p><strong>Treasure Hall:</strong> Hold and Win bonus with 2x2 coin merging</p></div></div>
              <div className="text-center text-xs text-gray-500 border-t border-gray-700 pt-2">RTP: 96.10% | Max Win: 20,000x | Volatility: Very High</div>
            </div>
            <button onClick={() => setShowPaytable(false)} className="w-full mt-4 py-2 bg-gray-800 text-gray-400 rounded-lg">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
