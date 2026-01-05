'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';

export default function FPSArena() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [gameStarted, setGameStarted] = useState(false);
  const [health, setHealth] = useState(100);
  const [ammo, setAmmo] = useState(30);
  const [kills, setKills] = useState(0);
  const [deaths, setDeaths] = useState(0);
  const router = useRouter();

  useEffect(() => {
    if (!gameStarted || !containerRef.current) return;

    // Three.js setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 0, 200);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = 1.6; // Eye level

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 50, 50);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x228b22 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Arena walls
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 });
    const createWall = (x: number, z: number, width: number, depth: number) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(width, 3, depth), wallMaterial);
      wall.position.set(x, 1.5, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      scene.add(wall);
    };
    createWall(0, 50, 100, 2); // North
    createWall(0, -50, 100, 2); // South
    createWall(50, 0, 2, 100); // East
    createWall(-50, 0, 2, 100); // West

    // Cover objects
    for (let i = 0; i < 10; i++) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(2, 2, 2),
        new THREE.MeshStandardMaterial({ color: 0x8b4513 })
      );
      box.position.set(
        Math.random() * 80 - 40,
        1,
        Math.random() * 80 - 40
      );
      box.castShadow = true;
      scene.add(box);
    }

    // Player state
    const playerVelocity = new THREE.Vector3();
    const playerDirection = new THREE.Vector3();
    const keys: { [key: string]: boolean } = {};
    let mouseX = 0, mouseY = 0;
    const playerSpeed = 10;
    const rotationSpeed = 0.002;

    // Remote players
    const remotePlayers: { [id: string]: THREE.Mesh } = {};

    // Bullets
    const bullets: Array<{ mesh: THREE.Mesh; velocity: THREE.Vector3; owner: string }> = [];

    // Crosshair
    const crosshair = document.createElement('div');
    crosshair.style.cssText = 'position:fixed;top:50%;left:50%;width:4px;height:4px;background:white;transform:translate(-50%,-50%);pointer-events:none;z-index:1000;border-radius:50%;box-shadow:0 0 2px black';
    document.body.appendChild(crosshair);

    // Controls
    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = true;
      if (e.key === ' ' && !e.repeat) shoot();
    };
    const onKeyUp = (e: KeyboardEvent) => keys[e.key.toLowerCase()] = false;
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement) {
        mouseX -= e.movementX * rotationSpeed;
        mouseY -= e.movementY * rotationSpeed;
        mouseY = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, mouseY));
      }
    };
    const onClick = () => {
      if (!document.pointerLockElement) {
        renderer.domElement.requestPointerLock();
      } else {
        shoot();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('click', onClick);

    // Shoot function
    const shoot = () => {
      if (ammo <= 0) return;
      setAmmo(prev => prev - 1);

      const bulletGeometry = new THREE.SphereGeometry(0.1);
      const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
      
      bullet.position.copy(camera.position);
      scene.add(bullet);

      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      
      bullets.push({
        mesh: bullet,
        velocity: direction.multiplyScalar(50),
        owner: socket?.id || ''
      });

      socket?.emit('fpsShoot', { position: camera.position.toArray(), direction: direction.toArray() });
    };

    // Socket events
    if (socket) {
      socket.emit('fpsJoin', { name: playerName });

      socket.on('fpsPlayerJoined', ({ id, name, position }) => {
        if (id === socket.id) return;
        const playerMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 1.8, 0.6),
          new THREE.MeshStandardMaterial({ color: 0xff0000 })
        );
        playerMesh.position.fromArray(position);
        scene.add(playerMesh);
        remotePlayers[id] = playerMesh;
      });

      socket.on('fpsPlayerMoved', ({ id, position, rotation }) => {
        if (remotePlayers[id]) {
          remotePlayers[id].position.fromArray(position);
          remotePlayers[id].rotation.y = rotation;
        }
      });

      socket.on('fpsPlayerLeft', ({ id }) => {
        if (remotePlayers[id]) {
          scene.remove(remotePlayers[id]);
          delete remotePlayers[id];
        }
      });

      socket.on('fpsShot', ({ id, position, direction }) => {
        if (id === socket.id) return;
        const bulletGeometry = new THREE.SphereGeometry(0.1);
        const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
        bullet.position.fromArray(position);
        scene.add(bullet);

        const vel = new THREE.Vector3().fromArray(direction).multiplyScalar(50);
        bullets.push({ mesh: bullet, velocity: vel, owner: id });
      });

      socket.on('fpsHit', ({ damage }) => {
        setHealth(prev => Math.max(0, prev - damage));
      });

      socket.on('fpsKill', ({ killer, victim }) => {
        if (killer === socket.id) setKills(prev => prev + 1);
        if (victim === socket.id) {
          setDeaths(prev => prev + 1);
          setHealth(100);
          camera.position.set(0, 1.6, 0);
        }
      });
    }

    // Animation loop
    const clock = new THREE.Clock();
    const animate = () => {
      const delta = clock.getDelta();

      // Camera rotation
      camera.rotation.order = 'YXZ';
      camera.rotation.y = mouseX;
      camera.rotation.x = mouseY;

      // Movement
      playerVelocity.set(0, 0, 0);
      if (keys['w']) playerVelocity.z -= 1;
      if (keys['s']) playerVelocity.z += 1;
      if (keys['a']) playerVelocity.x -= 1;
      if (keys['d']) playerVelocity.x += 1;

      if (playerVelocity.length() > 0) {
        playerVelocity.normalize().multiplyScalar(playerSpeed * delta);
        playerVelocity.applyEuler(new THREE.Euler(0, mouseX, 0, 'YXZ'));
        camera.position.add(playerVelocity);

        // Boundary check
        camera.position.x = Math.max(-48, Math.min(48, camera.position.x));
        camera.position.z = Math.max(-48, Math.min(48, camera.position.z));

        socket?.emit('fpsMove', { 
          position: camera.position.toArray(),
          rotation: mouseX
        });
      }

      // Update bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.mesh.position.add(bullet.velocity.clone().multiplyScalar(delta));

        // Check collision with players
        Object.entries(remotePlayers).forEach(([id, player]) => {
          if (bullet.owner === socket?.id && bullet.mesh.position.distanceTo(player.position) < 1) {
            scene.remove(bullet.mesh);
            bullets.splice(i, 1);
            socket?.emit('fpsHit', { victim: id, damage: 20 });
          }
        });

        // Remove if out of bounds or too old
        if (bullet.mesh.position.length() > 100) {
          scene.remove(bullet.mesh);
          bullets.splice(i, 1);
        }
      }

      // Ammo regen
      if (ammo < 30 && Math.random() < 0.01) setAmmo(prev => prev + 1);

      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    // Cleanup
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('click', onClick);
      document.exitPointerLock();
      crosshair.remove();
      renderer.domElement.remove();
      socket?.emit('fpsLeave');
    };
  }, [gameStarted, socket, playerName, ammo]);

  useEffect(() => {
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';
    const newSocket = io(serverUrl);
    setSocket(newSocket);
    return () => { newSocket.close(); };
  }, []);

  if (!gameStarted) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full">
          <h1 className="text-4xl font-bold text-center mb-6" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            FPS Arena
          </h1>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name"
            className="w-full px-4 py-3 border-2 border-purple-200 rounded-xl mb-4 focus:border-purple-500 focus:outline-none"
          />
          <button
            onClick={() => playerName.trim() && setGameStarted(true)}
            disabled={!playerName.trim()}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-bold disabled:opacity-50"
          >
            Join Arena
          </button>
          <button
            onClick={() => router.push('/games')}
            className="w-full mt-3 py-3 bg-gray-200 text-gray-700 rounded-xl font-bold"
          >
            Back to Games
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div ref={containerRef} className="w-full h-screen" />
      <div className="fixed top-4 left-4 bg-black/70 text-white p-4 rounded-lg">
        <div>Health: {health}</div>
        <div>Ammo: {ammo}/30</div>
        <div>Kills: {kills}</div>
        <div>Deaths: {deaths}</div>
        <div className="mt-2 text-xs">WASD - Move | Mouse - Look | Click/Space - Shoot</div>
      </div>
    </>
  );
}
