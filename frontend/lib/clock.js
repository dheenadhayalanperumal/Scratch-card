"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Single clock that drives every animation on the customer page. Components
 * read `t` (seconds) and paint a pure function of it — no CSS transitions or
 * timers for the card, headline, lights or win reveal.
 *
 * Live mode: requestAnimationFrame advances `t` while anything is subscribed.
 * Render mode (`?render`): no rAF; `t` comes from `?t=` and `window.seek(t)`,
 * so any frame can be reproduced exactly (used for contact sheets / capture).
 */

const isBrowser = typeof window !== "undefined";
const params = isBrowser ? new URLSearchParams(window.location.search) : null;

export const RENDER_MODE = Boolean(params?.has("render"));
export const renderParam = (key) => params?.get(key) ?? null;

const origin = isBrowser ? performance.now() : 0;
let seekT = RENDER_MODE ? Number(params.get("t")) || 0 : 0;
let frameT = 0;
let raf = 0;
const subs = new Set();

export function now() {
  if (RENDER_MODE) return seekT;
  return isBrowser ? (performance.now() - origin) / 1000 : 0;
}

function emit() {
  subs.forEach((fn) => fn());
}

function loop() {
  frameT = now();
  emit();
  raf = requestAnimationFrame(loop);
}

function subscribe(fn) {
  subs.add(fn);
  if (!RENDER_MODE && !raf && isBrowser) {
    frameT = now();
    raf = requestAnimationFrame(loop);
  }
  return () => {
    subs.delete(fn);
    if (!subs.size && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}

if (RENDER_MODE) {
  window.seek = (t) => {
    seekT = Number(t) || 0;
    emit();
  };
}

const snapshot = () => (RENDER_MODE ? seekT : frameT);

/** Current clock time in seconds; re-renders the caller every frame. */
export function useTime() {
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}

/** Run `fn(t)` on every tick (and once immediately) without re-rendering. */
export function onTick(fn) {
  const run = () => fn(now());
  run();
  return subscribe(run);
}

/**
 * 0→1 entrance progress that starts when the caller mounts. Settles at 1, after
 * which the snapshot stops changing so the caller stops re-rendering.
 */
export function useEntrance(dur = 0.8, delay = 0) {
  const [start] = useState(now);
  const reduced = useReducedMotion();
  const p = useSyncExternalStore(
    subscribe,
    () => Math.min(1, Math.max(0, (snapshot() - start - delay) / dur)),
    () => 0
  );
  return reduced ? 1 : p;
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}
