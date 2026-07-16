import { describe, expect, it } from "vitest";
import { transformReactJsx, usesReactRuntimeImports } from "./transform.js";

describe("automatic React JSX ownership", () => {
  it("detects referenced React value imports but ignores type-only and unused imports", () => {
    expect(usesReactRuntimeImports('import { useState } from "react"; export const V = () => { useState(0); return <i />; };', "v.tsx")).toBe(true);
    expect(usesReactRuntimeImports('import type { ReactNode } from "react"; export const value: ReactNode = null;', "v.tsx")).toBe(false);
    expect(usesReactRuntimeImports('import { useState } from "react"; export const V = () => <i />;', "v.tsx")).toBe(false);
  });

  it("lowers JSX and rewrites public React modules directly", () => {
    const result = transformReactJsx('import { useState } from "react"; export const V = () => <button>{useState(0)[0]}</button>;', {
      filename: "view.tsx", target: 18, sourceMap: true
    });
    expect(result.code).toContain('from "@exact/react-compat/jsx-runtime18"');
    expect(result.code).toContain('from "@exact/react-compat/react18"');
    expect(result.code).not.toContain('from "react"');
    expect(result.map).toMatchObject({ sources: ["view.tsx"] });
  });
});
