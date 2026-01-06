'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCasino } from '../CasinoContext';

// Simple open map - Dust2 style with wide lanes
const MAP_W = 800;
const MAP_H = 600;

// Grid for pathfinding (20x20 tiles)
const TILE = 40;
const GRID_W = MAP_W / TILE;
const GRID_H = MAP_H / TILE;

// Simple wall layout - wide corridors, no tight spaces
const WALLS: {x:number,y:number,w:number,h:number}[] = [
  // Outer walls
  {x:0,y:0,w:MAP_W,h:10},{x:0,y:MAP_H-10,w:MAP_W,h:10},
  {x:0,y:0,w:10,h:MAP_H},{x:MAP_W-10,y:0,w:10,h:MAP_H},
  
  // Center divider with gaps
  {x:350,y:10,w:20,h:150},
  {x:350,y:250,w:20,h:100},
  {x:350,y:450,w:20,h:140},
  
  // A site cover boxes
  {x:150,y:80,w:60,h:40},
  {x:250,y:150,w:40,h:50},
  
  // B site cover boxes  
  {x:550,y:80,w:60,h:40},
  {x:650,y:150,w:40,h:50},
  
  // Mid cover
  {x:380,y:280,w:40,h:40},
  
  // Lower area obstacles
  {x:100,y:400,w:80,h:30},
  {x:250,y:480,w:60,h:30},
  {x:500,y:400,w:80,h:30},
  {x:620,y:480,w:60,h:30},
];

// Bomb sites - large open areas
const SITE_A = {x:180,y:120,r:60};
const SITE_B = {x:620,y:120,r:60};

// Spawn points - far apart
const T_SPAWNS = [
  {x:100,y:550},{x:150,y:550},{x:200,y:550},{x:250,y:550},{x:300,y:550}
];
const CT_SPAWNS = [
  {x:500,y:50},{x:550,y:50},{x:600,y:50},{x:650,y:50},{x:700,y:50}
];

type TeamType = 'T' | 'CT';

interface Bot {
  id: string;
  team: TeamType;
  x: number;
  y: number;
  health: number;
  alive: boolean;
  hasBomb: boolean;
  plantProg: number;
  defuseProg: number;
  angle: number;
  path: {x:number,y:number}[];
  pathIndex: number;
  lastShot: number;
  stuck: number;
  lastX: number;
  lastY: number;
}

// Check if point is inside any wall
const inWall = (x: number, y: number, pad = 12): boolean => {
  for (const w of WALLS) {
    if (x >= w.x - pad && x <= w.x + w.w + pad && y >= w.y - pad && y <= w.y + w.h + pad) {
      return true;
    }
  }
  return false;
};

// Line of sight check
const hasLOS = (x1: number, y1: number, x2: number, y2: number): boolean => {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.ceil(dist / 15);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (inWall(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 0)) return false;
  }
  return true;
};

// Build walkable grid
const buildGrid = (): boolean[][] => {
  const grid: boolean[][] = [];
  for (let y = 0; y < GRID_H; y++) {
    grid[y] = [];
    for (let x = 0; x < GRID_W; x++) {
      const wx = x * TILE + TILE / 2;
      const wy = y * TILE + TILE / 2;
      grid[y][x] = !inWall(wx, wy, 15);
    }
  }
  return grid;
};

// A* Pathfinding
const findPath = (
  grid: boolean[][],
  startX: number, startY: number,
  endX: number, endY: number
): {x:number,y:number}[] => {
  const sx = Math.floor(startX / TILE);
  const sy = Math.floor(startY / TILE);
  let ex = Math.floor(endX / TILE);
  let ey = Math.floor(endY / TILE);
  
  // Clamp
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max - 1, v));
  const sxc = clamp(sx, GRID_W), syc = clamp(sy, GRID_H);
  let exc = clamp(ex, GRID_W), eyc = clamp(ey, GRID_H);
  
  // If end is blocked, find nearby open
  if (!grid[eyc]?.[exc]) {
    for (let r = 1; r <= 3; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const ny = eyc + dy, nx = exc + dx;
          if (ny >= 0 && ny < GRID_H && nx >= 0 && nx < GRID_W && grid[ny][nx]) {
            exc = nx; eyc = ny;
            break;
          }
        }
      }
    }
  }
  
  interface Node { x: number; y: number; g: number; h: number; f: number; parent: Node | null; }
  
  const openSet: Node[] = [{x: sxc, y: syc, g: 0, h: 0, f: 0, parent: null}];
  const closedSet = new Set<string>();
  const key = (x: number, y: number) => `${x},${y}`;
  
  const dirs = [
    {dx:0,dy:-1},{dx:0,dy:1},{dx:-1,dy:0},{dx:1,dy:0},
    {dx:-1,dy:-1},{dx:1,dy:-1},{dx:-1,dy:1},{dx:1,dy:1}
  ];
  
  while (openSet.length > 0) {
    // Get lowest f
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift()!;
    
    if (current.x === exc && current.y === eyc) {
      // Reconstruct path
      const path: {x:number,y:number}[] = [];
      let node: Node | null = current;
      while (node) {
        path.unshift({x: node.x * TILE + TILE / 2, y: node.y * TILE + TILE / 2});
        node = node.parent;
      }
      return path;
    }
    
    closedSet.add(key(current.x, current.y));
    
    for (const dir of dirs) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      
      if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
      if (!grid[ny][nx]) continue;
      if (closedSet.has(key(nx, ny))) continue;
      
      // Diagonal: check both adjacent cells are walkable
      if (dir.dx !== 0 && dir.dy !== 0) {
        if (!grid[current.y][nx] || !grid[ny][current.x]) continue;
      }
      
      const g = current.g + (dir.dx !== 0 && dir.dy !== 0 ? 1.414 : 1);
      const h = Math.abs(nx - exc) + Math.abs(ny - eyc);
      const f = g + h;
      
      const existing = openSet.find(n => n.x === nx && n.y === ny);
      if (existing) {
        if (g < existing.g) {
          existing.g = g;
          existing.f = f;
          existing.parent = current;
        }
      } else {
        openSet.push({x: nx, y: ny, g, h, f, parent: current});
      }
    }
  }
  
  return []; // No path
};

export default function CSBetting() {
  const router = useRouter();
  const { balance, setBalance, recordBet, checkAndReload } = useCasino();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<boolean[][] | null>(null);
  
  const [started, setStarted] = useState(false);
  const [bet, setBet] = useState(500);
  const [betOn, setBetOn] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<'bet' | 'play' | 'end'>('bet');
  const [round, setRound] = useState(1);
  const [tScore, setTScore] = useState(0);
  const [ctScore, setCTScore] = useState(0);
  const [time, setTime] = useState(90);
  const [bombPlanted, setBombPlanted] = useState(false);
  const [bombTimer, setBombTimer] = useState(40);
  const [bombPos, setBombPos] = useState<{x:number,y:number} | null>(null);
  const [result, setResult] = useState('');
  const [betResult, setBetResult] = useState<{won:boolean,amt:number} | null>(null);
  const [matchOver, setMatchOver] = useState(false);
  const [winner, setWinner] = useState<TeamType | null>(null);
  const [bots, setBots] = useState<Bot[]>([]);
  const [kills, setKills] = useState<string[]>([]);
  
  const botsRef = useRef<Bot[]>([]);
  const bombRef = useRef(false);
  const bombPosRef = useRef<{x:number,y:number} | null>(null);
  const phaseRef = useRef<'bet' | 'play' | 'end'>('bet');
  const animRef = useRef(0);
  const tScoreRef = useRef(0);
  const ctScoreRef = useRef(0);

  // Init grid once
  useEffect(() => {
    gridRef.current = buildGrid();
  }, []);

  const createBots = useCallback((): Bot[] => {
    const b: Bot[] = [];
    for (let i = 0; i < 5; i++) {
      b.push({
        id: `T${i+1}`, team: 'T',
        x: T_SPAWNS[i].x, y: T_SPAWNS[i].y,
        health: 100, alive: true, hasBomb: i === 0,
        plantProg: 0, defuseProg: 0, angle: -Math.PI/2,
        path: [], pathIndex: 0, lastShot: 0,
        stuck: 0, lastX: T_SPAWNS[i].x, lastY: T_SPAWNS[i].y
      });
    }
    for (let i = 0; i < 5; i++) {
      b.push({
        id: `CT${i+1}`, team: 'CT',
        x: CT_SPAWNS[i].x, y: CT_SPAWNS[i].y,
        health: 100, alive: true, hasBomb: false,
        plantProg: 0, defuseProg: 0, angle: Math.PI/2,
        path: [], pathIndex: 0, lastShot: 0,
        stuck: 0, lastX: CT_SPAWNS[i].x, lastY: CT_SPAWNS[i].y
      });
    }
    return b;
  }, []);

  const startRound = useCallback((onPlant: boolean | null, betAmt: number) => {
    if (onPlant !== null && betAmt > 0 && betAmt <= balance) {
      setBetOn(onPlant);
      setBalance(balance - betAmt);
      recordBet(betAmt);
    } else {
      setBetOn(null);
    }
    const b = createBots();
    setBots(b);
    botsRef.current = b;
    setBombPlanted(false);
    bombRef.current = false;
    setBombPos(null);
    bombPosRef.current = null;
    setTime(90);
    setBombTimer(40);
    setKills([]);
    setResult('');
    setBetResult(null);
    setPhase('play');
    phaseRef.current = 'play';
  }, [balance, setBalance, recordBet, createBots]);

  const endRound = useCallback((w: TeamType, planted: boolean) => {
    if (phaseRef.current === 'end') return;
    phaseRef.current = 'end';
    setPhase('end');
    
    const res = w === 'T' 
      ? (planted ? '💣 TERRORISTS WIN - Bomb Exploded!' : '🔫 TERRORISTS WIN - CTs Eliminated!')
      : (bombRef.current ? '🛡️ CT WIN - Bomb Defused!' : '🛡️ CT WIN - Terrorists Eliminated!');
    setResult(res);
    
    if (w === 'T') {
      setTScore(s => s + 1);
      tScoreRef.current += 1;
    } else {
      setCTScore(s => s + 1);
      ctScoreRef.current += 1;
    }
    
    if (betOn !== null && bet > 0) {
      const won = betOn === planted;
      if (won) setBalance(balance + bet * 2);
      setBetResult({ won, amt: bet });
    }
    
    if (tScoreRef.current >= 13 || ctScoreRef.current >= 13) {
      setMatchOver(true);
      setWinner(tScoreRef.current >= 13 ? 'T' : 'CT');
    }
  }, [betOn, bet, balance, setBalance]);

  // Game loop
  useEffect(() => {
    if (phase !== 'play' || !gridRef.current) return;
    
    const grid = gridRef.current;
    let lastTime = performance.now();
    let timeAcc = 0;
    let bombAcc = 0;

    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      
      if (phaseRef.current !== 'play') return;

      // Timers
      timeAcc += dt;
      if (timeAcc >= 1) {
        timeAcc = 0;
        setTime(t => {
          if (t <= 1 && !bombRef.current) {
            endRound('CT', false);
            return 0;
          }
          return t - 1;
        });
      }
      
      if (bombRef.current) {
        bombAcc += dt;
        if (bombAcc >= 1) {
          bombAcc = 0;
          setBombTimer(t => {
            if (t <= 1) {
              endRound('T', true);
              return 0;
            }
            return t - 1;
          });
        }
      }

      const cur = [...botsRef.current];
      const aliveT = cur.filter(b => b.team === 'T' && b.alive);
      const aliveCT = cur.filter(b => b.team === 'CT' && b.alive);
      
      // Win conditions
      if (aliveT.length === 0 && !bombRef.current) {
        endRound('CT', false);
        return;
      }
      if (aliveCT.length === 0 && !bombRef.current) {
        endRound('T', false);
        return;
      }

      // Update each bot
      for (const bot of cur) {
        if (!bot.alive) continue;
        
        const enemies = bot.team === 'T' ? aliveCT : aliveT;
        
        // Find visible enemy
        let target: Bot | null = null;
        let minDist = Infinity;
        for (const e of enemies) {
          const d = Math.hypot(e.x - bot.x, e.y - bot.y);
          if (d < 300 && hasLOS(bot.x, bot.y, e.x, e.y) && d < minDist) {
            minDist = d;
            target = e;
          }
        }

        if (target) {
          // Combat
          bot.angle = Math.atan2(target.y - bot.y, target.x - bot.x);
          bot.plantProg = 0;
          bot.defuseProg = 0;
          
          if (now - bot.lastShot > 300) {
            bot.lastShot = now;
            const acc = Math.max(0.4, 1 - minDist / 350);
            if (Math.random() < acc) {
              target.health -= 20 + Math.random() * 15;
              if (target.health <= 0) {
                target.health = 0;
                target.alive = false;
                if (target.hasBomb) {
                  target.hasBomb = false;
                  const newBomber = aliveT.find(t => t.id !== target!.id && t.alive);
                  if (newBomber) newBomber.hasBomb = true;
                }
                setKills(k => [...k.slice(-4), `${bot.id} → ${target!.id}`]);
              }
            }
          }
        } else {
          // Movement AI
          let goalX = bot.x, goalY = bot.y;
          
          if (bot.team === 'T') {
            if (bot.hasBomb && !bombRef.current) {
              goalX = SITE_A.x;
              goalY = SITE_A.y;
            } else if (bombRef.current && bombPosRef.current) {
              goalX = bombPosRef.current.x + (Math.random() - 0.5) * 60;
              goalY = bombPosRef.current.y + (Math.random() - 0.5) * 60;
            } else {
              const bomber = cur.find(b => b.hasBomb && b.alive);
              if (bomber && bomber.id !== bot.id) {
                goalX = bomber.x + (Math.random() - 0.5) * 40;
                goalY = bomber.y + (Math.random() - 0.5) * 40;
              } else {
                goalX = SITE_A.x;
                goalY = SITE_A.y;
              }
            }
          } else {
            if (bombRef.current && bombPosRef.current) {
              goalX = bombPosRef.current.x;
              goalY = bombPosRef.current.y;
            } else {
              // Spread between sites
              const idx = parseInt(bot.id.slice(2)) - 1;
              if (idx < 3) {
                goalX = SITE_A.x + (idx - 1) * 40;
                goalY = SITE_A.y + 30;
              } else {
                goalX = SITE_B.x + (idx - 3) * 40;
                goalY = SITE_B.y + 30;
              }
            }
          }

          const distToGoal = Math.hypot(goalX - bot.x, goalY - bot.y);

          // Planting
          if (bot.team === 'T' && bot.hasBomb && !bombRef.current) {
            const distToA = Math.hypot(SITE_A.x - bot.x, SITE_A.y - bot.y);
            if (distToA < 50) {
              bot.plantProg += dt;
              if (bot.plantProg >= 3) {
                bombRef.current = true;
                setBombPlanted(true);
                bombPosRef.current = { x: bot.x, y: bot.y };
                setBombPos({ x: bot.x, y: bot.y });
                bot.hasBomb = false;
                bot.plantProg = 0;
              }
              continue; // Don't move while planting
            }
          }

          // Defusing
          if (bot.team === 'CT' && bombRef.current && bombPosRef.current) {
            const distToBomb = Math.hypot(bombPosRef.current.x - bot.x, bombPosRef.current.y - bot.y);
            if (distToBomb < 30) {
              bot.defuseProg += dt;
              if (bot.defuseProg >= 5) {
                endRound('CT', true);
                return;
              }
              continue; // Don't move while defusing
            }
          }

          // Move towards goal
          if (distToGoal > 25) {
            // Need new path?
            if (bot.path.length === 0 || bot.pathIndex >= bot.path.length || Math.random() < 0.01) {
              bot.path = findPath(grid, bot.x, bot.y, goalX, goalY);
              bot.pathIndex = 0;
            }

            // Follow path
            if (bot.path.length > 0 && bot.pathIndex < bot.path.length) {
              const wp = bot.path[bot.pathIndex];
              const dx = wp.x - bot.x;
              const dy = wp.y - bot.y;
              const wpDist = Math.hypot(dx, dy);

              if (wpDist < 20) {
                bot.pathIndex++;
              } else {
                const speed = 100 * dt;
                const nx = bot.x + (dx / wpDist) * speed;
                const ny = bot.y + (dy / wpDist) * speed;
                
                if (!inWall(nx, ny)) {
                  bot.x = nx;
                  bot.y = ny;
                  bot.angle = Math.atan2(dy, dx);
                } else {
                  // Try sliding along wall
                  if (!inWall(nx, bot.y)) {
                    bot.x = nx;
                  } else if (!inWall(bot.x, ny)) {
                    bot.y = ny;
                  } else {
                    // Stuck - get new path
                    bot.stuck++;
                    if (bot.stuck > 10) {
                      bot.path = [];
                      bot.stuck = 0;
                    }
                  }
                }
              }
            }

            // Stuck detection
            if (Math.hypot(bot.x - bot.lastX, bot.y - bot.lastY) < 1) {
              bot.stuck++;
              if (bot.stuck > 30) {
                bot.path = [];
                bot.stuck = 0;
                // Random nudge
                const angle = Math.random() * Math.PI * 2;
                const nx = bot.x + Math.cos(angle) * 20;
                const ny = bot.y + Math.sin(angle) * 20;
                if (!inWall(nx, ny)) {
                  bot.x = nx;
                  bot.y = ny;
                }
              }
            } else {
              bot.stuck = 0;
            }
            bot.lastX = bot.x;
            bot.lastY = bot.y;
          }
        }
      }

      botsRef.current = cur;
      setBots([...cur]);
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [phase, endRound]);

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      // Background
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, MAP_W, MAP_H);

      // Grid lines (subtle)
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= MAP_W; x += TILE) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, MAP_H);
        ctx.stroke();
      }
      for (let y = 0; y <= MAP_H; y += TILE) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(MAP_W, y);
        ctx.stroke();
      }

      // Walls
      ctx.fillStyle = '#475569';
      for (const w of WALLS) {
        ctx.fillRect(w.x, w.y, w.w, w.h);
      }

      // Bomb sites
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(SITE_A.x, SITE_A.y, SITE_A.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(SITE_B.x, SITE_B.y, SITE_B.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Site labels
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('A', SITE_A.x, SITE_A.y + 8);
      ctx.fillText('B', SITE_B.x, SITE_B.y + 8);

      // Planted bomb
      if (bombPos) {
        const pulse = 0.7 + Math.sin(Date.now() / 100) * 0.3;
        ctx.fillStyle = `rgba(255, 100, 0, ${pulse})`;
        ctx.beginPath();
        ctx.arc(bombPos.x, bombPos.y, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = '12px Arial';
        ctx.fillText('💣', bombPos.x, bombPos.y + 4);
      }

      // Bots
      for (const bot of bots) {
        if (!bot.alive) continue;
        
        ctx.save();
        ctx.translate(bot.x, bot.y);

        // Body
        const color = bot.team === 'T' ? '#eab308' : '#3b82f6';
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = bot.team === 'T' ? '#a16207' : '#1d4ed8';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Direction
        ctx.rotate(bot.angle);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(8, -5);
        ctx.lineTo(8, 5);
        ctx.closePath();
        ctx.fill();

        ctx.restore();

        // Health bar
        const hp = bot.health / 100;
        const barW = 28;
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(bot.x - barW/2, bot.y - 22, barW, 5);
        ctx.fillStyle = hp > 0.6 ? '#22c55e' : hp > 0.3 ? '#f59e0b' : '#ef4444';
        ctx.fillRect(bot.x - barW/2, bot.y - 22, barW * hp, 5);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(bot.x - barW/2, bot.y - 22, barW, 5);

        // Bomb indicator
        if (bot.hasBomb) {
          ctx.fillStyle = '#ef4444';
          ctx.font = '10px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('💣', bot.x, bot.y - 28);
        }

        // Plant/defuse progress
        if (bot.plantProg > 0) {
          ctx.fillStyle = '#1f2937';
          ctx.fillRect(bot.x - 15, bot.y + 16, 30, 4);
          ctx.fillStyle = '#f97316';
          ctx.fillRect(bot.x - 15, bot.y + 16, 30 * (bot.plantProg / 3), 4);
        }
        if (bot.defuseProg > 0) {
          ctx.fillStyle = '#1f2937';
          ctx.fillRect(bot.x - 15, bot.y + 16, 30, 4);
          ctx.fillStyle = '#06b6d4';
          ctx.fillRect(bot.x - 15, bot.y + 16, 30 * (bot.defuseProg / 5), 4);
        }
      }

      requestAnimationFrame(render);
    };

    render();
  }, [bots, bombPos]);

  if (!started) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-4">CS:GO Betting</h1>
          <p className="text-gray-400 mb-8">Watch bots play & bet on bomb plant!</p>
          <button
            onClick={() => setStarted(true)}
            className="px-8 py-4 bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold text-xl rounded-lg hover:from-yellow-400 hover:to-orange-400"
          >
            Start Game
          </button>
          <button
            onClick={() => router.push('/casino')}
            className="block mx-auto mt-4 text-gray-400 hover:text-white"
          >
            ← Back to Casino
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-3 flex justify-between items-center">
        <button onClick={() => router.push('/casino')} className="text-gray-400 hover:text-white">
          ← Back
        </button>
        <div className="flex gap-6 items-center">
          <span className="text-yellow-500 font-bold text-xl">T {tScore}</span>
          <span className="text-gray-500">:</span>
          <span className="text-blue-500 font-bold text-xl">{ctScore} CT</span>
          <span className="text-gray-400">Round {round}</span>
          <span className={`font-mono text-lg ${bombPlanted ? 'text-red-500 animate-pulse' : 'text-white'}`}>
            {bombPlanted ? `💣 ${bombTimer}s` : `⏱️ ${time}s`}
          </span>
        </div>
        <span className="text-green-400 font-bold">${balance.toLocaleString()}</span>
      </div>

      <div className="flex-1 flex">
        {/* Canvas */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={MAP_W}
              height={MAP_H}
              className="border-2 border-slate-700 rounded-lg shadow-xl"
            />
            {/* Killfeed */}
            <div className="absolute top-2 right-2">
              {kills.slice(-5).map((k, i) => (
                <div key={i} className="text-xs text-white bg-black/70 px-2 py-1 rounded mb-1">
                  {k}
                </div>
              ))}
            </div>
            {/* Legend */}
            <div className="absolute bottom-2 left-2 bg-black/70 p-2 rounded text-xs">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span className="text-yellow-400">Terrorists</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-blue-400">Counter-Terrorists</span>
              </div>
            </div>
          </div>
        </div>

        {/* Side panel */}
        <div className="w-72 bg-slate-800 border-l border-slate-700 p-4">
          {phase === 'bet' && !matchOver && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white">Place Your Bet</h2>
              <p className="text-gray-400 text-sm">Will the bomb be planted?</p>
              
              <input
                type="number"
                value={bet}
                onChange={e => setBet(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full bg-slate-700 text-white px-3 py-2 rounded"
                min={0}
                max={balance}
              />
              
              <div className="flex gap-2">
                {[500, 1000, 5000, 10000].map(a => (
                  <button
                    key={a}
                    onClick={() => setBet(Math.min(a, balance))}
                    className="flex-1 bg-slate-700 text-white py-1 rounded text-sm hover:bg-slate-600"
                  >
                    ${a >= 1000 ? `${a/1000}k` : a}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => startRound(true, bet)}
                  disabled={bet <= 0 || bet > balance}
                  className="bg-gradient-to-r from-orange-500 to-red-500 text-white py-3 rounded font-bold disabled:opacity-50"
                >
                  💣 PLANTED
                  <div className="text-xs opacity-80">2x Payout</div>
                </button>
                <button
                  onClick={() => startRound(false, bet)}
                  disabled={bet <= 0 || bet > balance}
                  className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white py-3 rounded font-bold disabled:opacity-50"
                >
                  🛡️ NOT PLANTED
                  <div className="text-xs opacity-80">2x Payout</div>
                </button>
              </div>

              <button
                onClick={() => startRound(null, 0)}
                className="w-full bg-slate-700 text-gray-300 py-2 rounded hover:bg-slate-600"
              >
                Watch Only
              </button>
            </div>
          )}

          {phase === 'play' && (
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-white">Round In Progress</h2>
              
              {betOn !== null && (
                <div className="bg-slate-700 p-2 rounded text-white text-sm">
                  ${bet} on {betOn ? '💣 Planted' : '🛡️ Not Planted'}
                </div>
              )}

              <div className="bg-slate-700 p-3 rounded">
                <div className="flex justify-between mb-2">
                  <span className="text-yellow-400 font-bold">Terrorists</span>
                  <span className="text-white">{bots.filter(b => b.team === 'T' && b.alive).length}/5</span>
                </div>
                <div className="flex gap-1">
                  {bots.filter(b => b.team === 'T').map(bot => (
                    <div
                      key={bot.id}
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                        bot.alive ? 'bg-yellow-500' : 'bg-gray-600'
                      }`}
                    >
                      {bot.hasBomb ? '💣' : ''}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-700 p-3 rounded">
                <div className="flex justify-between mb-2">
                  <span className="text-blue-400 font-bold">Counter-Terrorists</span>
                  <span className="text-white">{bots.filter(b => b.team === 'CT' && b.alive).length}/5</span>
                </div>
                <div className="flex gap-1">
                  {bots.filter(b => b.team === 'CT').map(bot => (
                    <div
                      key={bot.id}
                      className={`w-6 h-6 rounded-full ${bot.alive ? 'bg-blue-500' : 'bg-gray-600'}`}
                    />
                  ))}
                </div>
              </div>

              {bombPlanted && (
                <div className="bg-red-900/50 border border-red-500 p-3 rounded text-center animate-pulse">
                  <div className="text-red-400 font-bold">💣 BOMB PLANTED!</div>
                  <div className="text-red-300 text-sm">{bombTimer} seconds remaining</div>
                </div>
              )}
            </div>
          )}

          {phase === 'end' && !matchOver && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white">Round Over</h2>
              <div className="bg-slate-700 p-3 rounded text-center text-white">{result}</div>
              
              {betResult && (
                <div className={`p-3 rounded text-center font-bold ${
                  betResult.won ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                }`}>
                  {betResult.won ? `+$${betResult.amt}` : `-$${betResult.amt}`}
                </div>
              )}

              <button
                onClick={() => {
                  setRound(r => r + 1);
                  setPhase('bet');
                  phaseRef.current = 'bet';
                  setBetOn(null);
                  setBetResult(null);
                }}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-500 text-white py-3 rounded font-bold"
              >
                Next Round →
              </button>
            </div>
          )}

          {matchOver && (
            <div className="space-y-4 text-center">
              <h2 className="text-xl font-bold text-white">Match Over!</h2>
              <div className={`p-4 rounded ${
                winner === 'T' ? 'bg-yellow-900/50 text-yellow-400' : 'bg-blue-900/50 text-blue-400'
              }`}>
                <div className="text-xl font-bold">{winner === 'T' ? 'TERRORISTS' : 'COUNTER-TERRORISTS'} WIN!</div>
                <div className="text-lg mt-2">{tScore} - {ctScore}</div>
              </div>
              <button
                onClick={() => {
                  setTScore(0);
                  setCTScore(0);
                  tScoreRef.current = 0;
                  ctScoreRef.current = 0;
                  setRound(1);
                  setMatchOver(false);
                  setWinner(null);
                  setPhase('bet');
                  phaseRef.current = 'bet';
                  checkAndReload();
                }}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 rounded font-bold"
              >
                New Match
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
