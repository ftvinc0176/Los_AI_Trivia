'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

type WeaponType = 'awp' | 'm4' | 'ak47';
type TeamType = 'T' | 'CT';

export default function FPSArena() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [playerName, setPlayerName] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<TeamType>('T');
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponType>('awp');
  const [gameStarted, setGameStarted] = useState(false);
  const [showWeaponMenu, setShowWeaponMenu] = useState(false);
  const [health, setHealth] = useState(100);
  const [kills, setKills] = useState(0);
  const [deaths, setDeaths] = useState(0);
  const [currentAmmo, setCurrentAmmo] = useState(1);
  const [isReloading, setIsReloading] = useState(false);
  const [roundTime, setRoundTime] = useState(115); // CS round time (1:55)
  const [bombPlanted, setBombPlanted] = useState(false);
  const [bombTimer, setBombTimer] = useState(40); // 40 seconds to defuse
  const [roundPhase, setRoundPhase] = useState<'buy' | 'active' | 'end'>('buy');
  const [hasBomb, setHasBomb] = useState(false);
  const [isPlanting, setIsPlanting] = useState(false);
  const [isDefusing, setIsDefusing] = useState(false);
  const [defuseTimer, setDefuseTimer] = useState(5);
  const [tScore, setTScore] = useState(0);
  const [ctScore, setCtScore] = useState(0);
  const [waitingForPlayers, setWaitingForPlayers] = useState(true);
  const [countdown, setCountdown] = useState(5);
  const [atBombSite, setAtBombSite] = useState<'A' | 'B' | null>(null);
  const [bombPosition, setBombPosition] = useState<{x: number, y: number, z: number} | null>(null);
  const [teamCounts, setTeamCounts] = useState({T: 0, CT: 0});
  const [roundWinner, setRoundWinner] = useState<'T' | 'CT' | null>(null);
  const [plantedSite, setPlantedSite] = useState<'A' | 'B' | null>(null);
  const [isDead, setIsDead] = useState(false);
  
  const ammoRef = useRef(1);
  const isReloadingRef = useRef(false);
  const isShootingRef = useRef(false); // For full auto
  const lastShotTimeRef = useRef(0); // Rate of fire control
  const countdownRef = useRef(5);
  const roundPhaseRef = useRef<'buy' | 'active' | 'end'>('buy');
  const hasBombRef = useRef(false);
  const atBombSiteRef = useRef<'A' | 'B' | null>(null);
  const bombPositionRef = useRef<{x: number, y: number, z: number} | null>(null);
  const bombPlantedRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const playerCapsuleRef = useRef<Capsule | null>(null);
  const defuseIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isDefusingRef = useRef(false);
  const bombGroupRef = useRef<THREE.Group | null>(null);
  const plantTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isPlantingRef = useRef(false);
  const plantStartPosRef = useRef<{x: number, z: number} | null>(null);

  // Weapon configs
  const weaponConfig = {
    awp: { maxAmmo: 1, damage: 100, reloadTime: 2000, fireRate: 1000, auto: false },
    m4: { maxAmmo: 30, damage: 20, reloadTime: 1000, fireRate: 100, auto: true },
    ak47: { maxAmmo: 30, damage: 20, reloadTime: 1000, fireRate: 100, auto: true },
  };

  // Helper function to respawn player at team spawn
  const respawnPlayer = () => {
    const spawnPos = selectedTeam === 'T' 
      ? { x: 0, y: 0.35, z: -70 } 
      : { x: 25, y: 0.35, z: 20 };
    
    // Reset player position via capsule and camera refs
    if (playerCapsuleRef.current) {
      playerCapsuleRef.current.start.set(spawnPos.x, spawnPos.y, spawnPos.z);
      playerCapsuleRef.current.end.set(spawnPos.x, 1.8, spawnPos.z);
    }
    if (cameraRef.current) {
      cameraRef.current.position.set(spawnPos.x, 1.8, spawnPos.z);
    }
    
    // Reset game state
    setHealth(100);
    setIsDead(false);
    setRoundPhase('buy');
    roundPhaseRef.current = 'buy';
    setRoundTime(115);
    setRoundWinner(null);
    setCountdown(5);
    countdownRef.current = 5;
    setWaitingForPlayers(false);
    setBombPlanted(false);
    bombPlantedRef.current = false;
    setBombPosition(null);
    bombPositionRef.current = null;
    setPlantedSite(null);
    setBombTimer(40);
    setIsPlanting(false);
    isPlantingRef.current = false;
    setIsDefusing(false);
    isDefusingRef.current = false;
    setDefuseTimer(5);
    if (defuseIntervalRef.current) {
      clearInterval(defuseIntervalRef.current);
      defuseIntervalRef.current = null;
    }
    if (plantTimeoutRef.current) {
      clearTimeout(plantTimeoutRef.current);
      plantTimeoutRef.current = null;
    }
    // Hide bomb model on round reset
    if (bombGroupRef.current) {
      bombGroupRef.current.visible = false;
    }
    
    // Reset bomb for Terrorists
    if (selectedTeam === 'T') {
      setHasBomb(true);
      hasBombRef.current = true;
    }
    
    // Notify server to reset health for all players
    if (socketRef.current) {
      socketRef.current.emit('fpsRoundReset');
    }
  };

  // Sync ammo when weapon changes
  useEffect(() => {
    if (gameStarted) {
      const maxAmmo = weaponConfig[selectedWeapon].maxAmmo;
      ammoRef.current = maxAmmo;
      setCurrentAmmo(maxAmmo);
      isReloadingRef.current = false;
      setIsReloading(false);
    }
  }, [selectedWeapon, gameStarted]);

  // Helper function to create weapon model
  const createWeaponModel = (weaponType: WeaponType) => {
    const weaponGroup = new THREE.Group();
    
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.8, roughness: 0.3 });
    const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.9, roughness: 0.2 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.8 });
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x2d4a3e, metalness: 0.6, roughness: 0.4 });
    
    if (weaponType === 'awp') {
      // AWP Sniper Rifle - Long barrel with scope
      // Main barrel (long and thin)
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.025, 0.9, 8),
        darkMetalMat
      );
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = 0.45;
      weaponGroup.add(barrel);
      
      // Receiver body
      const receiver = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.12, 0.4),
        greenMat
      );
      receiver.position.z = -0.1;
      weaponGroup.add(receiver);
      
      // Scope mount
      const scopeMount = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.04, 0.15),
        metalMat
      );
      scopeMount.position.set(0, 0.08, 0);
      weaponGroup.add(scopeMount);
      
      // Scope body
      const scope = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.25, 12),
        darkMetalMat
      );
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.12, 0);
      weaponGroup.add(scope);
      
      // Scope lens front
      const lensFront = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.035, 0.02, 12),
        new THREE.MeshStandardMaterial({ color: 0x4444ff, metalness: 0.9, roughness: 0.1 })
      );
      lensFront.rotation.x = Math.PI / 2;
      lensFront.position.set(0, 0.12, 0.13);
      weaponGroup.add(lensFront);
      
      // Stock
      const stock = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.14, 0.25),
        greenMat
      );
      stock.position.z = -0.35;
      weaponGroup.add(stock);
      
      // Trigger guard
      const triggerGuard = new THREE.Mesh(
        new THREE.TorusGeometry(0.03, 0.008, 8, 12, Math.PI),
        metalMat
      );
      triggerGuard.rotation.x = Math.PI / 2;
      triggerGuard.position.set(0, -0.07, -0.15);
      weaponGroup.add(triggerGuard);
      
      // Magazine
      const mag = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.12, 0.08),
        darkMetalMat
      );
      mag.position.set(0, -0.1, -0.08);
      weaponGroup.add(mag);
      
    } else if (weaponType === 'm4') {
      // M4A4 Rifle - Modern tactical look
      // Barrel with flash hider
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.5, 8),
        darkMetalMat
      );
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = 0.35;
      weaponGroup.add(barrel);
      
      // Flash hider
      const flashHider = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.02, 0.06, 8),
        metalMat
      );
      flashHider.rotation.x = Math.PI / 2;
      flashHider.position.z = 0.62;
      weaponGroup.add(flashHider);
      
      // Handguard (quad rail)
      const handguard = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, 0.22),
        metalMat
      );
      handguard.position.z = 0.18;
      weaponGroup.add(handguard);
      
      // Upper receiver
      const upperReceiver = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.07, 0.18),
        darkMetalMat
      );
      upperReceiver.position.z = -0.02;
      weaponGroup.add(upperReceiver);
      
      // Carry handle / sight rail
      const sightRail = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.025, 0.12),
        metalMat
      );
      sightRail.position.set(0, 0.048, 0);
      weaponGroup.add(sightRail);
      
      // Lower receiver
      const lowerReceiver = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.08, 0.12),
        darkMetalMat
      );
      lowerReceiver.position.set(0, -0.04, -0.08);
      weaponGroup.add(lowerReceiver);
      
      // Pistol grip
      const grip = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.1, 0.045),
        darkMetalMat
      );
      grip.position.set(0, -0.1, -0.12);
      grip.rotation.x = 0.3;
      weaponGroup.add(grip);
      
      // Stock (collapsible)
      const stockTube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.18, 8),
        metalMat
      );
      stockTube.rotation.x = Math.PI / 2;
      stockTube.position.z = -0.22;
      weaponGroup.add(stockTube);
      
      const stockPad = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.08, 0.03),
        darkMetalMat
      );
      stockPad.position.z = -0.32;
      weaponGroup.add(stockPad);
      
      // Magazine (curved)
      const mag = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.14, 0.05),
        darkMetalMat
      );
      mag.position.set(0, -0.12, -0.05);
      mag.rotation.x = 0.1;
      weaponGroup.add(mag);
      
    } else if (weaponType === 'ak47') {
      // AK-47 - Iconic curved magazine, wood furniture
      // Barrel
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.45, 8),
        darkMetalMat
      );
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = 0.35;
      weaponGroup.add(barrel);
      
      // Front sight block
      const frontSight = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.06, 0.04),
        darkMetalMat
      );
      frontSight.position.set(0, 0.02, 0.5);
      weaponGroup.add(frontSight);
      
      // Gas tube
      const gasTube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.25, 8),
        darkMetalMat
      );
      gasTube.rotation.x = Math.PI / 2;
      gasTube.position.set(0, 0.03, 0.2);
      weaponGroup.add(gasTube);
      
      // Wooden handguard (lower)
      const handguardLower = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.04, 0.2),
        woodMat
      );
      handguardLower.position.set(0, -0.02, 0.15);
      weaponGroup.add(handguardLower);
      
      // Receiver (stamped steel look)
      const receiver = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.08, 0.22),
        darkMetalMat
      );
      receiver.position.z = -0.02;
      weaponGroup.add(receiver);
      
      // Rear sight
      const rearSight = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.03, 0.02),
        darkMetalMat
      );
      rearSight.position.set(0, 0.055, 0.02);
      weaponGroup.add(rearSight);
      
      // Dust cover
      const dustCover = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.02, 0.12),
        metalMat
      );
      dustCover.position.set(0, 0.04, -0.04);
      weaponGroup.add(dustCover);
      
      // Pistol grip
      const grip = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.1, 0.05),
        woodMat
      );
      grip.position.set(0, -0.1, -0.1);
      grip.rotation.x = 0.25;
      weaponGroup.add(grip);
      
      // Wooden stock
      const stock = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.07, 0.28),
        woodMat
      );
      stock.position.z = -0.28;
      stock.position.y = -0.01;
      weaponGroup.add(stock);
      
      // Stock buttpad
      const buttpad = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.08, 0.02),
        darkMetalMat
      );
      buttpad.position.z = -0.43;
      weaponGroup.add(buttpad);
      
      // Curved magazine (iconic AK look)
      const mag = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.16, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 })
      );
      mag.position.set(0, -0.14, -0.03);
      mag.rotation.x = 0.2;
      weaponGroup.add(mag);
    }
    
    return weaponGroup;
  };

  // Helper function to create soldier model with weapon
  const createSoldierModel = (weaponType: WeaponType = 'awp') => {
    const soldier = new THREE.Group();

    // Body (torso)
    const bodyGeometry = new THREE.BoxGeometry(0.5, 0.8, 0.3);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x2a5a2a }); // Military green
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.9;
    body.castShadow = true;
    soldier.add(body);

    // Head
    const headGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffdbac }); // Skin tone
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.5;
    head.castShadow = true;
    soldier.add(head);

    // Helmet
    const helmetGeometry = new THREE.BoxGeometry(0.32, 0.2, 0.32);
    const helmetMaterial = new THREE.MeshStandardMaterial({ color: 0x1a3a1a }); // Dark green
    const helmet = new THREE.Mesh(helmetGeometry, helmetMaterial);
    helmet.position.y = 1.65;
    helmet.castShadow = true;
    soldier.add(helmet);

    // Arms
    const armGeometry = new THREE.BoxGeometry(0.15, 0.6, 0.15);
    const armMaterial = new THREE.MeshStandardMaterial({ color: 0x2a5a2a });
    
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
    const legMaterial = new THREE.MeshStandardMaterial({ color: 0x3a4a3a }); // Dark pants
    
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.12, 0.3, 0);
    leftLeg.castShadow = true;
    soldier.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.12, 0.3, 0);
    rightLeg.castShadow = true;
    soldier.add(rightLeg);

    // Add weapon based on type
    const weaponGroup = createWeaponModel(weaponType);
    weaponGroup.position.set(0.3, 0.85, 0.25);
    weaponGroup.rotation.x = Math.PI / 6;
    weaponGroup.castShadow = true;
    soldier.add(weaponGroup);

    return soldier;
  };

  // Helper function to create nameplate
  const createNameplate = (name: string, health: number) => {
    const nameplateDiv = document.createElement('div');
    nameplateDiv.className = 'nameplate';
    nameplateDiv.style.cssText = `
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      font-weight: bold;
      text-align: center;
      pointer-events: none;
      white-space: nowrap;
    `;
    
    const nameSpan = document.createElement('div');
    nameSpan.textContent = name;
    nameSpan.style.marginBottom = '2px';
    nameplateDiv.appendChild(nameSpan);
    
    const healthBar = document.createElement('div');
    healthBar.style.cssText = `
      width: 60px;
      height: 6px;
      background: rgba(255, 255, 255, 0.3);
      border-radius: 3px;
      overflow: hidden;
    `;
    
    const healthFill = document.createElement('div');
    healthFill.className = 'health-fill';
    healthFill.style.cssText = `
      width: ${health}%;
      height: 100%;
      background: ${health > 50 ? '#4ade80' : health > 25 ? '#fbbf24' : '#ef4444'};
      transition: width 0.3s, background 0.3s;
    `;
    
    healthBar.appendChild(healthFill);
    nameplateDiv.appendChild(healthBar);
    
    return { div: nameplateDiv, healthFill };
  };

  useEffect(() => {
    if (!gameStarted || !containerRef.current) return;

    // Scene setup - Mirage desert theme
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Bright blue sky like Mirage
    scene.fog = new THREE.Fog(0xc9b896, 150, 500); // Sandy haze

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.rotation.order = 'YXZ';

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);

    // CSS2D renderer for nameplates
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0';
    labelRenderer.domElement.style.pointerEvents = 'none';
    containerRef.current.appendChild(labelRenderer.domElement);

    // Lighting - warm sun like Mirage
    const ambientLight = new THREE.AmbientLight(0xffeedd, 0.4);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffaf0, 1.0);
    sunLight.position.set(50, 80, 30);
    sunLight.castShadow = true;
    sunLight.shadow.camera.near = 0.1;
    sunLight.shadow.camera.far = 500;
    sunLight.shadow.camera.right = 150;
    sunLight.shadow.camera.left = -150;
    sunLight.shadow.camera.top = 150;
    sunLight.shadow.camera.bottom = -150;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.radius = 2;
    sunLight.shadow.bias = -0.0001;
    scene.add(sunLight);

    // Fill light from opposite side
    const fillLight = new THREE.DirectionalLight(0x8899bb, 0.3);
    fillLight.position.set(-30, 20, -30);
    scene.add(fillLight);

    // World octree for collision
    const worldOctree = new Octree();

    // === TEXTURE GENERATION ===
    // Create procedural brick texture
    const createBrickTexture = (baseColor: number, groutColor: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d')!;
      
      // Base grout color
      const grout = new THREE.Color(groutColor);
      ctx.fillStyle = `rgb(${grout.r*255},${grout.g*255},${grout.b*255})`;
      ctx.fillRect(0, 0, 256, 256);
      
      // Draw bricks
      const brickW = 60, brickH = 28, groutW = 4;
      const base = new THREE.Color(baseColor);
      
      for (let row = 0; row < 10; row++) {
        const offset = (row % 2) * (brickW / 2);
        for (let col = -1; col < 6; col++) {
          // Vary brick color slightly
          const variation = 0.9 + Math.random() * 0.2;
          ctx.fillStyle = `rgb(${base.r*255*variation},${base.g*255*variation},${base.b*255*variation})`;
          ctx.fillRect(offset + col * (brickW + groutW), row * (brickH + groutW), brickW, brickH);
        }
      }
      
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      return texture;
    };

    // Create stone/tile texture
    const createStoneTexture = (baseColor: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d')!;
      
      const base = new THREE.Color(baseColor);
      ctx.fillStyle = `rgb(${base.r*255},${base.g*255},${base.b*255})`;
      ctx.fillRect(0, 0, 256, 256);
      
      // Add stone pattern
      const tileSize = 64;
      for (let x = 0; x < 4; x++) {
        for (let y = 0; y < 4; y++) {
          const variation = 0.85 + Math.random() * 0.3;
          ctx.fillStyle = `rgb(${base.r*255*variation},${base.g*255*variation},${base.b*255*variation})`;
          ctx.fillRect(x * tileSize + 2, y * tileSize + 2, tileSize - 4, tileSize - 4);
          
          // Cracks
          ctx.strokeStyle = `rgba(0,0,0,0.1)`;
          ctx.beginPath();
          ctx.moveTo(x * tileSize + Math.random() * tileSize, y * tileSize);
          ctx.lineTo(x * tileSize + Math.random() * tileSize, y * tileSize + tileSize);
          ctx.stroke();
        }
      }
      
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      return texture;
    };

    // Create sandy ground texture
    const createSandTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d')!;
      
      // Base sand color
      ctx.fillStyle = '#d4b896';
      ctx.fillRect(0, 0, 512, 512);
      
      // Add noise/grain
      for (let i = 0; i < 8000; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const brightness = 0.7 + Math.random() * 0.6;
        ctx.fillStyle = `rgba(${180*brightness},${150*brightness},${110*brightness},0.5)`;
        ctx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
      }
      
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(20, 20);
      return texture;
    };

    // Create wood texture
    const createWoodTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d')!;
      
      ctx.fillStyle = '#6b4423';
      ctx.fillRect(0, 0, 256, 256);
      
      // Wood grain lines
      for (let i = 0; i < 40; i++) {
        const y = i * 6 + Math.random() * 4;
        ctx.strokeStyle = `rgba(${40 + Math.random()*30},${20 + Math.random()*20},${10},${0.3 + Math.random()*0.3})`;
        ctx.lineWidth = 1 + Math.random() * 2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x < 256; x += 20) {
          ctx.lineTo(x, y + Math.sin(x * 0.05) * 3);
        }
        ctx.stroke();
      }
      
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      return texture;
    };

    // Generate textures
    const brickTex = createBrickTexture(0xc9a86c, 0x8b7355);
    brickTex.repeat.set(4, 2);
    const stoneTex = createStoneTexture(0x9a8b7a);
    stoneTex.repeat.set(2, 2);
    const sandTex = createSandTexture();
    const woodTex = createWoodTexture();
    woodTex.repeat.set(1, 2);

    // === MATERIALS WITH TEXTURES ===
    const sandMat = new THREE.MeshStandardMaterial({ map: sandTex, roughness: 0.9 });
    const wallMat = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.8 });
    const darkWallMat = new THREE.MeshStandardMaterial({ 
      map: createBrickTexture(0x8b7355, 0x5a4a3a),
      roughness: 0.85 
    });
    const tileMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.7 });
    const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8 });
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.9 });
    const archMat = new THREE.MeshStandardMaterial({ color: 0xa08060, roughness: 0.7 });

    // Helper to add mesh with collision
    const addMesh = (mesh: THREE.Mesh) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      worldOctree.fromGraphNode(mesh);
    };

    // Wall height for indoor areas
    const wallH = 6;
    const wallThick = 1;

    // ===== CORRIDOR BUILDER =====
    // Creates a proper enclosed corridor with floor, walls, and ceiling
    const buildCorridor = (
      x1: number, z1: number, // Start point
      x2: number, z2: number, // End point  
      width: number,         // Corridor width
      hasRoof: boolean = true,
      mat: THREE.Material = wallMat
    ) => {
      const dx = x2 - x1;
      const dz = z2 - z1;
      const length = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dx, dz);
      const cx = (x1 + x2) / 2;
      const cz = (z1 + z2) / 2;

      // Floor
      const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.3, length), tileMat);
      floor.position.set(cx, 0.15, cz);
      floor.rotation.y = angle;
      addMesh(floor);

      // Left wall
      const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallH, length), mat);
      leftWall.position.set(
        cx + Math.cos(angle) * (width / 2 + wallThick / 2),
        wallH / 2,
        cz - Math.sin(angle) * (width / 2 + wallThick / 2)
      );
      leftWall.rotation.y = angle;
      addMesh(leftWall);

      // Right wall
      const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallH, length), mat);
      rightWall.position.set(
        cx - Math.cos(angle) * (width / 2 + wallThick / 2),
        wallH / 2,
        cz + Math.sin(angle) * (width / 2 + wallThick / 2)
      );
      rightWall.rotation.y = angle;
      addMesh(rightWall);

      // Ceiling
      if (hasRoof) {
        const ceiling = new THREE.Mesh(new THREE.BoxGeometry(width + wallThick * 2, 0.3, length), roofMat);
        ceiling.position.set(cx, wallH, cz);
        ceiling.rotation.y = angle;
        addMesh(ceiling);
      }
    };

    // ===== ROOM BUILDER =====
    // Creates an enclosed room with optional door openings
    const buildRoom = (
      x: number, z: number,  // Center position
      w: number, d: number,  // Width and depth
      doors: { side: 'n' | 's' | 'e' | 'w', pos: number, width: number }[] = [],
      hasRoof: boolean = true,
      mat: THREE.Material = wallMat
    ) => {
      // Floor
      const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), tileMat);
      floor.position.set(x, 0.15, z);
      addMesh(floor);

      // Build walls with door openings
      const buildWallWithDoor = (
        wx: number, wz: number, 
        wWidth: number, wDepth: number,
        doorPos: number, doorWidth: number
      ) => {
        if (doorWidth <= 0) {
          // No door, full wall
          const wall = new THREE.Mesh(new THREE.BoxGeometry(wWidth, wallH, wDepth), mat);
          wall.position.set(wx, wallH / 2, wz);
          addMesh(wall);
        } else {
          // Wall with door opening - create two segments
          const isHorizontal = wWidth > wDepth;
          const wallLen = isHorizontal ? wWidth : wDepth;
          const leftLen = doorPos - doorWidth / 2;
          const rightLen = wallLen - doorPos - doorWidth / 2;

          if (leftLen > 0.5) {
            const leftWall = new THREE.Mesh(
              new THREE.BoxGeometry(
                isHorizontal ? leftLen : wWidth,
                wallH,
                isHorizontal ? wDepth : leftLen
              ),
              mat
            );
            leftWall.position.set(
              isHorizontal ? wx - wallLen / 2 + leftLen / 2 : wx,
              wallH / 2,
              isHorizontal ? wz : wz - wallLen / 2 + leftLen / 2
            );
            addMesh(leftWall);
          }

          if (rightLen > 0.5) {
            const rightWall = new THREE.Mesh(
              new THREE.BoxGeometry(
                isHorizontal ? rightLen : wWidth,
                wallH,
                isHorizontal ? wDepth : rightLen
              ),
              mat
            );
            rightWall.position.set(
              isHorizontal ? wx + wallLen / 2 - rightLen / 2 : wx,
              wallH / 2,
              isHorizontal ? wz : wz + wallLen / 2 - rightLen / 2
            );
            addMesh(rightWall);
          }

          // Door frame top (lintel)
          const lintel = new THREE.Mesh(
            new THREE.BoxGeometry(
              isHorizontal ? doorWidth + 0.5 : wWidth,
              1.5,
              isHorizontal ? wDepth : doorWidth + 0.5
            ),
            archMat
          );
          lintel.position.set(
            isHorizontal ? wx - wallLen / 2 + doorPos : wx,
            wallH - 0.75,
            isHorizontal ? wz : wz - wallLen / 2 + doorPos
          );
          addMesh(lintel);
        }
      };

      // Process each wall
      doors.forEach(door => {
        const halfW = w / 2;
        const halfD = d / 2;
        
        switch (door.side) {
          case 'n': // North wall (positive Z)
            buildWallWithDoor(x, z + halfD + wallThick / 2, w + wallThick * 2, wallThick, halfW + door.pos, door.width);
            break;
          case 's': // South wall (negative Z)
            buildWallWithDoor(x, z - halfD - wallThick / 2, w + wallThick * 2, wallThick, halfW + door.pos, door.width);
            break;
          case 'e': // East wall (positive X)
            buildWallWithDoor(x + halfW + wallThick / 2, z, wallThick, d + wallThick * 2, halfD + door.pos, door.width);
            break;
          case 'w': // West wall (negative X)
            buildWallWithDoor(x - halfW - wallThick / 2, z, wallThick, d + wallThick * 2, halfD + door.pos, door.width);
            break;
        }
      });

      // Add solid walls for sides without doors
      const sides = ['n', 's', 'e', 'w'] as const;
      sides.forEach(side => {
        if (!doors.find(d => d.side === side)) {
          const halfW = w / 2;
          const halfD = d / 2;
          switch (side) {
            case 'n':
              const nWall = new THREE.Mesh(new THREE.BoxGeometry(w + wallThick * 2, wallH, wallThick), mat);
              nWall.position.set(x, wallH / 2, z + halfD + wallThick / 2);
              addMesh(nWall);
              break;
            case 's':
              const sWall = new THREE.Mesh(new THREE.BoxGeometry(w + wallThick * 2, wallH, wallThick), mat);
              sWall.position.set(x, wallH / 2, z - halfD - wallThick / 2);
              addMesh(sWall);
              break;
            case 'e':
              const eWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallH, d), mat);
              eWall.position.set(x + halfW + wallThick / 2, wallH / 2, z);
              addMesh(eWall);
              break;
            case 'w':
              const wWall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallH, d), mat);
              wWall.position.set(x - halfW - wallThick / 2, wallH / 2, z);
              addMesh(wWall);
              break;
          }
        }
      });

      // Ceiling
      if (hasRoof) {
        const ceiling = new THREE.Mesh(new THREE.BoxGeometry(w + wallThick * 2, 0.3, d + wallThick * 2), roofMat);
        ceiling.position.set(x, wallH, z);
        addMesh(ceiling);
      }
    };

    // === GROUND (visible in open areas) ===
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), sandMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    scene.add(ground);
    worldOctree.fromGraphNode(ground);

    // ============================================
    // MIRAGE MAP - PROPER ENCLOSED CORRIDORS
    // ============================================

    // === T SPAWN (bottom center) - FULLY OPEN ===
    // Just add floor, no walls so players can't get stuck
    const tSpawnFloor = new THREE.Mesh(new THREE.BoxGeometry(30, 0.5, 20), sandMat);
    tSpawnFloor.position.set(0, -0.25, -70);
    addMesh(tSpawnFloor);

    // === T APARTMENTS (T spawn to B) ===
    buildRoom(-20, -55, 10, 15, [
      { side: 's', pos: 0, width: 5 },   // From T spawn
      { side: 'n', pos: 0, width: 4 },   // To B apps corridor
    ]);

    // === B APARTMENTS CORRIDOR ===
    buildRoom(-30, -35, 12, 25, [
      { side: 's', pos: 0, width: 4 },   // From T apartments
      { side: 'n', pos: 0, width: 5 },   // To B site
      { side: 'e', pos: 5, width: 4 },   // To underpass
    ]);

    // === B SITE ===
    buildRoom(-40, -5, 25, 25, [
      { side: 's', pos: 5, width: 5 },   // From B apartments
      { side: 'e', pos: 0, width: 6 },   // From short/market
      { side: 'e', pos: -8, width: 4 },  // From underpass
    ], false); // Open roof

    // B site cover
    const bBox = new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 4), woodMat);
    bBox.position.set(-45, 1.25, 0);
    addMesh(bBox);
    const bBox2 = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), woodMat);
    bBox2.position.set(-35, 1, -8);
    addMesh(bBox2);

    // === UNDERPASS (connects B apps to mid and B) ===
    buildRoom(-18, -25, 10, 20, [
      { side: 'w', pos: 5, width: 4 },   // From B apartments
      { side: 'n', pos: 0, width: 4 },   // To B site
      { side: 'e', pos: -5, width: 4 },  // To mid
    ]);

    // === MID ===
    buildRoom(0, -35, 15, 40, [
      { side: 's', pos: 0, width: 5 },   // From T spawn
      { side: 'n', pos: 0, width: 6 },   // To connector
      { side: 'w', pos: 5, width: 4 },   // To underpass
      { side: 'e', pos: -10, width: 4 }, // To window room
      { side: 'e', pos: 10, width: 4 },  // To A short
    ], false); // Open roof (for sniping)

    // Mid boxes
    const midBox = new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 4), woodMat);
    midBox.position.set(-3, 1.25, -35);
    addMesh(midBox);
    const midBox2 = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), woodMat);
    midBox2.position.set(4, 1, -45);
    addMesh(midBox2);

    // === WINDOW ROOM ===
    buildRoom(20, -45, 12, 12, [
      { side: 'w', pos: 0, width: 4 },   // From mid
      { side: 'e', pos: 0, width: 4 },   // To top mid/cat
    ]);

    // === A SHORT (mid to A) ===
    buildRoom(20, -20, 12, 15, [
      { side: 'w', pos: 0, width: 4 },   // From mid
      { side: 'e', pos: 0, width: 5 },   // To A site
    ]);

    // === CONNECTOR (mid to CT) ===
    buildRoom(0, -5, 15, 20, [
      { side: 's', pos: 0, width: 6 },   // From mid
      { side: 'n', pos: 0, width: 6 },   // To CT spawn
    ]);

    // === T RAMP (T spawn to A) ===
    buildRoom(20, -60, 10, 20, [
      { side: 's', pos: 0, width: 4 },   // From T spawn area
      { side: 'n', pos: 0, width: 4 },   // To palace
    ]);

    // === PALACE ===
    buildRoom(35, -45, 15, 15, [
      { side: 's', pos: 0, width: 4 },   // From T ramp
      { side: 'e', pos: 0, width: 5 },   // To A site
      { side: 'n', pos: 3, width: 4 },   // To palace top
    ]);

    // Palace inner room
    buildRoom(35, -30, 12, 12, [
      { side: 's', pos: 3, width: 4 },   // From palace
      { side: 'e', pos: 0, width: 4 },   // To A site
    ]);

    // === A SITE ===
    buildRoom(50, -20, 30, 35, [
      { side: 'w', pos: 5, width: 5 },   // From A short
      { side: 'w', pos: -8, width: 5 },  // From palace
      { side: 's', pos: 0, width: 4 },   // From palace inner
      { side: 'n', pos: 5, width: 6 },   // To CT spawn (stairs)
    ], false); // Open roof

    // A site boxes
    const aDefault = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), woodMat);
    aDefault.position.set(50, 1.5, -15);
    addMesh(aDefault);
    const aTriple = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 3), woodMat);
    aTriple.position.set(55, 1.25, -20);
    addMesh(aTriple);
    const aNinja = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2, 2.5), woodMat);
    aNinja.position.set(62, 1, -10);
    addMesh(aNinja);
    const aTetris = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), woodMat);
    aTetris.position.set(40, 1, -25);
    addMesh(aTetris);

    // === CT SPAWN ===
    buildRoom(25, 15, 40, 20, [
      { side: 's', pos: -12, width: 6 },  // From connector
      { side: 's', pos: 12, width: 6 },   // From A site
      { side: 'w', pos: 0, width: 5 },    // To B through market
    ], false); // Open roof

    // CT boxes
    const ctBox = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), woodMat);
    ctBox.position.set(30, 1, 18);
    addMesh(ctBox);

    // === MARKET (CT to B) ===
    buildRoom(-10, 10, 15, 15, [
      { side: 'e', pos: 0, width: 5 },    // From CT spawn
      { side: 'w', pos: 0, width: 5 },    // To B site
    ]);

    // Market interior
    const marketBox = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 4), woodMat);
    marketBox.position.set(-12, 1, 12);
    addMesh(marketBox);

    // === OUTER BOUNDARY WALLS ===
    const boundaryWalls = [
      { x: 0, z: -95, w: 150, d: 2 },    // South
      { x: 0, z: 40, w: 150, d: 2 },     // North
      { x: -70, z: -25, w: 2, d: 140 },  // West
      { x: 80, z: -25, w: 2, d: 140 },   // East
    ];
    boundaryWalls.forEach(b => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(b.w, 12, b.d), darkWallMat);
      wall.position.set(b.x, 6, b.z);
      addMesh(wall);
    });

    // === BOMB SITES MARKERS ===
    // Bomb Site A marker
    const bombSiteAGeometry = new THREE.CircleGeometry(8, 32);
    const bombSiteAMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xff0000, 
      transparent: true, 
      opacity: 0.3,
      side: THREE.DoubleSide 
    });
    const bombSiteA = new THREE.Mesh(bombSiteAGeometry, bombSiteAMaterial);
    bombSiteA.rotation.x = -Math.PI / 2;
    bombSiteA.position.set(50, 0.1, -20); // A Site center
    scene.add(bombSiteA);
    
    // Bomb Site A label
    const bombSiteALabelDiv = document.createElement('div');
    bombSiteALabelDiv.className = 'bomb-site-label';
    bombSiteALabelDiv.textContent = 'BOMB SITE A';
    bombSiteALabelDiv.style.cssText = `
      color: #ff0000;
      font-size: 24px;
      font-weight: bold;
      background: rgba(0, 0, 0, 0.7);
      padding: 8px 16px;
      border: 2px solid #ff0000;
      border-radius: 4px;
      text-shadow: 0 0 10px rgba(255, 0, 0, 0.8);
      pointer-events: none;
      user-select: none;
    `;
    const bombSiteALabel = new CSS2DObject(bombSiteALabelDiv);
    bombSiteALabel.position.set(50, 3, -20); // Above the marker
    scene.add(bombSiteALabel);
    
    // Bomb Site B marker
    const bombSiteB = new THREE.Mesh(bombSiteAGeometry, bombSiteAMaterial);
    bombSiteB.rotation.x = -Math.PI / 2;
    bombSiteB.position.set(-35, 0.1, -10); // B Site center
    scene.add(bombSiteB);
    
    // Bomb Site B label
    const bombSiteBLabelDiv = document.createElement('div');
    bombSiteBLabelDiv.className = 'bomb-site-label';
    bombSiteBLabelDiv.textContent = 'BOMB SITE B';
    bombSiteBLabelDiv.style.cssText = `
      color: #ff0000;
      font-size: 24px;
      font-weight: bold;
      background: rgba(0, 0, 0, 0.7);
      padding: 8px 16px;
      border: 2px solid #ff0000;
      border-radius: 4px;
      text-shadow: 0 0 10px rgba(255, 0, 0, 0.8);
      pointer-events: none;
      user-select: none;
    `;
    const bombSiteBLabel = new CSS2DObject(bombSiteBLabelDiv);
    bombSiteBLabel.position.set(-35, 3, -10); // Above the marker
    scene.add(bombSiteBLabel);

    // === C4 BOMB MODEL (hidden until planted) ===
    const bombGroup = new THREE.Group();
    
    // Main bomb body - 5x larger
    const bombBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.75, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.8, roughness: 0.3 })
    );
    bombGroup.add(bombBody);
    
    // Red LED display - 5x larger
    const ledDisplay = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.4, 0.1),
      new THREE.MeshStandardMaterial({ 
        color: 0xff0000, 
        emissive: 0xff0000,
        emissiveIntensity: 0.8
      })
    );
    ledDisplay.position.set(0, 0.2, 0.55);
    bombGroup.add(ledDisplay);
    
    // Wires - 5x larger
    for (let i = 0; i < 3; i++) {
      const wire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.75, 8),
        new THREE.MeshStandardMaterial({ 
          color: i === 0 ? 0xff0000 : i === 1 ? 0x0000ff : 0x00ff00 
        })
      );
      wire.position.set(-0.5 + i * 0.5, -0.25, -0.25);
      wire.rotation.x = Math.PI / 2;
      bombGroup.add(wire);
    }
    
    bombGroup.visible = false;
    bombGroupRef.current = bombGroup;
    scene.add(bombGroup);

    // === FIRST PERSON WEAPON (dynamic based on selected weapon) ===
    const createFirstPersonWeapon = (weaponType: WeaponType) => {
      const fpWeapon = new THREE.Group();
      
      const metalMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.7, roughness: 0.3 });
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.8, roughness: 0.2 });
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.7 });
      const greenMat = new THREE.MeshStandardMaterial({ color: 0x2d4a3e, metalness: 0.5, roughness: 0.4 });
      
      if (weaponType === 'awp') {
        // AWP - Long sniper rifle with scope
        // Barrel (long, extending forward into -Z)
        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.015, 0.02, 0.6, 8),
          darkMat
        );
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0, -0.4);
        fpWeapon.add(barrel);
        
        // Receiver body
        const receiver = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 0.08, 0.25),
          greenMat
        );
        receiver.position.set(0, -0.02, -0.05);
        fpWeapon.add(receiver);
        
        // Scope
        const scope = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.025, 0.18, 12),
          darkMat
        );
        scope.rotation.x = Math.PI / 2;
        scope.position.set(0, 0.06, -0.08);
        fpWeapon.add(scope);
        
        // Scope lens (front)
        const lens = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.025, 0.01, 12),
          new THREE.MeshStandardMaterial({ color: 0x4488ff, metalness: 0.9, roughness: 0.1 })
        );
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0, 0.06, -0.17);
        fpWeapon.add(lens);
        
        // Stock
        const stock = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.1, 0.18),
          greenMat
        );
        stock.position.set(0, -0.02, 0.15);
        fpWeapon.add(stock);
        
        // Magazine
        const mag = new THREE.Mesh(
          new THREE.BoxGeometry(0.03, 0.08, 0.05),
          darkMat
        );
        mag.position.set(0, -0.08, 0);
        fpWeapon.add(mag);
        
      } else if (weaponType === 'm4') {
        // M4A4 - Modern tactical rifle
        // Barrel
        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.015, 0.4, 8),
          darkMat
        );
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0, -0.35);
        fpWeapon.add(barrel);
        
        // Flash hider
        const flashHider = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.015, 0.04, 8),
          metalMat
        );
        flashHider.rotation.x = Math.PI / 2;
        flashHider.position.set(0, 0, -0.56);
        fpWeapon.add(flashHider);
        
        // Handguard (quad rail)
        const handguard = new THREE.Mesh(
          new THREE.BoxGeometry(0.045, 0.045, 0.18),
          metalMat
        );
        handguard.position.set(0, -0.01, -0.22);
        fpWeapon.add(handguard);
        
        // Upper receiver
        const upperReceiver = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.05, 0.14),
          darkMat
        );
        upperReceiver.position.set(0, -0.01, -0.02);
        fpWeapon.add(upperReceiver);
        
        // Carry handle / rail
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(0.02, 0.015, 0.1),
          metalMat
        );
        rail.position.set(0, 0.03, -0.05);
        fpWeapon.add(rail);
        
        // Lower receiver + grip
        const lowerReceiver = new THREE.Mesh(
          new THREE.BoxGeometry(0.035, 0.06, 0.08),
          darkMat
        );
        lowerReceiver.position.set(0, -0.05, 0.02);
        fpWeapon.add(lowerReceiver);
        
        // Pistol grip
        const grip = new THREE.Mesh(
          new THREE.BoxGeometry(0.025, 0.07, 0.03),
          darkMat
        );
        grip.position.set(0, -0.09, 0.05);
        grip.rotation.x = 0.3;
        fpWeapon.add(grip);
        
        // Stock tube
        const stockTube = new THREE.Mesh(
          new THREE.CylinderGeometry(0.01, 0.01, 0.12, 8),
          metalMat
        );
        stockTube.rotation.x = Math.PI / 2;
        stockTube.position.set(0, -0.02, 0.12);
        fpWeapon.add(stockTube);
        
        // Stock pad
        const stockPad = new THREE.Mesh(
          new THREE.BoxGeometry(0.035, 0.06, 0.02),
          darkMat
        );
        stockPad.position.set(0, -0.02, 0.19);
        fpWeapon.add(stockPad);
        
        // Magazine
        const mag = new THREE.Mesh(
          new THREE.BoxGeometry(0.025, 0.1, 0.035),
          darkMat
        );
        mag.position.set(0, -0.1, 0);
        mag.rotation.x = 0.1;
        fpWeapon.add(mag);
        
      } else if (weaponType === 'ak47') {
        // AK-47 - Iconic rifle with wood furniture and curved mag
        // Barrel
        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.015, 0.018, 0.35, 8),
          darkMat
        );
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0, -0.38);
        fpWeapon.add(barrel);
        
        // Front sight block
        const frontSight = new THREE.Mesh(
          new THREE.BoxGeometry(0.025, 0.04, 0.025),
          darkMat
        );
        frontSight.position.set(0, 0.015, -0.5);
        fpWeapon.add(frontSight);
        
        // Gas tube (above barrel)
        const gasTube = new THREE.Mesh(
          new THREE.CylinderGeometry(0.01, 0.01, 0.2, 8),
          darkMat
        );
        gasTube.rotation.x = Math.PI / 2;
        gasTube.position.set(0, 0.025, -0.28);
        fpWeapon.add(gasTube);
        
        // Wooden handguard (below gas tube)
        const handguard = new THREE.Mesh(
          new THREE.BoxGeometry(0.035, 0.03, 0.16),
          woodMat
        );
        handguard.position.set(0, -0.015, -0.25);
        fpWeapon.add(handguard);
        
        // Receiver (stamped steel)
        const receiver = new THREE.Mesh(
          new THREE.BoxGeometry(0.045, 0.06, 0.16),
          darkMat
        );
        receiver.position.set(0, -0.01, -0.02);
        fpWeapon.add(receiver);
        
        // Dust cover
        const dustCover = new THREE.Mesh(
          new THREE.BoxGeometry(0.035, 0.015, 0.1),
          metalMat
        );
        dustCover.position.set(0, 0.03, -0.04);
        fpWeapon.add(dustCover);
        
        // Rear sight
        const rearSight = new THREE.Mesh(
          new THREE.BoxGeometry(0.025, 0.02, 0.015),
          darkMat
        );
        rearSight.position.set(0, 0.045, -0.08);
        fpWeapon.add(rearSight);
        
        // Pistol grip (wood)
        const grip = new THREE.Mesh(
          new THREE.BoxGeometry(0.028, 0.07, 0.035),
          woodMat
        );
        grip.position.set(0, -0.07, 0.02);
        grip.rotation.x = 0.25;
        fpWeapon.add(grip);
        
        // Wooden stock
        const stock = new THREE.Mesh(
          new THREE.BoxGeometry(0.035, 0.055, 0.22),
          woodMat
        );
        stock.position.set(0, -0.02, 0.18);
        fpWeapon.add(stock);
        
        // Stock buttpad
        const buttpad = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.065, 0.015),
          darkMat
        );
        buttpad.position.set(0, -0.02, 0.3);
        fpWeapon.add(buttpad);
        
        // Curved magazine (iconic AK banana mag)
        const mag = new THREE.Mesh(
          new THREE.BoxGeometry(0.028, 0.12, 0.04),
          new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.6 })
        );
        mag.position.set(0, -0.1, 0);
        mag.rotation.x = 0.2;
        fpWeapon.add(mag);
      }
      
      fpWeapon.position.set(0.25, -0.2, -0.5);
      fpWeapon.rotation.set(0, 0, 0);
      return fpWeapon;
    };

    let currentWeapon = createFirstPersonWeapon(selectedWeapon);
    camera.add(currentWeapon);
    scene.add(camera);

    // === AUDIO SYSTEM ===
    const audioListener = new THREE.AudioListener();
    camera.add(audioListener);
    
    // Create shoot sounds for each weapon
    const createShootSound = (weaponType: WeaponType) => {
      const sound = new THREE.Audio(audioListener);
      const audioLoader = new THREE.AudioLoader();
      
      // Create synthetic gun shot using oscillator (since we don't have audio files)
      const audioContext = audioListener.context;
      const duration = weaponType === 'awp' ? 0.3 : 0.15;
      const sampleRate = audioContext.sampleRate;
      const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
      const data = buffer.getChannelData(0);
      
      for (let i = 0; i < buffer.length; i++) {
        const t = i / sampleRate;
        let sample = 0;
        if (weaponType === 'awp') {
          // Deep, loud sniper sound
          sample = Math.random() * 2 - 1;
          sample *= Math.exp(-t * 8);
          sample *= 0.8;
        } else {
          // Sharper rifle sound
          sample = Math.random() * 2 - 1;
          sample *= Math.exp(-t * 12);
          sample *= 0.6;
        }
        data[i] = sample;
      }
      
      sound.setBuffer(buffer);
      sound.setVolume(0.5);
      return sound;
    };

    const shootSounds = {
      awp: createShootSound('awp'),
      m4: createShootSound('m4'),
      ak47: createShootSound('ak47'),
    };

    // Hit sound
    const createHitSound = () => {
      const sound = new THREE.Audio(audioListener);
      const audioContext = audioListener.context;
      const duration = 0.1;
      const sampleRate = audioContext.sampleRate;
      const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
      const data = buffer.getChannelData(0);
      
      for (let i = 0; i < buffer.length; i++) {
        const t = i / sampleRate;
        data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 30) * 0.3;
      }
      
      sound.setBuffer(buffer);
      sound.setVolume(0.4);
      return sound;
    };

    const hitSound = createHitSound();
    const hurtSound = createHitSound();

    // Bomb plant sound
    const createBombSound = () => {
      const sound = new THREE.Audio(audioListener);
      const audioContext = audioListener.context;
      const duration = 1.5;
      const sampleRate = audioContext.sampleRate;
      const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
      const data = buffer.getChannelData(0);
      
      for (let i = 0; i < buffer.length; i++) {
        const t = i / sampleRate;
        // Beeping sound
        const beep = Math.sin(2 * Math.PI * 800 * t) * Math.exp(-t * 2);
        data[i] = beep * 0.5;
      }
      
      sound.setBuffer(buffer);
      sound.setVolume(0.7);
      return sound;
    };

    const bombPlantSound = createBombSound();

    // Function to update first-person weapon
    const updateFirstPersonWeapon = (weaponType: WeaponType) => {
      camera.remove(currentWeapon);
      currentWeapon = createFirstPersonWeapon(weaponType);
      camera.add(currentWeapon);
    };

    // Player capsule collision
    // Team-based spawns: T spawn at T spawn area, CT spawn at CT spawn area
    const spawnPos = selectedTeam === 'T' 
      ? { x: 0, y: 0.35, z: -70 } // T Spawn - center of T spawn room
      : { x: 25, y: 0.35, z: 20 };  // CT Spawn - center of CT spawn room
      
    const playerCapsule = new Capsule(
      new THREE.Vector3(spawnPos.x, spawnPos.y, spawnPos.z),
      new THREE.Vector3(spawnPos.x, 1.8, spawnPos.z),
      0.35
    );
    
    // Store references for respawn
    cameraRef.current = camera;
    playerCapsuleRef.current = playerCapsule;

    const playerVelocity = new THREE.Vector3();
    const playerDirection = new THREE.Vector3();
    let playerOnFloor = false;

    // Set camera to player position
    camera.position.copy(playerCapsule.end);

    // Controls
    const keyStates: any = {};
    let mouseTime = 0;

    document.addEventListener('keydown', (event) => {
      keyStates[event.code] = true;
      
      // B key to toggle weapon menu
      if (event.code === 'KeyB' && document.pointerLockElement === document.body) {
        document.exitPointerLock();
        setShowWeaponMenu(true);
      }
      
      // R key to reload
      if (event.code === 'KeyR' && document.pointerLockElement === document.body) {
        reloadWeapon();
      }
      
      // E key to plant/defuse bomb
      if (event.code === 'KeyE' && document.pointerLockElement === document.body) {
        console.log('E key pressed', { selectedTeam, hasBomb: hasBombRef.current, bombPlanted, roundPhase: roundPhaseRef.current, atBombSite: atBombSiteRef.current });
        if (selectedTeam === 'T' && hasBombRef.current && !bombPlanted && roundPhaseRef.current === 'active' && atBombSiteRef.current && !isPlantingRef.current) {
          // Must be at bomb site to plant - must stay still
          console.log('Starting bomb plant...');
          setIsPlanting(true);
          isPlantingRef.current = true;
          plantStartPosRef.current = { x: camera.position.x, z: camera.position.z };
          
          let plantTime = 3; // 3 seconds to plant
          
          const checkPlanting = setInterval(() => {
            // Check if player moved
            if (plantStartPosRef.current) {
              const distMoved = Math.sqrt(
                Math.pow(camera.position.x - plantStartPosRef.current.x, 2) + 
                Math.pow(camera.position.z - plantStartPosRef.current.z, 2)
              );
              
              if (distMoved > 0.5) {
                // Player moved - cancel plant
                clearInterval(checkPlanting);
                setIsPlanting(false);
                isPlantingRef.current = false;
                plantStartPosRef.current = null;
                console.log('Plant cancelled - player moved');
                return;
              }
            }
            
            plantTime--;
            
            if (plantTime <= 0) {
              // Plant complete!
              clearInterval(checkPlanting);
              console.log('Bomb planted!');
              setBombPlanted(true);
              bombPlantedRef.current = true;
              setIsPlanting(false);
              isPlantingRef.current = false;
              plantStartPosRef.current = null;
              setPlantedSite(atBombSiteRef.current);
              const bombPos = { x: camera.position.x, y: 0.2, z: camera.position.z };
              setBombPosition(bombPos);
              bombPositionRef.current = bombPos;
              
              // Show and position bomb model
              bombGroup.position.set(bombPos.x, bombPos.y, bombPos.z);
              bombGroup.visible = true;
              
              // Play bomb plant sound
              if (bombPlantSound.isPlaying) bombPlantSound.stop();
              bombPlantSound.play();
              
              if (socketRef.current) {
                socketRef.current.emit('fpsPlantBomb', { 
                  position: [bombPos.x, bombPos.y, bombPos.z],
                  site: atBombSiteRef.current
                });
              }
            }
          }, 1000);
        } else if (selectedTeam === 'CT' && bombPlantedRef.current && !isDefusingRef.current && bombPositionRef.current) {
          // Check if near bomb
          const distToBomb = Math.sqrt(
            Math.pow(camera.position.x - bombPositionRef.current.x, 2) + 
            Math.pow(camera.position.z - bombPositionRef.current.z, 2)
          );
          
          if (distToBomb < 2) {
            // Start defusing with countdown
            setIsDefusing(true);
            isDefusingRef.current = true;
            setDefuseTimer(5);
            let timeLeft = 5;
            
            defuseIntervalRef.current = setInterval(() => {
              // Check if still near bomb
              const currentDist = Math.sqrt(
                Math.pow(camera.position.x - bombPositionRef.current!.x, 2) + 
                Math.pow(camera.position.z - bombPositionRef.current!.z, 2)
              );
              
              if (currentDist > 2) {
                // Walked away - cancel defuse
                clearInterval(defuseIntervalRef.current!);
                defuseIntervalRef.current = null;
                setIsDefusing(false);
                isDefusingRef.current = false;
                setDefuseTimer(5);
                return;
              }
              
              timeLeft--;
              setDefuseTimer(timeLeft);
              
              if (timeLeft <= 0) {
                // Defuse complete!
                clearInterval(defuseIntervalRef.current!);
                defuseIntervalRef.current = null;
                bombGroup.visible = false;
                setCtScore(prev => prev + 1);
                setRoundPhase('end');
                roundPhaseRef.current = 'end';
                setRoundWinner('CT');
                setIsDefusing(false);
                isDefusingRef.current = false;
                if (socketRef.current) {
                  socketRef.current.emit('fpsDefuseBomb');
                }
                setTimeout(() => {
                  respawnPlayer();
                }, 5000);
              }
            }, 1000);
          }
        }
      }
    });

    document.addEventListener('keyup', (event) => {
      keyStates[event.code] = false;
    });

    // Pointer lock
    containerRef.current?.addEventListener('click', () => {
      document.body.requestPointerLock();
    });

    document.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement === document.body) {
        camera.rotation.y -= event.movementX / 500;
        camera.rotation.x -= event.movementY / 500;
        camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
      }
    });

    // Rockets
    const rockets: any[] = [];
    const maxRockets = 50;
    
    for (let i = 0; i < maxRockets; i++) {
      const rocketGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
      const rocketMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffaa00,
        emissive: 0xff6600,
        emissiveIntensity: 0.5
      });
      const rocket = new THREE.Mesh(rocketGeometry, rocketMaterial);
      rocket.visible = false;
      rocket.castShadow = true;
      scene.add(rocket);

      const collider = new THREE.Sphere(new THREE.Vector3(), 0.5);
      
      rockets.push({
        mesh: rocket,
        collider: collider,
        velocity: new THREE.Vector3(),
        alive: false,
        ownerId: null,
      });
    }

    let currentRocketIndex = 0;

    // Socket setup
    const remotePlayers: Map<string, any> = new Map();

    const initSocket = () => {
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
      const socket = io(serverUrl);
      socketRef.current = socket;

      console.log('Emitting fpsJoin with:', { name: playerName, team: selectedTeam });
      socket.emit('fpsJoin', { name: playerName, team: selectedTeam });

      // Listen for team counts
      socket.on('fpsTeamCounts', (counts: {T: number, CT: number}) => {
        console.log('Received fpsTeamCounts:', counts);
        setTeamCounts(counts);
        // Check if both teams have at least 1 player
        if (counts.T > 0 && counts.CT > 0) {
          setWaitingForPlayers(false);
        } else {
          setWaitingForPlayers(true);
          setCountdown(5); // Reset countdown when teams become unbalanced
          countdownRef.current = 5;
        }
      });

      socket.on('fpsPlayers', (players: any) => {
        Object.entries(players).forEach(([id, playerData]: [string, any]) => {
          if (id !== socket.id && !remotePlayers.has(id)) {
            const soldierModel = createSoldierModel();
            soldierModel.castShadow = true;
            scene.add(soldierModel);

            remotePlayers.set(id, {
              mesh: soldierModel,
              position: new THREE.Vector3(...playerData.position),
              rotation: playerData.rotation || 0,
              health: 100,
            });
          }
        });
      });

      socket.on('fpsPlayerJoined', ({ id, player }: any) => {
        if (id !== socket.id && !remotePlayers.has(id)) {
          const soldierModel = createSoldierModel();
          soldierModel.castShadow = true;
          scene.add(soldierModel);

          remotePlayers.set(id, {
            mesh: soldierModel,
            position: new THREE.Vector3(...player.position),
            rotation: player.rotation || 0,
            health: 100,
          });
        }
      });

      // High-frequency position updates (120Hz from server)
      socket.on('fpsPlayerPositions', (players: any) => {
        Object.entries(players).forEach(([id, playerData]: [string, any]) => {
          if (id !== socket.id) {
            let player = remotePlayers.get(id);
            
            // Create player if doesn't exist
            if (!player) {
              const soldierModel = createSoldierModel();
              soldierModel.castShadow = true;
              scene.add(soldierModel);

              // No nameplates - removed for cleaner gameplay

              player = {
                mesh: soldierModel,
                position: new THREE.Vector3(...playerData.position),
                rotation: 0,
                health: 100,
              };
              remotePlayers.set(id, player);
            } else {
              // Smooth interpolation to new position
              player.position.lerp(new THREE.Vector3(...playerData.position), 0.3);
            }
          }
        });
      });

      socket.on('fpsPlayerLeft', ({ id }: any) => {
        const player = remotePlayers.get(id);
        if (player) {
          scene.remove(player.mesh);
          remotePlayers.delete(id);
        }
      });

      socket.on('fpsBombPlanted', ({ position, site }: any) => {
        console.log('Received fpsBombPlanted:', { position, site });
        setBombPlanted(true);
        bombPlantedRef.current = true;
        setPlantedSite(site);
        const bombPos = { x: position[0], y: position[1], z: position[2] };
        setBombPosition(bombPos);
        bombPositionRef.current = bombPos;
        bombGroup.position.set(bombPos.x, bombPos.y, bombPos.z);
        bombGroup.visible = true;
        console.log('Bomb model visible:', bombGroup.visible, 'position:', bombGroup.position);
        
        // Play bomb plant sound
        if (bombPlantSound.isPlaying) bombPlantSound.stop();
        bombPlantSound.play();
      });

      socket.on('fpsBombDefused', () => {
        setBombPlanted(false);
        bombPlantedRef.current = false;
        setBombPosition(null);
        bombPositionRef.current = null;
        setPlantedSite(null);
        bombGroup.visible = false;
      });

      // Listen for round reset from server (triggered when any player calls respawnPlayer)
      socket.on('fpsRoundReset', () => {
        console.log('Round reset received from server');
        setHealth(100);
        setIsDead(false);
      });

      socket.on('fpsTeamEliminated', ({ winner }: any) => {
        console.log('Team eliminated, winner:', winner);
        setRoundPhase('end');
        roundPhaseRef.current = 'end';
        setRoundWinner(winner);
        if (winner === 'T') {
          setTScore(s => s + 1);
        } else {
          setCtScore(s => s + 1);
        }
        setTimeout(() => {
          respawnPlayer();
        }, 5000);
      });

      socket.on('fpsShot', ({ id, position, direction, damage }: any) => {
        const rocket = rockets.find((r: any) => !r.alive);
        if (rocket) {
          rocket.mesh.position.set(...position);
          rocket.velocity.set(...direction).multiplyScalar(100);
          rocket.alive = true;
          rocket.mesh.visible = true;
          rocket.collider.center.copy(rocket.mesh.position);
          rocket.ownerId = id; // Track who shot this rocket
          rocket.damage = damage || 20; // Store damage with the rocket

          const dir = new THREE.Vector3(...direction);
          const targetPos = rocket.mesh.position.clone().add(dir);
          rocket.mesh.lookAt(targetPos);
          rocket.mesh.rotateX(Math.PI / 2);
        }
      });

      socket.on('fpsHit', ({ damage, victim }: any) => {
        // Play hurt sound when we get hit
        if (hurtSound.isPlaying) hurtSound.stop();
        hurtSound.play();
        
        setHealth((prev) => Math.max(0, prev - damage));
        
        // Play hit sound when we hit someone
        if (victim) {
          if (hitSound.isPlaying) hitSound.stop();
          hitSound.play();
          
          const player = remotePlayers.get(victim);
          if (player) {
            player.health = Math.max(0, player.health - damage);
          }
        }
      });

      socket.on('fpsKill', ({ killer, victim }: any) => {
        if (victim === socket.id) {
          setDeaths((prev) => prev + 1);
          // Don't respawn during round - wait for round end
        }
        if (killer === socket.id) {
          setKills((prev) => prev + 1);
        }
        
        // Reset killed player's health
        const killedPlayer = remotePlayers.get(victim);
        if (killedPlayer) {
          killedPlayer.health = 100;
        }
      });
    };

    initSocket();

    // Reload function
    const reloadWeapon = () => {
      if (isReloadingRef.current) return;
      
      const config = weaponConfig[selectedWeapon];
      if (ammoRef.current >= config.maxAmmo) return; // Already full
      
      isReloadingRef.current = true;
      setIsReloading(true);
      
      setTimeout(() => {
        ammoRef.current = config.maxAmmo;
        setCurrentAmmo(config.maxAmmo);
        isReloadingRef.current = false;
        setIsReloading(false);
      }, config.reloadTime);
    };

    // Shoot function
    const shootRocket = () => {
      // Check if can shoot using refs for immediate values
      if (isReloadingRef.current || ammoRef.current <= 0) {
        return;
      }
      
      // Consume ammo immediately using ref
      ammoRef.current -= 1;
      setCurrentAmmo(ammoRef.current);
      
      const rocket = rockets[currentRocketIndex];
      
      camera.getWorldDirection(playerDirection);
      
      rocket.mesh.position.copy(camera.position);
      rocket.mesh.position.add(playerDirection.clone().multiplyScalar(2));
      rocket.velocity.copy(playerDirection).multiplyScalar(100);
      rocket.alive = true;
      rocket.mesh.visible = true;
      rocket.collider.center.copy(rocket.mesh.position);
      rocket.ownerId = socketRef.current?.id || null; // Track who shot this rocket
      rocket.damage = weaponConfig[selectedWeapon].damage; // Store damage with the rocket
      
      const targetPos = rocket.mesh.position.clone().add(playerDirection);
      rocket.mesh.lookAt(targetPos);
      rocket.mesh.rotateX(Math.PI / 2);
      
      currentRocketIndex = (currentRocketIndex + 1) % maxRockets;

      // Play weapon sound
      const sound = shootSounds[selectedWeapon];
      if (sound.isPlaying) sound.stop();
      sound.play();

      // Auto-reload when out of ammo
      if (ammoRef.current === 0) {
        setTimeout(() => reloadWeapon(), 100);
      }

      if (socketRef.current) {
        socketRef.current.emit('fpsShoot', {
          position: [camera.position.x, camera.position.y, camera.position.z],
          direction: [playerDirection.x, playerDirection.y, playerDirection.z],
          damage: weaponConfig[selectedWeapon].damage,
        });
      }
    };

    // Full auto shooting system
    const tryShoot = () => {
      const now = Date.now();
      const config = weaponConfig[selectedWeapon];
      
      // Check fire rate
      if (now - lastShotTimeRef.current < config.fireRate) {
        return;
      }
      
      if (isReloadingRef.current || ammoRef.current <= 0) {
        return;
      }
      
      lastShotTimeRef.current = now;
      shootRocket();
    };

    document.addEventListener('mousedown', () => {
      if (document.pointerLockElement === document.body && !(countdownRef.current > 0 && roundPhaseRef.current === 'buy')) {
        isShootingRef.current = true;
        tryShoot(); // Shoot immediately
      }
    });

    document.addEventListener('mouseup', () => {
      isShootingRef.current = false;
    });

    // Auto-fire loop for full auto weapons
    const autoFireInterval = setInterval(() => {
      if (isShootingRef.current && weaponConfig[selectedWeapon].auto) {
        tryShoot();
      }
    }, 50); // Check every 50ms

    // Player movement functions
    const getForwardVector = () => {
      camera.getWorldDirection(playerDirection);
      playerDirection.y = 0;
      playerDirection.normalize();
      return playerDirection;
    };

    const getSideVector = () => {
      camera.getWorldDirection(playerDirection);
      playerDirection.y = 0;
      playerDirection.normalize();
      playerDirection.cross(camera.up);
      return playerDirection;
    };

    const controls = (deltaTime: number) => {
      // Freeze players ONLY during countdown in buy phase
      const shouldFreeze = roundPhaseRef.current === 'buy' && countdownRef.current > 0;
      if (shouldFreeze) {
        return;
      }
      
      // Reduce speed while in air to prevent bunny hopping
      const baseSpeed = 25;
      const airSpeedMultiplier = playerOnFloor ? 1.0 : 0.15; // Much less air control
      const speedDelta = deltaTime * baseSpeed * airSpeedMultiplier;

      if (keyStates['KeyW']) {
        playerVelocity.add(getForwardVector().multiplyScalar(speedDelta));
      }
      if (keyStates['KeyS']) {
        playerVelocity.add(getForwardVector().multiplyScalar(-speedDelta));
      }
      if (keyStates['KeyA']) {
        playerVelocity.add(getSideVector().multiplyScalar(-speedDelta));
      }
      if (keyStates['KeyD']) {
        playerVelocity.add(getSideVector().multiplyScalar(speedDelta));
      }
      if (keyStates['Space'] && playerOnFloor) {
        playerVelocity.y = 8; // Reduced from 15 for lower jumps
      }
      
      // Cap horizontal velocity to prevent speed buildup from bunny hopping
      const maxHorizontalSpeed = 12;
      const horizontalSpeed = Math.sqrt(playerVelocity.x * playerVelocity.x + playerVelocity.z * playerVelocity.z);
      if (horizontalSpeed > maxHorizontalSpeed) {
        const scale = maxHorizontalSpeed / horizontalSpeed;
        playerVelocity.x *= scale;
        playerVelocity.z *= scale;
      }
    };

    const updatePlayer = (deltaTime: number) => {
      let damping = Math.exp(-4 * deltaTime) - 1;

      if (!playerOnFloor) {
        playerVelocity.y -= 30 * deltaTime;
        damping *= 0.1;
      }

      playerVelocity.addScaledVector(playerVelocity, damping);

      const deltaPosition = playerVelocity.clone().multiplyScalar(deltaTime);
      playerCapsule.translate(deltaPosition);

      playerCollisions();

      camera.position.copy(playerCapsule.end);

      if (socketRef.current && Date.now() - mouseTime > 16) {
        mouseTime = Date.now();
        socketRef.current.emit('fpsMove', {
          position: [camera.position.x, camera.position.y, camera.position.z],
          rotation: camera.rotation.y,
        });
      }
    };

    const playerCollisions = () => {
      const result = worldOctree.capsuleIntersect(playerCapsule);
      playerOnFloor = false;

      if (result) {
        playerOnFloor = result.normal.y > 0;

        if (!playerOnFloor) {
          playerVelocity.addScaledVector(result.normal, -result.normal.dot(playerVelocity));
        }

        playerCapsule.translate(result.normal.multiplyScalar(result.depth));
      }
    };

    const teleportPlayerIfOob = () => {
      // Teleport if out of bounds OR if in buy phase countdown (to reset positions)
      if (camera.position.y <= -25 || (roundPhaseRef.current === 'buy' && countdownRef.current === 10)) {
        const spawn = selectedTeam === 'T'
          ? { x: 0, z: -70 }
          : { x: 25, z: 20 };
        playerCapsule.start.set(spawn.x, 0.35, spawn.z);
        playerCapsule.end.set(spawn.x, 1.8, spawn.z);
        playerCapsule.radius = 0.35;
        camera.position.copy(playerCapsule.end);
        camera.rotation.set(0, 0, 0);
      }
    };

    const updateRockets = (deltaTime: number) => {
      rockets.forEach((rocket: any) => {
        if (!rocket.alive) return;

        rocket.mesh.position.addScaledVector(rocket.velocity, deltaTime);
        rocket.collider.center.copy(rocket.mesh.position);

        const result = worldOctree.sphereIntersect(rocket.collider);
        if (result) {
          rocket.alive = false;
          rocket.mesh.visible = false;
          return;
        }

        remotePlayers.forEach((player: any, playerId: string) => {
          if (!rocket.alive) return;
          
          // Don't check collision with the player who shot this rocket
          if (rocket.ownerId === playerId) return;
          
          const distance = rocket.mesh.position.distanceTo(player.position);
          if (distance < 1.5) {
            rocket.alive = false;
            rocket.mesh.visible = false;

            if (socketRef.current) {
              socketRef.current.emit('fpsHit', {
                victim: playerId,
                damage: rocket.damage || 20,
              });
            }
          }
        });

        if (rocket.mesh.position.length() > 500) {
          rocket.alive = false;
          rocket.mesh.visible = false;
        }
      });
    };

    const raycaster = new THREE.Raycaster();
    
    const updateRemotePlayers = () => {
      remotePlayers.forEach((player: any) => {
        // Offset Y position - camera is at eye level (1.8), but model base is at feet
        // Subtract ~1.5 to put feet on ground (model is about 1.8 tall, eyes at top)
        player.mesh.position.set(
          player.position.x,
          player.position.y - 1.5,
          player.position.z
        );
        player.mesh.rotation.y = player.rotation;
        
        // Check if nameplate is occluded by walls
        const direction = new THREE.Vector3();
        direction.subVectors(player.position, camera.position).normalize();
        raycaster.set(camera.position, direction);
        
        const distance = camera.position.distanceTo(player.position);
        const intersects = raycaster.intersectObjects(scene.children, true);
        
        // Hide nameplate if something is between camera and player
        let occluded = false;
        for (const intersect of intersects) {
          // Skip the player mesh itself and rockets
          if (intersect.object === player.mesh || intersect.object.parent === player.mesh) continue;
          if (intersect.object.name === 'rocket') continue;
          
          if (intersect.distance < distance - 0.5) {
            occluded = true;
            break;
          }
        }
        
        if (player.nameplate && player.nameplate.element) {
          player.nameplate.element.style.display = occluded ? 'none' : 'block';
        }
      });
    };

    // Animation loop
    const clock = new THREE.Clock();

    const animate = () => {
      const deltaTime = Math.min(0.05, clock.getDelta());

      controls(deltaTime);
      updatePlayer(deltaTime);
      updateRockets(deltaTime);
      updateRemotePlayers();
      teleportPlayerIfOob();
      
      // Make bomb LED blink when planted
      if (bombPlanted && bombGroup.visible) {
        const blinkSpeed = 2; // Blinks per second
        const intensity = (Math.sin(Date.now() * 0.001 * blinkSpeed * Math.PI * 2) + 1) / 2;
        ledDisplay.material.emissiveIntensity = 0.4 + intensity * 0.6;
      }
      
      // Check if player is at bomb site
      const distToA = Math.sqrt(
        Math.pow(camera.position.x - 50, 2) + 
        Math.pow(camera.position.z - (-20), 2)
      );
      const distToB = Math.sqrt(
        Math.pow(camera.position.x - (-35), 2) + 
        Math.pow(camera.position.z - (-10), 2)
      );
      
      if (distToA < 8) {
        setAtBombSite('A');
        atBombSiteRef.current = 'A';
      } else if (distToB < 8) {
        setAtBombSite('B');
        atBombSiteRef.current = 'B';
      } else {
        setAtBombSite(null);
        atBombSiteRef.current = null;
      }

      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
      requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      labelRenderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearInterval(autoFireInterval);
      window.removeEventListener('resize', handleResize);
      if (containerRef.current) {
        if (renderer.domElement) {
          containerRef.current.removeChild(renderer.domElement);
        }
        if (labelRenderer.domElement) {
          containerRef.current.removeChild(labelRenderer.domElement);
        }
      }
      renderer.dispose();
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [gameStarted, playerName, selectedWeapon, selectedTeam]);

  // Round timer system
  useEffect(() => {
    if (!gameStarted || roundPhase !== 'active') return;
    
    const timer = setInterval(() => {
      setRoundTime(prev => {
        // Play beep sound for last 10 seconds
        if (prev <= 10 && prev > 1 && !bombPlanted) {
          const audioContext = new AudioContext();
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.frequency.value = 600;
          gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
          
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.15);
        }
        
        if (prev <= 1) {
          // Time's up - CTs win
          setCtScore(s => s + 1);
          setRoundPhase('end');
          roundPhaseRef.current = 'end';
          setRoundWinner('CT');
          setTimeout(() => {
            respawnPlayer();
          }, 5000);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [gameStarted, roundPhase, bombPlanted]);

  // Bomb timer
  useEffect(() => {
    if (!bombPlanted) return;
    
    const timer = setInterval(() => {
      setBombTimer(prev => {
        if (prev <= 1) {
          // Bomb explodes - Ts win
          setTScore(s => s + 1);
          setRoundPhase('end');
          roundPhaseRef.current = 'end';
          setRoundWinner('T');
          setTimeout(() => {
            respawnPlayer();
          }, 5000);
          return 40;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [bombPlanted]);

  // Buy phase timer
  useEffect(() => {
    if (!gameStarted || roundPhase !== 'buy' || waitingForPlayers) return;
    
    // Countdown before round starts
    if (countdown > 0) {
      // Play countdown beep sound
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = countdown === 1 ? 1200 : 800;
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
      
      const timer = setTimeout(() => {
        setCountdown(prev => {
          const newVal = prev - 1;
          countdownRef.current = newVal;
          return newVal;
        });
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      // Start active round
      setRoundPhase('active');
      roundPhaseRef.current = 'active';
      setCountdown(5); // Reset for next round
      countdownRef.current = 5;
      // Assign bomb to random T player (for now, just give it to everyone on T team)
      if (selectedTeam === 'T') {
        setHasBomb(true);
        hasBombRef.current = true;
      }
    }
  }, [gameStarted, roundPhase, selectedTeam, countdown, waitingForPlayers]);

  // Check for death and team elimination
  useEffect(() => {
    if (health <= 0 && !isDead) {
      setIsDead(true);
      // Check for team elimination via server
      if (socketRef.current) {
        socketRef.current.emit('fpsPlayerDied', { team: selectedTeam });
      }
    } else if (health > 0 && isDead) {
      setIsDead(false);
    }
  }, [health, isDead, selectedTeam]);

  // Handle weapon change from menu
  const handleWeaponSelect = (weapon: WeaponType) => {
    setSelectedWeapon(weapon);
    setShowWeaponMenu(false);
    // Reset ammo to max for new weapon
    const weaponConfig = {
      awp: { maxAmmo: 1, damage: 100, reloadTime: 2000 },
      m4: { maxAmmo: 30, damage: 20, reloadTime: 1000 },
      ak47: { maxAmmo: 30, damage: 20, reloadTime: 1000 },
    };
    ammoRef.current = weaponConfig[weapon].maxAmmo;
    setCurrentAmmo(weaponConfig[weapon].maxAmmo);
    isReloadingRef.current = false;
    setIsReloading(false);
    // Re-lock pointer after selection
    setTimeout(() => {
      document.body.requestPointerLock();
    }, 100);
  };

  if (!gameStarted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="bg-black/50 backdrop-blur-xl rounded-3xl p-12 border border-white/10 max-w-2xl w-full mx-4">
          <h1 className="text-5xl font-bold text-center mb-8 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Counter-Strike Arena
          </h1>
          
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name"
            className="w-full px-6 py-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 mb-6 focus:outline-none focus:border-purple-500"
            onKeyDown={(e) => e.key === 'Enter' && playerName && setGameStarted(true)}
          />

          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">Select Your Team</h2>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <button
                onClick={() => setSelectedTeam('T')}
                className={`p-6 rounded-xl border-2 transition-all ${
                  selectedTeam === 'T'
                    ? 'border-yellow-500 bg-yellow-500/20'
                    : 'border-white/20 bg-white/5 hover:border-white/40'
                }`}
              >
                <div className="text-white text-xl font-bold mb-2">Terrorists</div>
                <div className="text-gray-400 text-sm">Plant the bomb</div>
                <div className="text-xs text-yellow-400 mt-2">Objective: Plant C4</div>
              </button>
              
              <button
                onClick={() => setSelectedTeam('CT')}
                className={`p-6 rounded-xl border-2 transition-all ${
                  selectedTeam === 'CT'
                    ? 'border-blue-500 bg-blue-500/20'
                    : 'border-white/20 bg-white/5 hover:border-white/40'
                }`}
              >
                <div className="text-white text-xl font-bold mb-2">Counter-Terrorists</div>
                <div className="text-gray-400 text-sm">Defuse the bomb</div>
                <div className="text-xs text-blue-400 mt-2">Objective: Stop Ts</div>
              </button>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">Select Your Weapon</h2>
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => setSelectedWeapon('awp')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  selectedWeapon === 'awp'
                    ? 'border-green-500 bg-green-500/20'
                    : 'border-white/20 bg-white/5 hover:border-white/40'
                }`}
              >
                <div className="text-white font-semibold mb-1">AWP</div>
                <div className="text-gray-400 text-sm">Sniper Rifle</div>
                <div className="text-xs text-green-400 mt-1">1 Shot Kill</div>
                <div className="text-xs text-gray-500">1 Round</div>
              </button>
              
              <button
                onClick={() => setSelectedWeapon('m4')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  selectedWeapon === 'm4'
                    ? 'border-blue-500 bg-blue-500/20'
                    : 'border-white/20 bg-white/5 hover:border-white/40'
                }`}
              >
                <div className="text-white font-semibold mb-1">M4A1</div>
                <div className="text-gray-400 text-sm">Assault Rifle</div>
                <div className="text-xs text-blue-400 mt-1">5 Shots to Kill</div>
                <div className="text-xs text-gray-500">30 Rounds</div>
              </button>
              
              <button
                onClick={() => setSelectedWeapon('ak47')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  selectedWeapon === 'ak47'
                    ? 'border-orange-500 bg-orange-500/20'
                    : 'border-white/20 bg-white/5 hover:border-white/40'
                }`}
              >
                <div className="text-white font-semibold mb-1">AK-47</div>
                <div className="text-gray-400 text-sm">Assault Rifle</div>
                <div className="text-xs text-orange-400 mt-1">5 Shots to Kill</div>
                <div className="text-xs text-gray-500">30 Rounds</div>
              </button>
            </div>
          </div>

          <button
            onClick={() => setGameStarted(true)}
            disabled={!playerName}
            className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl font-semibold text-lg hover:from-purple-500 hover:to-pink-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Join Arena
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
      
      {/* Top HUD - Score and Timer */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm rounded-lg px-8 py-3 text-white">
        <div className="flex items-center gap-8 text-xl font-bold">
          <div className="text-yellow-400">T: {tScore}</div>
          <div className="text-2xl">{Math.floor(roundTime / 60)}:{(roundTime % 60).toString().padStart(2, '0')}</div>
          <div className="text-blue-400">CT: {ctScore}</div>
        </div>
        {waitingForPlayers && (
          <div className="text-center text-sm text-orange-400 mt-1 animate-pulse">WAITING FOR PLAYERS...</div>
        )}
        {!waitingForPlayers && roundPhase === 'buy' && countdown > 0 && (
          <div className="text-center text-sm text-green-400 mt-1">ROUND STARTS IN: {countdown}s</div>
        )}
        {roundPhase === 'buy' && countdown === 0 && (
          <div className="text-center text-sm text-yellow-400 mt-1">BUY PHASE</div>
        )}
        {roundPhase === 'active' && (
          <div className="text-center text-sm text-green-400 mt-1 font-bold">● ROUND ACTIVE ●</div>
        )}
        {bombPlanted && (
          <div className="text-center text-sm text-red-400 mt-1 animate-pulse">BOMB PLANTED - {bombTimer}s</div>
        )}
      </div>

      {/* Round Winner Popup */}
      {roundWinner && roundPhase === 'end' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 border-4 rounded-xl p-12 text-center animate-pulse"
               style={{ borderColor: roundWinner === 'T' ? '#fbbf24' : '#60a5fa' }}>
            <div className="text-6xl font-bold mb-4"
                 style={{ color: roundWinner === 'T' ? '#fbbf24' : '#60a5fa' }}>
              {roundWinner === 'T' ? 'TERRORISTS WIN' : 'COUNTER-TERRORISTS WIN'}
            </div>
            <div className="text-2xl text-gray-300">Next round starting...</div>
          </div>
        </div>
      )}

      {/* Player Info HUD */}
      <div className="absolute top-6 left-6 bg-black/50 backdrop-blur-sm rounded-lg p-4 text-white space-y-2">
        <div className="text-lg font-bold" style={{ color: selectedTeam === 'T' ? '#fbbf24' : '#60a5fa' }}>
          {selectedTeam === 'T' ? 'TERRORIST' : 'COUNTER-TERRORIST'}
        </div>
        <div>Health: {health}</div>
        <div>K/D: {kills}/{deaths}</div>
        <div className="text-sm text-gray-300 mt-2 pt-2 border-t border-white/20">
          {selectedWeapon.toUpperCase()}
        </div>
        <div className="text-lg font-bold mt-1">
          {isReloading ? (
            <span className="text-yellow-400">Reloading...</span>
          ) : (
            <span className={currentAmmo === 0 ? 'text-red-400' : 'text-white'}>
              {currentAmmo}/{weaponConfig[selectedWeapon].maxAmmo}
            </span>
          )}
        </div>
        {hasBomb && selectedTeam === 'T' && !bombPlanted && roundPhase === 'active' && (
          <div className="text-sm text-red-400 font-bold mt-2 px-3 py-1 bg-red-900/50 rounded border border-red-400 animate-pulse">
            💣 YOU HAVE THE BOMB
          </div>
        )}
        {atBombSite && selectedTeam === 'T' && hasBomb && !bombPlanted && roundPhase === 'active' && (
          <div className="text-sm text-green-400 font-bold mt-2 px-3 py-1 bg-green-900/50 rounded border border-green-400">
            ✓ AT BOMB SITE {atBombSite} - PRESS E TO PLANT
          </div>
        )}
        {isPlanting && (
          <div className="text-sm text-yellow-400 font-bold mt-2">PLANTING...</div>
        )}
        {bombPlanted && selectedTeam === 'CT' && plantedSite && (
          <div className="text-sm text-orange-400 font-bold mt-2 px-3 py-1 bg-orange-900/50 rounded border border-orange-400">
            💣 BOMB PLANTED AT SITE {plantedSite} - FIND AND DEFUSE
          </div>
        )}
        {bombPlanted && selectedTeam === 'CT' && bombPosition && !isDefusing && (
          <div className="text-sm text-blue-400 font-bold mt-1">
            Get close and press E to defuse
          </div>
        )}
        {isDefusing && (
          <div className="text-center mt-2">
            <div className="text-2xl text-blue-400 font-bold animate-pulse">DEFUSING... {defuseTimer}s</div>
            <div className="w-48 h-3 bg-gray-700 rounded-full mx-auto mt-2 overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-1000"
                style={{ width: `${(defuseTimer / 5) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* In-game weapon menu */}
      {showWeaponMenu && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-black/80 backdrop-blur-xl rounded-2xl p-8 border border-white/20 max-w-2xl w-full mx-4">
            <h2 className="text-3xl font-bold text-center mb-6 text-white">Select Weapon</h2>
            <div className="grid grid-cols-3 gap-6 mb-6">
              <button
                onClick={() => handleWeaponSelect('awp')}
                className={`p-6 rounded-xl border-2 transition-all ${
                  selectedWeapon === 'awp'
                    ? 'border-green-500 bg-green-500/30'
                    : 'border-white/30 bg-white/10 hover:border-white/50'
                }`}
              >
                <div className="text-white text-xl font-semibold mb-2">AWP</div>
                <div className="text-gray-300 text-sm">Sniper Rifle</div>
                <div className="text-green-400 text-xs mt-2">1 Shot Kill</div>
                <div className="text-gray-400 text-xs">1 Round | 2s Reload</div>
              </button>
              
              <button
                onClick={() => handleWeaponSelect('m4')}
                className={`p-6 rounded-xl border-2 transition-all ${
                  selectedWeapon === 'm4'
                    ? 'border-blue-500 bg-blue-500/30'
                    : 'border-white/30 bg-white/10 hover:border-white/50'
                }`}
              >
                <div className="text-white text-xl font-semibold mb-2">M4A1</div>
                <div className="text-gray-300 text-sm">Assault Rifle</div>
                <div className="text-blue-400 text-xs mt-2">5 Shots to Kill</div>
                <div className="text-gray-400 text-xs">30 Rounds | 1s Reload</div>
              </button>
              
              <button
                onClick={() => handleWeaponSelect('ak47')}
                className={`p-6 rounded-xl border-2 transition-all ${
                  selectedWeapon === 'ak47'
                    ? 'border-orange-500 bg-orange-500/30'
                    : 'border-white/30 bg-white/10 hover:border-white/50'
                }`}
              >
                <div className="text-white text-xl font-semibold mb-2">AK-47</div>
                <div className="text-gray-300 text-sm">Assault Rifle</div>
                <div className="text-orange-400 text-xs mt-2">5 Shots to Kill</div>
                <div className="text-gray-400 text-xs">30 Rounds | 1s Reload</div>
              </button>
            </div>
            <button
              onClick={() => {
                setShowWeaponMenu(false);
                setTimeout(() => document.body.requestPointerLock(), 100);
              }}
              className="w-full py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all"
            >
              Close (or press ESC)
            </button>
          </div>
        </div>
      )}

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="relative w-6 h-6">
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-white/70 -translate-y-1/2" />
          <div className="absolute left-1/2 top-0 w-0.5 h-full bg-white/70 -translate-x-1/2" />
        </div>
      </div>

      <div className="absolute bottom-6 left-6 bg-black/50 backdrop-blur-sm rounded-lg p-4 text-white text-sm">
        <div>WASD - Move</div>
        <div>Mouse - Look</div>
        <div>Hold Click - Shoot (Auto for rifles)</div>
        <div>R - Reload</div>
        <div>E - Plant/Defuse Bomb</div>
        <div>Space - Jump</div>
        <div>B - Change Weapon</div>
        <div className="text-xs text-gray-400 mt-2">Click screen to lock pointer</div>
      </div>
    </div>
  );
}
