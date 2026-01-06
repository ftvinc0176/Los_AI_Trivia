'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCasino } from '../CasinoContext';

// LARGER MAP - More space for tactical gameplay
const MAP_W = 1200;
const MAP_H = 900;

// Grid for pathfinding (30x22.5 tiles)
const TILE = 40;
const GRID_W = MAP_W / TILE;
const GRID_H = MAP_H / TILE;

// Wall layout - open with cover, sites at top
const WALLS: {x:number,y:number,w:number,h:number}[] = [
  // Outer walls
  {x:0,y:0,w:MAP_W,h:10},{x:0,y:MAP_H-10,w:MAP_W,h:10},
  {x:0,y:0,w:10,h:MAP_H},{x:MAP_W-10,y:0,w:10,h:MAP_H},
  
  // === TOP AREA (CT side / Sites) ===
  // A site area (left side)
  {x:100,y:120,w:80,h:30},
  {x:250,y:80,w:30,h:60},
  
  // B site area (right side)
  {x:1000,y:120,w:80,h:30},
  {x:920,y:80,w:30,h:60},
  
  // === MID SECTION ===
  // Left corridor walls
  {x:180,y:280,w:100,h:20},
  {x:180,y:380,w:20,h:100},
  
  // Center structure
  {x:550,y:300,w:100,h:20},
  {x:550,y:380,w:100,h:20},
  {x:550,y:300,w:20,h:100},
  {x:630,y:300,w:20,h:100},
  
  // Right corridor walls
  {x:920,y:280,w:100,h:20},
  {x:1000,y:380,w:20,h:100},
  
  // === LOWER MID ===
  {x:300,y:520,w:80,h:30},
  {x:820,y:520,w:80,h:30},
  {x:550,y:550,w:100,h:30},
  
  // === T SPAWN AREA (bottom) ===
  {x:200,y:700,w:100,h:25},
  {x:500,y:720,w:60,h:25},
  {x:640,y:720,w:60,h:25},
  {x:900,y:700,w:100,h:25},
];

// Bomb sites - top of map
const SITE_A = {x:180,y:150,r:70};
const SITE_B = {x:1020,y:150,r:70};

// Spawn points - well inside map boundaries
const T_SPAWNS = [
  {x:500,y:800},{x:560,y:800},{x:620,y:800},{x:680,y:800},{x:600,y:770}
];
const CT_SPAWNS = [
  {x:400,y:180},{x:500,y:180},{x:600,y:180},{x:700,y:180},{x:800,y:180}
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
  rushDelay: number;
  skill: number; // 0.5-1.5 accuracy/damage multiplier
  aggression: number; // 0-1 how likely to push vs hold
  assignedSite: 'A' | 'B'; // which site this bot focuses on
}

// Check if point is inside any wall
const inWall = (x: number, y: number, pad = 15): boolean => {
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
      grid[y][x] = !inWall(wx, wy, 18);
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
  
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max - 1, v));
  const sxc = clamp(sx, GRID_W), syc = clamp(sy, GRID_H);
  let exc = clamp(ex, GRID_W), eyc = clamp(ey, GRID_H);
  
  // If end is blocked, find nearby open
  if (!grid[eyc]?.[exc]) {
    for (let r = 1; r <= 5; r++) {
      let found = false;
      for (let dy = -r; dy <= r && !found; dy++) {
        for (let dx = -r; dx <= r && !found; dx++) {
          const ny = eyc + dy, nx = exc + dx;
          if (ny >= 0 && ny < GRID_H && nx >= 0 && nx < GRID_W && grid[ny][nx]) {
            exc = nx; eyc = ny;
            found = true;
          }
        }
      }
      if (found) break;
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

  let iterations = 0;
  const maxIterations = 1000;
  
  while (openSet.length > 0 && iterations < maxIterations) {
    iterations++;
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift()!;
    
    if (current.x === exc && current.y === eyc) {
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
  
  return [];
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
  const [time, setTime] = useState(120);
  const [bombPlanted, setBombPlanted] = useState(false);
  const [bombTimer, setBombTimer] = useState(45);
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
  const gameTimeRef = useRef(0);
  const targetSiteRef = useRef<'A' | 'B'>('A'); // T's target site for this round

  useEffect(() => {
    gridRef.current = buildGrid();
  }, []);

  const createBots = useCallback((): Bot[] => {
    const b: Bot[] = [];
    
    // === T SIDE STRATEGY (random each round) ===
    // 0 = Rush A, 1 = Rush B, 2 = Split (2 go A, 3 go B), 3 = Slow/Default
    const tStrategy = Math.floor(Math.random() * 4);
    targetSiteRef.current = (tStrategy === 0 || tStrategy === 2) ? 'A' : 'B';
    
    // === CT SIDE STRATEGY (random each round) ===
    // 0 = Stack A (4-1), 1 = Stack B (1-4), 2 = Even (3-2), 3 = Even (2-3), 4 = Aggro push
    const ctStrategy = Math.floor(Math.random() * 5);
    let ctSiteA: number;
    switch(ctStrategy) {
      case 0: ctSiteA = 4; break; // Stack A
      case 1: ctSiteA = 1; break; // Stack B
      case 2: ctSiteA = 3; break; // Even 3-2
      case 3: ctSiteA = 2; break; // Even 2-3
      default: ctSiteA = 2 + Math.floor(Math.random() * 2); break;
    }
    
    const ctAssignments: ('A' | 'B')[] = [];
    for (let i = 0; i < 5; i++) {
      ctAssignments.push(i < ctSiteA ? 'A' : 'B');
    }
    // Shuffle CT assignments
    for (let i = ctAssignments.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ctAssignments[i], ctAssignments[j]] = [ctAssignments[j], ctAssignments[i]];
    }
    
    // T side - different delays based on strategy
    const tDelays = tStrategy === 3 ? [2, 2.5, 3, 3.5, 4] : [0, 0.2, 0.4, 0.6, 0.8];
    const tSites: ('A' | 'B')[] = tStrategy === 2 
      ? ['A', 'A', 'B', 'B', 'B'] // Split
      : Array(5).fill(targetSiteRef.current);
    
    for (let i = 0; i < 5; i++) {
      b.push({
        id: `T${i+1}`, team: 'T',
        x: T_SPAWNS[i].x, y: T_SPAWNS[i].y,
        health: 100, alive: true, hasBomb: i === 0,
        plantProg: 0, defuseProg: 0, angle: -Math.PI/2,
        path: [], pathIndex: 0, lastShot: 0,
        stuck: 0, lastX: T_SPAWNS[i].x, lastY: T_SPAWNS[i].y,
        rushDelay: tDelays[i] + Math.random() * 0.3,
        skill: 0.6 + Math.random() * 0.8, // 0.6-1.4 wider range
        aggression: 0.4 + Math.random() * 0.6,
        assignedSite: tSites[i]
      });
    }
    
    // CT side - aggro strategy has shorter delays
    const ctBaseDelay = ctStrategy === 4 ? 0.2 : 0.5;
    for (let i = 0; i < 5; i++) {
      b.push({
        id: `CT${i+1}`, team: 'CT',
        x: CT_SPAWNS[i].x, y: CT_SPAWNS[i].y,
        health: 100, alive: true, hasBomb: false,
        plantProg: 0, defuseProg: 0, angle: Math.PI/2,
        path: [], pathIndex: 0, lastShot: 0,
        stuck: 0, lastX: CT_SPAWNS[i].x, lastY: CT_SPAWNS[i].y,
        rushDelay: ctBaseDelay + Math.random() * 1.0,
        skill: 0.6 + Math.random() * 0.8, // 0.6-1.4 wider range
        aggression: ctStrategy === 4 ? 0.7 + Math.random() * 0.3 : Math.random() * 0.5,
        assignedSite: ctAssignments[i]
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
    setTime(120);
    setBombTimer(45);
    setKills([]);
    setResult('');
    setBetResult(null);
    setPhase('play');
    phaseRef.current = 'play';
    gameTimeRef.current = 0;
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
      gameTimeRef.current += dt;
      
      if (phaseRef.current !== 'play') return;

      // Round timer
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
      
      // Bomb timer
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
        // All T dead and bomb NOT planted - CT wins
        endRound('CT', false);
        return;
      }
      // Note: If all T dead but bomb IS planted, round continues - CTs must defuse or bomb explodes
      
      if (aliveCT.length === 0) {
        // All CT dead - T wins (bomb planted or elimination)
        endRound('T', bombRef.current);
        return;
      }

      // Update each bot
      for (const bot of cur) {
        if (!bot.alive) continue;
        
        // Rush delay - bots wait before moving
        if (bot.rushDelay > 0) {
          bot.rushDelay -= dt;
          continue;
        }
        
        const enemies = bot.team === 'T' ? aliveCT : aliveT;
        
        // Find visible enemy - range affected by skill
        let target: Bot | null = null;
        let minDist = Infinity;
        const sightRange = 280 + bot.skill * 70; // 330-380 range based on skill
        for (const e of enemies) {
          const d = Math.hypot(e.x - bot.x, e.y - bot.y);
          if (d < sightRange && hasLOS(bot.x, bot.y, e.x, e.y) && d < minDist) {
            minDist = d;
            target = e;
          }
        }

        if (target) {
          // Combat mode
          bot.angle = Math.atan2(target.y - bot.y, target.x - bot.x);
          bot.plantProg = 0;
          bot.defuseProg = 0;
          
          // Fire rate affected by skill (faster = better)
          const fireRate = 350 - bot.skill * 80; // 270-420ms between shots
          if (now - bot.lastShot > fireRate) {
            bot.lastShot = now;
            // Accuracy affected by skill and distance
            const baseAcc = Math.max(0.25, 1 - minDist / 450);
            const acc = baseAcc * bot.skill;
            if (Math.random() < acc) {
              // Damage affected by skill
              const dmg = (15 + Math.random() * 12) * bot.skill;
              target.health -= dmg;
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
          const botSitePos = bot.assignedSite === 'A' ? SITE_A : SITE_B;
          
          if (bot.team === 'T') {
            if (bot.hasBomb && !bombRef.current) {
              // Bomber goes to their assigned site
              goalX = botSitePos.x;
              goalY = botSitePos.y;
            } else if (bombRef.current && bombPosRef.current) {
              // Guard the bomb with some spread
              const guardDist = 40 + Math.random() * 60;
              const guardAngle = Math.random() * Math.PI * 2;
              goalX = bombPosRef.current.x + Math.cos(guardAngle) * guardDist;
              goalY = bombPosRef.current.y + Math.sin(guardAngle) * guardDist;
            } else {
              // Go to assigned site (may be different from bomber in split strat)
              goalX = botSitePos.x + (Math.random() - 0.5) * 60;
              goalY = botSitePos.y + (Math.random() - 0.5) * 60;
            }
          } else {
            // CT behavior - go to assigned site
            if (bombRef.current && bombPosRef.current) {
              // Rush to defuse - closest CT goes directly, others provide cover
              const distToBomb = Math.hypot(bombPosRef.current.x - bot.x, bombPosRef.current.y - bot.y);
              const closestCT = aliveCT.reduce((closest, ct) => {
                const d = Math.hypot(bombPosRef.current!.x - ct.x, bombPosRef.current!.y - ct.y);
                return d < closest.dist ? {bot: ct, dist: d} : closest;
              }, {bot: bot, dist: distToBomb});
              
              if (closestCT.bot.id === bot.id || distToBomb < 150) {
                goalX = bombPosRef.current.x;
                goalY = bombPosRef.current.y;
              } else {
                const coverAngle = Math.atan2(bot.y - bombPosRef.current.y, bot.x - bombPosRef.current.x);
                goalX = bombPosRef.current.x + Math.cos(coverAngle) * 80;
                goalY = bombPosRef.current.y + Math.sin(coverAngle) * 80;
              }
            } else {
              // Position at assigned site with variation
              const spreadAngle = (parseInt(bot.id.slice(2)) - 1) * (Math.PI / 3);
              const spreadDist = 30 + Math.random() * 40;
              goalX = botSitePos.x + Math.cos(spreadAngle) * spreadDist;
              goalY = botSitePos.y + 20 + Math.sin(spreadAngle) * spreadDist;
            }
          }

          const distToGoal = Math.hypot(goalX - bot.x, goalY - bot.y);

          // Planting logic - can plant at either site
          if (bot.team === 'T' && bot.hasBomb && !bombRef.current) {
            const distToA = Math.hypot(SITE_A.x - bot.x, SITE_A.y - bot.y);
            const distToB = Math.hypot(SITE_B.x - bot.x, SITE_B.y - bot.y);
            const minSiteDist = Math.min(distToA, distToB);
            
            if (minSiteDist < 60) {
              bot.plantProg += dt;
              if (bot.plantProg >= 3.5) {
                bombRef.current = true;
                setBombPlanted(true);
                bombPosRef.current = { x: bot.x, y: bot.y };
                setBombPos({ x: bot.x, y: bot.y });
                bot.hasBomb = false;
                bot.plantProg = 0;
              }
              continue;
            }
          }

          // Defusing logic
          if (bot.team === 'CT' && bombRef.current && bombPosRef.current) {
            const distToBomb = Math.hypot(bombPosRef.current.x - bot.x, bombPosRef.current.y - bot.y);
            if (distToBomb < 35) {
              bot.defuseProg += dt;
              if (bot.defuseProg >= 5) {
                endRound('CT', true);
                return;
              }
              continue;
            }
          }

          // Movement
          if (distToGoal > 30) {
            // Recalculate path if needed
            if (bot.path.length === 0 || bot.pathIndex >= bot.path.length || Math.random() < 0.005) {
              bot.path = findPath(grid, bot.x, bot.y, goalX, goalY);
              bot.pathIndex = 0;
            }

            if (bot.path.length > 0 && bot.pathIndex < bot.path.length) {
              const wp = bot.path[bot.pathIndex];
              const dx = wp.x - bot.x;
              const dy = wp.y - bot.y;
              const wpDist = Math.hypot(dx, dy);

              if (wpDist < 25) {
                bot.pathIndex++;
              } else {
                // Speed varies by skill
                const baseSpeed = 100 + bot.skill * 30;
                const speed = baseSpeed * dt;
                const nx = bot.x + (dx / wpDist) * speed;
                const ny = bot.y + (dy / wpDist) * speed;
                
                if (!inWall(nx, ny)) {
                  bot.x = nx;
                  bot.y = ny;
                  bot.angle = Math.atan2(dy, dx);
                } else {
                  // Wall sliding
                  if (!inWall(nx, bot.y)) {
                    bot.x = nx;
                  } else if (!inWall(bot.x, ny)) {
                    bot.y = ny;
                  } else {
                    bot.stuck++;
                    if (bot.stuck > 15) {
                      bot.path = [];
                      bot.stuck = 0;
                    }
                  }
                }
              }
            } else {
              // No path found - try direct movement
              const dx = goalX - bot.x;
              const dy = goalY - bot.y;
              const dist = Math.hypot(dx, dy);
              if (dist > 0) {
                const speed = 100 * dt;
                const nx = bot.x + (dx / dist) * speed;
                const ny = bot.y + (dy / dist) * speed;
                if (!inWall(nx, ny)) {
                  bot.x = nx;
                  bot.y = ny;
                  bot.angle = Math.atan2(dy, dx);
                } else if (!inWall(nx, bot.y)) {
                  bot.x = nx;
                } else if (!inWall(bot.x, ny)) {
                  bot.y = ny;
                }
              }
            }

            // Stuck detection
            if (Math.hypot(bot.x - bot.lastX, bot.y - bot.lastY) < 0.5) {
              bot.stuck++;
              if (bot.stuck > 40) {
                bot.path = [];
                bot.stuck = 0;
                const angle = Math.random() * Math.PI * 2;
                const nx = bot.x + Math.cos(angle) * 25;
                const ny = bot.y + Math.sin(angle) * 25;
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

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      // Dark background
      ctx.fillStyle = '#1a1f2e';
      ctx.fillRect(0, 0, MAP_W, MAP_H);

      // Draw grid lines (subtle)
      ctx.strokeStyle = '#252a3a';
      ctx.lineWidth = 1;
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

      // Draw walls
      ctx.fillStyle = '#4a5568';
      ctx.strokeStyle = '#718096';
      ctx.lineWidth = 2;
      for (const w of WALLS) {
        ctx.fillRect(w.x, w.y, w.w, w.h);
        ctx.strokeRect(w.x, w.y, w.w, w.h);
      }

      // Draw bomb sites
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#c53030';
      ctx.beginPath();
      ctx.arc(SITE_A.x, SITE_A.y, SITE_A.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(SITE_B.x, SITE_B.y, SITE_B.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Site labels
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('A', SITE_A.x, SITE_A.y + 10);
      ctx.fillText('B', SITE_B.x, SITE_B.y + 10);

      // Draw spawn zone indicators
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#f6ad55';
      ctx.fillRect(450, 800, 300, 80);
      ctx.fillStyle = '#63b3ed';
      ctx.fillRect(350, 30, 500, 50);
      ctx.globalAlpha = 1;

      // Draw planted bomb
      if (bombPos) {
        ctx.fillStyle = '#f56565';
        ctx.beginPath();
        ctx.arc(bombPos.x, bombPos.y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('💣', bombPos.x - 8, bombPos.y + 5);
      }

      // Draw bots
      for (const bot of bots) {
        if (!bot.alive) continue;
        
        const color = bot.team === 'T' ? '#f6ad55' : '#63b3ed';
        const darkColor = bot.team === 'T' ? '#c05621' : '#2b6cb0';
        
        // Body
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(bot.x, bot.y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = darkColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Direction indicator
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(bot.x, bot.y);
        ctx.lineTo(bot.x + Math.cos(bot.angle) * 20, bot.y + Math.sin(bot.angle) * 20);
        ctx.stroke();

        // Bomb indicator
        if (bot.hasBomb) {
          ctx.fillStyle = '#f56565';
          ctx.beginPath();
          ctx.arc(bot.x + 10, bot.y - 10, 6, 0, Math.PI * 2);
          ctx.fill();
        }

        // Health bar
        const hbW = 30;
        const hbH = 5;
        const hbX = bot.x - hbW / 2;
        const hbY = bot.y - 25;
        ctx.fillStyle = '#333';
        ctx.fillRect(hbX, hbY, hbW, hbH);
        const hpPct = bot.health / 100;
        ctx.fillStyle = hpPct > 0.6 ? '#48bb78' : hpPct > 0.3 ? '#ecc94b' : '#f56565';
        ctx.fillRect(hbX, hbY, hbW * hpPct, hbH);

        // Planting/Defusing progress
        if (bot.plantProg > 0) {
          ctx.fillStyle = '#f56565';
          ctx.fillRect(bot.x - 15, bot.y + 20, 30 * (bot.plantProg / 3.5), 4);
          ctx.strokeStyle = '#fff';
          ctx.strokeRect(bot.x - 15, bot.y + 20, 30, 4);
        }
        if (bot.defuseProg > 0) {
          ctx.fillStyle = '#4299e1';
          ctx.fillRect(bot.x - 15, bot.y + 20, 30 * (bot.defuseProg / 5), 4);
          ctx.strokeStyle = '#fff';
          ctx.strokeRect(bot.x - 15, bot.y + 20, 30, 4);
        }

        // Bot ID
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(bot.id, bot.x, bot.y + 4);
      }

      // Draw dead bot markers
      for (const bot of bots) {
        if (bot.alive) continue;
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = bot.team === 'T' ? '#c05621' : '#2b6cb0';
        ctx.beginPath();
        ctx.moveTo(bot.x - 8, bot.y - 8);
        ctx.lineTo(bot.x + 8, bot.y + 8);
        ctx.moveTo(bot.x + 8, bot.y - 8);
        ctx.lineTo(bot.x - 8, bot.y + 8);
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Legend
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(10, MAP_H - 60, 160, 50);
      ctx.fillStyle = '#f6ad55';
      ctx.beginPath();
      ctx.arc(30, MAP_H - 40, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Terrorists', 45, MAP_H - 36);
      ctx.fillStyle = '#63b3ed';
      ctx.beginPath();
      ctx.arc(30, MAP_H - 22, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText('Counter-Terrorists', 45, MAP_H - 18);

      requestAnimationFrame(draw);
    };
    draw();
  }, [bots, bombPos]);

  const nextRound = () => {
    if (matchOver) {
      setRound(1);
      setTScore(0);
      setCTScore(0);
      tScoreRef.current = 0;
      ctScoreRef.current = 0;
      setMatchOver(false);
      setWinner(null);
    } else {
      setRound(r => r + 1);
    }
    setPhase('bet');
    phaseRef.current = 'bet';
    setBetResult(null);
  };

  if (!started) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 p-4">
        <div className="max-w-2xl mx-auto">
          <button onClick={() => { checkAndReload(); router.push('/casino'); }} 
            className="text-gray-400 hover:text-white mb-6 flex items-center gap-2">
            ← Back
          </button>
          
          <div className="bg-gray-800/90 rounded-2xl p-8 border border-gray-700">
            <h1 className="text-4xl font-bold text-center mb-4 bg-gradient-to-r from-orange-400 to-blue-400 bg-clip-text text-transparent">
              CS2 Betting
            </h1>
            <p className="text-gray-400 text-center mb-6">
              Watch AI bots play and bet on whether the bomb gets planted!
            </p>
            
            <div className="bg-gray-700/50 rounded-xl p-4 mb-6">
              <h3 className="text-white font-semibold mb-2">How it works:</h3>
              <ul className="text-gray-300 text-sm space-y-1">
                <li>• 5v5 T vs CT bot match</li>
                <li>• Bet on bomb plant (T wins) or defuse/elimination (CT wins)</li>
                <li>• First to 13 rounds wins the match</li>
                <li>• 2x payout on correct bets</li>
              </ul>
            </div>
            
            <div className="text-center text-2xl font-bold text-green-400 mb-6">
              Balance: ${balance.toLocaleString()}
            </div>
            
            <button onClick={() => setStarted(true)}
              className="w-full py-4 bg-gradient-to-r from-orange-500 to-blue-500 rounded-xl text-white font-bold text-xl hover:opacity-90 transition">
              Start Watching
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 p-2">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-2">
          <button onClick={() => { checkAndReload(); router.push('/casino'); }} 
            className="text-gray-400 hover:text-white text-sm">
            ← Back
          </button>
          <div className="flex items-center gap-6 text-xl font-bold">
            <span className="text-orange-400">T {tScore}</span>
            <span className="text-gray-500">:</span>
            <span className="text-blue-400">{ctScore} CT</span>
            <span className="text-gray-400 text-sm">Round {round}</span>
            <span className="text-white flex items-center gap-1">
              {bombPlanted ? '💣' : '⏱️'} {bombPlanted ? bombTimer : time}s
            </span>
          </div>
          <div className="text-green-400 font-bold">${balance.toLocaleString()}</div>
        </div>

        <div className="flex gap-4">
          {/* Game Canvas */}
          <div className="relative">
            <canvas ref={canvasRef} width={MAP_W} height={MAP_H}
              className="rounded-xl border-2 border-gray-700 bg-gray-900" />
            
            {/* Kill feed */}
            <div className="absolute top-2 right-2 text-right">
              {kills.map((k, i) => (
                <div key={i} className="bg-black/70 px-2 py-1 rounded text-sm text-white mb-1">
                  {k}
                </div>
              ))}
            </div>
          </div>

          {/* Betting Panel */}
          <div className="w-72 flex-shrink-0">
            {phase === 'bet' && (
              <div className="bg-gray-800/90 rounded-xl p-4 border border-gray-700">
                <h2 className="text-xl font-bold text-white mb-4 text-center">Place Bet</h2>
                
                <div className="mb-4">
                  <label className="text-gray-400 text-sm">Bet Amount</label>
                  <select value={bet} onChange={(e) => setBet(Number(e.target.value))}
                    className="w-full bg-gray-700 text-white rounded-lg p-2 mt-1">
                    {[500, 1000, 2500, 5000, 10000, 25000].map(v => (
                      <option key={v} value={v} disabled={v > balance}>${v.toLocaleString()}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 mb-4">
                  <button onClick={() => startRound(true, bet)}
                    disabled={bet > balance}
                    className="w-full py-3 bg-gradient-to-r from-orange-600 to-orange-500 rounded-lg text-white font-bold hover:opacity-90 disabled:opacity-50 transition">
                    🔥 Bet T Wins (Plant)
                  </button>
                  <button onClick={() => startRound(false, bet)}
                    disabled={bet > balance}
                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-500 rounded-lg text-white font-bold hover:opacity-90 disabled:opacity-50 transition">
                    🛡️ Bet CT Wins
                  </button>
                </div>

                <button onClick={() => startRound(null, 0)}
                  className="w-full py-2 bg-gray-700 rounded-lg text-gray-300 hover:bg-gray-600 transition">
                  Just Watch
                </button>
              </div>
            )}

            {phase === 'play' && (
              <div className="bg-gray-800/90 rounded-xl p-4 border border-gray-700">
                <h2 className="text-xl font-bold text-white mb-2 text-center">Round in Progress</h2>
                {betOn !== null && (
                  <div className="text-center">
                    <p className="text-gray-400">Your bet:</p>
                    <p className={`text-xl font-bold ${betOn ? 'text-orange-400' : 'text-blue-400'}`}>
                      ${bet.toLocaleString()} on {betOn ? 'T (Plant)' : 'CT'}
                    </p>
                  </div>
                )}
                
                <div className="mt-4 space-y-2">
                  <div className="text-sm text-gray-400">
                    T Alive: {bots.filter(b => b.team === 'T' && b.alive).length}/5
                  </div>
                  <div className="text-sm text-gray-400">
                    CT Alive: {bots.filter(b => b.team === 'CT' && b.alive).length}/5
                  </div>
                  {bombPlanted && (
                    <div className="text-red-400 font-bold animate-pulse">
                      💣 BOMB PLANTED! {bombTimer}s
                    </div>
                  )}
                </div>
              </div>
            )}

            {phase === 'end' && (
              <div className="bg-gray-800/90 rounded-xl p-4 border border-gray-700">
                <h2 className="text-xl font-bold text-white mb-2 text-center">Round Over</h2>
                <p className="text-center text-lg mb-4">{result}</p>
                
                {betResult && (
                  <div className={`text-center text-2xl font-bold mb-4 ${betResult.won ? 'text-green-400' : 'text-red-400'}`}>
                    {betResult.won ? `+$${(betResult.amt * 2).toLocaleString()}` : `-$${betResult.amt.toLocaleString()}`}
                  </div>
                )}

                {matchOver ? (
                  <div className="text-center mb-4">
                    <p className="text-2xl font-bold text-yellow-400">
                      🏆 {winner === 'T' ? 'TERRORISTS' : 'COUNTER-TERRORISTS'} WIN!
                    </p>
                    <p className="text-gray-400">Final: {tScore} - {ctScore}</p>
                  </div>
                ) : null}

                <button onClick={nextRound}
                  className="w-full py-3 bg-gradient-to-r from-green-600 to-green-500 rounded-lg text-white font-bold hover:opacity-90 transition">
                  {matchOver ? 'New Match' : 'Next Round →'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
