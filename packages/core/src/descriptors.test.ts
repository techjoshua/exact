import { describe, expect, it } from "vitest";
import {
  composeExactComponentDescriptors,
  exactClientComponentDescriptor,
  readExactComponentDescriptor
} from "./descriptors.js";

describe("component artifact descriptors", () => {
  it("reads positional descriptors and composes their runtime lookup names", () => {
    const island = () => undefined;
    const component = Object.assign(() => undefined, {
      [exactClientComponentDescriptor]: [1, [["island-id", "Panel_ExactClient_1", island]]] as const
    });

    expect(readExactComponentDescriptor(component, "client")).toEqual([
      1,
      [["island-id", "Panel_ExactClient_1", island]]
    ]);
    expect(composeExactComponentDescriptors([component], "client")).toEqual({
      "Panel_ExactClient_1": island
    });
    expect(composeExactComponentDescriptors([component], "server")).toEqual({});
  });

  it("rejects conflicting implementations for one runtime lookup name", () => {
    const component = (implementation: () => void) => Object.assign(() => undefined, {
      [exactClientComponentDescriptor]: [1, [["component-id", "duplicate", implementation]]] as const
    });
    expect(() => composeExactComponentDescriptors([
      component(() => undefined),
      component(() => undefined)
    ], "client")).toThrow("Conflicting eXact component descriptor duplicate");
  });
});
