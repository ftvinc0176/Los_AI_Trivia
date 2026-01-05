'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

type TeamType = 'T' | 'CT';

interface Bot {
  id: string;
  team: TeamType;
  capsule: Capsule;
  velocity: THREE.Vector3;
  health: number;
  isAlive: boolean;
  mesh: THREE.Group;
  targetPosition: THREE.Vector3 | null;
  hasBomb: boolean;
  isPlanting: boolean;
  plantProgress: number;
  lastShotTime: number;
  facingDirection: THREE.Vector3;
}

export default function CSBetting() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Game state
  const [gameStarted, setGameStarted] = useState(false);
  const [balance, setBalance] = useState(10000);
  const [currentBet, setCurrentBet] = useState(0);
  const [betOnPlant, setBetOnPlant] = useState<boolean | null>(null);
  const [roundPhase, setRoundPhase] = useState<'betting' | 'playing' | 'result'>('betting');
  const [roundNumber, setRoundNumber] = useState(1);
  const [tScore, setTScore] = useState(0);
  const [ctScore, setCtScore] = useState(0);
  const [roundTime, setRoundTime] = useState(90);
  const [bombPlanted, setBombPlanted] = useState(false);
  const [bombTimer, setBombTimer] = useState(40);
  const [roundResult, setRoundResult] = useState<string>('');
  const [betResult, setBetResult] = useState<{ won: boolean; amount: number } | null>(null);
  const [matchOver, setMatchOver] = useState(false);
  const [matchWinner, setMatchWinner] = useState<TeamType | null>(null);
  
  // Refs for game loop
  const botsRef = useRef<Bot[]>([]);
  const worldOctreeRef = useRef<Octree | null>(null);
  const bombPlantedRef = useRef(false);
  const roundPhaseRef = useRef<'betting' | 'playing' | 'result'>('betting');
  const plantedPositionRef = useRef<THREE.Vector3 | null>(null);
  
  const startGame = () => {
    setGameStarted(true);
    setRoundPhase('betting');
  };
  
  const placeBet = (onPlant: boolean) => {
    if (currentBet <= 0 || currentBet > balance) return;
    setBetOnPlant(onPlant);
    setBalance(prev => prev - currentBet);
    setRoundPhase('playing');
    roundPhaseRef.current = 'playing';
  };
  
  const skipBetting = () => {
    setCurrentBet(0);
    setBetOnPlant(null);
    setRoundPhase('playing');
    roundPhaseRef.current = 'playing';
  };

  // Main game effect
  useEffect(() => {
    if (!gameStarted || !containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 50, 200);

    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    // Overhead spectator view
    camera.position.set(0, 80, 40);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1);
    sunLight.position.set(50, 100, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 500;
    sunLight.shadow.camera.left = -100;
    sunLight.shadow.camera.right = 100;
    sunLight.shadow.camera.top = 100;
    sunLight.shadow.camera.bottom = -100;
    scene.add(sunLight);

    // World octree for collision
    const worldOctree = new Octree();
    worldOctreeRef.current = worldOctree;

    // Create simplified CS-style map
    const createMap = () => {
      const mapGroup = new THREE.Group();
      
      // Ground
      const groundGeo = new THREE.PlaneGeometry(200, 200);
      const groundMat = new THREE.MeshStandardMaterial({ 
        color: 0x4a4a4a,
        roughness: 0.9 
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      mapGroup.add(ground);

      // Wall material
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.8 });
      const concreteMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.7 });

      // Create walls
      const createWall = (x: number, z: number, w: number, h: number, d: number, mat: THREE.Material) => {
        const geo = new THREE.BoxGeometry(w, h, d);
        const wall = new THREE.Mesh(geo, mat);
        wall.position.set(x, h / 2, z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        return wall;
      };

      // Outer walls
      mapGroup.add(createWall(0, -50, 100, 6, 2, wallMat)); // South
      mapGroup.add(createWall(0, 50, 100, 6, 2, wallMat));  // North
      mapGroup.add(createWall(-50, 0, 2, 6, 100, wallMat)); // West
      mapGroup.add(createWall(50, 0, 2, 6, 100, wallMat));  // East

      // Center divider with gap
      mapGroup.add(createWall(-20, 0, 2, 5, 40, concreteMat));
      mapGroup.add(createWall(20, 0, 2, 5, 40, concreteMat));

      // Bomb site A marker (left side)
      const siteAGeo = new THREE.PlaneGeometry(15, 15);
      const siteAMat = new THREE.MeshStandardMaterial({ color: 0xff4444, transparent: true, opacity: 0.3 });
      const siteA = new THREE.Mesh(siteAGeo, siteAMat);
      siteA.rotation.x = -Math.PI / 2;
      siteA.position.set(-30, 0.1, 30);
      mapGroup.add(siteA);

      // Bomb site B marker (right side)
      const siteBGeo = new THREE.PlaneGeometry(15, 15);
      const siteBMat = new THREE.MeshStandardMaterial({ color: 0xff4444, transparent: true, opacity: 0.3 });
      const siteB = new THREE.Mesh(siteBGeo, siteBMat);
      siteB.rotation.x = -Math.PI / 2;
      siteB.position.set(30, 0.1, 30);
      mapGroup.add(siteB);

      // Cover boxes
      const boxMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
      mapGroup.add(createWall(-30, 10, 4, 3, 4, boxMat));
      mapGroup.add(createWall(30, 10, 4, 3, 4, boxMat));
      mapGroup.add(createWall(-10, -20, 6, 2, 6, boxMat));
      mapGroup.add(createWall(10, -20, 6, 2, 6, boxMat));
      mapGroup.add(createWall(0, 20, 8, 3, 4, boxMat));

      // T Spawn area marker
      const tSpawnGeo = new THREE.PlaneGeometry(20, 10);
      const tSpawnMat = new THREE.MeshStandardMaterial({ color: 0xffa500, transparent: true, opacity: 0.2 });
      const tSpawn = new THREE.Mesh(tSpawnGeo, tSpawnMat);
      tSpawn.rotation.x = -Math.PI / 2;
      tSpawn.position.set(0, 0.1, -40);
      mapGroup.add(tSpawn);

      // CT Spawn area marker
      const ctSpawnGeo = new THREE.PlaneGeometry(20, 10);
      const ctSpawnMat = new THREE.MeshStandardMaterial({ color: 0x4444ff, transparent: true, opacity: 0.2 });
      const ctSpawn = new THREE.Mesh(ctSpawnGeo, ctSpawnMat);
      ctSpawn.rotation.x = -Math.PI / 2;
      ctSpawn.position.set(0, 0.1, 45);
      mapGroup.add(ctSpawn);

      return mapGroup;
    };

    const map = createMap();
    scene.add(map);
    worldOctree.fromGraphNode(map);

    // Create bot model
    const createBotModel = (team: TeamType) => {
      const botGroup = new THREE.Group();
      
      const bodyColor = team === 'T' ? 0xc9a227 : 0x4169e1;
      const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor });
      const skinMat = new THREE.MeshStandardMaterial({ color: 0xffdbac });

      // Body
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.35, 1.2, 8),
        bodyMat
      );
      body.position.y = 0.8;
      body.castShadow = true;
      botGroup.add(body);

      // Head
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 8, 8),
        skinMat
      );
      head.position.y = 1.6;
      head.castShadow = true;
      botGroup.add(head);

      // Weapon (simple rifle shape)
      const weapon = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
      );
      weapon.position.set(0.3, 1.0, 0.3);
      weapon.rotation.x = -0.1;
      botGroup.add(weapon);

      return botGroup;
    };

    // Initialize bots
    const initializeBots = () => {
      const bots: Bot[] = [];
      
      // T bots (spawn at south)
      for (let i = 0; i < 5; i++) {
        const mesh = createBotModel('T');
        const xOffset = (i - 2) * 4;
        mesh.position.set(xOffset, 0, -40);
        scene.add(mesh);
        
        bots.push({
          id: `T${i}`,
          team: 'T',
          capsule: new Capsule(
            new THREE.Vector3(xOffset, 0.35, -40),
            new THREE.Vector3(xOffset, 1.5, -40),
            0.35
          ),
          velocity: new THREE.Vector3(),
          health: 100,
          isAlive: true,
          mesh,
          targetPosition: null,
          hasBomb: i === 0, // First T has bomb
          isPlanting: false,
          plantProgress: 0,
          lastShotTime: 0,
          facingDirection: new THREE.Vector3(0, 0, 1)
        });
      }

      // CT bots (spawn at north)
      for (let i = 0; i < 5; i++) {
        const mesh = createBotModel('CT');
        const xOffset = (i - 2) * 4;
        mesh.position.set(xOffset, 0, 45);
        scene.add(mesh);
        
        bots.push({
          id: `CT${i}`,
          team: 'CT',
          capsule: new Capsule(
            new THREE.Vector3(xOffset, 0.35, 45),
            new THREE.Vector3(xOffset, 1.5, 45),
            0.35
          ),
          velocity: new THREE.Vector3(),
          health: 100,
          isAlive: true,
          mesh,
          targetPosition: null,
          hasBomb: false,
          isPlanting: false,
          plantProgress: 0,
          lastShotTime: 0,
          facingDirection: new THREE.Vector3(0, 0, -1)
        });
      }

      botsRef.current = bots;
    };

    initializeBots();

    // Bomb mesh
    const bombGeo = new THREE.BoxGeometry(0.5, 0.3, 0.3);
    const bombMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const bombMesh = new THREE.Mesh(bombGeo, bombMat);
    bombMesh.visible = false;
    scene.add(bombMesh);

    // Bot AI
    const bombSiteA = new THREE.Vector3(-30, 0, 30);
    const bombSiteB = new THREE.Vector3(30, 0, 30);
    let targetSite = Math.random() > 0.5 ? bombSiteA : bombSiteB;

    const updateBotAI = (deltaTime: number) => {
      if (roundPhaseRef.current !== 'playing') return;

      const aliveTBots = botsRef.current.filter(b => b.team === 'T' && b.isAlive);
      const aliveCTBots = botsRef.current.filter(b => b.team === 'CT' && b.isAlive);

      botsRef.current.forEach(bot => {
        if (!bot.isAlive) {
          bot.mesh.visible = false;
          return;
        }

        const botPos = bot.capsule.start.clone();
        botPos.y = 0;

        // T bot behavior
        if (bot.team === 'T') {
          if (bombPlantedRef.current) {
            // Defend planted bomb
            if (plantedPositionRef.current) {
              const distToPlant = botPos.distanceTo(plantedPositionRef.current);
              if (distToPlant > 10) {
                bot.targetPosition = plantedPositionRef.current.clone();
              } else {
                bot.targetPosition = null;
              }
            }
          } else if (bot.hasBomb) {
            // Bomb carrier goes to site
            const distToSite = botPos.distanceTo(targetSite);
            if (distToSite < 5) {
              // At bomb site - plant
              bot.isPlanting = true;
              bot.plantProgress += deltaTime;
              if (bot.plantProgress >= 3) {
                bombPlantedRef.current = true;
                setBombPlanted(true);
                plantedPositionRef.current = botPos.clone();
                bombMesh.position.copy(botPos);
                bombMesh.position.y = 0.15;
                bombMesh.visible = true;
                bot.hasBomb = false;
                bot.isPlanting = false;
              }
            } else {
              bot.targetPosition = targetSite.clone();
              bot.isPlanting = false;
              bot.plantProgress = 0;
            }
          } else {
            // Follow bomb carrier or go to site
            const bombCarrier = aliveTBots.find(b => b.hasBomb);
            if (bombCarrier) {
              const carrierPos = bombCarrier.capsule.start.clone();
              carrierPos.y = 0;
              bot.targetPosition = carrierPos.clone().add(
                new THREE.Vector3((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10)
              );
            } else {
              bot.targetPosition = targetSite.clone();
            }
          }
        }

        // CT bot behavior
        if (bot.team === 'CT') {
          if (bombPlantedRef.current && plantedPositionRef.current) {
            // Rush to defuse
            bot.targetPosition = plantedPositionRef.current.clone();
          } else {
            // Patrol between sites or engage enemies
            const nearestT = aliveTBots.reduce((nearest, tBot) => {
              const dist = botPos.distanceTo(tBot.capsule.start);
              return !nearest || dist < botPos.distanceTo(nearest.capsule.start) ? tBot : nearest;
            }, null as Bot | null);

            if (nearestT) {
              const distToT = botPos.distanceTo(nearestT.capsule.start);
              if (distToT < 30) {
                // Engage enemy
                bot.targetPosition = nearestT.capsule.start.clone();
              } else {
                // Patrol
                if (!bot.targetPosition || botPos.distanceTo(bot.targetPosition) < 3) {
                  bot.targetPosition = new THREE.Vector3(
                    (Math.random() - 0.5) * 60,
                    0,
                    20 + Math.random() * 20
                  );
                }
              }
            }
          }
        }

        // Movement
        if (bot.targetPosition && !bot.isPlanting) {
          const direction = bot.targetPosition.clone().sub(botPos).normalize();
          bot.facingDirection.copy(direction);
          const speed = 8;
          bot.velocity.x = direction.x * speed * deltaTime;
          bot.velocity.z = direction.z * speed * deltaTime;
          
          bot.capsule.start.x += bot.velocity.x;
          bot.capsule.start.z += bot.velocity.z;
          bot.capsule.end.x += bot.velocity.x;
          bot.capsule.end.z += bot.velocity.z;
        }

        // Combat - shoot at enemies
        const enemies = bot.team === 'T' ? aliveCTBots : aliveTBots;
        const now = Date.now();
        
        enemies.forEach(enemy => {
          const distToEnemy = bot.capsule.start.distanceTo(enemy.capsule.start);
          if (distToEnemy < 25 && now - bot.lastShotTime > 500) {
            // Check line of sight (simplified)
            const hitChance = Math.max(0.1, 1 - distToEnemy / 30);
            if (Math.random() < hitChance * 0.3) {
              enemy.health -= 25;
              if (enemy.health <= 0) {
                enemy.isAlive = false;
                enemy.mesh.visible = false;
                // Transfer bomb if T with bomb dies
                if (enemy.hasBomb) {
                  const otherT = aliveTBots.find(t => t.id !== enemy.id && t.isAlive);
                  if (otherT) {
                    otherT.hasBomb = true;
                  }
                }
              }
            }
            bot.lastShotTime = now;
          }
        });

        // Update mesh position
        bot.mesh.position.set(
          bot.capsule.start.x,
          0,
          bot.capsule.start.z
        );
        bot.mesh.lookAt(
          bot.mesh.position.x + bot.facingDirection.x,
          0,
          bot.mesh.position.z + bot.facingDirection.z
        );
      });
    };

    // Camera controls
    let cameraAngle = 0;
    let cameraHeight = 80;
    let cameraDistance = 40;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyA') cameraAngle -= 0.05;
      if (e.code === 'KeyD') cameraAngle += 0.05;
      if (e.code === 'KeyW') cameraHeight = Math.min(120, cameraHeight + 5);
      if (e.code === 'KeyS') cameraHeight = Math.max(30, cameraHeight - 5);
      if (e.code === 'KeyQ') cameraDistance = Math.min(80, cameraDistance + 5);
      if (e.code === 'KeyE') cameraDistance = Math.max(20, cameraDistance - 5);
    };
    window.addEventListener('keydown', handleKeyDown);

    // Animation loop
    const clock = new THREE.Clock();
    let lastTime = 0;

    const animate = () => {
      const currentTime = clock.getElapsedTime();
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;

      updateBotAI(deltaTime);

      // Update camera position
      camera.position.x = Math.sin(cameraAngle) * cameraDistance;
      camera.position.z = Math.cos(cameraAngle) * cameraDistance;
      camera.position.y = cameraHeight;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [gameStarted]);

  // Round timer
  useEffect(() => {
    if (!gameStarted || roundPhase !== 'playing') return;

    const timer = setInterval(() => {
      setRoundTime(prev => {
        if (prev <= 1) {
          // Time's up - CTs win (bomb not planted or defused in time)
          endRound('CT', false);
          return 90;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameStarted, roundPhase]);

  // Bomb timer
  useEffect(() => {
    if (!gameStarted || !bombPlanted) return;

    const timer = setInterval(() => {
      setBombTimer(prev => {
        if (prev <= 1) {
          // Bomb explodes - Ts win
          endRound('T', true);
          return 40;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameStarted, bombPlanted]);

  // Check round end conditions
  useEffect(() => {
    if (!gameStarted || roundPhase !== 'playing') return;

    const checkInterval = setInterval(() => {
      const bots = botsRef.current;
      const aliveTBots = bots.filter(b => b.team === 'T' && b.isAlive);
      const aliveCTBots = bots.filter(b => b.team === 'CT' && b.isAlive);

      // All Ts dead
      if (aliveTBots.length === 0 && !bombPlantedRef.current) {
        endRound('CT', false);
      }
      // All CTs dead
      else if (aliveCTBots.length === 0) {
        if (bombPlantedRef.current) {
          endRound('T', true);
        } else {
          // Check if T can still plant
          const bombCarrier = bots.find(b => b.hasBomb && b.isAlive);
          if (!bombCarrier) {
            endRound('CT', false);
          }
        }
      }
    }, 500);

    return () => clearInterval(checkInterval);
  }, [gameStarted, roundPhase]);

  const endRound = (winner: TeamType, wasPlanted: boolean) => {
    setRoundPhase('result');
    roundPhaseRef.current = 'result';
    
    if (winner === 'T') {
      setTScore(prev => prev + 1);
      setRoundResult('TERRORISTS WIN');
    } else {
      setCtScore(prev => prev + 1);
      setRoundResult('COUNTER-TERRORISTS WIN');
    }

    // Calculate bet result
    if (betOnPlant !== null && currentBet > 0) {
      const won = betOnPlant === wasPlanted;
      if (won) {
        setBalance(prev => prev + currentBet * 2);
        setBetResult({ won: true, amount: currentBet });
      } else {
        setBetResult({ won: false, amount: currentBet });
      }
    }

    // Check for match end
    const newTScore = winner === 'T' ? tScore + 1 : tScore;
    const newCTScore = winner === 'CT' ? ctScore + 1 : ctScore;
    
    if (newTScore >= 8 || newCTScore >= 8) {
      setMatchOver(true);
      setMatchWinner(newTScore >= 8 ? 'T' : 'CT');
    }
  };

  const nextRound = () => {
    if (matchOver) {
      // Reset for new match
      setMatchOver(false);
      setMatchWinner(null);
      setTScore(0);
      setCtScore(0);
      setRoundNumber(1);
    } else {
      setRoundNumber(prev => prev + 1);
    }
    
    setRoundPhase('betting');
    roundPhaseRef.current = 'betting';
    setRoundTime(90);
    setBombPlanted(false);
    bombPlantedRef.current = false;
    setBombTimer(40);
    setCurrentBet(0);
    setBetOnPlant(null);
    setBetResult(null);
    setRoundResult('');
    plantedPositionRef.current = null;

    // Reset bots
    botsRef.current.forEach((bot, i) => {
      bot.health = 100;
      bot.isAlive = true;
      bot.mesh.visible = true;
      bot.isPlanting = false;
      bot.plantProgress = 0;
      bot.hasBomb = bot.team === 'T' && i === 0;
      
      if (bot.team === 'T') {
        const xOffset = (i % 5 - 2) * 4;
        bot.capsule.start.set(xOffset, 0.35, -40);
        bot.capsule.end.set(xOffset, 1.5, -40);
        bot.mesh.position.set(xOffset, 0, -40);
      } else {
        const xOffset = ((i - 5) - 2) * 4;
        bot.capsule.start.set(xOffset, 0.35, 45);
        bot.capsule.end.set(xOffset, 1.5, 45);
        bot.mesh.position.set(xOffset, 0, 45);
      }
    });
  };

  // Pre-game lobby
  if (!gameStarted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-black/60 backdrop-blur-xl rounded-3xl p-8 border border-white/20">
          <button
            onClick={() => router.push('/')}
            className="mb-6 text-white/60 hover:text-white transition-colors"
          >
            ← Back to Home
          </button>
          
          <h1 className="text-5xl font-bold text-white mb-4 text-center">CS BETTING</h1>
          <p className="text-xl text-purple-200 text-center mb-8">
            Watch 5v5 bot matches and bet on the outcome
          </p>
          
          <div className="bg-white/10 rounded-xl p-6 mb-6">
            <h3 className="text-xl font-bold text-white mb-4">How to Play</h3>
            <ul className="text-purple-100 space-y-2">
              <li>• Watch bot teams compete in CS-style rounds</li>
              <li>• Before each round, bet whether the bomb will be planted</li>
              <li>• Win 2x your bet if you predict correctly</li>
              <li>• First team to 8 rounds wins the match</li>
            </ul>
          </div>
          
          <div className="bg-white/10 rounded-xl p-6 mb-6">
            <h3 className="text-xl font-bold text-white mb-4">Camera Controls</h3>
            <ul className="text-purple-100 space-y-1">
              <li>A/D - Rotate camera</li>
              <li>W/S - Raise/Lower camera</li>
              <li>Q/E - Zoom in/out</li>
            </ul>
          </div>
          
          <div className="text-center mb-6">
            <div className="text-3xl font-bold text-yellow-400">
              Starting Balance: $10,000
            </div>
          </div>
          
          <button
            onClick={startGame}
            className="w-full py-4 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white rounded-xl font-bold text-xl transition-all"
          >
            START WATCHING
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
      
      {/* Top HUD */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm rounded-lg px-8 py-3 text-white">
        <div className="flex items-center gap-8 text-xl font-bold">
          <div className="text-yellow-400">T: {tScore}</div>
          <div className="text-2xl">Round {roundNumber}</div>
          <div className="text-blue-400">CT: {ctScore}</div>
        </div>
        <div className="text-center text-lg mt-1">
          {Math.floor(roundTime / 60)}:{(roundTime % 60).toString().padStart(2, '0')}
        </div>
        {bombPlanted && (
          <div className="text-center text-red-400 animate-pulse font-bold mt-1">
            💣 BOMB PLANTED - {bombTimer}s
          </div>
        )}
      </div>

      {/* Balance Display */}
      <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm rounded-lg px-6 py-3 text-white">
        <div className="text-sm text-gray-400">Balance</div>
        <div className="text-2xl font-bold text-green-400">${balance.toLocaleString()}</div>
      </div>

      {/* Betting Phase UI */}
      {roundPhase === 'betting' && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 max-w-lg w-full mx-4 border border-white/20">
            <h2 className="text-3xl font-bold text-white text-center mb-6">
              Round {roundNumber} - Place Your Bet
            </h2>
            
            <div className="text-center mb-6">
              <div className="text-lg text-gray-400">Your Balance</div>
              <div className="text-4xl font-bold text-green-400">${balance.toLocaleString()}</div>
            </div>
            
            <div className="mb-6">
              <label className="text-white text-lg mb-2 block">Bet Amount</label>
              <input
                type="number"
                value={currentBet}
                onChange={(e) => setCurrentBet(Math.min(balance, Math.max(0, parseInt(e.target.value) || 0)))}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white text-2xl text-center"
                placeholder="0"
              />
              <div className="flex gap-2 mt-2">
                {[100, 500, 1000, 5000].map(amt => (
                  <button
                    key={amt}
                    onClick={() => setCurrentBet(Math.min(balance, amt))}
                    className="flex-1 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm"
                  >
                    ${amt}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentBet(balance)}
                  className="flex-1 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg text-white text-sm"
                >
                  ALL IN
                </button>
              </div>
            </div>
            
            <div className="text-center text-white text-lg mb-4">
              Will the bomb be planted this round?
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              <button
                onClick={() => placeBet(true)}
                disabled={currentBet <= 0}
                className="py-4 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white rounded-xl font-bold text-xl transition-all"
              >
                YES - Bomb Planted
              </button>
              <button
                onClick={() => placeBet(false)}
                disabled={currentBet <= 0}
                className="py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-xl font-bold text-xl transition-all"
              >
                NO - Not Planted
              </button>
            </div>
            
            <button
              onClick={skipBetting}
              className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl transition-all"
            >
              Skip Betting (Just Watch)
            </button>
          </div>
        </div>
      )}

      {/* Round Result UI */}
      {roundPhase === 'result' && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 max-w-lg w-full mx-4 border border-white/20 text-center">
            <h2 className="text-4xl font-bold text-white mb-4">{roundResult}</h2>
            
            <div className="text-xl text-gray-300 mb-4">
              Bomb was {bombPlanted ? 'PLANTED' : 'NOT PLANTED'}
            </div>
            
            {betResult && (
              <div className={`text-3xl font-bold mb-6 ${betResult.won ? 'text-green-400' : 'text-red-400'}`}>
                {betResult.won ? `+$${betResult.amount.toLocaleString()}` : `-$${betResult.amount.toLocaleString()}`}
              </div>
            )}
            
            {matchOver ? (
              <div className="mb-6">
                <div className="text-2xl font-bold text-white mb-2">MATCH OVER</div>
                <div className={`text-4xl font-bold ${matchWinner === 'T' ? 'text-yellow-400' : 'text-blue-400'}`}>
                  {matchWinner === 'T' ? 'TERRORISTS' : 'COUNTER-TERRORISTS'} WIN!
                </div>
              </div>
            ) : null}
            
            <button
              onClick={nextRound}
              className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl font-bold text-xl transition-all"
            >
              {matchOver ? 'New Match' : 'Next Round'}
            </button>
          </div>
        </div>
      )}

      {/* Current Bet Display */}
      {roundPhase === 'playing' && betOnPlant !== null && (
        <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-sm rounded-lg px-6 py-3 text-white">
          <div className="text-sm text-gray-400">Your Bet</div>
          <div className="text-xl font-bold">${currentBet.toLocaleString()}</div>
          <div className={`text-sm ${betOnPlant ? 'text-yellow-400' : 'text-blue-400'}`}>
            {betOnPlant ? 'Bomb WILL be planted' : 'Bomb will NOT be planted'}
          </div>
        </div>
      )}

      {/* Controls Hint */}
      <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-sm rounded-lg px-4 py-2 text-white text-sm">
        <div>A/D - Rotate | W/S - Height | Q/E - Zoom</div>
      </div>

      {/* Back Button */}
      <button
        onClick={() => router.push('/')}
        className="absolute bottom-4 right-4 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 text-white transition-all"
      >
        Exit to Menu
      </button>
    </div>
  );
}
