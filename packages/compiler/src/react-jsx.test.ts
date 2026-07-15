import { describe, expect, it } from "vitest";
import { transformReactJsx, usesReactRuntimeImports } from "./react-jsx.js";

describe("automatic React JSX ownership", () => {
  it("detects referenced React value imports but ignores type-only and unused imports", () => {
    expect(usesReactRuntimeImports('import { useState } from "react"; export const V = () => { useState(0); return <i />; };', "v.tsx")).toBe(true);
    expect(usesReactRuntimeImports('import * as React from "react"; export class V extends React.Component { render() { return <i />; } }', "v.tsx")).toBe(true);
    expect(usesReactRuntimeImports('import { Component } from "react"; export class V extends Component { render() { return <i />; } }', "v.tsx")).toBe(true);
    expect(usesReactRuntimeImports('import type { ReactNode } from "react"; export const value: ReactNode = null;', "v.tsx")).toBe(false);
    expect(usesReactRuntimeImports('import { Component } from "react"; interface V extends Component {}', "v.tsx")).toBe(false);
    expect(usesReactRuntimeImports('import { useState } from "react"; export const V = () => <i />;', "v.tsx")).toBe(false);
  });

  it("rewrites authored React DOM imports while leaving ordinary strings intact", () => {
    const result = transformReactJsx(
      'import { createPortal } from "react-dom"; export const label = "react"; export const V = (target: Element) => createPortal(<i />, target);',
      { filename: "portal.tsx", target: 19 }
    );
    expect(result.code).toContain('from "@exact/react-dom-compat/react19"');
    expect(result.code).toContain('from "@exact/react-compat/jsx-runtime19"');
    expect(result.code).toContain('label = "react"');
  });

  it("emits a direct target-specific compatibility JSX runtime import", () => {
    const result = transformReactJsx('import { useState } from "react"; export const V = () => <button>{useState(0)[0]}</button>;', {
      filename: "view.tsx",
      target: 18,
      sourceMap: true
    });
    expect(result.code).toContain('from "@exact/react-compat/jsx-runtime18"');
    expect(result.code).toContain('from "@exact/react-compat/react18"');
    expect(result.code).not.toContain('from "react"');
    expect(result.code).not.toContain("<button>");
    expect(result.map).toMatchObject({ sources: ["view.tsx"] });
  });

});
