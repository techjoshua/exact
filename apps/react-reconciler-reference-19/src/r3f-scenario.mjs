import React, { createElement } from "react";
import { advance, createRoot, extend, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

extend(THREE);

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export async function runR3fScenario() {
  const canvas = {};
  const lifecycle = [];
  const renderer = {
    domElement: canvas,
    outputColorSpace: "",
    toneMapping: 0,
    shadowMap: { enabled: false, type: 0 },
    renderLists: { dispose: () => lifecycle.push("render-lists-dispose") },
    xr: {
      enabled: false,
      isPresenting: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      setAnimationLoop: () => {}
    },
    setPixelRatio: value => lifecycle.push(`dpr:${value}`),
    setSize: (width, height) => lifecycle.push(`size:${width}x${height}`),
    render: (scene, camera) => lifecycle.push(`render:${scene.children.length}:${camera.type}`),
    forceContextLoss: () => lifecycle.push("context-loss")
  };
  let frameCount = 0;
  let observed;
  function Scene({ position }) {
    const state = useThree();
    observed = { width: state.size.width, camera: state.camera.type };
    useFrame(() => { frameCount++; });
    return createElement("mesh", { name: "certification-mesh", position },
      createElement("boxGeometry", { key: "geometry", args: [1, 1, 1] }),
      createElement("meshBasicMaterial", { key: "material", color: "hotpink" })
    );
  }
  const root = createRoot(canvas);
  await root.configure({ gl: renderer, size: { width: 320, height: 200, top: 0, left: 0 }, frameloop: "never", dpr: 1 });
  const store = root.render(createElement(Scene, { position: [0, 0, 0] }));
  await delay(20);
  advance(1, true, store.getState());
  const mesh = store.getState().scene.getObjectByName("certification-mesh");
  root.render(createElement(Scene, { position: [2, 0, 0] }));
  await delay(20);
  const updatedPosition = mesh?.position.x;
  root.unmount();
  await delay(550);
  return {
    package: "@react-three/fiber",
    version: "9.6.1",
    observed,
    frameCount,
    meshCreated: Boolean(mesh?.isMesh),
    updatedPosition,
    disposed: lifecycle.includes("render-lists-dispose") && lifecycle.includes("context-loss"),
    lifecycle
  };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) console.log(JSON.stringify(await runR3fScenario()));
