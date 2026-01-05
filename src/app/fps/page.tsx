'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';
import { Octree } from 'three/examples/jsm/math/Octree.js';

export default function FPSArena() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [playerName, setPlayerName] = useState('');
  const [gameStarted, setGameStarted] = useState(false);
  const [health, setHealth] = useState(100);
  const [kills, setKills] = useState(0);
  const [deaths, setDeaths] = useState(0);

  useEffect(() => {
    if (!gameStarted || !containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x88ccff);
    scene.fog = new THREE.Fog(0x88ccff, 0, 500);

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

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(-25, 25, -25);
    dirLight.castShadow = true;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 500;
    dirLight.shadow.camera.right = 150;
    dirLight.shadow.camera.left = -150;
    dirLight.shadow.camera.top = 150;
    dirLight.shadow.camera.bottom = -150;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.radius = 4;
    dirLight.shadow.bias = -0.00006;
    scene.add(dirLight);

    // World octree for collision
    const worldOctree = new Octree();

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x3a8a3a });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    worldOctree.fromGraphNode(ground);

    // Walls
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 });
    
    const wall1 = new THREE.Mesh(new THREE.BoxGeometry(200, 20, 5), wallMaterial);
    wall1.position.set(0, 10, -100);
    wall1.castShadow = true;
    wall1.receiveShadow = true;
    scene.add(wall1);
    worldOctree.fromGraphNode(wall1);

    const wall2 = new THREE.Mesh(new THREE.BoxGeometry(200, 20, 5), wallMaterial);
    wall2.position.set(0, 10, 100);
    wall2.castShadow = true;
    wall2.receiveShadow = true;
    scene.add(wall2);
    worldOctree.fromGraphNode(wall2);

    const wall3 = new THREE.Mesh(new THREE.BoxGeometry(5, 20, 200), wallMaterial);
    wall3.position.set(-100, 10, 0);
    wall3.castShadow = true;
    wall3.receiveShadow = true;
    scene.add(wall3);
    worldOctree.fromGraphNode(wall3);

    const wall4 = new THREE.Mesh(new THREE.BoxGeometry(5, 20, 200), wallMaterial);
    wall4.position.set(100, 10, 0);
    wall4.castShadow = true;
    wall4.receiveShadow = true;
    scene.add(wall4);
    worldOctree.fromGraphNode(wall4);

    // Cover obstacles
    const obstacles = [
      { pos: [0, 2.5, 0], size: [10, 5, 10] },
      { pos: [30, 2.5, 30], size: [8, 5, 8] },
      { pos: [-30, 2.5, -30], size: [8, 5, 8] },
      { pos: [30, 2.5, -30], size: [6, 5, 6] },
      { pos: [-30, 2.5, 30], size: [6, 5, 6] },
      { pos: [50, 2.5, 0], size: [10, 5, 5] },
      { pos: [-50, 2.5, 0], size: [10, 5, 5] },
      { pos: [0, 2.5, 50], size: [5, 5, 10] },
      { pos: [0, 2.5, -50], size: [5, 5, 10] },
    ];

    obstacles.forEach((obs) => {
      const obsMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(obs.size[0], obs.size[1], obs.size[2]),
        obsMaterial
      );
      box.position.set(obs.pos[0], obs.pos[1], obs.pos[2]);
      box.castShadow = true;
      box.receiveShadow = true;
      scene.add(box);
      worldOctree.fromGraphNode(box);
    });

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
            const geometry = new THREE.BoxGeometry(0.7, 1.8, 0.7);
            const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            scene.add(mesh);

            remotePlayers.set(id, {
              mesh: mesh,
              position: new THREE.Vector3(...playerData.position),
              rotation: playerData.rotation || 0,
            });
          }
        });
      });

      socket.on('fpsPlayerJoined', ({ id, player }: any) => {
        if (id !== socket.id && !remotePlayers.has(id)) {
          const geometry = new THREE.BoxGeometry(0.7, 1.8, 0.7);
          const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.castShadow = true;
          scene.add(mesh);

          remotePlayers.set(id, {
            mesh: mesh,
            position: new THREE.Vector3(...player.position),
            rotation: player.rotation || 0,
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
              const geometry = new THREE.BoxGeometry(0.7, 1.8, 0.7);
              const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
              const mesh = new THREE.Mesh(geometry, material);
              mesh.castShadow = true;
              scene.add(mesh);

              player = {
                mesh: mesh,
                position: new THREE.Vector3(...playerData.position),
                rotation: 0,
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

          const dir = new THREE.Vector3(...direction);
          const targetPos = rocket.mesh.position.clone().add(dir);
          rocket.mesh.lookAt(targetPos);
          rocket.mesh.rotateX(Math.PI / 2);
        }
      });

      socket.on('fpsHit', ({ damage }: any) => {
        setHealth((prev) => Math.max(0, prev - damage));
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

    document.addEventListener('keydown', (event) => {
      if (event.code === 'Space' && document.pointerLockElement === document.body) {
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
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
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
        <div>Click/Space - Shoot</div>
        <div>Click screen to lock pointer</div>
      </div>
    </div>
  );
}
