import React, { createElement } from "react";
import { advance, createRoot, extend, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

extend(THREE);
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

/** Runs r3f18 scenario with the supplied execution context. */
export async function runR3f18Scenario() {
  const canvas = {};
  const lifecycle = [];
  const renderer = {
    domElement: canvas, outputEncoding: 0, toneMapping: 0,
    shadowMap: { enabled: false, type: 0 },
    renderLists: { dispose: () => lifecycle.push("render-lists-dispose") },
    xr: { enabled: false, isPresenting: false, addEventListener() {}, removeEventListener() {}, setAnimationLoop() {} },
    setPixelRatio: value => lifecycle.push(`dpr:${value}`),
    setSize: (width, height) => lifecycle.push(`size:${width}x${height}`),
    render: scene => lifecycle.push(`render:${scene.children.length}`),
    forceContextLoss: () => lifecycle.push("context-loss")
  };
  let frameCount = 0;
  function Scene({ position }) {
    const state = useThree();
    useFrame(() => { frameCount++; });
    return createElement("mesh", { name: `r3f18-${state.size.width}`, position });
  }
  const root = createRoot(canvas);
  await root.configure({ gl: renderer, size: { width: 300, height: 180, top: 0, left: 0 }, frameloop: "never", dpr: 1 });
  const store = root.render(createElement(Scene, { position: [0, 0, 0] }));
  await delay(20);
  advance(1, true, store.getState());
  const mesh = store.getState().scene.getObjectByName("r3f18-300");
  root.render(createElement(Scene, { position: [3, 0, 0] }));
  await delay(20);
  const updatedPosition = mesh?.position.x;
  root.unmount();
  await delay(550);
  return {
    package: "@react-three/fiber", version: "8.18.0", frameCount,
    meshCreated: Boolean(mesh?.isMesh), updatedPosition,
    disposed: lifecycle.includes("render-lists-dispose") && lifecycle.includes("context-loss"), lifecycle
  };
}
