'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCasino } from '../CasinoContext';
import * as THREE from 'three';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';
import { OctreeHelper } from 'three/examples/jsm/helpers/OctreeHelper.js';

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

interface Bullet {
  mesh: THREE.Mesh;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  progress: number;
  speed: number;
}

export default function CSBetting() {
  const router = useRouter();
  const { balance, setBalance, recordWin, checkAndReload } = useCasino();
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Game state
  const [gameStarted, setGameStarted] = useState(false);
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
  const initRoutesRef = useRef<(() => void) | null>(null);
  
  const startGame = () => {
    setGameStarted(true);
    setRoundPhase('betting');
  };
  
  const placeBet = (onPlant: boolean) => {
    if (currentBet <= 0 || currentBet > balance) return;
    setBetOnPlant(onPlant);
    setBalance(balance - currentBet);
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
    
    // Bullets array for tracers
    const bullets: Bullet[] = [];
    const raycaster = new THREE.Raycaster();

    // === TEXTURE GENERATION ===
    const createBrickTexture = (baseColor: number, groutColor: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#' + groutColor.toString(16).padStart(6, '0');
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = '#' + baseColor.toString(16).padStart(6, '0');
      for (let row = 0; row < 8; row++) {
        const offset = row % 2 ? 8 : 0;
        for (let col = -1; col < 8; col++) {
          ctx.fillRect(offset + col * 16 + 1, row * 16 + 1, 14, 14);
        }
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(2, 2);
      return texture;
    };

    const createSandTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#c9b896';
      ctx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 500; i++) {
        const x = Math.random() * 128;
        const y = Math.random() * 128;
        const shade = Math.random() * 30 - 15;
        ctx.fillStyle = `rgb(${201 + shade}, ${184 + shade}, ${150 + shade})`;
        ctx.fillRect(x, y, 2, 2);
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(10, 10);
      return texture;
    };

    const createWoodTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(0, 0, 64, 128);
      for (let i = 0; i < 20; i++) {
        ctx.strokeStyle = `rgba(60, 30, 15, ${Math.random() * 0.3})`;
        ctx.beginPath();
        ctx.moveTo(0, i * 6 + Math.random() * 3);
        ctx.bezierCurveTo(16, i * 6 + Math.random() * 6, 48, i * 6 - Math.random() * 6, 64, i * 6 + Math.random() * 3);
        ctx.stroke();
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(1, 2);
      return texture;
    };

    const brickTex = createBrickTexture(0xa08060, 0x605040);
    brickTex.repeat.set(4, 2);
    const sandTex = createSandTexture();
    const woodTex = createWoodTexture();

    // === MATERIALS ===
    const sandMat = new THREE.MeshStandardMaterial({ map: sandTex, roughness: 0.9 });
    const wallMat = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.8 });
    const darkWallMat = new THREE.MeshStandardMaterial({ 
      map: createBrickTexture(0x8b7355, 0x5a4a3a),
      roughness: 0.85 
    });
    const tileMat = new THREE.MeshStandardMaterial({ 
      map: createBrickTexture(0x888888, 0x666666), 
      roughness: 0.7 
    });
    const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.9 });

    const wallH = 6;
    const wallThick = 1;
    
    // Store all wall meshes for raycasting LOS checks
    const wallMeshes: THREE.Mesh[] = [];

    // Helper to add mesh with collision (for walls)
    const addMesh = (mesh: THREE.Mesh) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      worldOctree.fromGraphNode(mesh);
      wallMeshes.push(mesh); // Track for raycasting
    };

    // Helper to add mesh WITHOUT collision (for floors)
    const addFloor = (mesh: THREE.Mesh) => {
      mesh.receiveShadow = true;
      scene.add(mesh);
      // Don't add to octree - bots should walk on floors, not collide with them
    };

    // ===== ROOM BUILDER =====
    const buildRoom = (
      x: number, z: number,
      w: number, d: number,
      doors: { side: 'n' | 's' | 'e' | 'w', pos: number, width: number }[] = [],
      hasRoof: boolean = true,
      mat: THREE.Material = wallMat
    ) => {
      // Floor - visual only, no collision
      const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), tileMat);
      floor.position.set(x, 0.15, z);
      addFloor(floor);

      const buildWallWithDoor = (
        wx: number, wz: number, 
        wWidth: number, wDepth: number,
        doorPos: number, doorWidth: number
      ) => {
        if (doorWidth <= 0) {
          const wall = new THREE.Mesh(new THREE.BoxGeometry(wWidth, wallH, wDepth), mat);
          wall.position.set(wx, wallH / 2, wz);
          addMesh(wall);
        } else {
          const isHorizontal = wWidth > wDepth;
          const totalLen = isHorizontal ? wWidth : wDepth;
          const doorStart = totalLen / 2 + doorPos - doorWidth / 2;
          const doorEnd = totalLen / 2 + doorPos + doorWidth / 2;

          if (doorStart > 0.5) {
            const leftLen = doorStart;
            const leftWall = new THREE.Mesh(
              new THREE.BoxGeometry(isHorizontal ? leftLen : wWidth, wallH, isHorizontal ? wDepth : leftLen),
              mat
            );
            leftWall.position.set(
              isHorizontal ? wx - (totalLen - leftLen) / 2 : wx,
              wallH / 2,
              isHorizontal ? wz : wz - (totalLen - leftLen) / 2
            );
            addMesh(leftWall);
          }

          if (totalLen - doorEnd > 0.5) {
            const rightLen = totalLen - doorEnd;
            const rightWall = new THREE.Mesh(
              new THREE.BoxGeometry(isHorizontal ? rightLen : wWidth, wallH, isHorizontal ? wDepth : rightLen),
              mat
            );
            rightWall.position.set(
              isHorizontal ? wx + (totalLen - rightLen) / 2 : wx,
              wallH / 2,
              isHorizontal ? wz : wz + (totalLen - rightLen) / 2
            );
            addMesh(rightWall);
          }
        }
      };

      const northDoor = doors.find(d => d.side === 'n');
      const southDoor = doors.find(d => d.side === 's');
      const eastDoor = doors.find(d => d.side === 'e');
      const westDoor = doors.find(d => d.side === 'w');

      // North wall
      buildWallWithDoor(x, z + d/2 + wallThick/2, w + wallThick*2, wallThick,
        northDoor?.pos || 0, northDoor?.width || 0);
      // South wall
      buildWallWithDoor(x, z - d/2 - wallThick/2, w + wallThick*2, wallThick,
        southDoor?.pos || 0, southDoor?.width || 0);
      // East wall
      buildWallWithDoor(x + w/2 + wallThick/2, z, wallThick, d,
        eastDoor?.pos || 0, eastDoor?.width || 0);
      // West wall
      buildWallWithDoor(x - w/2 - wallThick/2, z, wallThick, d,
        westDoor?.pos || 0, westDoor?.width || 0);

      if (hasRoof) {
        const ceiling = new THREE.Mesh(new THREE.BoxGeometry(w + wallThick*2, 0.3, d + wallThick*2), roofMat);
        ceiling.position.set(x, wallH, z);
        addMesh(ceiling);
      }
    };

    // === GROUND ===
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), sandMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    scene.add(ground);
    // Don't add ground to octree - bots walk on it

    // ============================================
    // MIRAGE MAP LAYOUT
    // ============================================

    // === T SPAWN ===
    const tSpawnFloor = new THREE.Mesh(new THREE.BoxGeometry(30, 0.5, 20), sandMat);
    tSpawnFloor.position.set(0, -0.25, -70);
    addFloor(tSpawnFloor);

    // === T APARTMENTS ===
    buildRoom(-20, -55, 12, 18, [
      { side: 's', pos: 0, width: 10 },
      { side: 'n', pos: 0, width: 10 },
    ]);

    // === B APARTMENTS CORRIDOR ===
    buildRoom(-30, -35, 15, 28, [
      { side: 's', pos: 0, width: 10 },
      { side: 'n', pos: 0, width: 10 },
      { side: 'e', pos: 5, width: 10 },
    ]);

    // === B SITE ===
    buildRoom(-40, -5, 30, 30, [
      { side: 's', pos: 5, width: 12 },
      { side: 'e', pos: 0, width: 12 },
      { side: 'e', pos: -10, width: 10 },
    ], false);

    const bBox = new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 4), woodMat);
    bBox.position.set(-45, 1.25, 0);
    addMesh(bBox);
    const bBox2 = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), woodMat);
    bBox2.position.set(-35, 1, -8);
    addMesh(bBox2);

    // === UNDERPASS ===
    buildRoom(-18, -25, 14, 22, [
      { side: 'w', pos: 5, width: 10 },
      { side: 'n', pos: 0, width: 10 },
      { side: 'e', pos: -5, width: 10 },
    ]);

    // === MID ===
    buildRoom(0, -35, 20, 45, [
      { side: 's', pos: 0, width: 12 },
      { side: 'n', pos: 0, width: 12 },
      { side: 'w', pos: 5, width: 10 },
      { side: 'e', pos: -12, width: 10 },
      { side: 'e', pos: 12, width: 10 },
    ], false);

    const midBox = new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 4), woodMat);
    midBox.position.set(-3, 1.25, -35);
    addMesh(midBox);

    // === WINDOW ROOM ===
    buildRoom(20, -45, 14, 14, [
      { side: 'w', pos: 0, width: 10 },
      { side: 'e', pos: 0, width: 10 },
    ]);

    // === A SHORT ===
    buildRoom(20, -20, 15, 18, [
      { side: 'w', pos: 0, width: 10 },
      { side: 'e', pos: 0, width: 12 },
    ]);

    // === CONNECTOR ===
    buildRoom(0, -5, 18, 22, [
      { side: 's', pos: 0, width: 12 },
      { side: 'n', pos: 0, width: 12 },
    ]);

    // === T RAMP ===
    buildRoom(20, -60, 14, 22, [
      { side: 's', pos: 0, width: 10 },
      { side: 'n', pos: 0, width: 10 },
    ]);

    // === PALACE ===
    buildRoom(35, -45, 18, 18, [
      { side: 's', pos: 0, width: 10 },
      { side: 'e', pos: 0, width: 10 },
      { side: 'n', pos: 3, width: 10 },
    ]);

    buildRoom(35, -30, 14, 14, [
      { side: 's', pos: 3, width: 10 },
      { side: 'e', pos: 0, width: 10 },
    ]);

    // === A SITE ===
    buildRoom(50, -20, 35, 40, [
      { side: 'w', pos: 5, width: 12 },
      { side: 'w', pos: -10, width: 12 },
      { side: 's', pos: 0, width: 10 },
      { side: 'n', pos: 5, width: 12 },
    ], false);

    const aDefault = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), woodMat);
    aDefault.position.set(50, 1.5, -15);
    addMesh(aDefault);
    const aTriple = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 3), woodMat);
    aTriple.position.set(55, 1.25, -20);
    addMesh(aTriple);

    // === CT SPAWN ===
    buildRoom(25, 15, 45, 25, [
      { side: 's', pos: -14, width: 12 },
      { side: 's', pos: 14, width: 12 },
      { side: 'w', pos: 0, width: 12 },
    ], false);

    // === MARKET ===
    buildRoom(-10, 10, 18, 18, [
      { side: 'e', pos: 0, width: 12 },
      { side: 'w', pos: 0, width: 12 },
    ]);

    // === BOUNDARY WALLS ===
    const boundaryWalls = [
      { x: 0, z: -95, w: 150, d: 2 },
      { x: 0, z: 40, w: 150, d: 2 },
      { x: -70, z: -25, w: 2, d: 140 },
      { x: 80, z: -25, w: 2, d: 140 },
    ];
    boundaryWalls.forEach(b => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(b.w, 12, b.d), darkWallMat);
      wall.position.set(b.x, 6, b.z);
      addMesh(wall);
    });

    // === BOMB SITE MARKERS ===
    const bombSiteAGeo = new THREE.CircleGeometry(8, 32);
    const bombSiteMat = new THREE.MeshStandardMaterial({ 
      color: 0xff0000, transparent: true, opacity: 0.3, side: THREE.DoubleSide 
    });
    const bombSiteAMesh = new THREE.Mesh(bombSiteAGeo, bombSiteMat);
    bombSiteAMesh.rotation.x = -Math.PI / 2;
    bombSiteAMesh.position.set(50, 0.2, -20);
    scene.add(bombSiteAMesh);

    const bombSiteBMesh = new THREE.Mesh(bombSiteAGeo.clone(), bombSiteMat);
    bombSiteBMesh.rotation.x = -Math.PI / 2;
    bombSiteBMesh.position.set(-35, 0.2, -10);
    scene.add(bombSiteBMesh);

    // Create soldier model with weapon
    const createSoldierModel = (team: TeamType) => {
      const soldier = new THREE.Group();

      // Team colors
      const teamColor = team === 'T' ? 0xc9a227 : 0x4169e1;
      const darkTeamColor = team === 'T' ? 0x8b7318 : 0x2a4890;

      // Body (torso)
      const bodyGeometry = new THREE.BoxGeometry(0.5, 0.8, 0.3);
      const bodyMaterial = new THREE.MeshStandardMaterial({ color: teamColor });
      const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
      body.position.y = 0.9;
      body.castShadow = true;
      soldier.add(body);

      // Head
      const headGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
      const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffdbac });
      const head = new THREE.Mesh(headGeometry, headMaterial);
      head.position.y = 1.5;
      head.castShadow = true;
      soldier.add(head);

      // Helmet
      const helmetGeometry = new THREE.BoxGeometry(0.32, 0.2, 0.32);
      const helmetMaterial = new THREE.MeshStandardMaterial({ color: darkTeamColor });
      const helmet = new THREE.Mesh(helmetGeometry, helmetMaterial);
      helmet.position.y = 1.65;
      helmet.castShadow = true;
      soldier.add(helmet);

      // Arms
      const armGeometry = new THREE.BoxGeometry(0.15, 0.6, 0.15);
      const armMaterial = new THREE.MeshStandardMaterial({ color: teamColor });
      
      const leftArm = new THREE.Mesh(armGeometry, armMaterial);
      leftArm.position.set(-0.35, 0.9, 0);
      leftArm.castShadow = true;
      soldier.add(leftArm);

      const rightArm = new THREE.Mesh(armGeometry, armMaterial);
      rightArm.position.set(0.35, 0.9, 0);
      rightArm.castShadow = true;
      soldier.add(rightArm);

      // Legs
      const legGeometry = new THREE.BoxGeometry(0.18, 0.6, 0.18);
      const legMaterial = new THREE.MeshStandardMaterial({ color: darkTeamColor });
      
      const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
      leftLeg.position.set(-0.12, 0.3, 0);
      leftLeg.castShadow = true;
      soldier.add(leftLeg);

      const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
      rightLeg.position.set(0.12, 0.3, 0);
      rightLeg.castShadow = true;
      soldier.add(rightLeg);

      // Weapon (AK47 style for T, M4 style for CT)
      const weaponGroup = new THREE.Group();
      const metalMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8 });
      const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9 });
      const gunWoodMat = new THREE.MeshStandardMaterial({ color: 0x8b4513 });

      // Barrel
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8), darkMetalMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = 0.3;
      weaponGroup.add(barrel);

      // Receiver
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.2), darkMetalMat);
      receiver.position.z = 0;
      weaponGroup.add(receiver);

      // Stock
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.2), team === 'T' ? gunWoodMat : metalMat);
      stock.position.z = -0.2;
      weaponGroup.add(stock);

      // Magazine
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.04), team === 'T' ? gunWoodMat : metalMat);
      mag.position.set(0, -0.1, -0.02);
      mag.rotation.x = team === 'T' ? 0.2 : 0;
      weaponGroup.add(mag);

      weaponGroup.position.set(0.3, 0.85, 0.25);
      weaponGroup.rotation.x = Math.PI / 6;
      soldier.add(weaponGroup);

      // Scale up the soldier to be more visible
      soldier.scale.set(3, 3, 3);

      return soldier;
    };

    // Initialize bots with proper spawn positions for Mirage
    const initializeBots = () => {
      const bots: Bot[] = [];
      
      // T bots (spawn at T spawn area - south) - spread out more
      for (let i = 0; i < 5; i++) {
        const mesh = createSoldierModel('T');
        const xOffset = (i - 2) * 6; // Spread more for bigger models
        mesh.position.set(xOffset, 0, -70);
        scene.add(mesh);
        
        bots.push({
          id: `T${i}`,
          team: 'T',
          capsule: new Capsule(
            new THREE.Vector3(xOffset, 0.5, -70),
            new THREE.Vector3(xOffset, 4.5, -70),
            0.6 // Smaller radius for easier navigation
          ),
          velocity: new THREE.Vector3(),
          health: 100,
          isAlive: true,
          mesh,
          targetPosition: null,
          hasBomb: i === 0,
          isPlanting: false,
          plantProgress: 0,
          lastShotTime: 0,
          facingDirection: new THREE.Vector3(0, 0, 1)
        });
      }

      // CT bots (spawn at CT spawn - north) - spread out more
      for (let i = 0; i < 5; i++) {
        const mesh = createSoldierModel('CT');
        const xOffset = (i - 2) * 6 + 25; // Spread more
        mesh.position.set(xOffset, 0, 15);
        scene.add(mesh);
        
        bots.push({
          id: `CT${i}`,
          team: 'CT',
          capsule: new Capsule(
            new THREE.Vector3(xOffset, 0.5, 15),
            new THREE.Vector3(xOffset, 4.5, 15),
            0.6 // Smaller radius for easier navigation
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
    const bombGeo = new THREE.BoxGeometry(1.0, 0.5, 0.6);
    const bombMatRed = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.8 });
    const bombMesh = new THREE.Mesh(bombGeo, bombMatRed);
    // Add LED display to bomb
    const ledDisplay = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.25, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.8 })
    );
    ledDisplay.position.set(0, 0.15, 0.35);
    bombMesh.add(ledDisplay);
    bombMesh.visible = false;
    scene.add(bombMesh);

    // Updated bomb site positions for Mirage map
    const bombSiteA = new THREE.Vector3(50, 0, -20);
    const bombSiteB = new THREE.Vector3(-35, 0, -10);
    let targetSite = Math.random() > 0.5 ? bombSiteA : bombSiteB;

    // Waypoints for navigation around the map - more granular for smooth pathfinding
    const waypoints = {
      // T side spawns and areas
      tSpawn: new THREE.Vector3(0, 0, -70),
      tSpawnLeft: new THREE.Vector3(-8, 0, -68),
      tSpawnRight: new THREE.Vector3(8, 0, -68),
      
      // B route via apartments
      tAptsEntry: new THREE.Vector3(-20, 0, -60),
      tAptsInside: new THREE.Vector3(-20, 0, -50),
      bAppsCorridor: new THREE.Vector3(-30, 0, -45),
      bAppsExit: new THREE.Vector3(-30, 0, -25),
      bSiteEntry: new THREE.Vector3(-35, 0, -18),
      bSite: new THREE.Vector3(-40, 0, -5),
      bSiteBox: new THREE.Vector3(-45, 0, 0),
      
      // Mid area
      midEntry: new THREE.Vector3(0, 0, -50),
      mid: new THREE.Vector3(0, 0, -35),
      midTop: new THREE.Vector3(0, 0, -20),
      
      // Underpass connection
      underpassEntry: new THREE.Vector3(-10, 0, -30),
      underpass: new THREE.Vector3(-18, 0, -25),
      underpassExit: new THREE.Vector3(-25, 0, -18),
      
      // Connector
      connector: new THREE.Vector3(0, 0, -5),
      connectorToA: new THREE.Vector3(10, 0, -10),
      
      // A route via palace/ramp
      tRamp: new THREE.Vector3(20, 0, -65),
      tRampTop: new THREE.Vector3(20, 0, -55),
      palace: new THREE.Vector3(35, 0, -50),
      palaceMid: new THREE.Vector3(35, 0, -40),
      palaceTop: new THREE.Vector3(35, 0, -30),
      palaceExit: new THREE.Vector3(40, 0, -25),
      
      // A short route
      aShortEntry: new THREE.Vector3(15, 0, -25),
      aShort: new THREE.Vector3(25, 0, -20),
      aShortExit: new THREE.Vector3(35, 0, -20),
      
      // A site
      aSiteEntry: new THREE.Vector3(40, 0, -20),
      aSite: new THREE.Vector3(50, 0, -20),
      aSiteDefault: new THREE.Vector3(50, 0, -15),
      
      // CT areas
      ctSpawn: new THREE.Vector3(25, 0, 15),
      ctSpawnLeft: new THREE.Vector3(15, 0, 12),
      ctSpawnRight: new THREE.Vector3(35, 0, 12),
      ctToA: new THREE.Vector3(40, 0, 5),
      ctToB: new THREE.Vector3(5, 0, 10),
      
      // Market
      marketEntry: new THREE.Vector3(-5, 0, 5),
      market: new THREE.Vector3(-10, 0, 10),
      marketExit: new THREE.Vector3(-20, 0, 5),
    };

    // Routes from T spawn to bomb sites - more waypoints for smoother paths
    const routesToA = [
      [waypoints.tSpawn, waypoints.midEntry, waypoints.mid, waypoints.midTop, waypoints.aShortEntry, waypoints.aShort, waypoints.aSiteEntry, waypoints.aSite],
      [waypoints.tSpawn, waypoints.tRamp, waypoints.tRampTop, waypoints.palace, waypoints.palaceMid, waypoints.palaceTop, waypoints.palaceExit, waypoints.aSite],
      [waypoints.tSpawn, waypoints.midEntry, waypoints.mid, waypoints.connector, waypoints.connectorToA, waypoints.aShort, waypoints.aSite],
    ];
    const routesToB = [
      [waypoints.tSpawn, waypoints.tSpawnLeft, waypoints.tAptsEntry, waypoints.tAptsInside, waypoints.bAppsCorridor, waypoints.bAppsExit, waypoints.bSiteEntry, waypoints.bSite],
      [waypoints.tSpawn, waypoints.midEntry, waypoints.mid, waypoints.underpassEntry, waypoints.underpass, waypoints.underpassExit, waypoints.bSiteEntry, waypoints.bSite],
    ];

    // Routes from CT spawn to bomb sites
    const ctRoutesToA = [
      [waypoints.ctSpawn, waypoints.ctToA, waypoints.aSiteEntry, waypoints.aSite],
      [waypoints.ctSpawn, waypoints.ctSpawnLeft, waypoints.connector, waypoints.connectorToA, waypoints.aShort, waypoints.aSiteEntry, waypoints.aSite],
    ];
    const ctRoutesToB = [
      [waypoints.ctSpawn, waypoints.ctToB, waypoints.marketEntry, waypoints.market, waypoints.marketExit, waypoints.bSiteEntry, waypoints.bSite],
      [waypoints.ctSpawn, waypoints.ctSpawnLeft, waypoints.connector, waypoints.underpassEntry, waypoints.underpass, waypoints.underpassExit, waypoints.bSiteEntry, waypoints.bSite],
    ];

    // Assign routes to bots
    const botRoutes: Map<string, THREE.Vector3[]> = new Map();
    const botRouteIndex: Map<string, number> = new Map();
    const botStuckTime: Map<string, number> = new Map();
    const botLastPos: Map<string, THREE.Vector3> = new Map();

    // Initialize routes when game starts
    const initializeBotRoutes = () => {
      // Pick a new random target site for each round
      targetSite = Math.random() > 0.5 ? bombSiteA : bombSiteB;
      
      botsRef.current.forEach((bot, i) => {
        if (bot.team === 'T') {
          // Assign T bots to routes
          if (targetSite === bombSiteA) {
            botRoutes.set(bot.id, [...routesToA[i % routesToA.length]]);
          } else {
            botRoutes.set(bot.id, [...routesToB[i % routesToB.length]]);
          }
        } else {
          // CT bots patrol between sites
          if (i % 2 === 0) {
            botRoutes.set(bot.id, [...ctRoutesToA[i % ctRoutesToA.length]]);
          } else {
            botRoutes.set(bot.id, [...ctRoutesToB[i % ctRoutesToB.length]]);
          }
        }
        botRouteIndex.set(bot.id, 0);
        botStuckTime.set(bot.id, 0);
        botLastPos.set(bot.id, bot.capsule.start.clone());
      });
    };

    // Store the function in ref so nextRound can call it
    initRoutesRef.current = initializeBotRoutes;

    // Call after bots are initialized
    setTimeout(initializeBotRoutes, 100);

    // Check line of sight between two positions using proper raycasting
    const checkLineOfSight = (from: THREE.Vector3, to: THREE.Vector3): boolean => {
      const direction = to.clone().sub(from).normalize();
      const distance = from.distanceTo(to);
      
      raycaster.set(from, direction);
      raycaster.far = distance;
      
      const intersects = raycaster.intersectObjects(wallMeshes, false);
      
      // If any wall is between us and target, no LOS
      if (intersects.length > 0 && intersects[0].distance < distance - 0.5) {
        return false;
      }
      return true;
    };
    
    // Check if a position is walkable (not inside a wall)
    const isWalkable = (pos: THREE.Vector3): boolean => {
      const testCapsule = new Capsule(
        new THREE.Vector3(pos.x, 0.5, pos.z),
        new THREE.Vector3(pos.x, 4, pos.z),
        0.8 // Check with slightly larger radius for safety margin
      );
      return !worldOctree.capsuleIntersect(testCapsule);
    };
    
    // Find a clear path around obstacles - improved pathfinding
    const findClearDirection = (from: THREE.Vector3, to: THREE.Vector3, bot: Bot): THREE.Vector3 | null => {
      const directDir = to.clone().sub(from).normalize();
      
      // Check multiple distances - start close, then farther
      const testDistances = [1, 1.5, 2, 3];
      
      for (const testDist of testDistances) {
        // First, try direct path
        const testPos = from.clone().add(directDir.clone().multiplyScalar(testDist));
        if (isWalkable(testPos)) {
          return directDir;
        }
      }
      
      // Direct path blocked - try various angles with multiple distances
      const angles = [15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90, 120, -120, 150, -150, 180];
      
      for (const testDist of [1.5, 2, 3]) {
        for (const angleDeg of angles) {
          const angle = (angleDeg * Math.PI) / 180;
          const rotatedDir = new THREE.Vector3(
            directDir.x * Math.cos(angle) - directDir.z * Math.sin(angle),
            0,
            directDir.x * Math.sin(angle) + directDir.z * Math.cos(angle)
          );
          const testPosRot = from.clone().add(rotatedDir.multiplyScalar(testDist));
          if (isWalkable(testPosRot)) {
            return rotatedDir.normalize();
          }
        }
      }
      
      return null; // Completely stuck
    };

    // Create bullet tracer
    const createBulletTracer = (from: THREE.Vector3, to: THREE.Vector3) => {
      const direction = to.clone().sub(from);
      const length = direction.length();
      
      const bulletGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6);
      const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      const bullet = new THREE.Mesh(bulletGeo, bulletMat);
      
      // Position at start
      bullet.position.copy(from);
      bullet.position.y = 1;
      
      // Rotate to face target
      bullet.lookAt(to.clone().setY(1));
      bullet.rotateX(Math.PI / 2);
      
      scene.add(bullet);
      
      bullets.push({
        mesh: bullet,
        startPos: from.clone().setY(1),
        endPos: to.clone().setY(1),
        progress: 0,
        speed: 200 // units per second
      });
    };

    // Update bullets
    const updateBullets = (deltaTime: number) => {
      for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.progress += deltaTime * bullet.speed / bullet.startPos.distanceTo(bullet.endPos);
        
        if (bullet.progress >= 1) {
          scene.remove(bullet.mesh);
          bullet.mesh.geometry.dispose();
          (bullet.mesh.material as THREE.Material).dispose();
          bullets.splice(i, 1);
        } else {
          bullet.mesh.position.lerpVectors(bullet.startPos, bullet.endPos, bullet.progress);
        }
      }
    };

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

        // Check if stuck
        const lastPos = botLastPos.get(bot.id);
        if (lastPos) {
          const moved = botPos.distanceTo(lastPos);
          if (moved < 0.1) {
            const stuckTime = (botStuckTime.get(bot.id) || 0) + deltaTime;
            botStuckTime.set(bot.id, stuckTime);
            
            // If stuck for more than 0.8 seconds, try to find alternate path
            if (stuckTime > 0.8) {
              // Try to skip to next waypoint in route, or find a walkable nearby position
              const route = botRoutes.get(bot.id) || [];
              const currentIdx = botRouteIndex.get(bot.id) || 0;
              
              // Skip to next waypoint if available
              if (currentIdx + 1 < route.length) {
                botRouteIndex.set(bot.id, currentIdx + 1);
              }
              
              // Also try a perpendicular direction to escape wall
              const toTarget = bot.targetPosition?.clone().sub(botPos).normalize() || new THREE.Vector3(1, 0, 0);
              const perpendicular = new THREE.Vector3(-toTarget.z, 0, toTarget.x);
              const escapeDir = Math.random() > 0.5 ? perpendicular : perpendicular.negate();
              
              // Find a walkable escape position
              for (let dist = 2; dist <= 6; dist += 2) {
                const escapePos = botPos.clone().add(escapeDir.clone().multiplyScalar(dist));
                if (isWalkable(escapePos)) {
                  bot.targetPosition = escapePos;
                  break;
                }
              }
              
              botStuckTime.set(bot.id, 0);
            }
          } else {
            botStuckTime.set(bot.id, 0);
          }
        }
        botLastPos.set(bot.id, botPos.clone());

        // Get current route and waypoint
        const route = botRoutes.get(bot.id) || [];
        let routeIdx = botRouteIndex.get(bot.id) || 0;

        // T bot behavior
        if (bot.team === 'T') {
          if (bombPlantedRef.current) {
            // Defend planted bomb
            if (plantedPositionRef.current) {
              const distToPlant = botPos.distanceTo(plantedPositionRef.current);
              if (distToPlant > 8) {
                bot.targetPosition = plantedPositionRef.current.clone();
              } else {
                // Stay near bomb and watch for CTs
                const nearestCT = aliveCTBots.reduce((nearest, ctBot) => {
                  const dist = botPos.distanceTo(ctBot.capsule.start);
                  return !nearest || dist < botPos.distanceTo(nearest.capsule.start) ? ctBot : nearest;
                }, null as Bot | null);
                if (nearestCT) {
                  bot.targetPosition = nearestCT.capsule.start.clone();
                } else {
                  bot.targetPosition = null;
                }
              }
            }
          } else if (bot.hasBomb) {
            // Bomb carrier follows waypoint route to site
            if (routeIdx < route.length) {
              const currentWaypoint = route[routeIdx];
              const distToWaypoint = botPos.distanceTo(currentWaypoint);
              
              if (distToWaypoint < 4) {
                // Reached waypoint, move to next
                botRouteIndex.set(bot.id, routeIdx + 1);
              }
              bot.targetPosition = currentWaypoint.clone();
            } else {
              // At site - plant
              const distToSite = botPos.distanceTo(targetSite);
              if (distToSite < 6) {
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
              }
            }
          } else {
            // Non-bomb carrier follows similar route
            if (routeIdx < route.length) {
              const currentWaypoint = route[routeIdx];
              const distToWaypoint = botPos.distanceTo(currentWaypoint);
              
              if (distToWaypoint < 4) {
                botRouteIndex.set(bot.id, routeIdx + 1);
              }
              bot.targetPosition = currentWaypoint.clone();
            } else {
              // At site, engage enemies
              const nearestCT = aliveCTBots.reduce((nearest, ctBot) => {
                const dist = botPos.distanceTo(ctBot.capsule.start);
                return !nearest || dist < botPos.distanceTo(nearest.capsule.start) ? ctBot : nearest;
              }, null as Bot | null);
              if (nearestCT) {
                bot.targetPosition = nearestCT.capsule.start.clone();
              }
            }
          }
        }

        // CT bot behavior
        if (bot.team === 'CT') {
          // Check for enemies with line of sight
          const nearestVisibleT = aliveTBots.reduce((nearest, tBot) => {
            const dist = botPos.distanceTo(tBot.capsule.start);
            const hasLOS = checkLineOfSight(
              botPos.clone().setY(1),
              tBot.capsule.start.clone().setY(1)
            );
            if (!hasLOS) return nearest; // Can't see this T
            return !nearest || dist < botPos.distanceTo(nearest.capsule.start) ? tBot : nearest;
          }, null as Bot | null);

          if (bombPlantedRef.current && plantedPositionRef.current) {
            // Rush to defuse - follow route toward bomb
            // Find closest waypoint near planted bomb
            const distToPlant = botPos.distanceTo(plantedPositionRef.current);
            if (distToPlant < 8) {
              // Close enough, go direct
              bot.targetPosition = plantedPositionRef.current.clone();
            } else {
              // Follow route waypoints
              if (routeIdx < route.length) {
                const currentWaypoint = route[routeIdx];
                const distToWaypoint = botPos.distanceTo(currentWaypoint);
                if (distToWaypoint < 3) {
                  botRouteIndex.set(bot.id, routeIdx + 1);
                }
                bot.targetPosition = currentWaypoint.clone();
              } else {
                bot.targetPosition = plantedPositionRef.current.clone();
              }
            }
          } else if (nearestVisibleT) {
            // Can see a T - engage directly
            bot.targetPosition = nearestVisibleT.capsule.start.clone();
          } else {
            // Can't see any T, follow patrol route
            if (routeIdx < route.length) {
              const currentWaypoint = route[routeIdx];
              const distToWaypoint = botPos.distanceTo(currentWaypoint);
              if (distToWaypoint < 3) {
                botRouteIndex.set(bot.id, routeIdx + 1);
              }
              bot.targetPosition = currentWaypoint.clone();
            } else {
              // End of route, pick a new random site to patrol
              if (!bot.targetPosition || botPos.distanceTo(bot.targetPosition) < 5) {
                bot.targetPosition = Math.random() > 0.5 ? bombSiteA.clone() : bombSiteB.clone();
              }
            }
          }
        }

        // Movement with smart obstacle avoidance
        if (bot.targetPosition && !bot.isPlanting) {
          const speed = 12; // Fast movement
          
          // Get a clear direction toward target, avoiding walls
          let moveDir = findClearDirection(botPos.clone().setY(2), bot.targetPosition.clone().setY(2), bot);
          
          // If no clear direction found, try moving directly anyway (will slide on walls)
          if (!moveDir) {
            moveDir = bot.targetPosition.clone().sub(botPos).normalize();
            moveDir.y = 0;
          }
          
          if (moveDir && moveDir.length() > 0.01) {
            bot.facingDirection.copy(moveDir);
            
            // Calculate new position
            const newX = bot.capsule.start.x + moveDir.x * speed * deltaTime;
            const newZ = bot.capsule.start.z + moveDir.z * speed * deltaTime;
            
            // Create test capsule at new position (sized for model)
            const testCapsule = new Capsule(
              new THREE.Vector3(newX, 0.5, newZ),
              new THREE.Vector3(newX, 4.5, newZ),
              0.6
            );
            
            // Check collision with world
            const result = worldOctree.capsuleIntersect(testCapsule);
            
            if (!result) {
              // No collision - move freely
              bot.capsule.start.x = newX;
              bot.capsule.start.z = newZ;
              bot.capsule.end.x = newX;
              bot.capsule.end.z = newZ;
            } else {
              // Collision - use the collision normal to slide along wall
              const normal = result.normal;
              
              // Project velocity onto the wall plane (slide)
              const slideDir = new THREE.Vector3(moveDir.x, 0, moveDir.z);
              slideDir.addScaledVector(normal, -slideDir.dot(normal));
              slideDir.normalize();
              
              if (slideDir.length() > 0.1) {
                const slideX = bot.capsule.start.x + slideDir.x * speed * deltaTime * 0.7;
                const slideZ = bot.capsule.start.z + slideDir.z * speed * deltaTime * 0.7;
                
                const testSlide = new Capsule(
                  new THREE.Vector3(slideX, 0.5, slideZ),
                  new THREE.Vector3(slideX, 4.5, slideZ),
                  0.6
                );
                
                if (!worldOctree.capsuleIntersect(testSlide)) {
                  bot.capsule.start.x = slideX;
                  bot.capsule.start.z = slideZ;
                  bot.capsule.end.x = slideX;
                  bot.capsule.end.z = slideZ;
                }
              }
            }
          }
        }

        // Combat - shoot at enemies with line of sight check
        const enemies = bot.team === 'T' ? aliveCTBots : aliveTBots;
        const now = Date.now();
        
        enemies.forEach(enemy => {
          const distToEnemy = bot.capsule.start.distanceTo(enemy.capsule.start);
          if (distToEnemy < 40 && now - bot.lastShotTime > 400) {
            // Check line of sight before shooting
            const botShootPos = bot.capsule.start.clone();
            botShootPos.y = 1;
            const enemyPos = enemy.capsule.start.clone();
            enemyPos.y = 1;
            
            const hasLOS = checkLineOfSight(botShootPos, enemyPos);
            
            if (hasLOS) {
              // Create bullet tracer
              createBulletTracer(botShootPos, enemyPos);
              
              // Calculate hit chance based on distance
              const hitChance = Math.max(0.15, 1 - distToEnemy / 50);
              if (Math.random() < hitChance * 0.4) {
                enemy.health -= 20 + Math.floor(Math.random() * 15);
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
      updateBullets(deltaTime);

      // Update camera position - centered on action area
      camera.position.x = Math.sin(cameraAngle) * cameraDistance + 10;
      camera.position.z = Math.cos(cameraAngle) * cameraDistance - 25;
      camera.position.y = cameraHeight;
      camera.lookAt(10, 0, -25);

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
        const winAmount = currentBet * 2;
        setBalance(balance + winAmount);
        recordWin(currentBet); // Record profit only
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

    // Reset bots to correct Mirage spawn positions
    botsRef.current.forEach((bot, i) => {
      bot.health = 100;
      bot.isAlive = true;
      bot.mesh.visible = true;
      bot.isPlanting = false;
      bot.plantProgress = 0;
      bot.hasBomb = bot.team === 'T' && i === 0;
      bot.targetPosition = null;
      
      if (bot.team === 'T') {
        const xOffset = (i % 5 - 2) * 3;
        bot.capsule.start.set(xOffset, 0.35, -70);
        bot.capsule.end.set(xOffset, 1.7, -70);
        bot.mesh.position.set(xOffset, 0, -70);
      } else {
        const xOffset = ((i - 5) - 2) * 3 + 25;
        bot.capsule.start.set(xOffset, 0.35, 15);
        bot.capsule.end.set(xOffset, 1.7, 15);
        bot.mesh.position.set(xOffset, 0, 15);
      }
    });

    // Reinitialize routes for new round
    if (initRoutesRef.current) {
      setTimeout(() => initRoutesRef.current?.(), 100);
    }
  };

  // Pre-game lobby
  if (!gameStarted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-black/60 backdrop-blur-xl rounded-3xl p-8 border border-white/20">
          <button
            onClick={() => router.push('/casino')}
            className="mb-6 text-white/60 hover:text-white transition-colors"
          >
            ← Back to Casino
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
              Casino Balance: ${balance.toLocaleString()}
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
        onClick={() => router.push('/casino')}
        className="absolute bottom-4 right-4 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 text-white transition-all"
      >
        Exit to Casino
      </button>
    </div>
  );
}
