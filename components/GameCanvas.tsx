
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameStatus, Point, Stick, Bike, InputState, Entity } from '../types';
import { PHYSICS, COLORS, GAME_CONFIG } from '../constants';
import { HUD } from './HUD';

// Helper to create a point
const createPoint = (x: number, y: number, mass = 1, radius = 5, isWheel = false): Point => ({
  x, y, oldx: x, oldy: y, mass, radius, isWheel, pinned: false, rotation: 0
});

// Helper to create a stick
const createStick = (p1: Point, p2: Point, length: number | null, stiffness: number, visible = true, width = 2): Stick => ({
  p1, p2,
  length: length || Math.hypot(p2.x - p1.x, p2.y - p1.y),
  stiffness, visible, width
});

export const GameCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const accumulatorRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  
  // Mutable Game State
  const stateRef = useRef({
    points: [] as Point[],
    sticks: [] as Stick[],
    terrain: [] as {x: number, y: number}[],
    apples: [] as Entity[],
    killers: [] as Entity[],
    flower: { x: 0, y: 0, unlocked: false },
    bike: {} as Bike,
    keys: { up: false, down: false, left: false, right: false, space: false, enter: false } as InputState,
    status: GameStatus.MENU,
    camera: { x: 0, y: 0 }, // Smoothed camera
  });

  // React State for UI
  const [uiState, setUiState] = useState({
    apples: 0,
    totalApples: 0,
    time: 0,
    status: GameStatus.MENU
  });

  // --- INITIALIZATION ---

  const initLevel = (width: number, height: number, startStatus: GameStatus = GameStatus.PLAYING) => {
    const state = stateRef.current;
    state.points = [];
    state.sticks = [];
    state.terrain = [];
    state.apples = [];
    state.killers = [];
    state.keys = { up: false, down: false, left: false, right: false, space: false, enter: false };
    
    // 1. Generate Terrain
    let tX = 0;
    let tY = height - 200;
    state.terrain.push({x: tX, y: height + 2000}); // Deep Anchor
    state.terrain.push({x: tX, y: tY}); // Start

    // Procedural jagged terrain
    for(let i = 0; i < GAME_CONFIG.TERRAIN_SEGMENTS; i++) {
        tX += 80 + Math.random() * 100;
        
        // Randomize height but keep within bounds
        const variation = (Math.random() - 0.5) * 250;
        tY += variation;
        tY = Math.max(200, Math.min(height + 200, tY));

        // Flatten out periodically
        if (Math.random() > 0.8) tY = height - 200;

        state.terrain.push({x: tX, y: tY});
        
        // Apples
        if(Math.random() > 0.5) {
            state.apples.push({x: tX, y: tY - 120 - Math.random() * 50, collected: false});
        }
        // Killers (Spikes)
        if(i > 3 && Math.random() > 0.7) {
            state.killers.push({x: tX + 20, y: tY - 15, r: 15});
        }
    }
    state.terrain.push({x: tX + 500, y: height + 2000}); // Anchor End

    // Flower at end
    state.flower = { x: tX, y: tY - 100, unlocked: false };

    // 2. Build Bike
    const sx = 200;
    const sy = height - 400;
    
    const rw = createPoint(sx, sy, 1.5, 23, true);
    const fw = createPoint(sx + 85, sy, 1.5, 23, true);
    const body = createPoint(sx + 40, sy - 45, 2, 10); // Engine
    const handle = createPoint(sx + 60, sy - 70, 0.5, 5); // Handlebars
    const head = createPoint(sx + 20, sy - 95, 0.5, 12); // Head

    state.points.push(rw, fw, body, handle, head);
    state.bike = { rw, fw, body, handle, head };

    // Suspension (Springs)
    state.sticks.push(createStick(rw, body, null, PHYSICS.SUSPENSION_STIFFNESS));
    state.sticks.push(createStick(fw, handle, null, PHYSICS.SUSPENSION_STIFFNESS));

    // Rigid Body Frame
    state.sticks.push(createStick(rw, fw, null, PHYSICS.RIGID_STIFFNESS));
    state.sticks.push(createStick(body, handle, null, PHYSICS.RIGID_STIFFNESS));
    state.sticks.push(createStick(body, head, null, PHYSICS.RIGID_STIFFNESS)); // Neck

    // Structural Triangulation (Invisible)
    state.sticks.push(createStick(rw, handle, null, PHYSICS.RIGID_STIFFNESS, false));
    state.sticks.push(createStick(fw, body, null, PHYSICS.RIGID_STIFFNESS, false));
    state.sticks.push(createStick(rw, head, null, 0.5, false)); // Stabilizer
    state.sticks.push(createStick(handle, head, null, PHYSICS.RIGID_STIFFNESS, false));

    // Reset Times
    startTimeRef.current = Date.now();
    lastTimeRef.current = Date.now();
    accumulatorRef.current = 0;
    state.status = startStatus;
    
    // Reset Camera
    state.camera = { x: -sx + width/2, y: -sy + height/1.5 };

    setUiState({
      apples: 0,
      totalApples: state.apples.length,
      time: 0,
      status: startStatus
    });
  };

  const startGame = () => {
    if (canvasRef.current) {
      initLevel(canvasRef.current.width, canvasRef.current.height, GameStatus.PLAYING);
    }
  };

  // --- PHYSICS ENGINE ---

  const updatePhysics = () => {
    const s = stateRef.current;
    if (s.status !== GameStatus.PLAYING) return;

    // --- Controls ---
    
    // Drive: Modify OldX to induce velocity (momentum preservation)
    if (s.keys.up) {
        // Push Rear Wheel
        s.bike.rw.oldx -= PHYSICS.WHEEL_SPEED;
    }
    if (s.keys.down) {
        // Brake / Reverse
        s.bike.rw.oldx += PHYSICS.WHEEL_SPEED * 0.5;
    }
    
    // Torque: Apply force pairs to rotate the bike frame
    // This gives the "wobbly" Elma feel rather than just moving the bike
    const torqueForce = PHYSICS.BIKE_TORQUE;
    if (s.keys.left) {
        // Lean Back: Lift Front, Push Rear Down
        s.bike.fw.y -= torqueForce;
        s.bike.rw.y += torqueForce;
        // Also pull handle back
        s.bike.handle.x -= torqueForce;
    }
    if (s.keys.right) {
        // Lean Forward: Push Front Down, Lift Rear
        s.bike.fw.y += torqueForce;
        s.bike.rw.y -= torqueForce;
        // Push handle forward
        s.bike.handle.x += torqueForce;
    }
    
    // Space: Super Volt (Flip)
    if (s.keys.space) {
        s.bike.body.y -= 2;
        s.bike.rw.oldx -= 1;
        s.bike.fw.oldx += 1;
    }

    // --- Verlet Integration ---
    s.points.forEach(p => {
      if (p.pinned) return;
      const vx = (p.x - p.oldx) * PHYSICS.FRICTION;
      const vy = (p.y - p.oldy) * PHYSICS.FRICTION;
      p.oldx = p.x;
      p.oldy = p.y;
      p.x += vx;
      p.y += vy + PHYSICS.GRAVITY;
    });

    // --- Constraints & Collisions ---
    for (let i = 0; i < PHYSICS.ITERATIONS; i++) {
      // 1. Stick Constraints
      s.sticks.forEach(stick => {
        const dx = stick.p2.x - stick.p1.x;
        const dy = stick.p2.y - stick.p1.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) return;
        const diff = (stick.length - dist) / dist * (stick.stiffness);
        // Mass ratio compensation could go here, but simple 0.5 split is stable enough
        const ox = dx * diff * 0.5;
        const oy = dy * diff * 0.5;

        if (!stick.p1.pinned) { stick.p1.x -= ox; stick.p1.y -= oy; }
        if (!stick.p2.pinned) { stick.p2.x += ox; stick.p2.y += oy; }
      });

      // 2. Terrain Collisions
      checkCollisions(s);
    }

    checkGameplay(s);
  };

  const checkCollisions = (s: typeof stateRef.current) => {
    // Death Check
    if (s.bike.head.y > s.terrain[0].y + 2000) die();

    // Terrain
    for (const p of s.points) {
      // Optimization: Only check segments near the point? 
      // For now, checking all 50 segments against 5 points is fast enough (250 checks/iter)
      
      for (let i = 0; i < s.terrain.length - 1; i++) {
        const p1 = s.terrain[i];
        const p2 = s.terrain[i + 1];

        // Skip if point is far from segment bounding box (Broad Phase)
        if (p.x < Math.min(p1.x, p2.x) - 50 || p.x > Math.max(p1.x, p2.x) + 50) continue;

        // Segment Vector
        const sx = p2.x - p1.x;
        const sy = p2.y - p1.y;
        
        // Point Vector
        const px = p.x - p1.x;
        const py = p.y - p1.y;

        const t = Math.max(0, Math.min(1, (px * sx + py * sy) / (sx * sx + sy * sy)));

        const closestX = p1.x + t * sx;
        const closestY = p1.y + t * sy;

        const dx = p.x - closestX;
        const dy = p.y - closestY;
        const dist = Math.hypot(dx, dy);

        if (dist < p.radius) {
            // Collision!
            
            // Head die logic
            if (p === s.bike.head) {
                 // Allow glancing blows? No, classic Elma is strict.
                 // But let's give a tiny buffer (radius * 0.5)
                 if (dist < p.radius * 0.8) {
                     die(); 
                     return;
                 }
            }

            const overlap = p.radius - dist;
            const nx = dx / dist || 0; // Normal
            const ny = dy / dist || -1;

            // Push out
            p.x += nx * overlap;
            p.y += ny * overlap;

            // Friction (Tangential force)
            // Project velocity onto tangent
            const vx = p.x - p.oldx;
            const vy = p.y - p.oldy;
            // Tangent vector (-ny, nx)
            const dot = vx * -ny + vy * nx;
            
            // Apply friction impulse against motion
            p.oldx += -ny * dot * (1 - PHYSICS.GROUND_FRICTION);
            p.oldy += nx * dot * (1 - PHYSICS.GROUND_FRICTION);

            // Wheel visual rotation
            if (p.isWheel) {
                const speed = Math.hypot(vx, vy);
                const dir = dot > 0 ? 1 : -1;
                p.rotation += (speed * dir * 0.2);
            }
        }
      }
    }
  };

  const checkGameplay = (s: typeof stateRef.current) => {
      // Check Collection against ALL bike parts
      const bikeParts = [s.bike.rw, s.bike.fw, s.bike.body, s.bike.head];

      let collectedCount = 0;
      
      s.apples.forEach(a => {
          if (!a.collected) {
              // Check distance to any bike part
              for(const part of bikeParts) {
                  const d = Math.hypot(part.x - a.x, part.y - a.y);
                  if (d < 35) { // Generous hit box
                      a.collected = true;
                      break; 
                  }
              }
          } else {
              collectedCount++;
          }
      });

      // Flower
      if (collectedCount === s.apples.length) {
          s.flower.unlocked = true;
          for(const part of bikeParts) {
             const d = Math.hypot(part.x - s.flower.x, part.y - s.flower.y);
             if (d < 35) win();
          }
      }

      // Killers
      s.killers.forEach(k => {
          bikeParts.forEach(p => {
             if (Math.hypot(p.x - k.x, p.y - k.y) < (k.r || 15) + p.radius) die();
          });
      });

      // Update UI State (throttled)
      const currentTime = Math.floor((Date.now() - startTimeRef.current) / 1000);
      if (uiState.apples !== collectedCount || uiState.time !== currentTime || uiState.status !== s.status) {
          setUiState(prev => ({
              ...prev,
              apples: collectedCount,
              time: currentTime,
              status: s.status
          }));
      }
  };

  const die = () => {
      const s = stateRef.current;
      if (s.status === GameStatus.PLAYING) {
          s.status = GameStatus.DEAD;
      }
  };

  const win = () => {
      const s = stateRef.current;
      if (s.status === GameStatus.PLAYING) {
          s.status = GameStatus.WON;
      }
  };

  // --- RENDERING ---

  const draw = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const s = stateRef.current;
    if (!s.bike.body) return; // Safety

    ctx.clearRect(0, 0, width, height);

    // Smooth Camera
    const targetX = -s.bike.body.x + width / 2;
    const targetY = -s.bike.body.y + height / 1.8;
    
    // LERP for smoothness
    s.camera.x += (targetX - s.camera.x) * 0.1;
    s.camera.y += (targetY - s.camera.y) * 0.1;

    // Clamp vertical
    let camY = Math.min(200, Math.max(-1000, s.camera.y));
    
    ctx.save();
    ctx.translate(s.camera.x, camY);

    // 1. Draw Terrain
    ctx.fillStyle = COLORS.TERRAIN_FILL;
    ctx.beginPath();
    if(s.terrain.length > 0) {
        ctx.moveTo(s.terrain[0].x, s.terrain[0].y);
        for (let i = 1; i < s.terrain.length; i++) {
            ctx.lineTo(s.terrain[i].x, s.terrain[i].y);
        }
        ctx.fill();

        // Grass Top
        ctx.strokeStyle = COLORS.TERRAIN_STROKE;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(s.terrain[0].x, s.terrain[0].y);
        for (let i = 1; i < s.terrain.length - 1; i++) {
            ctx.lineTo(s.terrain[i].x, s.terrain[i].y);
        }
        ctx.stroke();
    }

    // 2. Entities
    // Flower
    ctx.save();
    ctx.translate(s.flower.x, s.flower.y);
    ctx.fillStyle = s.flower.unlocked ? 'white' : '#555';
    for (let i = 0; i < 5; i++) {
        ctx.rotate(Math.PI * 2 / 5);
        ctx.beginPath(); ctx.arc(0, 12, 8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'yellow'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Apples
    s.apples.forEach(a => {
        if (a.collected) return;
        ctx.fillStyle = COLORS.APPLE_BODY;
        ctx.beginPath(); ctx.arc(a.x, a.y, 14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(a.x - 5, a.y - 5, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = COLORS.APPLE_STEM; ctx.fillRect(a.x - 1, a.y - 18, 2, 6);
    });

    // Killers
    s.killers.forEach(k => {
        ctx.fillStyle = COLORS.KILLER;
        ctx.beginPath(); ctx.arc(k.x, k.y, k.r || 15, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 8; i++) {
            const ang = (Date.now() / 150) + (i * Math.PI / 4);
            const sx = k.x + Math.cos(ang) * ((k.r || 15) + 8);
            const sy = k.y + Math.sin(ang) * ((k.r || 15) + 8);
            ctx.beginPath(); ctx.moveTo(k.x, k.y); ctx.lineTo(sx, sy);
            ctx.strokeStyle = '#333'; ctx.lineWidth = 3; ctx.stroke();
        }
    });

    // 3. Bike
    // Wheels
    [s.bike.rw, s.bike.fw].forEach(w => {
        if(!w) return;
        ctx.save();
        ctx.translate(w.x, w.y);
        ctx.rotate(w.rotation);
        // Tire
        ctx.beginPath(); ctx.arc(0, 0, w.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#111'; ctx.fill();
        ctx.strokeStyle = '#222'; ctx.lineWidth = 3; ctx.stroke();
        // Rim
        ctx.beginPath(); ctx.arc(0, 0, w.radius - 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#888'; ctx.lineWidth = 2; ctx.stroke();
        // Spokes
        ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) {
            ctx.rotate(Math.PI * 2 / 5);
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w.radius - 6, 0); ctx.stroke();
        }
        ctx.restore();
    });

    // Frame
    if (s.bike.body) {
        ctx.strokeStyle = COLORS.BIKE_FRAME;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(s.bike.rw.x, s.bike.rw.y);
        ctx.lineTo(s.bike.body.x, s.bike.body.y);
        ctx.lineTo(s.bike.handle.x, s.bike.handle.y);
        ctx.lineTo(s.bike.fw.x, s.bike.fw.y);
        ctx.stroke();

        // Subframe
        ctx.beginPath();
        ctx.moveTo(s.bike.body.x, s.bike.body.y);
        ctx.lineTo(s.bike.rw.x + (s.bike.handle.x - s.bike.rw.x) * 0.35, s.bike.handle.y + 5);
        ctx.stroke();

        // Tank
        ctx.fillStyle = COLORS.BIKE_FRAME;
        ctx.beginPath();
        ctx.ellipse((s.bike.body.x + s.bike.handle.x) / 2, (s.bike.body.y + s.bike.handle.y) / 2 - 8, 15, 8, -0.2, 0, Math.PI*2);
        ctx.fill();
    }

    // Rider
    if (s.bike.head) {
        ctx.strokeStyle = COLORS.RIDER_SUIT;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';

        // Leg
        ctx.beginPath();
        ctx.moveTo(s.bike.body.x, s.bike.body.y - 5);
        ctx.lineTo(s.bike.rw.x + 10, s.bike.rw.y - 25);
        ctx.stroke();

        // Body
        ctx.beginPath();
        ctx.moveTo(s.bike.body.x, s.bike.body.y - 5);
        ctx.lineTo(s.bike.head.x, s.bike.head.y + 10);
        ctx.stroke();

        // Arm
        ctx.beginPath();
        ctx.moveTo(s.bike.head.x, s.bike.head.y + 10);
        ctx.lineTo(s.bike.handle.x, s.bike.handle.y);
        ctx.stroke();

        // Head
        ctx.save();
        ctx.translate(s.bike.head.x, s.bike.head.y);
        
        // Helmet
        ctx.fillStyle = COLORS.HELMET;
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
        
        // Visor
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.roundRect(4, -6, 8, 8, 2); ctx.fill();

        // Propeller
        ctx.save();
        ctx.translate(0, -13);
        const speed = Math.hypot(s.bike.body.x - s.bike.body.oldx, s.bike.body.y - s.bike.body.oldy);
        const propAngle = (Date.now() / 80) * (1 + speed * 3); // Spin faster with speed
        
        ctx.fillStyle = '#888'; ctx.fillRect(-1.5, 0, 3, -6);
        ctx.translate(0, -6);
        ctx.rotate(propAngle);
        
        // Blades
        ctx.fillStyle = '#DC2626'; ctx.fillRect(-14, -2, 28, 4);
        ctx.rotate(Math.PI/2);
        ctx.fillStyle = '#2563EB'; ctx.fillRect(-14, -2, 28, 4);
        
        ctx.restore();
        ctx.restore();
    }
    
    // Debug Suspension (optional)
    // ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    // ctx.lineWidth = 1;
    // s.sticks.forEach(st => {
    //     if(st.visible) return;
    //     ctx.beginPath(); ctx.moveTo(st.p1.x, st.p1.y); ctx.lineTo(st.p2.x, st.p2.y); ctx.stroke();
    // });

    ctx.restore();

  }, []);

  // --- MAIN LOOP ---

  const tick = useCallback(() => {
      if (canvasRef.current && stateRef.current) {
          const now = Date.now();
          // Limit max frame time to prevent death spiral on lag spikes
          let frameTime = Math.min(now - lastTimeRef.current, 100); 
          lastTimeRef.current = now;
          accumulatorRef.current += frameTime;

          // Fixed Time Step Physics
          while (accumulatorRef.current >= PHYSICS.TIMESTEP) {
              updatePhysics();
              accumulatorRef.current -= PHYSICS.TIMESTEP;
          }

          draw(canvasRef.current.getContext('2d')!, canvasRef.current.width, canvasRef.current.height);
      }
      requestRef.current = requestAnimationFrame(tick);
  }, [draw]);

  // --- EVENT LISTENERS ---

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if(e.code === 'ArrowUp') s.keys.up = true;
      if(e.code === 'ArrowDown') s.keys.down = true;
      if(e.code === 'ArrowLeft') s.keys.left = true;
      if(e.code === 'ArrowRight') s.keys.right = true;
      if(e.code === 'Space') s.keys.space = true;
      if(e.code === 'Enter') {
        s.keys.enter = true;
        if (s.status !== GameStatus.PLAYING) {
             startGame();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if(e.code === 'ArrowUp') s.keys.up = false;
      if(e.code === 'ArrowDown') s.keys.down = false;
      if(e.code === 'ArrowLeft') s.keys.left = false;
      if(e.code === 'ArrowRight') s.keys.right = false;
      if(e.code === 'Space') s.keys.space = false;
      if(e.code === 'Enter') s.keys.enter = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const handleResize = () => {
        if(canvasRef.current) {
            canvasRef.current.width = window.innerWidth;
            canvasRef.current.height = window.innerHeight;
            // Re-init menu if resizing on start, but don't kill game if playing
            if (stateRef.current.status === GameStatus.MENU) {
                initLevel(window.innerWidth, window.innerHeight, GameStatus.MENU);
            }
        }
    }
    window.addEventListener('resize', handleResize);
    
    // Initial Setup
    handleResize(); 

    // Start Loop
    lastTimeRef.current = Date.now();
    requestRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [tick]);

  return (
    <>
        <HUD 
            apples={uiState.apples} 
            totalApples={uiState.totalApples} 
            time={uiState.time} 
            status={uiState.status}
            onRestart={startGame}
        />
        <canvas 
            ref={canvasRef} 
            className="block w-full h-full bg-[#87CEEB]"
        />
    </>
  );
};
