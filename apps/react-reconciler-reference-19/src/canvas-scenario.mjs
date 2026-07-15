import { JSDOM } from "jsdom";
import React, { createContext, createElement, useContext } from "react";
import { createRoot as createDomRoot } from "react-dom/client";
import { Canvas, useThree } from "@react-three/fiber";

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const SurroundingContext = createContext("default");

export async function runCanvasScenario() {
  const dom = new JSDOM("<!doctype html><html><body><main id=app></main></body></html>", { pretendToBeVisual: true });
  const previous = new Map();
  for (const name of [
    "window", "document", "Node", "Element", "DocumentFragment", "HTMLElement", "HTMLCanvasElement",
    "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "HTMLFormElement", "SVGElement",
    "Event", "InputEvent", "PointerEvent", "MutationObserver", "screen", "requestAnimationFrame", "cancelAnimationFrame", "getComputedStyle"
  ]) {
    previous.set(name, globalThis[name]);
    if (name in dom.window) globalThis[name] = dom.window[name];
  }
  previous.set("ResizeObserver", globalThis.ResizeObserver);
  globalThis.ResizeObserver = class ResizeObserver {
    constructor(callback) { this.callback = callback; }
    observe(target) { queueMicrotask(() => this.callback([{ target, contentRect: target.getBoundingClientRect() }])); }
    unobserve() {}
    disconnect() {}
  };
  const rect = { width: 320, height: 200, top: 0, left: 0, right: 320, bottom: 200, x: 0, y: 0, toJSON() { return this; } };
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => rect;
  const lifecycle = [];
  let createdState;
  const errors = [];
  const renderer = {
    outputColorSpace: "", toneMapping: 0,
    shadowMap: { enabled: false, type: 0 },
    renderLists: { dispose: () => lifecycle.push("render-lists-dispose") },
    xr: { enabled: false, isPresenting: false, addEventListener() {}, removeEventListener() {}, setAnimationLoop() {} },
    setPixelRatio: value => lifecycle.push(`dpr:${value}`),
    setSize: (width, height) => lifecycle.push(`size:${width}x${height}`),
    render: scene => lifecycle.push(`render:${scene.children.length}`),
    forceContextLoss: () => lifecycle.push("context-loss")
  };
  function Scene() {
    const state = useThree();
    const surrounding = useContext(SurroundingContext);
    return createElement("mesh", { name: `canvas-mesh-${surrounding}-${state.size.width}` });
  }
  const container = dom.window.document.querySelector("#app");
  const root = createDomRoot(container, {
    onUncaughtError: error => errors.push(error),
    onCaughtError: error => errors.push(error),
    onRecoverableError: error => errors.push(error)
  });
  try {
    root.render(createElement(SurroundingContext.Provider, { value: "ocean" }, createElement(Canvas, {
      gl: defaults => { renderer.domElement = defaults.canvas; return renderer; },
      frameloop: "never",
      dpr: 1,
      resize: { polyfill: globalThis.ResizeObserver },
      onCreated: state => { createdState = state; }
    }, createElement(Scene))));
    for (let count = 0; count < 40 && !createdState; count++) await delay(10);
    const canvas = container.querySelector("canvas");
    const mesh = createdState?.scene.getObjectByName("canvas-mesh-ocean-320");
    const htmlBeforeUnmount = container.innerHTML;
    root.unmount();
    await delay(550);
    return {
      canvasMounted: Boolean(canvas),
      meshCreated: Boolean(mesh?.isMesh),
      contextBridged: mesh?.name === "canvas-mesh-ocean-320",
      size: createdState ? [createdState.size.width, createdState.size.height] : null,
      disposed: lifecycle.includes("render-lists-dispose") && lifecycle.includes("context-loss"),
      domAfterUnmount: container.childNodes.length,
      htmlBeforeUnmount,
      errors: errors.map(error => error?.stack ?? String(error)),
      lifecycle
    };
  } finally {
    try { root.unmount(); } catch {}
    for (const [name, value] of previous) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
    dom.window.close();
  }
}
