import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Html, OrbitControls, useGLTF, useTexture } from "@react-three/drei";
import { CubeTexture } from "three";

const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const emptyGltf = `data:model/gltf+json;base64,${btoa(JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [] }], nodes: [] }))}`;

const ShellContext = createContext("missing");
const result = window.__exactR3fBrowser = {
  done: false,
  errors: [],
  cycles: []
};
const initialHeap = performance.memory?.usedJSHeapSize ?? null;
let activeCycle = null;

window.addEventListener("error", event => {
  const message = String(event.error ?? event.message);
  result.errors.push(message);
  activeCycle?.errors.push(message);
});
window.addEventListener("unhandledrejection", event => {
  const message = String(event.reason);
  result.errors.push(message);
  activeCycle?.errors.push(message);
});

function Scene() {
  const cycle = activeCycle;
  const shellValue = useContext(ShellContext);
  const rendererState = useThree();
  const { gl, scene } = rendererState;
  const [position, setPosition] = useState(0);
  const texture = useTexture(pixel);
  const gltf = useGLTF(emptyGltf);
  const environment = useMemo(() => new CubeTexture(), []);

  useEffect(() => {
    cycle.contextBridged = shellValue === "exact-shell";
    const context = gl.getContext?.();
    cycle.webgl = Boolean(context);
    setPosition(2);
    const canvas = gl.domElement;
    const onLost = event => { event.preventDefault(); cycle.contextLost = true; };
    const onRestored = () => { cycle.contextRestored = true; };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    const extension = context?.getExtension("WEBGL_lose_context");
    const loseTimer = setTimeout(() => extension?.loseContext(), 100);
    const restoreTimer = setTimeout(() => extension?.restoreContext(), 250);
    return () => {
      clearTimeout(loseTimer);
      clearTimeout(restoreTimer);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [gl, shellValue]);

  useEffect(() => {
    const mesh = scene.getObjectByName("compat-mesh");
    if (mesh) cycle.updatedPosition = mesh.position.x;
  }, [position, scene]);

  useFrame(() => {
    cycle.frames += 1;
    const mesh = scene.getObjectByName("compat-mesh");
    if (mesh) cycle.updatedPosition = mesh.position.x;
    cycle.drei.controls = Boolean(rendererState.controls);
    cycle.drei.environment = scene.environment === environment;
    cycle.drei.html = Boolean(document.getElementById("drei-overlay"));
    cycle.drei.texture = Boolean(texture?.isTexture);
    cycle.drei.gltf = Boolean(gltf?.scene?.isObject3D);
  });

  return React.createElement(React.Fragment, null,
    React.createElement(
      "mesh",
      { name: "compat-mesh", position: [position, 0, 0], onPointerDown: () => { cycle.pointerRaycast = true; } },
      React.createElement("boxGeometry"),
      React.createElement("meshBasicMaterial", { color: "hotpink", map: texture })
    ),
    React.createElement("primitive", { object: gltf.scene.clone() }),
    React.createElement(Environment, { map: environment }),
    React.createElement(OrbitControls, { makeDefault: true }),
    React.createElement(Html, null, React.createElement("span", { id: "drei-overlay" }, "overlay"))
  );
}

const host = document.getElementById("root");
let root;
let cycleFinishing = false;
function mountCycle() {
  activeCycle = {
    index: result.cycles.length + 1,
    startedAt: performance.now(),
    errors: [],
    frames: 0,
    contextBridged: false,
    pointerRaycast: false,
    contextLost: false,
    contextRestored: false,
    drei: { controls: false, environment: false, html: false, texture: false, gltf: false },
    updatedPosition: null,
    webgl: false,
    cleaned: false,
    animationStopped: false
  };
  root = createRoot(host);
  root.render(React.createElement(
    ShellContext.Provider,
    { value: "exact-shell" },
    React.createElement(Canvas, { camera: { position: [0, 0, 5] }, frameloop: "always" },
      React.createElement(React.Suspense, { fallback: null }, React.createElement(Scene)))
  ));
}
mountCycle();

const poll = setInterval(() => {
  const cycle = activeCycle;
  if (cycleFinishing || !cycle) return;
  const canvas = host.querySelector("canvas");
  if (canvas && cycle.frames >= 2 && !cycle.pointerRaycast) {
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      // The update moves the mesh to x=2; with the pinned camera this projects
      // to roughly three quarters of the viewport width.
      clientX: rect.left + rect.width * 0.76,
      clientY: rect.top + rect.height / 2,
      pointerId: 1,
      pointerType: "mouse"
    }));
  }
  const dreiReady = Object.values(cycle.drei).every(Boolean);
  const ready = cycle.webgl && cycle.contextBridged && cycle.contextLost && cycle.contextRestored && cycle.updatedPosition === 2 && cycle.frames >= 3 && cycle.pointerRaycast && dreiReady;
  const timedOut = performance.now() - cycle.startedAt >= 10_000;
  if (!ready && !timedOut) return;
  if (timedOut) cycle.errors.push(`cycle ${cycle.index} timed out before satisfying its readiness assertions`);
  cycleFinishing = true;
  const framesBeforeUnmount = cycle.frames;
  root.unmount();
  cycle.cleaned = host.childNodes.length === 0;
  setTimeout(() => {
    cycle.animationStopped = cycle.frames === framesBeforeUnmount;
    cycle.passed = ready && cycle.cleaned && cycle.animationStopped && cycle.errors.length === 0;
    delete cycle.startedAt;
    result.cycles.push(cycle);
    if (result.cycles.length < 5 && cycle.passed) {
      mountCycle();
      cycleFinishing = false;
      return;
    }
    clearInterval(poll);
    globalThis.gc?.();
    const finalHeap = performance.memory?.usedJSHeapSize ?? null;
    result.heapDeltaBytes = initialHeap === null || finalHeap === null ? null : finalHeap - initialHeap;
    result.memoryBudgetPassed = result.heapDeltaBytes === null ? null : result.heapDeltaBytes < 64 * 1024 * 1024;
    result.done = true;
  }, 150);
}, 50);
