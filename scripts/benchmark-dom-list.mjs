import { JSDOM } from "jsdom";
import { createVNode } from "../packages/core/dist/index.js";
import { render } from "../packages/dom/dist/index.js";

const dom = new JSDOM("<!doctype html><body></body>");
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  Node: dom.window.Node,
  Element: dom.window.Element,
  HTMLElement: dom.window.HTMLElement,
  CharacterData: dom.window.CharacterData,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement
});

const items = Array.from({ length: 1_000 }, (_, id) => ({ id: String(id) }));
let instance;
function List() {
  instance = this;
  this.state.items = items;
  return () => createVNode("ul", null, this.map(this.state.items, item => item.id, item => createVNode("li", null, item.id)));
}

const container = document.createElement("div");
render(createVNode(List, null), container);
const start = performance.now();
instance.state.items.splice(0, items.length, items.at(-1), ...items.slice(0, -1));
const elapsed = performance.now() - start;
if (container.querySelectorAll("li").length !== 1_000) throw new Error("1k keyed list lost items during rotation");
if (elapsed > 2_000) throw new Error(`1k keyed rotation exceeded 2000ms budget (${elapsed.toFixed(1)}ms)`);
console.log(`keyed 1k rotation: ${elapsed.toFixed(1)}ms`);
