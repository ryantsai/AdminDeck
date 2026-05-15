import { useEffect, useRef, type ComponentType } from "react";

interface CanvasAnimLifecycle {
  onResize?: (width: number, height: number, ctx: CanvasRenderingContext2D) => void;
}

type CanvasDraw<State extends CanvasAnimLifecycle> = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  state: State,
) => void;

function useCanvasAnim<State extends CanvasAnimLifecycle>(draw: CanvasDraw<State>) {
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvasElement = ref.current;
    const parentElement = canvasElement?.parentElement;
    if (!canvasElement || !parentElement) return;
    const context = canvasElement.getContext("2d");
    if (!context) return;
    const canvas = canvasElement;
    const parent = parentElement;
    const ctx = context;

    let raf = 0;
    let width = 0;
    let height = 0;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const state = {} as State;

    function resize() {
      const rect = parent.getBoundingClientRect();
      width = Math.max(2, Math.floor(rect.width));
      height = Math.max(2, Math.floor(rect.height));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      state.onResize?.(width, height, ctx);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(parent);
    drawRef.current(ctx, 0, 0, 0, state);
    resize();

    const start = performance.now();
    function frame(now: number) {
      const time = (now - start) / 1000;
      drawRef.current(ctx, width, height, time, state);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
    };
  }, []);

  return ref;
}

function AuroraBg() {
  return (
    <div className="dw-bg-aurora">
      <div className="dw-aurora-blob dw-aurora-1" />
      <div className="dw-aurora-blob dw-aurora-2" />
      <div className="dw-aurora-blob dw-aurora-3" />
      <div className="dw-aurora-grain" />
    </div>
  );
}

interface EmberParticle {
  x: number;
  y: number;
  r: number;
  vy: number;
  vx: number;
  life: number;
  speed: number;
  hue: number;
}

interface EmbersState extends CanvasAnimLifecycle {
  parts?: EmberParticle[];
  last?: number;
}

function EmbersBg() {
  const draw: CanvasDraw<EmbersState> = (ctx, width, height, time, state) => {
    state.onResize = (nextWidth, nextHeight) => {
      const count = Math.max(60, Math.min(160, Math.floor((nextWidth * nextHeight) / 9000)));
      state.parts = Array.from({ length: count }, () => ({
        x: Math.random() * nextWidth,
        y: Math.random() * nextHeight,
        r: 0.6 + Math.random() * 1.8,
        vy: 6 + Math.random() * 18,
        vx: (Math.random() - 0.5) * 4,
        life: Math.random(),
        speed: 0.15 + Math.random() * 0.5,
        hue: 12 + Math.random() * 28,
      }));
      state.last = time;
    };
    if (!state.parts) return;
    const dt = Math.min(0.05, time - (state.last ?? time));
    state.last = time;

    const pulse = 0.5 + 0.5 * Math.sin(time * 0.4);
    const gradient = ctx.createRadialGradient(width * 0.5, height * 1.05, 0, width * 0.5, height * 1.05, Math.max(width, height) * 0.9);
    gradient.addColorStop(0, `rgba(255,${110 + pulse * 30},40,0.32)`);
    gradient.addColorStop(0.5, "rgba(160,40,10,0.18)");
    gradient.addColorStop(1, "rgba(20,8,5,0.05)");
    ctx.fillStyle = "rgba(18,10,6,1)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = "lighter";
    for (const particle of state.parts) {
      particle.y -= particle.vy * dt;
      particle.x += particle.vx * dt + Math.sin((time + particle.life * 10) * particle.speed) * 0.4;
      particle.life += dt * 0.15;
      if (particle.y < -10) {
        particle.y = height + 10;
        particle.x = Math.random() * width;
        particle.life = 0;
      }
      const alpha = 0.4 + 0.4 * Math.sin(particle.life * 6);
      const spark = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, particle.r * 8);
      spark.addColorStop(0, `hsla(${particle.hue}, 95%, 65%, ${0.85 * alpha})`);
      spark.addColorStop(1, `hsla(${particle.hue}, 95%, 50%, 0)`);
      ctx.fillStyle = spark;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.r * 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  };
  const ref = useCanvasAnim(draw);
  return <canvas ref={ref} className="dw-dynamic-bg-canvas" />;
}

interface Star {
  x: number;
  y: number;
  d: number;
  sz: number;
  hue: number;
  ph: number;
  tw: number;
}

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
}

interface StarfieldState extends CanvasAnimLifecycle {
  stars?: Star[];
  shooters?: ShootingStar[];
  last?: number;
  nextShoot?: number;
}

function StarfieldBg() {
  const draw: CanvasDraw<StarfieldState> = (ctx, width, height, time, state) => {
    state.onResize = (nextWidth, nextHeight) => {
      const layers = [
        { count: Math.floor((nextWidth * nextHeight) / 8000), depth: 1.2, size: 0.6, hue: 220, tw: 1.6 },
        { count: Math.floor((nextWidth * nextHeight) / 14000), depth: 3.5, size: 1.1, hue: 205, tw: 2.4 },
        { count: Math.floor((nextWidth * nextHeight) / 26000), depth: 7, size: 1.7, hue: 35, tw: 3.0 },
      ];
      state.stars = layers.flatMap((layer) => Array.from({ length: layer.count }, () => ({
        x: Math.random() * nextWidth,
        y: Math.random() * nextHeight,
        d: layer.depth,
        sz: layer.size * (0.5 + Math.random() * 0.9),
        hue: layer.hue + (Math.random() - 0.5) * 20,
        ph: Math.random() * 6.28,
        tw: layer.tw * (0.7 + Math.random() * 0.6),
      })));
      state.shooters = [];
      state.last = time;
      state.nextShoot = time + 4 + Math.random() * 6;
    };
    if (!state.stars || !state.shooters || state.nextShoot === undefined) return;
    const dt = Math.min(0.05, time - (state.last ?? time));
    state.last = time;

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#070a1c");
    gradient.addColorStop(0.55, "#0c1230");
    gradient.addColorStop(1, "#05081a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const nebulaX = width * (0.4 + 0.15 * Math.sin(time * 0.05));
    const nebulaY = height * (0.6 + 0.1 * Math.cos(time * 0.04));
    const nebula = ctx.createRadialGradient(nebulaX, nebulaY, 0, nebulaX, nebulaY, Math.max(width, height) * 0.6);
    nebula.addColorStop(0, "rgba(80,40,140,0.32)");
    nebula.addColorStop(0.5, "rgba(40,60,160,0.10)");
    nebula.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, width, height);

    for (const star of state.stars) {
      star.x -= star.d * dt;
      if (star.x < -3) {
        star.x = width + 3;
        star.y = Math.random() * height;
      }
      const k = Math.sin(time * star.tw + star.ph);
      const twinkle = 0.35 + 0.65 * k * k;
      ctx.fillStyle = `hsla(${star.hue}, 85%, 92%, ${twinkle})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.sz, 0, Math.PI * 2);
      ctx.fill();
      if (star.sz > 1.1) {
        const halo = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.sz * 4);
        halo.addColorStop(0, `hsla(${star.hue}, 85%, 92%, ${twinkle * 0.35})`);
        halo.addColorStop(1, `hsla(${star.hue}, 85%, 92%, 0)`);
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.sz * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (time > state.nextShoot) {
      state.shooters.push({
        x: Math.random() * width * 0.6,
        y: Math.random() * height * 0.4,
        vx: 320 + Math.random() * 220,
        vy: 90 + Math.random() * 60,
        life: 0,
        ttl: 0.9 + Math.random() * 0.5,
      });
      state.nextShoot = time + 5 + Math.random() * 8;
    }
    state.shooters = state.shooters.filter((shooter) => shooter.life < shooter.ttl);
    for (const shooter of state.shooters) {
      shooter.life += dt;
      shooter.x += shooter.vx * dt;
      shooter.y += shooter.vy * dt;
      const alpha = Math.sin((shooter.life / shooter.ttl) * Math.PI);
      const tailX = shooter.x - shooter.vx * 0.06;
      const tailY = shooter.y - shooter.vy * 0.06;
      const tail = ctx.createLinearGradient(tailX, tailY, shooter.x, shooter.y);
      tail.addColorStop(0, "rgba(255,255,255,0)");
      tail.addColorStop(1, `rgba(220,235,255,${0.9 * alpha})`);
      ctx.strokeStyle = tail;
      ctx.lineWidth = 1.8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(shooter.x, shooter.y);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(shooter.x, shooter.y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  const ref = useCanvasAnim(draw);
  return <canvas ref={ref} className="dw-dynamic-bg-canvas" />;
}

interface RainDrop {
  x: number;
  y: number;
  len: number;
  speed: number;
  a: number;
}

interface Ripple {
  x: number;
  y: number;
  r: number;
  life: number;
  ttl: number;
}

interface RaindropsState extends CanvasAnimLifecycle {
  drops?: RainDrop[];
  ripples?: Ripple[];
  last?: number;
}

function RaindropsBg() {
  const wind = -0.18;
  const draw: CanvasDraw<RaindropsState> = (ctx, width, height, time, state) => {
    state.onResize = (nextWidth, nextHeight) => {
      const count = Math.max(120, Math.min(280, Math.floor((nextWidth * nextHeight) / 4800)));
      state.drops = Array.from({ length: count }, () => ({
        x: Math.random() * nextWidth * 1.2,
        y: Math.random() * nextHeight,
        len: 9 + Math.random() * 16,
        speed: 420 + Math.random() * 260,
        a: 0.25 + Math.random() * 0.55,
      }));
      state.ripples = [];
      state.last = time;
    };
    if (!state.drops || !state.ripples) return;
    const dt = Math.min(0.05, time - (state.last ?? time));
    state.last = time;

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#0e1a2a");
    gradient.addColorStop(0.6, "#162638");
    gradient.addColorStop(1, "#0a1422");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const cloud = ctx.createRadialGradient(width * 0.6, -height * 0.2, 0, width * 0.6, -height * 0.2, Math.max(width, height));
    cloud.addColorStop(0, "rgba(150,180,220,0.08)");
    cloud.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = cloud;
    ctx.fillRect(0, 0, width, height);

    ctx.lineCap = "round";
    for (const drop of state.drops) {
      drop.y += drop.speed * dt;
      drop.x += drop.speed * wind * dt;
      if (drop.y > height) {
        if (Math.random() < 0.45) {
          state.ripples.push({ x: drop.x, y: height - 2 + Math.random() * 2, r: 0, life: 0, ttl: 0.7 + Math.random() * 0.4 });
        }
        drop.y = -drop.len;
        drop.x = Math.random() * width * 1.2;
      }
      const line = ctx.createLinearGradient(drop.x, drop.y, drop.x + drop.len * wind, drop.y + drop.len);
      line.addColorStop(0, "rgba(180,210,240,0)");
      line.addColorStop(1, `rgba(200,225,255,${drop.a})`);
      ctx.strokeStyle = line;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x + drop.len * wind, drop.y + drop.len);
      ctx.stroke();
    }

    state.ripples = state.ripples.filter((ripple) => ripple.life < ripple.ttl);
    for (const ripple of state.ripples) {
      ripple.life += dt;
      const k = ripple.life / ripple.ttl;
      ripple.r = k * 14;
      ctx.strokeStyle = `rgba(200,225,255,${(1 - k) * 0.55})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(ripple.x, ripple.y, ripple.r, ripple.r * 0.35, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  };
  const ref = useCanvasAnim(draw);
  return <canvas ref={ref} className="dw-dynamic-bg-canvas" />;
}

interface MatrixState extends CanvasAnimLifecycle {
  fs?: number;
  cols?: number;
  drops?: number[];
  speeds?: number[];
  last?: number;
}

function MatrixBg() {
  const chars = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789@#$%&".split("");
  const draw: CanvasDraw<MatrixState> = (ctx, width, height, time, state) => {
    state.onResize = (nextWidth) => {
      state.fs = 14;
      state.cols = Math.ceil(nextWidth / state.fs);
      state.drops = Array.from({ length: state.cols }, () => Math.random() * -height);
      state.speeds = Array.from({ length: state.cols }, () => 110 + Math.random() * 180);
      state.last = time;
    };
    if (!state.drops || !state.speeds || !state.fs || !state.cols) return;
    const dt = Math.min(0.05, time - (state.last ?? time));
    state.last = time;

    ctx.fillStyle = `rgba(5, 10, 8, ${Math.min(0.25, 6 * dt)})`;
    ctx.fillRect(0, 0, width, height);
    ctx.font = `${state.fs}px ui-monospace, "JetBrains Mono", monospace`;
    for (let i = 0; i < state.cols; i += 1) {
      const char = chars[(Math.floor(time * 4 + i)) % chars.length];
      const x = i * state.fs;
      const y = state.drops[i];
      ctx.fillStyle = "rgba(190,255,210,0.95)";
      ctx.fillText(char, x, y);
      ctx.fillStyle = "rgba(60,210,90,0.75)";
      ctx.fillText(chars[(i * 7 + Math.floor(time * 2)) % chars.length], x, y - state.fs);
      state.drops[i] += state.speeds[i] * dt;
      if (y > height && Math.random() > 0.975) state.drops[i] = Math.random() * -40;
    }
  };
  const ref = useCanvasAnim(draw);
  return <canvas ref={ref} className="dw-dynamic-bg-canvas dw-dynamic-bg-canvas-matrix" />;
}

interface LavaBlob {
  ph: number;
  rx: number;
  ry: number;
  ax: number;
  ay: number;
  speed: number;
  hue: number;
  r: number;
}

interface LavaState extends CanvasAnimLifecycle {
  blobs?: LavaBlob[];
}

function LavaBg() {
  const draw: CanvasDraw<LavaState> = (ctx, width, height, time, state) => {
    state.onResize = (nextWidth, nextHeight) => {
      state.blobs = Array.from({ length: 6 }, (_, index) => ({
        ph: index * 1.4 + Math.random() * 3,
        rx: 0.15 + Math.random() * 0.25,
        ry: 0.18 + Math.random() * 0.3,
        ax: nextWidth * (0.25 + Math.random() * 0.5),
        ay: nextHeight * (0.25 + Math.random() * 0.5),
        speed: 0.15 + Math.random() * 0.25,
        hue: 8 + index * 8,
        r: Math.min(nextWidth, nextHeight) * (0.18 + Math.random() * 0.18),
      }));
    };
    if (!state.blobs) return;

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#2a0a06");
    gradient.addColorStop(1, "#180605");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = "lighter";
    for (const blob of state.blobs) {
      const x = blob.ax + Math.sin(time * blob.speed + blob.ph) * width * blob.rx;
      const y = blob.ay + Math.cos(time * blob.speed * 0.8 + blob.ph) * height * blob.ry;
      const blobGradient = ctx.createRadialGradient(x, y, 0, x, y, blob.r);
      blobGradient.addColorStop(0, `hsla(${blob.hue + 5}, 95%, 60%, 0.70)`);
      blobGradient.addColorStop(0.5, `hsla(${blob.hue}, 85%, 50%, 0.30)`);
      blobGradient.addColorStop(1, `hsla(${blob.hue - 5}, 80%, 35%, 0)`);
      ctx.fillStyle = blobGradient;
      ctx.beginPath();
      ctx.arc(x, y, blob.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  };
  const ref = useCanvasAnim(draw);
  return <canvas ref={ref} className="dw-dynamic-bg-canvas" />;
}

function SynthwaveBg() {
  return (
    <div className="dw-bg-synthwave">
      <div className="dw-sw-sky" />
      <div className="dw-sw-sun" />
      <div className="dw-sw-mountains" />
      <div className="dw-sw-grid" />
      <div className="dw-sw-scan" />
    </div>
  );
}

interface ConfettiBit {
  x: number;
  y: number;
  sz: number;
  rot: number;
  vrot: number;
  vy: number;
  vx: number;
  wob: number;
  wobSp: number;
  color: string;
}

interface ConfettiState extends CanvasAnimLifecycle {
  bits?: ConfettiBit[];
  last?: number;
}

function ConfettiBg() {
  const palette = ["#ff5b8a", "#ffd166", "#06d6a0", "#118ab2", "#a78bfa", "#ff8c42", "#ef476f", "#7be0ad"];
  function spawn(width: number, height: number, seed: boolean): ConfettiBit {
    return {
      x: Math.random() * width,
      y: seed ? Math.random() * height : -10,
      sz: 5 + Math.random() * 9,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 4,
      vy: 25 + Math.random() * 60,
      vx: (Math.random() - 0.5) * 30,
      wob: Math.random() * 6.28,
      wobSp: 1 + Math.random() * 2,
      color: palette[Math.floor(Math.random() * palette.length)],
    };
  }

  const draw: CanvasDraw<ConfettiState> = (ctx, width, height, time, state) => {
    state.onResize = (nextWidth, nextHeight) => {
      const count = Math.max(60, Math.min(180, Math.floor((nextWidth * nextHeight) / 8500)));
      state.bits = Array.from({ length: count }, () => spawn(nextWidth, nextHeight, true));
      state.last = time;
    };
    if (!state.bits) return;
    const dt = Math.min(0.05, time - (state.last ?? time));
    state.last = time;

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#fdf2f8");
    gradient.addColorStop(1, "#eef2ff");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    for (const bit of state.bits) {
      bit.y += bit.vy * dt;
      bit.x += bit.vx * dt + Math.sin(time * bit.wobSp + bit.wob) * 0.7;
      bit.rot += bit.vrot * dt;
      if (bit.y > height + 20) Object.assign(bit, spawn(width, height, false));
      ctx.save();
      ctx.translate(bit.x, bit.y);
      ctx.rotate(bit.rot);
      ctx.fillStyle = bit.color;
      ctx.fillRect(-bit.sz / 2, -bit.sz * 0.35, bit.sz, bit.sz * 0.7);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(-bit.sz / 2, -bit.sz * 0.35, bit.sz, bit.sz * 0.18);
      ctx.restore();
    }
  };
  const ref = useCanvasAnim(draw);
  return <canvas ref={ref} className="dw-dynamic-bg-canvas" />;
}

interface NebulaCloud {
  hue: number;
  ax: number;
  ay: number;
  r: number;
  ph: number;
  speed: number;
}

interface NebulaState extends CanvasAnimLifecycle {
  clouds?: NebulaCloud[];
  starCanvas?: HTMLCanvasElement;
}

function NebulaBg() {
  const draw: CanvasDraw<NebulaState> = (ctx, width, height, time, state) => {
    state.onResize = (nextWidth, nextHeight) => {
      state.clouds = Array.from({ length: 5 }, (_, index) => ({
        hue: [285, 320, 200, 260, 180][index],
        ax: nextWidth * (0.15 + (index / 4) * 0.7),
        ay: nextHeight * (0.3 + Math.random() * 0.4),
        r: Math.min(nextWidth, nextHeight) * (0.35 + Math.random() * 0.25),
        ph: index * 1.3,
        speed: 0.04 + Math.random() * 0.05,
      }));
      state.starCanvas = document.createElement("canvas");
      state.starCanvas.width = nextWidth;
      state.starCanvas.height = nextHeight;
      const starCtx = state.starCanvas.getContext("2d");
      if (!starCtx) return;
      const starCount = Math.floor((nextWidth * nextHeight) / 14000);
      for (let i = 0; i < starCount; i += 1) {
        const x = Math.random() * nextWidth;
        const y = Math.random() * nextHeight;
        const radius = Math.random() * 0.9 + 0.2;
        starCtx.fillStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.5})`;
        starCtx.beginPath();
        starCtx.arc(x, y, radius, 0, Math.PI * 2);
        starCtx.fill();
      }
    };
    if (!state.clouds) return;

    ctx.fillStyle = "#070617";
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = "lighter";
    for (const cloud of state.clouds) {
      const x = cloud.ax + Math.sin(time * cloud.speed + cloud.ph) * width * 0.1;
      const y = cloud.ay + Math.cos(time * cloud.speed * 0.7 + cloud.ph) * height * 0.06;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, cloud.r);
      gradient.addColorStop(0, `hsla(${cloud.hue}, 80%, 60%, 0.32)`);
      gradient.addColorStop(0.4, `hsla(${cloud.hue + 20}, 70%, 50%, 0.16)`);
      gradient.addColorStop(1, `hsla(${cloud.hue}, 70%, 30%, 0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, cloud.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";

    if (state.starCanvas) ctx.drawImage(state.starCanvas, 0, 0, width, height);
  };
  const ref = useCanvasAnim(draw);
  return <canvas ref={ref} className="dw-dynamic-bg-canvas" />;
}

const DYNAMIC_BACKGROUND_COMPONENTS = {
  aurora: AuroraBg,
  raindrops: RaindropsBg,
  starfield: StarfieldBg,
  nebula: NebulaBg,
  embers: EmbersBg,
  lava: LavaBg,
  matrix: MatrixBg,
  synthwave: SynthwaveBg,
  confetti: ConfettiBg,
} satisfies Record<string, ComponentType>;

export type DynamicBackgroundId = keyof typeof DYNAMIC_BACKGROUND_COMPONENTS;

export const DYNAMIC_BACKGROUNDS: readonly {
  id: DynamicBackgroundId;
  labelKey: string;
  mood: "calm" | "spacey" | "warm" | "geeky" | "erratic";
}[] = [
  { id: "aurora", labelKey: "dashboard.dynamicBackgrounds.aurora", mood: "calm" },
  { id: "raindrops", labelKey: "dashboard.dynamicBackgrounds.raindrops", mood: "calm" },
  { id: "starfield", labelKey: "dashboard.dynamicBackgrounds.starfield", mood: "spacey" },
  { id: "nebula", labelKey: "dashboard.dynamicBackgrounds.nebula", mood: "spacey" },
  { id: "embers", labelKey: "dashboard.dynamicBackgrounds.embers", mood: "warm" },
  { id: "lava", labelKey: "dashboard.dynamicBackgrounds.lava", mood: "warm" },
  { id: "matrix", labelKey: "dashboard.dynamicBackgrounds.matrix", mood: "geeky" },
  { id: "synthwave", labelKey: "dashboard.dynamicBackgrounds.synthwave", mood: "geeky" },
  { id: "confetti", labelKey: "dashboard.dynamicBackgrounds.confetti", mood: "erratic" },
];

export function isDynamicBackgroundId(value: string): value is DynamicBackgroundId {
  return value in DYNAMIC_BACKGROUND_COMPONENTS;
}

export function getDashboardDynamicBackgroundHostClassName() {
  return "dw-canvas-bg dw-dynamic-bg-layer";
}

export function DashboardDynamicBackground({ id }: { id: string }) {
  if (!isDynamicBackgroundId(id)) return null;
  const Component = DYNAMIC_BACKGROUND_COMPONENTS[id];
  return (
    <div className={getDashboardDynamicBackgroundHostClassName()} aria-hidden="true">
      <Component />
    </div>
  );
}
