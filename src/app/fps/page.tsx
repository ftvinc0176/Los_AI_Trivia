'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export default function FPSArena() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [playerName, setPlayerName] = useState('');
  const [gameStarted, setGameStarted] = useState(false);
  const [health, setHealth] = useState(100);
  const [kills, setKills] = useState(0);
  const [deaths, setDeaths] = useState(0);

  // Helper function to create soldier model
  const createSoldierModel = () => {
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

    // AWP Sniper Rifle
    const awpGroup = new THREE.Group();
    
    // Main body (long barrel)
    const barrelGeometry = new THREE.BoxGeometry(0.08, 1.2, 0.08);
    const awpMaterial = new THREE.MeshStandardMaterial({ color: 0x2d4a3e }); // AWP green
    const barrel = new THREE.Mesh(barrelGeometry, awpMaterial);
    barrel.position.y = 0;
    awpGroup.add(barrel);
    
    // Scope
    const scopeGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.25, 8);
    const scopeMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const scope = new THREE.Mesh(scopeGeometry, scopeMaterial);
    scope.rotation.z = Math.PI / 2;
    scope.position.set(0, 0.3, 0.08);
    awpGroup.add(scope);
    
    // Stock
    const stockGeometry = new THREE.BoxGeometry(0.1, 0.3, 0.12);
    const stock = new THREE.Mesh(stockGeometry, awpMaterial);
    stock.position.y = -0.5;
    awpGroup.add(stock);
    
    awpGroup.position.set(0.3, 0.85, 0.25);
    awpGroup.rotation.x = Math.PI / 6;
    soldier.add(awpGroup);

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
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.6, roughness: 0.4 });

    // Helper to add mesh with collision
    const addMesh = (mesh: THREE.Mesh, noCollision = false) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      if (!noCollision) worldOctree.fromGraphNode(mesh);
    };

    // Helper to create building with windows/doors
    const createBuilding = (w: number, h: number, d: number, mat: THREE.Material, hasWindows = true) => {
      const group = new THREE.Group();
      const main = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      main.castShadow = true;
      main.receiveShadow = true;
      group.add(main);
      
      if (hasWindows) {
        // Add window frames
        const windowMat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.2 });
        const numWindows = Math.floor(w / 5);
        for (let i = 0; i < numWindows; i++) {
          const window = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2, 0.2), windowMat);
          window.position.set(-w/2 + 3 + i * 4, h * 0.2, d/2 + 0.1);
          group.add(window);
        }
      }
      return group;
    };

    // === GROUND ===
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(250, 250), sandMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    worldOctree.fromGraphNode(ground);

    // === A SITE (Mirage style - right side) ===
    // A site platform with stone texture
    const aSitePlatform = new THREE.Mesh(new THREE.BoxGeometry(25, 0.3, 25), tileMat);
    aSitePlatform.position.set(50, 0.15, 0);
    addMesh(aSitePlatform);

    // Triple box (classic A site default)
    const tripleBox1 = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 5), woodMat);
    tripleBox1.position.set(52, 1.25, 2);
    addMesh(tripleBox1);
    const tripleBox2 = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 3), woodMat);
    tripleBox2.position.set(49, 1.25, 0);
    addMesh(tripleBox2);
    const tripleBox3 = new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 2), woodMat);
    tripleBox3.position.set(52, 0.75, -3);
    addMesh(tripleBox3);

    // Ninja box
    const ninjaBox = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2, 2.5), woodMat);
    ninjaBox.position.set(45, 1, 8);
    addMesh(ninjaBox);

    // A site back wall (Ticket booth)
    const ticketBooth = createBuilding(12, 6, 8, wallMat);
    ticketBooth.position.set(58, 3, -8);
    scene.add(ticketBooth);
    const ticketMesh = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 8), wallMat);
    ticketMesh.position.set(58, 3, -8);
    worldOctree.fromGraphNode(ticketMesh);

    // === RAMP (A Ramp) ===
    const aRamp = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 15), tileMat);
    aRamp.position.set(40, 0.25, -15);
    aRamp.rotation.x = -0.08;
    addMesh(aRamp);

    // Ramp side walls
    const rampWall1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 15), wallMat);
    rampWall1.position.set(44, 2, -15);
    addMesh(rampWall1);
    const rampWall2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 15), wallMat);
    rampWall2.position.set(36, 2, -15);
    addMesh(rampWall2);

    // === PALACE ===
    const palace = createBuilding(20, 10, 15, wallMat);
    palace.position.set(55, 5, -40);
    scene.add(palace);
    const palaceMesh = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 15), wallMat);
    palaceMesh.position.set(55, 5, -40);
    worldOctree.fromGraphNode(palaceMesh);

    // Palace arch entrance
    const palaceArch = new THREE.Mesh(new THREE.BoxGeometry(6, 8, 2), darkWallMat);
    palaceArch.position.set(45, 4, -35);
    addMesh(palaceArch);

    // === MID ===
    // Mid boxes (window peek spot)
    const midBox1 = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), woodMat);
    midBox1.position.set(0, 1.5, 0);
    addMesh(midBox1);
    const midBox2 = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), woodMat);
    midBox2.position.set(-4, 1, 3);
    addMesh(midBox2);

    // Connector building (mid to A)
    const connector = createBuilding(10, 7, 20, wallMat);
    connector.position.set(20, 3.5, -10);
    scene.add(connector);
    const connectorMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 7, 20), wallMat);
    connectorMesh.position.set(20, 3.5, -10);
    worldOctree.fromGraphNode(connectorMesh);

    // === CATWALK (A to Jungle) ===
    const catwalk = new THREE.Mesh(new THREE.BoxGeometry(20, 0.3, 4), woodMat);
    catwalk.position.set(35, 2.5, 15);
    addMesh(catwalk);
    // Catwalk railing
    const catwalkRail = new THREE.Mesh(new THREE.BoxGeometry(20, 1, 0.1), metalMat);
    catwalkRail.position.set(35, 3.2, 17);
    addMesh(catwalkRail);

    // Stairs up to catwalk
    for (let i = 0; i < 5; i++) {
      const stair = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 1), tileMat);
      stair.position.set(25, 0.5 + i * 0.5, 15 + i * 0.8);
      addMesh(stair);
    }

    // === B SITE (left side) ===
    // B site platform
    const bSitePlatform = new THREE.Mesh(new THREE.BoxGeometry(22, 0.3, 28), tileMat);
    bSitePlatform.position.set(-50, 0.15, 0);
    addMesh(bSitePlatform);

    // B site boxes
    const bBox1 = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 3), woodMat);
    bBox1.position.set(-52, 1.5, 5);
    addMesh(bBox1);
    const bBox2 = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 4), woodMat);
    bBox2.position.set(-48, 1, -8);
    addMesh(bBox2);

    // Van (B site iconic)
    const vanBody = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 3), concreteMat);
    vanBody.position.set(-55, 2, 0);
    addMesh(vanBody);
    const vanCab = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), concreteMat);
    vanCab.position.set(-55, 1.5, 3);
    addMesh(vanCab);

    // === B APARTMENTS ===
    const bApps = createBuilding(18, 12, 12, wallMat);
    bApps.position.set(-55, 6, 40);
    scene.add(bApps);
    const bAppsMesh = new THREE.Mesh(new THREE.BoxGeometry(18, 12, 12), wallMat);
    bAppsMesh.position.set(-55, 6, 40);
    worldOctree.fromGraphNode(bAppsMesh);

    // Apartments balcony
    const appsBalcony = new THREE.Mesh(new THREE.BoxGeometry(12, 0.3, 4), tileMat);
    appsBalcony.position.set(-46, 4, 36);
    addMesh(appsBalcony);
    // Balcony railing
    const balconyRail = new THREE.Mesh(new THREE.BoxGeometry(12, 1.2, 0.1), metalMat);
    balconyRail.position.set(-46, 4.75, 34);
    addMesh(balconyRail);

    // === MARKET/KITCHEN ===
    const market = createBuilding(15, 6, 10, wallMat);
    market.position.set(-30, 3, -35);
    scene.add(market);
    const marketMesh = new THREE.Mesh(new THREE.BoxGeometry(15, 6, 10), wallMat);
    marketMesh.position.set(-30, 3, -35);
    worldOctree.fromGraphNode(marketMesh);

    // === UNDERPASS ===
    const underpassCeiling = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 15), concreteMat);
    underpassCeiling.position.set(-15, 4, -15);
    addMesh(underpassCeiling);
    const underpassWall1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 15), wallMat);
    underpassWall1.position.set(-11, 2, -15);
    addMesh(underpassWall1);
    const underpassWall2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 15), wallMat);
    underpassWall2.position.set(-19, 2, -15);
    addMesh(underpassWall2);

    // === T SPAWN ===
    const tSpawn = createBuilding(25, 10, 15, wallMat);
    tSpawn.position.set(0, 5, -80);
    scene.add(tSpawn);
    const tSpawnMesh = new THREE.Mesh(new THREE.BoxGeometry(25, 10, 15), wallMat);
    tSpawnMesh.position.set(0, 5, -80);
    worldOctree.fromGraphNode(tSpawnMesh);

    // T spawn side buildings
    const tSpawnLeft = createBuilding(12, 8, 10, darkWallMat);
    tSpawnLeft.position.set(-20, 4, -70);
    scene.add(tSpawnLeft);
    const tSpawnLeftMesh = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 10), darkWallMat);
    tSpawnLeftMesh.position.set(-20, 4, -70);
    worldOctree.fromGraphNode(tSpawnLeftMesh);

    // === CT SPAWN ===
    const ctSpawn = createBuilding(20, 8, 12, wallMat);
    ctSpawn.position.set(0, 4, 80);
    scene.add(ctSpawn);
    const ctSpawnMesh = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 12), wallMat);
    ctSpawnMesh.position.set(0, 4, 80);
    worldOctree.fromGraphNode(ctSpawnMesh);

    // === BOUNDARY WALLS (styled) ===
    const boundaryHeight = 18;
    const boundaryWalls = [
      { pos: [0, boundaryHeight/2, -120], size: [250, boundaryHeight, 3] },
      { pos: [0, boundaryHeight/2, 120], size: [250, boundaryHeight, 3] },
      { pos: [-120, boundaryHeight/2, 0], size: [3, boundaryHeight, 250] },
      { pos: [120, boundaryHeight/2, 0], size: [3, boundaryHeight, 250] },
    ];
    boundaryWalls.forEach(w => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w.size[0], w.size[1], w.size[2]), darkWallMat);
      wall.position.set(w.pos[0], w.pos[1], w.pos[2]);
      addMesh(wall);
    });

    // === SCATTERED COVER ===
    const coverSpots = [
      { pos: [15, 1, 35], size: [3, 2, 2] },
      { pos: [-15, 1, -25], size: [2.5, 1.8, 2.5] },
      { pos: [30, 1, -50], size: [3, 2.5, 3] },
      { pos: [-35, 1, 50], size: [2, 1.5, 3] },
      { pos: [70, 1, 25], size: [2.5, 2, 2.5] },
      { pos: [-70, 1, -25], size: [3, 2, 2] },
      { pos: [10, 1, 60], size: [2, 1.8, 2] },
      { pos: [-10, 1, -60], size: [2.5, 2, 2.5] },
    ];
    coverSpots.forEach(c => {
      const cover = new THREE.Mesh(new THREE.BoxGeometry(c.size[0], c.size[1], c.size[2]), woodMat);
      cover.position.set(c.pos[0], c.pos[1], c.pos[2]);
      addMesh(cover);
    });

    // === BARRELS & PROPS ===
    const barrelSpots = [
      [38, 1, 12], [-38, 1, -12], [8, 1, 45], [-8, 1, -45],
      [60, 1, -15], [-60, 1, 15], [25, 1, 30], [-25, 1, -30],
    ];
    barrelSpots.forEach(pos => {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.8, 0.8, 1.8, 12),
        new THREE.MeshStandardMaterial({ color: 0x3a5a4a, roughness: 0.7 })
      );
      barrel.position.set(pos[0], pos[1], pos[2]);
      addMesh(barrel);
    });

    // === FIRST PERSON AWP WEAPON ===
    const fpWeapon = new THREE.Group();
    
    // AWP body
    const fpBarrel = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.8, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x2d4a3e, roughness: 0.3 })
    );
    fpBarrel.position.set(0, 0, -0.4);
    fpWeapon.add(fpBarrel);
    
    // AWP receiver
    const fpReceiver = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.15, 0.25),
      new THREE.MeshStandardMaterial({ color: 0x2d4a3e, roughness: 0.4 })
    );
    fpReceiver.position.set(0, -0.05, 0);
    fpWeapon.add(fpReceiver);
    
    // Scope
    const fpScope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.03, 0.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.2 })
    );
    fpScope.rotation.x = Math.PI / 2;
    fpScope.position.set(0, 0.08, -0.1);
    fpWeapon.add(fpScope);
    
    // Scope rings
    const scopeRing1 = new THREE.Mesh(
      new THREE.TorusGeometry(0.035, 0.008, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9 })
    );
    scopeRing1.rotation.y = Math.PI / 2;
    scopeRing1.position.set(0, 0.08, -0.05);
    fpWeapon.add(scopeRing1);
    
    const scopeRing2 = new THREE.Mesh(
      new THREE.TorusGeometry(0.035, 0.008, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9 })
    );
    scopeRing2.rotation.y = Math.PI / 2;
    scopeRing2.position.set(0, 0.08, -0.15);
    fpWeapon.add(scopeRing2);
    
    // Stock
    const fpStock = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.12, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x2d4a3e, roughness: 0.5 })
    );
    fpStock.position.set(0, -0.02, 0.2);
    fpWeapon.add(fpStock);
    
    // Magazine
    const fpMag = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.12, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 })
    );
    fpMag.position.set(0, -0.12, 0.05);
    fpWeapon.add(fpMag);
    
    // Bolt
    const fpBolt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.08, 8),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9, roughness: 0.1 })
    );
    fpBolt.rotation.z = Math.PI / 2;
    fpBolt.position.set(0.04, 0.02, -0.05);
    fpWeapon.add(fpBolt);
    
    // Position weapon in view
    fpWeapon.position.set(0.25, -0.2, -0.5);
    fpWeapon.rotation.set(0, 0, 0);
    camera.add(fpWeapon);
    scene.add(camera);

    // Player capsule collision
    const playerCapsule = new Capsule(
      new THREE.Vector3(0, 0.35, 0),
      new THREE.Vector3(0, 1.8, 0),
      0.35
    );

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
    const socketRef = { current: null as Socket | null };
    const remotePlayers: Map<string, any> = new Map();

    const initSocket = () => {
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
      const socket = io(serverUrl);
      socketRef.current = socket;

      socket.emit('fpsJoin', { name: playerName });

      socket.on('fpsPlayers', (players: any) => {
        Object.entries(players).forEach(([id, playerData]: [string, any]) => {
          if (id !== socket.id && !remotePlayers.has(id)) {
            const soldierModel = createSoldierModel();
            soldierModel.castShadow = true;
            scene.add(soldierModel);

            // Create nameplate
            const { div: nameplateDiv, healthFill } = createNameplate(playerData.name || 'Player', 100);
            const nameplate = new CSS2DObject(nameplateDiv);
            nameplate.position.y = 2.2;
            soldierModel.add(nameplate);

            remotePlayers.set(id, {
              mesh: soldierModel,
              nameplate: nameplate,
              healthFill: healthFill,
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

          // Create nameplate
          const { div: nameplateDiv, healthFill } = createNameplate(player.name || 'Player', 100);
          const nameplate = new CSS2DObject(nameplateDiv);
          nameplate.position.y = 2.2;
          soldierModel.add(nameplate);

          remotePlayers.set(id, {
            mesh: soldierModel,
            nameplate: nameplate,
            healthFill: healthFill,
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

              // Create nameplate
              const { div: nameplateDiv, healthFill } = createNameplate(playerData.name || 'Player', 100);
              const nameplate = new CSS2DObject(nameplateDiv);
              nameplate.position.y = 2.2;
              soldierModel.add(nameplate);

              player = {
                mesh: soldierModel,
                nameplate: nameplate,
                healthFill: healthFill,
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

      socket.on('fpsShot', ({ id, position, direction }: any) => {
        const rocket = rockets.find((r: any) => !r.alive);
        if (rocket) {
          rocket.mesh.position.set(...position);
          rocket.velocity.set(...direction).multiplyScalar(100);
          rocket.alive = true;
          rocket.mesh.visible = true;
          rocket.collider.center.copy(rocket.mesh.position);
          rocket.ownerId = id; // Track who shot this rocket

          const dir = new THREE.Vector3(...direction);
          const targetPos = rocket.mesh.position.clone().add(dir);
          rocket.mesh.lookAt(targetPos);
          rocket.mesh.rotateX(Math.PI / 2);
        }
      });

      socket.on('fpsHit', ({ damage, victim }: any) => {
        setHealth((prev) => Math.max(0, prev - damage));
        
        // Update remote player health bar if we hit someone
        if (victim) {
          const player = remotePlayers.get(victim);
          if (player) {
            player.health = Math.max(0, player.health - damage);
            player.healthFill.style.width = `${player.health}%`;
            player.healthFill.style.background = player.health > 50 ? '#4ade80' : player.health > 25 ? '#fbbf24' : '#ef4444';
          }
        }
      });

      socket.on('fpsKill', ({ killer, victim }: any) => {
        if (victim === socket.id) {
          setDeaths((prev) => prev + 1);
          setHealth(100);
          playerCapsule.start.set(
            Math.random() * 40 - 20,
            0.35,
            Math.random() * 40 - 20
          );
          playerCapsule.end.set(
            playerCapsule.start.x,
            1.8,
            playerCapsule.start.z
          );
          playerVelocity.set(0, 0, 0);
        }
        if (killer === socket.id) {
          setKills((prev) => prev + 1);
        }
        
        // Reset killed player's health bar
        const killedPlayer = remotePlayers.get(victim);
        if (killedPlayer) {
          killedPlayer.health = 100;
          killedPlayer.healthFill.style.width = '100%';
          killedPlayer.healthFill.style.background = '#4ade80';
        }
      });
    };

    initSocket();

    // Shoot function
    const shootRocket = () => {
      const rocket = rockets[currentRocketIndex];
      
      camera.getWorldDirection(playerDirection);
      
      rocket.mesh.position.copy(camera.position);
      rocket.mesh.position.add(playerDirection.clone().multiplyScalar(2));
      rocket.velocity.copy(playerDirection).multiplyScalar(100);
      rocket.alive = true;
      rocket.mesh.visible = true;
      rocket.collider.center.copy(rocket.mesh.position);
      rocket.ownerId = socketRef.current?.id || null; // Track who shot this rocket
      
      const targetPos = rocket.mesh.position.clone().add(playerDirection);
      rocket.mesh.lookAt(targetPos);
      rocket.mesh.rotateX(Math.PI / 2);
      
      currentRocketIndex = (currentRocketIndex + 1) % maxRockets;

      if (socketRef.current) {
        socketRef.current.emit('fpsShoot', {
          position: [camera.position.x, camera.position.y, camera.position.z],
          direction: [playerDirection.x, playerDirection.y, playerDirection.z],
        });
      }
    };

    document.addEventListener('mousedown', () => {
      if (document.pointerLockElement === document.body) {
        shootRocket();
      }
    });

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
      const speedDelta = deltaTime * 50;

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
        playerVelocity.y = 15;
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
      if (camera.position.y <= -25) {
        playerCapsule.start.set(0, 0.35, 0);
        playerCapsule.end.set(0, 1.8, 0);
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
                damage: 20,
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

    const updateRemotePlayers = () => {
      remotePlayers.forEach((player: any) => {
        player.mesh.position.copy(player.position);
        player.mesh.rotation.y = player.rotation;
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
  }, [gameStarted, playerName]);

  if (!gameStarted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="bg-black/50 backdrop-blur-xl rounded-3xl p-12 border border-white/10 max-w-md w-full mx-4">
          <h1 className="text-5xl font-bold text-center mb-8 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            FPS Arena
          </h1>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name"
            className="w-full px-6 py-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 mb-6 focus:outline-none focus:border-purple-500"
            onKeyDown={(e) => e.key === 'Enter' && playerName && setGameStarted(true)}
          />
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
      
      <div className="absolute top-6 left-6 bg-black/50 backdrop-blur-sm rounded-lg p-4 text-white space-y-2">
        <div>Health: {health}</div>
        <div>Kills: {kills}</div>
        <div>Deaths: {deaths}</div>
      </div>

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="relative w-6 h-6">
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-white/70 -translate-y-1/2" />
          <div className="absolute left-1/2 top-0 w-0.5 h-full bg-white/70 -translate-x-1/2" />
        </div>
      </div>

      <div className="absolute bottom-6 left-6 bg-black/50 backdrop-blur-sm rounded-lg p-4 text-white text-sm">
        <div>WASD - Move</div>
        <div>Mouse - Look</div>
        <div>Click - Shoot AWP</div>
        <div>Space - Jump</div>
        <div>Click screen to lock pointer</div>
      </div>
    </div>
  );
}
