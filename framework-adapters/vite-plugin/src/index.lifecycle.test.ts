import { describe, expect, it } from "vitest";
import { analyzeSource } from "@exact/compiler";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { exact } from "./index.js";
import { createReactCompatibilityBuildEngine } from "@exact/react-compat/build";

describe("@exact/vite-plugin: lifecycle", () => {
  it("honors include and exclude filters", () => {
    expect(exact({ include: "/src/", reactCompatibility: false }).transform("const view = <span />;", "/src/view.tsx")).not.toBeNull();
    expect(exact({ include: "/src/", reactCompatibility: false }).transform("const view = <span />;", "/test/view.tsx")).toBeNull();
    expect(exact({ exclude: /ignored/, reactCompatibility: false }).transform("const view = <span />;", "/src/ignored.tsx")).toBeNull();
  });

  it("skips node_modules unless explicitly included", () => {
    expect(exact({ reactCompatibility: false }).transform("const view = <span />;", "/project/node_modules/lib/view.tsx")).toBeNull();
    expect(exact({ include: "node_modules/lib", reactCompatibility: false }).transform("const view = <span />;", "/project/node_modules/lib/view.tsx")).not.toBeNull();
  });

  it("adds filename context to transform errors", () => {
    const plugin = exact({ reactCompatibility: false });

    expect(() => plugin.transform("const view = <span>;", "/src/broken.tsx")).toThrow(/broken\.tsx:1:\d+/);
  });

  it("invalidates semantic state for source and project configuration updates", () => {
    const plugin = exact({ reactCompatibility: false });
    expect(() => plugin.handleHotUpdate?.({ file: "/src/model.ts" })).not.toThrow();
    expect(() => plugin.handleHotUpdate?.({ file: "/project/tsconfig.json" })).not.toThrow();
    expect(() => plugin.watchChange?.("/src/removed.tsx", { event: "delete" })).not.toThrow();
    plugin.closeBundle?.();
  });

  it("enables and deduplicates diagnostics by default during development", () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    const model = path.join(root, "apps/kanban/src/__vite_diagnostic_model.ts");
    const consumer = path.join(root, "apps/kanban/src/__vite_diagnostic_consumer.ts");
    const plugin = exact({ reactCompatibility: false });
    const warnings: string[] = [];
    const context = { warn: (message: string) => warnings.push(message) };
    try {
      plugin.configResolved?.({ command: "serve" });
      writeFileSync(model, "export interface Model { value: number }\nexport const model: Model = { value: 1 };");
      writeFileSync(consumer, 'import { model } from "./__vite_diagnostic_model.js"; export const value: number = model.value;');
      plugin.handleHotUpdate?.call(context, { file: model });
      writeFileSync(model, 'export interface Model { value: string }\nexport const model: Model = { value: "changed" };');
      plugin.handleHotUpdate?.call(context, { file: model });
      plugin.handleHotUpdate?.call(context, { file: model });
      expect(warnings.filter(message => message.includes("TS2322"))).toHaveLength(1);
    } finally {
      plugin.closeBundle?.();
      rmSync(model, { force: true });
      rmSync(consumer, { force: true });
    }
  });

  it("disposes its compiler session when the dev server closes", () => {
    const plugin = exact({ reactCompatibility: false });
    let close!: () => void;
    plugin.configureServer?.({
      httpServer: {
        once(event, listener) {
          expect(event).toBe("close");
          close = listener;
        }
      },
      watcher: {
        once(event) {
          expect(event).toBe("close");
        }
      }
    });
    expect(plugin.transform("const view = <span />;", "/src/lifecycle.tsx")).not.toBeNull();
    close();
    expect(() => plugin.transform("const view = <span />;", "/src/lifecycle.tsx")).toThrow("disposed");
  });

  it("disposes its compiler session when a build closes", () => {
    const plugin = exact({ reactCompatibility: false });
    expect(plugin.transform("const view = <span />;", "/src/build.tsx")).not.toBeNull();
    plugin.closeBundle?.();
    expect(() => plugin.transform("const view = <span />;", "/src/build.tsx")).toThrow("disposed");
  });

  it("watches every registry input used by the shared engine", () => {
    const cwd = path.resolve(import.meta.dirname, "../test-fixtures/adapter-app");
    const plugin = exact({ reactCompatibility: { target: 18, cwd } });
    const watched: string[] = [];
    plugin.buildStart?.call({ addWatchFile: file => watched.push(file) });
    expect(watched.some(file => file.endsWith("package-lock.json"))).toBe(true);
    expect(watched.some(file => file.replaceAll("\\", "/").endsWith("@exact/tanstack-query/package.json"))).toBe(true);
  });
});
