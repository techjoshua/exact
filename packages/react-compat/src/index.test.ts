import { describe, expect, it } from "vitest";
import path from "node:path";
import { Children, cache, cacheSignal, captureOwnerStack, cloneElement, createElement, isValidElement, useEffect, __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, __SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE } from "./index.js";
import { jsx } from "./jsx-runtime.js";
import { jsxSourceOwnership, reactCompatibilityAliases, resolveReactCompatibility, validateReactReconcilerTarget } from "./plugin.js";

describe("React compatibility elements", () => {
  it("creates, clones, validates, and flattens React-shaped elements", () => {
    const original = createElement("span", { id: "first", key: 7 }, "hello");
    const clone = cloneElement(original, { id: "second" });
    expect(isValidElement(original)).toBe(true);
    expect(original.key).toBe("7");
    expect(clone.props).toMatchObject({ id: "second", children: "hello" });
    expect(Children.toArray([null, original, false, "tail"])).toEqual([original, "tail"]);
    expect(jsx("div", { children: "jsx" }).props.children).toBe("jsx");
  });

  it("reports APIs deferred to later phases explicitly", () => {
    expect(() => useEffect(() => {})).toThrow(/Invalid hook call/);
  });

  it("resolves only supported React majors and exact aliases", () => {
    expect(resolveReactCompatibility({ target: 18 })?.aliases).toEqual(reactCompatibilityAliases(18));
    expect(resolveReactCompatibility()?.target).toBe(18);
    expect(resolveReactCompatibility(undefined, path.resolve(import.meta.dirname, "../../../apps/react-reference-19"))?.target).toBe(19);
    expect(resolveReactCompatibility(false)).toBeUndefined();
    expect(() => resolveReactCompatibility({ target: "auto" }, "/missing-react-project")).toThrow(/Unable to detect React/);
  });

  it("gives explicit JSX ownership precedence over source inference", () => {
    const resolved = resolveReactCompatibility({ target: 19, source: "/src/" });
    expect(jsxSourceOwnership("/src/view.tsx", "/** @jsxImportSource @exact/jsx */", resolved)).toBe("exact");
    expect(jsxSourceOwnership("/other/view.tsx", "/** @jsxImportSource react */", resolved)).toBe("react");
  });

  it("reports discoverable React/reconciler target mismatches", () => {
    expect(() => validateReactReconcilerTarget(19, {
      version: "0.29.2",
      peerDependencies: { react: "^18.3.1" },
      dependencies: { scheduler: "^0.23.2" }
    })).toThrow(/target 19.*react-reconciler 0\.29\.2.*scheduler \^0\.23\.2/);
    expect(() => validateReactReconcilerTarget(19, {
      version: "0.33.0",
      peerDependencies: { react: "^19.2.0" }
    })).not.toThrow();
    expect(() => validateReactReconcilerTarget(19, { peerDependencies: { react: ">=18" } })).not.toThrow();
    expect(() => validateReactReconcilerTarget(19, { peerDependencies: { react: "~19.0.0" } })).not.toThrow();
    expect(() => validateReactReconcilerTarget(19, { peerDependencies: { react: ">=18 <19" } })).toThrow(/target 19/);
    expect(() => validateReactReconcilerTarget(19, { peerDependencies: { react: "not a range" } })).toThrow(/invalid.*peer range/);
  });

  it("shares React 19 client and server dispatcher state", () => {
    expect(__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE)
      .toBe(__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE);
  });

  it("delegates React 19 cache, signal, and owner queries to an external async dispatcher", () => {
    const internals = __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const previous = internals.A;
    const signal = new AbortController().signal;
    const externalOwner = { type: function ExternalOwner() {}, return: null };
    const rootCaches = new Map<() => unknown, unknown>();
    let cacheCalls = 0;
    let signalCalls = 0;
    let ownerCalls = 0;
    internals.A = {
      getCacheForType<T>(factory: () => T): T {
        cacheCalls++;
        if (!rootCaches.has(factory)) rootCaches.set(factory, factory());
        return rootCaches.get(factory) as T;
      },
      cacheSignal() { signalCalls++; return signal; },
      getOwner() { ownerCalls++; return externalOwner; }
    };
    try {
      let computations = 0;
      const cached = cache((value: number) => ({ value, computation: ++computations }));
      expect(cached(1)).toBe(cached(1));
      expect(computations).toBe(1);
      expect(cacheCalls).toBe(2);
      expect(cacheSignal()).toBe(signal);
      expect(captureOwnerStack()).toContain("ExternalOwner");
      expect(createElement("span", null)._owner).toBe(externalOwner);
      expect(signalCalls).toBe(1);
      expect(ownerCalls).toBeGreaterThanOrEqual(2);
    } finally {
      internals.A = previous;
    }
  });
});
