import { describe, expect, it } from "vitest";
import { createComponentInstance, createContext, renderInstance, type Component } from "@exact/core";
import { adaptReactComponent } from "./exact.js";
import { HookHost } from "./internals.js";
import { bridgeReactContext, defineInteropContext, exactContextToken, exposeExactComponent, useExactContext } from "./interop.js";
import { createElement } from "./index.js";
import { toExactNode } from "./internals.js";

describe("eXact and React context interop", () => {
  it("lets React compatibility hooks consume a native ancestor context", () => {
    const Service = createContext<string>("fixture.service");
    let observed: string | undefined;
    const parent = createComponentInstance(function Parent(this: Component<{}>) {
      this.setContext(Service, "native-value");
      return () => null;
    }, {});
    const Reader = adaptReactComponent(function Reader() {
      observed = useExactContext(Service);
      return null;
    });
    const child = createComponentInstance(Reader, {}, parent);
    renderInstance(child, () => undefined);
    expect(observed).toBe("native-value");
  });

  it("makes a bridged React provider visible to native eXact descendants", () => {
    const Service = createContext<string>("fixture.provider");
    const ReactService = bridgeReactContext(Service, "default");
    let providerComponent!: Component<{}>;
    const provider = createComponentInstance(function Provider(this: Component<{}>) {
      providerComponent = this;
      return () => null;
    }, {});
    new HookHost(providerComponent).provide(ReactService, "react-value");
    const child = createComponentInstance(function Child(this: Component<{}>) {
      expect(this.getContext(Service)).toBe("react-value");
      return () => null;
    }, {}, provider);
    expect(child.getContext(Service)).toBe("react-value");
    expect(exactContextToken(ReactService)).toBe(Service);
  });

  it("defines paired identities and rejects extracting private React tokens", () => {
    const paired = defineInteropContext("fixture.paired", 0, { global: true });
    expect(exactContextToken(paired.react)).toBe(paired.exact);
    expect(() => exactContextToken({ _exactContextMode: "cell" } as never)).toThrow(/not created with bridgeReactContext/);
  });

  it("mounts explicitly exposed native components instead of invoking them as React functions", () => {
    function Native(this: Component<{}>) { return () => "native"; }
    const Boundary = exposeExactComponent(Native);
    const vnode = toExactNode(createElement(Boundary, {}));
    expect(Array.isArray(vnode)).toBe(false);
    expect((vnode as { type: unknown }).type).toBe(Native);
  });

  it("preserves keys, children, and explicitly forwarded refs at native boundaries", () => {
    const ref = { current: null };
    function Native(this: Component<{}>, _props: { nativeRef?: unknown; children?: unknown }) { return () => null; }
    const Boundary = exposeExactComponent(Native, "Native", { refProp: "nativeRef" });
    const vnode = toExactNode(createElement(Boundary, { key: "stable", ref }, "child")) as { key?: string; props: Record<string, unknown> };
    expect(vnode.key).toBe("stable");
    expect(vnode.props.nativeRef).toBe(ref);
    expect(vnode.props.children).toBe("child");
  });

  it("keeps nearest-provider semantics through alternating ownership layers", () => {
    const paired = defineInteropContext("fixture.alternating", "default");
    const root = createComponentInstance(function Root(this: Component<{}>) {
      this.setContext(paired.exact, "native-root");
      return () => null;
    }, {});
    const reactLayer = createComponentInstance(function Layer() { return () => null; }, {}, root);
    const reactHost = new HookHost(reactLayer as Component<{}>);
    expect(reactHost.exactContext(paired.exact)).toBe("native-root");
    reactHost.provide(paired.react, "react-override");
    const nativeLayer = createComponentInstance(function Native(this: Component<{}>) {
      expect(this.getContext(paired.exact)).toBe("react-override");
      return () => null;
    }, {}, reactLayer);
    const finalReactLayer = createComponentInstance(function Layer() { return () => null; }, {}, nativeLayer);
    expect(new HookHost(finalReactLayer as Component<{}>).exactContext(paired.exact)).toBe("react-override");
  });

  it("does not leak service values between roots", () => {
    const token = createContext<object>("fixture.root-local", { reactive: false });
    const leftValue = {};
    const rightValue = {};
    const makeRoot = (value: object) => createComponentInstance(function Root(this: Component<{}>) {
      this.setContext(token, value);
      return () => null;
    }, {});
    const left = createComponentInstance(function Child(this: Component<{}>) { return () => null; }, {}, makeRoot(leftValue));
    const right = createComponentInstance(function Child(this: Component<{}>) { return () => null; }, {}, makeRoot(rightValue));
    expect(left.getContext(token)).toBe(leftValue);
    expect(right.getContext(token)).toBe(rightValue);
  });
});
