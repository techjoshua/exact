import { createServerSlot, createVNode, logFrameworkEvent } from "@exact/core";
import { render } from "@exact/dom";
import { isSafeObjectKey } from "./safety.js";
import type { ClientIslandRegistry, HydrateOptions } from "./types.js";

/** Hydrates all unhydrated client island boundaries found under a container. */
export function hydrateClientIslands(container: Element | Document, registry: ClientIslandRegistry, options: HydrateOptions = {}): number {
  let hydrated = 0;
  const attempted = new Set<Element>();
  // Hydrate outer islands first, then rescan the live DOM. Rendering an outer
  // island may retain, replace, or create nested island placeholders; iterating
  // a stale preorder snapshot could otherwise mount a detached nested root.
  while (true) {
    const boundaries = Array.from(container.querySelectorAll("[data-exact-client-boundary]"))
      .filter(boundary => boundary.getAttribute("data-exact-client-hydrated") !== "true" && !attempted.has(boundary));
    const boundary = boundaries.find(candidate => {
      const parent = candidate.parentElement?.closest("[data-exact-client-boundary]");
      return !parent || parent.getAttribute("data-exact-client-hydrated") === "true";
    });
    if (!boundary) break;
    attempted.add(boundary);
    const name = boundary.getAttribute("data-exact-client-name");
    if (!name) continue;
    const component = registry[name];
    if (!component) {
      logFrameworkEvent("warn", "hydrate", "island", `missing client island ${name}`, undefined, options.logger);
      continue;
    }
    const props = parseIslandProps(boundary.getAttribute("data-exact-client-props"));
    render(createVNode(component, props), boundary, { logger: options.logger });
    boundary.setAttribute("data-exact-client-hydrated", "true");
    hydrated++;
  }
  return hydrated;
}

function parseIslandProps(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const props = (parsed as Record<string, unknown>).props;
    return props && typeof props === "object" && !Array.isArray(props)
      ? reviveServerSlots(props) as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function reviveServerSlots(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviveServerSlots);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (typeof record.__exactServerSlot === "string") {
    return createServerSlot(record.__exactServerSlot);
  }
  const revived: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (!isSafeObjectKey(key)) continue;
    revived[key] = reviveServerSlots(child);
  }
  return revived;
}
