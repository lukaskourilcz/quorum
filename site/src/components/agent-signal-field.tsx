"use client";

import { useEffect, useRef } from "react";

interface SignalAgent {
  group: "Control" | "Council" | "Specialist";
  id: string;
}

interface AgentSignalFieldProps {
  agents: readonly SignalAgent[];
}

interface OrbitParticle {
  angle: number;
  depth: number;
  radius: number;
  speed: number;
}

const TAU = Math.PI * 2;
const PARTICLE_COUNT = 96;

function seededUnit(seed: number) {
  const value = Math.sin(seed * 12_989.37) * 43_758.5453;
  return value - Math.floor(value);
}

function pointOnCurve(
  start: { x: number; y: number },
  control: { x: number; y: number },
  end: { x: number; y: number },
  progress: number
) {
  const inverse = 1 - progress;
  return {
    x:
      inverse * inverse * start.x +
      2 * inverse * progress * control.x +
      progress * progress * end.x,
    y:
      inverse * inverse * start.y +
      2 * inverse * progress * control.y +
      progress * progress * end.y
  };
}

export function AgentSignalField({ agents }: AgentSignalFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const particles: OrbitParticle[] = Array.from(
      { length: PARTICLE_COUNT },
      (_, index) => ({
        angle: seededUnit(index + 1) * TAU,
        depth: 0.3 + seededUnit(index + 101) * 0.7,
        radius: 0.16 + seededUnit(index + 201) * 0.38,
        speed:
          (0.025 + seededUnit(index + 301) * 0.055) *
          (index % 2 === 0 ? 1 : -1)
      })
    );

    let frame = 0;
    let height = 0;
    let isVisible = true;
    let pointerX = 0;
    let pointerY = 0;
    let width = 0;

    const style = getComputedStyle(canvas);
    const accent = style.getPropertyValue("--accent").trim();
    const fog = style.getPropertyValue("--fog").trim();
    const foreground = style.getPropertyValue("--foreground").trim();
    const fontFamily = style.fontFamily;

    const draw = (elapsed: number, reducedMotion: boolean) => {
      context.clearRect(0, 0, width, height);
      if (width === 0 || height === 0) {
        return;
      }

      const mobile = width < 760;
      const motion = reducedMotion ? 0 : 1;
      const scale = Math.min(width, height);
      const center = {
        x: width * (mobile ? 0.53 : 0.71) + pointerX * scale * 0.018,
        y: height * 0.52 + pointerY * scale * 0.018
      };
      const orbitWidth = Math.min(width * (mobile ? 0.48 : 0.34), scale * 0.5);
      const orbitHeight = Math.min(height * 0.39, scale * 0.35);
      const nodePositions = agents.map((agent, index) => {
        const isCouncil = agent.group === "Council";
        const isControl = agent.group === "Control";
        const ring = isCouncil ? 0.47 : isControl ? 1 : 0.76;
        const baseAngle = (index / agents.length) * TAU;
        const speed = isCouncil ? -0.035 : isControl ? 0.018 : 0.026;
        const angle = baseAngle + elapsed * speed * motion;
        const breathe =
          1 + Math.sin(elapsed * 0.65 + index * 1.7) * 0.035 * motion;
        const depth = 0.72 + Math.sin(angle) * 0.28;

        return {
          agent,
          depth,
          x:
            center.x +
            Math.cos(angle) * orbitWidth * ring * breathe +
            pointerX * depth * 7,
          y:
            center.y +
            Math.sin(angle) * orbitHeight * ring * breathe +
            pointerY * depth * 5
        };
      });

      context.save();
      context.globalCompositeOperation = "screen";

      for (const particle of particles) {
        const angle = particle.angle + elapsed * particle.speed * motion;
        const drift =
          Math.sin(elapsed * 0.27 + particle.angle * 3) * 0.025 * motion;
        const x =
          center.x +
          Math.cos(angle) * orbitWidth * (particle.radius + drift);
        const y =
          center.y +
          Math.sin(angle) *
            orbitHeight *
            (particle.radius + drift) *
            particle.depth;

        context.beginPath();
        context.globalAlpha = 0.06 + particle.depth * 0.12;
        context.fillStyle = particle.depth > 0.72 ? accent : foreground;
        context.arc(x, y, 0.45 + particle.depth * 0.85, 0, TAU);
        context.fill();
      }

      context.strokeStyle = fog;
      context.lineWidth = 0.7;
      for (let ring = 1; ring <= 3; ring += 1) {
        context.beginPath();
        context.globalAlpha = 0.055 - ring * 0.008;
        context.ellipse(
          center.x,
          center.y,
          orbitWidth * ring * 0.33,
          orbitHeight * ring * 0.33,
          0,
          0,
          TAU
        );
        context.stroke();
      }

      nodePositions.forEach((node, index) => {
        const nextIndex = (index * 5 + 3) % nodePositions.length;
        const target = nodePositions[nextIndex]!;
        const control = {
          x: center.x + (node.y - target.y) * 0.12,
          y: center.y - (node.x - target.x) * 0.12
        };

        context.beginPath();
        context.globalAlpha =
          0.045 + ((Math.sin(elapsed * 0.5 + index) + 1) / 2) * 0.055;
        context.strokeStyle =
          node.agent.group === "Council" ? accent : foreground;
        context.lineWidth = node.agent.group === "Council" ? 0.9 : 0.55;
        context.moveTo(node.x, node.y);
        context.quadraticCurveTo(control.x, control.y, target.x, target.y);
        context.stroke();

        if (!reducedMotion && index % 2 === 0) {
          const progress = (elapsed * (0.08 + index * 0.002) + index / 7) % 1;
          const signal = pointOnCurve(node, control, target, progress);
          context.beginPath();
          context.globalAlpha = 0.72;
          context.fillStyle = accent;
          context.shadowBlur = 8;
          context.shadowColor = accent;
          context.arc(signal.x, signal.y, 1.3, 0, TAU);
          context.fill();
          context.shadowBlur = 0;
        }
      });

      const reactorPulse =
        1 + Math.sin(elapsed * 1.15) * 0.13 * motion;
      context.beginPath();
      context.globalAlpha = 0.18;
      context.strokeStyle = accent;
      context.lineWidth = 1;
      context.arc(center.x, center.y, 15 * reactorPulse, 0, TAU);
      context.stroke();
      context.beginPath();
      context.globalAlpha = 0.45;
      context.fillStyle = accent;
      context.shadowBlur = 18;
      context.shadowColor = accent;
      context.arc(center.x, center.y, 2.7, 0, TAU);
      context.fill();
      context.shadowBlur = 0;

      nodePositions
        .sort((left, right) => left.depth - right.depth)
        .forEach((node) => {
          const isCouncil = node.agent.group === "Council";
          const isControl = node.agent.group === "Control";
          const radius = (isCouncil ? 4.8 : isControl ? 3.7 : 3.1) * node.depth;
          const pulse =
            1 +
            Math.sin(elapsed * 0.9 + node.x * 0.015) * 0.12 * motion;

          context.beginPath();
          context.globalAlpha = isCouncil ? 0.2 : 0.1;
          context.fillStyle = isCouncil ? accent : foreground;
          context.arc(node.x, node.y, radius * 3.2 * pulse, 0, TAU);
          context.fill();

          context.beginPath();
          context.globalAlpha = isCouncil ? 0.82 : 0.52;
          context.fillStyle = isCouncil ? accent : foreground;
          context.strokeStyle = isControl ? accent : foreground;
          context.lineWidth = 0.8;
          if (isControl) {
            context.rect(
              node.x - radius,
              node.y - radius,
              radius * 2,
              radius * 2
            );
            context.stroke();
          } else {
            context.arc(node.x, node.y, radius, 0, TAU);
            context.fill();
          }

          if (!mobile) {
            context.globalAlpha = isCouncil ? 0.5 : 0.25;
            context.fillStyle = isCouncil ? accent : fog;
            context.font = `600 9px ${fontFamily}`;
            context.fillText(
              node.agent.id,
              node.x + radius + 5,
              node.y + 3
            );
          }
        });

      context.restore();
    };

    const start = () => {
      window.cancelAnimationFrame(frame);
      if (motionQuery.matches || !isVisible || document.hidden) {
        draw(0, true);
        return;
      }

      const animate = (timestamp: number) => {
        draw(timestamp / 1_000, false);
        frame = window.requestAnimationFrame(animate);
      };
      frame = window.requestAnimationFrame(animate);
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = bounds.width;
      height = bounds.height;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      start();
    };

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointerX = (event.clientX - bounds.left) / bounds.width - 0.5;
      pointerY = (event.clientY - bounds.top) / bounds.height - 0.5;
    };
    const handleVisibilityChange = () => start();
    const handleMotionChange = () => start();
    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry?.isIntersecting ?? true;
      start();
    });
    const resizeObserver = new ResizeObserver(resize);

    observer.observe(canvas);
    resizeObserver.observe(canvas);
    window.addEventListener("pointermove", handlePointerMove, {
      passive: true
    });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    motionQuery.addEventListener("change", handleMotionChange);
    resize();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      motionQuery.removeEventListener("change", handleMotionChange);
    };
  }, [agents]);

  return (
    <canvas
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full opacity-75"
      ref={canvasRef}
    />
  );
}
