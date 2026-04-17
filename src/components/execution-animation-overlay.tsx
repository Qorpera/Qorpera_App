"use client";

import { useEffect, useRef, useState } from "react";

export type ExecutionAnimationType = "email" | "document" | "calendar_event" | "generic";

interface ExecutionAnimationOverlayProps {
  type: ExecutionAnimationType;
  onComplete: () => void;
}

const DISABLED = process.env.NEXT_PUBLIC_DISABLE_EXECUTION_ANIMATIONS === "true";
const DURATION_MS = 2100;
const REDUCED_DURATION_MS = 500;
const NON_BLOCKING_AFTER_MS = 500;

export function ExecutionAnimationOverlay({ type, onComplete }: ExecutionAnimationOverlayProps) {
  const [nonBlocking, setNonBlocking] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (DISABLED) {
      const t = setTimeout(() => onCompleteRef.current(), 100);
      return () => clearTimeout(t);
    }
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? REDUCED_DURATION_MS : DURATION_MS;

    const completeTimer = setTimeout(() => onCompleteRef.current(), duration);
    const nonBlockingTimer = setTimeout(() => setNonBlocking(true), NON_BLOCKING_AFTER_MS);
    return () => {
      clearTimeout(completeTimer);
      clearTimeout(nonBlockingTimer);
    };
  }, []);

  if (DISABLED) return null;

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "color-mix(in srgb, var(--background) 10%, transparent)",
        backdropFilter: "blur(0.5px)",
        pointerEvents: nonBlocking ? "none" : "auto",
      }}
    >
      {reduced ? <ReducedScene type={type} /> : <AnimationScene type={type} />}
      <style>{STYLES}</style>
    </div>
  );
}

// ── Animation scene ──────────────────────────────────────────────────────────

function AnimationScene({ type }: { type: ExecutionAnimationType }) {
  if (type === "email") return <EmailScene />;
  if (type === "document") return <DocumentScene />;
  if (type === "calendar_event") return <CalendarScene />;
  return <GenericScene />;
}

function EmailScene() {
  return (
    <div className="exec-anim-email-stage">
      {/* Paper */}
      <svg
        className="exec-anim-email-paper"
        width={48}
        height={62}
        viewBox="0 0 48 62"
        aria-hidden
      >
        <rect
          x={1}
          y={1}
          width={46}
          height={60}
          rx={2}
          fill="var(--background)"
          stroke="var(--foreground)"
          strokeWidth={1}
        />
        <line x1={8} y1={14} x2={40} y2={14} stroke="var(--fg3)" strokeWidth={1} />
        <line x1={8} y1={22} x2={40} y2={22} stroke="var(--fg3)" strokeWidth={1} />
        <line x1={8} y1={30} x2={40} y2={30} stroke="var(--fg3)" strokeWidth={1} />
        <line x1={8} y1={38} x2={34} y2={38} stroke="var(--fg3)" strokeWidth={1} />
        <line x1={8} y1={46} x2={30} y2={46} stroke="var(--fg3)" strokeWidth={1} />
      </svg>

      {/* Envelope */}
      <div className="exec-anim-email-envelope">
        <svg width={96} height={72} viewBox="0 0 96 72" aria-hidden>
          <rect
            x={1}
            y={1}
            width={94}
            height={70}
            rx={3}
            fill="var(--background)"
            stroke="var(--foreground)"
            strokeWidth={1.5}
          />
          {/* Bottom V-fold (decorative) */}
          <path
            d="M 1 70 L 48 38 L 95 70"
            fill="none"
            stroke="var(--foreground)"
            strokeWidth={1.5}
          />
          {/* Flap */}
          <path
            className="exec-anim-email-flap"
            d="M 1 1 L 48 38 L 95 1 Z"
            fill="var(--background)"
            stroke="var(--foreground)"
            strokeWidth={1.5}
          />
        </svg>
      </div>
    </div>
  );
}

function DocumentScene() {
  return (
    <div className="exec-anim-doc-stage">
      <svg
        className="exec-anim-doc-page"
        width={96}
        height={124}
        viewBox="0 0 96 124"
        aria-hidden
      >
        <path
          d="M 2 2 L 74 2 L 94 22 L 94 122 L 2 122 Z"
          fill="var(--background)"
          stroke="var(--foreground)"
          strokeWidth={1.25}
          strokeLinejoin="round"
        />
        {/* Folded corner */}
        <path
          d="M 74 2 L 74 22 L 94 22"
          fill="none"
          stroke="var(--foreground)"
          strokeWidth={1.25}
          strokeLinejoin="round"
        />
        <line x1={14} y1={42} x2={80} y2={42} stroke="var(--fg3)" strokeWidth={1} />
        <line x1={14} y1={56} x2={80} y2={56} stroke="var(--fg3)" strokeWidth={1} />
        <line x1={14} y1={70} x2={80} y2={70} stroke="var(--fg3)" strokeWidth={1} />
        <line x1={14} y1={84} x2={68} y2={84} stroke="var(--fg3)" strokeWidth={1} />
        <line x1={14} y1={98} x2={58} y2={98} stroke="var(--fg3)" strokeWidth={1} />
      </svg>
    </div>
  );
}

function CalendarScene() {
  const cellSize = 22;
  const gridTop = 58;
  const gridLeft = 10;
  // Date 16 is at row index 2 (starting at Sunday=0), col index 2 (Wed) for a standard April layout.
  // We place the dot at row 2, col 2 of a 7-col grid: x = gridLeft + col * cellSize + cellSize/2.
  const dotCol = 2;
  const dotRow = 2;
  const dotCx = gridLeft + dotCol * cellSize + cellSize / 2;
  const dotCy = gridTop + dotRow * cellSize + cellSize / 2;

  return (
    <div className="exec-anim-cal-stage">
      <svg
        className="exec-anim-cal-page"
        width={168}
        height={168}
        viewBox="0 0 168 168"
        aria-hidden
      >
        <rect
          x={1}
          y={1}
          width={166}
          height={166}
          rx={4}
          fill="var(--background)"
          stroke="var(--foreground)"
          strokeWidth={1.25}
        />
        {/* Header band */}
        <line x1={1} y1={30} x2={167} y2={30} stroke="var(--foreground)" strokeWidth={1} />
        <text
          x={84}
          y={22}
          fill="var(--foreground)"
          fontSize={14}
          fontWeight={600}
          textAnchor="middle"
          fontFamily="Inter, ui-sans-serif, system-ui"
        >
          April
        </text>
        {/* Weekday labels */}
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <text
            key={i}
            x={gridLeft + i * cellSize + cellSize / 2}
            y={48}
            fill="var(--fg3)"
            fontSize={9}
            textAnchor="middle"
            fontFamily="Inter, ui-sans-serif, system-ui"
          >
            {d}
          </text>
        ))}
        {/* Date grid — 5 rows × 7 cols, numbers 1..31 */}
        {Array.from({ length: 35 }).map((_, i) => {
          const day = i + 1;
          if (day > 31) return null;
          const row = Math.floor(i / 7);
          const col = i % 7;
          return (
            <text
              key={i}
              x={gridLeft + col * cellSize + cellSize / 2}
              y={gridTop + row * cellSize + cellSize / 2 + 3}
              fill="var(--fg3)"
              fontSize={10}
              textAnchor="middle"
              fontFamily="Inter, ui-sans-serif, system-ui"
            >
              {day}
            </text>
          );
        })}
        {/* Indicator circle over date 16 */}
        <circle
          className="exec-anim-cal-dot"
          cx={dotCx}
          cy={dotCy}
          r={0}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
}

function GenericScene() {
  return (
    <div className="exec-anim-gen-stage">
      <svg width={160} height={160} viewBox="0 0 80 80" aria-hidden>
        {/* Pulse ring */}
        <circle
          className="exec-anim-gen-pulse"
          cx={40}
          cy={40}
          r={32}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth={1.25}
        />
        {/* Main circle */}
        <circle
          className="exec-anim-gen-circle"
          cx={40}
          cy={40}
          r={32}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth={2}
        />
        {/* Check mark */}
        <path
          className="exec-anim-gen-check"
          d="M 24 42 L 36 54 L 58 28"
          fill="none"
          stroke="var(--foreground)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// ── Reduced-motion scene (static icon, 500ms) ────────────────────────────────

function ReducedScene({ type }: { type: ExecutionAnimationType }) {
  return (
    <div className="exec-anim-reduced">
      {type === "email" && <EmailScene />}
      {type === "document" && <DocumentScene />}
      {type === "calendar_event" && <CalendarScene />}
      {type === "generic" && <GenericScene />}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const STYLES = `
.exec-anim-reduced {
  animation: exec-anim-reduced-fade 500ms ease-out forwards;
}
.exec-anim-reduced .exec-anim-email-paper,
.exec-anim-reduced .exec-anim-email-envelope,
.exec-anim-reduced .exec-anim-email-flap,
.exec-anim-reduced .exec-anim-doc-page,
.exec-anim-reduced .exec-anim-cal-page,
.exec-anim-reduced .exec-anim-cal-dot,
.exec-anim-reduced .exec-anim-gen-pulse,
.exec-anim-reduced .exec-anim-gen-circle,
.exec-anim-reduced .exec-anim-gen-check {
  animation: none !important;
}
/* Scene children's base state is opacity: 0 (keyframes fade them in). With
 * animation: none applied above, the base stays 0, so we must force them
 * visible for reduced-motion users. The wrapper's own fade (reduced-fade)
 * then handles the 500ms in/out. */
.exec-anim-reduced .exec-anim-email-paper,
.exec-anim-reduced .exec-anim-email-envelope,
.exec-anim-reduced .exec-anim-doc-page,
.exec-anim-reduced .exec-anim-cal-page,
.exec-anim-reduced .exec-anim-cal-dot,
.exec-anim-reduced .exec-anim-gen-stage {
  opacity: 1 !important;
}
.exec-anim-reduced .exec-anim-cal-dot {
  r: 9;
}
.exec-anim-reduced .exec-anim-gen-check {
  stroke-dashoffset: 0;
}

@keyframes exec-anim-reduced-fade {
  0% { opacity: 0; }
  20% { opacity: 1; }
  85% { opacity: 1; }
  100% { opacity: 0; }
}

/* ── Email ───────────────────────────────────────────────────────────────── */

.exec-anim-email-stage {
  position: relative;
  width: 160px;
  height: 240px;
  perspective: 800px;
}

.exec-anim-email-paper {
  position: absolute;
  left: 50%;
  top: 50%;
  margin-left: -24px;
  margin-top: -31px;
  animation: exec-anim-email-paper 2100ms cubic-bezier(0.32, 0.72, 0.26, 1) forwards;
  transform-origin: center center;
  opacity: 0;
}

@keyframes exec-anim-email-paper {
  0%   { transform: translateY(-140px) scale(1); opacity: 0; }
  18%  { transform: translateY(-60px) scale(1); opacity: 1; }
  35%  { transform: translateY(-20px) scale(1); opacity: 1; }
  50%  { transform: translateY(10px) scale(0.55); opacity: 1; }
  58%  { transform: translateY(10px) scale(0.2); opacity: 0.6; }
  62%  { transform: translateY(10px) scale(0.2); opacity: 0; }
  100% { transform: translateY(10px) scale(0.2); opacity: 0; }
}

.exec-anim-email-envelope {
  position: absolute;
  left: 50%;
  top: 50%;
  margin-left: -48px;
  margin-top: -36px;
  animation: exec-anim-email-envelope 2100ms cubic-bezier(0.32, 0.72, 0.26, 1) forwards;
  transform-origin: center center;
  opacity: 0;
  perspective: 800px;
}

@keyframes exec-anim-email-envelope {
  0%   { transform: translate(0, 60px) scale(0.7) rotate(0deg); opacity: 0; }
  25%  { transform: translate(0, 60px) scale(0.7) rotate(0deg); opacity: 0; }
  40%  { transform: translate(0, 20px) scale(1) rotate(0deg); opacity: 1; }
  65%  { transform: translate(0, 20px) scale(1) rotate(0deg); opacity: 1; }
  80%  { transform: translate(15px, -40px) scale(0.9) rotate(-4deg); opacity: 1; }
  100% { transform: translate(40px, -200px) scale(0.5) rotate(-8deg); opacity: 0; }
}

.exec-anim-email-flap {
  transform-origin: 48px 1px;
  transform-box: fill-box;
  animation: exec-anim-email-flap 2100ms cubic-bezier(0.32, 0.72, 0.26, 1) forwards;
}

@keyframes exec-anim-email-flap {
  0%   { transform: rotateX(-150deg); }
  55%  { transform: rotateX(-150deg); }
  65%  { transform: rotateX(0deg); }
  100% { transform: rotateX(0deg); }
}

/* ── Document ────────────────────────────────────────────────────────────── */

.exec-anim-doc-stage {
  width: 160px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.exec-anim-doc-page {
  animation: exec-anim-doc-page 2100ms cubic-bezier(0.2, 0.8, 0.3, 1) forwards;
  transform-origin: center center;
  opacity: 0;
}

@keyframes exec-anim-doc-page {
  0%   { opacity: 0; transform: scale(0.5) translateY(20px); }
  20%  { opacity: 1; transform: scale(1.08) translateY(0); }
  30%  { opacity: 1; transform: scale(1) translateY(0); }
  75%  { opacity: 1; transform: scale(1) translateY(0); }
  100% { opacity: 0; transform: scale(1) translateY(-6px); }
}

/* ── Calendar ────────────────────────────────────────────────────────────── */

.exec-anim-cal-stage {
  width: 200px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.exec-anim-cal-page {
  animation: exec-anim-cal-page 2100ms cubic-bezier(0.2, 0.8, 0.3, 1) forwards;
  transform-origin: center center;
  opacity: 0;
}

@keyframes exec-anim-cal-page {
  0%   { opacity: 0; transform: scale(0.7) translateY(20px); }
  20%  { opacity: 1; transform: scale(1.04) translateY(0); }
  30%  { opacity: 1; transform: scale(1) translateY(0); }
  90%  { opacity: 1; transform: scale(1) translateY(0); }
  100% { opacity: 0; transform: scale(1) translateY(-6px); }
}

.exec-anim-cal-dot {
  animation: exec-anim-cal-dot 2100ms cubic-bezier(0.2, 0.8, 0.3, 1) forwards;
  opacity: 0;
}

@keyframes exec-anim-cal-dot {
  0%   { r: 0; opacity: 0; }
  40%  { r: 0; opacity: 0; }
  55%  { r: 12; opacity: 1; }
  65%  { r: 9; opacity: 1; }
  90%  { r: 9; opacity: 1; }
  100% { r: 9; opacity: 0; }
}

/* ── Generic ─────────────────────────────────────────────────────────────── */

.exec-anim-gen-stage {
  width: 200px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: exec-anim-gen-wrap 2100ms cubic-bezier(0.2, 0.8, 0.3, 1) forwards;
  opacity: 0;
}

@keyframes exec-anim-gen-wrap {
  0%   { opacity: 0; }
  15%  { opacity: 1; }
  85%  { opacity: 1; }
  100% { opacity: 0; }
}

.exec-anim-gen-circle {
  transform-origin: 40px 40px;
  transform-box: fill-box;
  animation: exec-anim-gen-circle 2100ms cubic-bezier(0.2, 0.8, 0.3, 1) forwards;
}

@keyframes exec-anim-gen-circle {
  0%   { transform: scale(0); }
  25%  { transform: scale(1.1); }
  35%  { transform: scale(1); }
  100% { transform: scale(1); }
}

.exec-anim-gen-check {
  stroke-dasharray: 50;
  stroke-dashoffset: 50;
  animation: exec-anim-gen-check 2100ms cubic-bezier(0.2, 0.8, 0.3, 1) forwards;
}

@keyframes exec-anim-gen-check {
  0%   { stroke-dashoffset: 50; }
  25%  { stroke-dashoffset: 50; }
  55%  { stroke-dashoffset: 0; }
  100% { stroke-dashoffset: 0; }
}

.exec-anim-gen-pulse {
  transform-origin: 40px 40px;
  transform-box: fill-box;
  animation: exec-anim-gen-pulse 2100ms cubic-bezier(0.2, 0.8, 0.3, 1) forwards;
  opacity: 0;
}

@keyframes exec-anim-gen-pulse {
  0%   { opacity: 0; transform: scale(1); }
  50%  { opacity: 0; transform: scale(1); }
  60%  { opacity: 0.5; transform: scale(1); }
  90%  { opacity: 0; transform: scale(1.6); }
  100% { opacity: 0; transform: scale(1.6); }
}
`;
