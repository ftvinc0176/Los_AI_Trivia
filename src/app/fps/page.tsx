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
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 });

    // Helper to add mesh with collision
    const addMesh = (mesh: THREE.Mesh) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      worldOctree.fromGraphNode(mesh);
    };

    // Helper to add wall segment
    const addWall = (x: number, z: number, w: number, d: number, h = 5) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      wall.position.set(x, h/2, z);
      addMesh(wall);
    };

    // Helper to add floor section
    const addFloor = (x: number, z: number, w: number, d: number, y = 0) => {
      const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), tileMat);
      floor.position.set(x, y + 0.15, z);
      addMesh(floor);
    };

    // Helper to add roof/ceiling
    const addRoof = (x: number, z: number, w: number, d: number, y: number) => {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), roofMat);
      roof.position.set(x, y, z);
      addMesh(roof);
    };

    // === BASE GROUND (only outside areas) ===
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), sandMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    worldOctree.fromGraphNode(ground);

    // ============================================
    // MIRAGE MAP LAYOUT (Based on actual CS2 map)
    // Coordinate system: +X = right (A), -X = left (B), +Z = CT, -Z = T
    // ============================================

    // === T SPAWN AREA (bottom of map, -Z) ===
    // T Spawn open area with surrounding walls
    addWall(-40, -85, 1, 30, 6); // Left boundary
    addWall(40, -85, 1, 30, 6);  // Right boundary
    addWall(0, -100, 82, 1, 6); // Back wall
    addFloor(0, -85, 80, 30);

    // === T APARTMENTS / T RAMP (path to B) ===
    // Left corridor from T spawn to B apartments
    addWall(-35, -60, 1, 20, 5);
    addWall(-50, -60, 1, 20, 5);
    addFloor(-42.5, -60, 14, 20);
    addRoof(-42.5, -60, 14, 20, 5);

    // T Apartments interior hallway
    addWall(-55, -45, 10, 1, 5);
    addWall(-55, -30, 10, 1, 5);
    addWall(-60, -37.5, 1, 16, 5);
    addFloor(-55, -37.5, 10, 15);
    addRoof(-55, -37.5, 10, 15, 5);

    // === B APARTMENTS (walkable building leading to B) ===
    // Long corridor
    addWall(-65, -15, 1, 30, 5);
    addWall(-50, -15, 1, 30, 5);
    addFloor(-57.5, -15, 14, 30);
    addRoof(-57.5, -15, 14, 30, 5);
    
    // B Apps drop down area
    addWall(-70, 5, 10, 1, 5);
    addWall(-65, 10, 1, 10, 5);
    addFloor(-67.5, 10, 6, 10);
    addRoof(-67.5, 10, 6, 10, 5);

    // === B SITE ===
    // B site is an enclosed courtyard
    addFloor(-55, 25, 30, 30);
    
    // B site walls forming the area
    addWall(-70, 10, 1, 30, 6);  // Far left
    addWall(-70, 35, 30, 1, 6);  // Back wall
    addWall(-40, 25, 1, 20, 6);  // Right side (partial)
    
    // B Bench (box)
    const bBench = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 3), woodMat);
    bBench.position.set(-55, 1, 30);
    addMesh(bBench);
    
    // B Van
    const van = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 8), concreteMat);
    van.position.set(-60, 1.5, 20);
    addMesh(van);

    // === B SHORT (Apartments exit to B) ===
    addWall(-45, 0, 10, 1, 5);
    addWall(-45, -8, 10, 1, 5);
    addWall(-40, -4, 1, 9, 5);
    addFloor(-45, -4, 10, 8);
    addRoof(-45, -4, 10, 8, 5);

    // === MARKET / KITCHEN (B side of mid) ===
    // Enclosed building you walk through
    addWall(-35, -25, 1, 20, 5);
    addWall(-20, -25, 1, 20, 5);
    addWall(-27.5, -35, 16, 1, 5);
    addFloor(-27.5, -25, 14, 20);
    addRoof(-27.5, -25, 14, 20, 5);
    
    // Market interior boxes
    const marketBox1 = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), woodMat);
    marketBox1.position.set(-30, 1, -28);
    addMesh(marketBox1);
    const marketBox2 = new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 2), woodMat);
    marketBox2.position.set(-24, 0.75, -22);
    addMesh(marketBox2);

    // === MID (Central corridor) ===
    // Mid is a long corridor connecting T to CT
    addWall(-18, -30, 1, 40, 5);  // Left side of mid
    addWall(18, -30, 1, 40, 5);   // Right side of mid
    addFloor(0, -30, 35, 40);
    
    // Mid boxes for cover
    const midBox1 = new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 4), woodMat);
    midBox1.position.set(0, 1.25, -25);
    addMesh(midBox1);
    const midBox2 = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), woodMat);
    midBox2.position.set(-8, 1, -35);
    addMesh(midBox2);

    // === WINDOW ROOM (overlooks mid) ===
    // Elevated room with window to mid
    addWall(25, -25, 14, 1, 5);
    addWall(25, -15, 14, 1, 5);
    addWall(32, -20, 1, 11, 5);
    addFloor(25, -20, 14, 10, 2);  // Elevated
    addRoof(25, -20, 14, 10, 7);
    
    // Stairs up to window
    for (let i = 0; i < 4; i++) {
      const stair = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 1.5), tileMat);
      stair.position.set(19, 0.5 + i * 0.5, -18 + i * 1.2);
      addMesh(stair);
    }

    // === UNDERPASS (below window) ===
    // Tunnel under window room
    addWall(25, -5, 1, 10, 2);
    addWall(32, -5, 1, 10, 2);
    addFloor(28.5, -5, 6, 10);
    addRoof(28.5, -5, 6, 10, 2);

    // === CONNECTOR / JUNGLE (Mid to A) ===
    // Corridor from mid to A site
    addWall(18, 0, 1, 20, 5);
    addWall(35, 0, 1, 20, 5);
    addFloor(26.5, 0, 16, 20);
    addRoof(26.5, 0, 16, 20, 5);
    
    // Connector boxes
    const connectorBox = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), woodMat);
    connectorBox.position.set(25, 1, 5);
    addMesh(connectorBox);

    // === A RAMP (T to A site) ===
    // Corridor with ramp leading up to A
    addWall(40, -40, 1, 30, 5);
    addWall(55, -40, 1, 30, 5);
    addFloor(47.5, -40, 14, 30);
    addRoof(47.5, -40, 14, 30, 5);
    
    // Actual ramp incline
    const aRamp = new THREE.Mesh(new THREE.BoxGeometry(12, 0.4, 15), tileMat);
    aRamp.position.set(47.5, 0.7, -30);
    aRamp.rotation.x = -0.12;
    addMesh(aRamp);

    // === PALACE (Top right, leads to A) ===
    // Palace interior rooms
    addWall(60, -55, 1, 20, 5);
    addWall(75, -55, 1, 20, 5);
    addWall(67.5, -65, 16, 1, 5);
    addFloor(67.5, -55, 14, 20);
    addRoof(67.5, -55, 14, 20, 5);
    
    // Palace second room
    addWall(60, -40, 1, 10, 5);
    addWall(75, -40, 1, 10, 5);
    addFloor(67.5, -40, 14, 10);
    addRoof(67.5, -40, 14, 10, 5);

    // === A SITE ===
    // Open bombsite with surrounding structures
    addFloor(55, -10, 40, 40);
    
    // A site surrounding walls (with gaps for entries)
    addWall(75, -10, 1, 40, 6);   // Far right wall
    addWall(55, 10, 40, 1, 6);    // Back wall (CT side)
    addWall(35, -5, 1, 30, 6);    // Left wall (partial, connector side)
    
    // Default boxes (triple stack)
    const aDefault1 = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 5), woodMat);
    aDefault1.position.set(55, 1.5, -5);
    addMesh(aDefault1);
    const aDefault2 = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 3), woodMat);
    aDefault2.position.set(52, 1.25, -8);
    addMesh(aDefault2);
    
    // Ninja corner
    const ninja = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2, 2.5), woodMat);
    ninja.position.set(72, 1, 5);
    addMesh(ninja);
    
    // Tetris boxes
    const tetris1 = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), woodMat);
    tetris1.position.set(45, 1, 0);
    addMesh(tetris1);
    const tetris2 = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), woodMat);
    tetris2.position.set(43, 1.5, -3);
    addMesh(tetris2);

    // === STAIRS (A site to CT) ===
    // Stairs connecting A to CT spawn
    for (let i = 0; i < 6; i++) {
      const stair = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 1.5), tileMat);
      stair.position.set(60, 0.2 + i * 0.4, 12 + i * 1.5);
      addMesh(stair);
    }

    // === CT SPAWN ===
    // Open area behind A site
    addFloor(50, 35, 50, 30);
    
    // CT Spawn walls
    addWall(75, 35, 1, 30, 6);
    addWall(50, 50, 50, 1, 6);
    addWall(25, 35, 1, 30, 6);
    
    // CT boxes
    const ctBox1 = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), woodMat);
    ctBox1.position.set(60, 1, 40);
    addMesh(ctBox1);
    const ctBox2 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.5, 2.5), woodMat);
    ctBox2.position.set(40, 0.75, 35);
    addMesh(ctBox2);

    // === TICKET BOOTH / SANDWICH ===
    // Small room between CT and A
    addWall(40, 15, 10, 1, 5);
    addWall(40, 25, 10, 1, 5);
    addWall(35, 20, 1, 11, 5);
    addFloor(40, 20, 10, 10);
    addRoof(40, 20, 10, 10, 5);

    // === JUNGLE (covered area near A) ===
    addWall(35, 5, 1, 10, 4);
    addRoof(38, 5, 7, 10, 4);

    // === BOUNDARY WALLS (outer map limits) ===
    addWall(-80, 0, 1, 200, 10);  // Far left
    addWall(85, 0, 1, 200, 10);   // Far right
    addWall(0, -110, 170, 1, 10); // Far back (T)
    addWall(0, 60, 170, 1, 10);   // Far front (CT)

    // === BARRELS scattered around ===
    const barrels = [
      [-50, 1, -5], [-25, 1, -40], [10, 1, -45], [35, 1, -50],
      [65, 1, 25], [30, 1, 30], [-55, 1, 25], [50, 1, -25],
    ];
    barrels.forEach(pos => {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.7, 1.6, 10),
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
