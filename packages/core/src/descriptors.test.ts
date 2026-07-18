import { describe, expect, it } from "vitest";
import {
  composeExactComponentDescriptors,
  exactClientComponentDescriptor,
  readExactComponentDescriptor
} from "./descriptors.js";

describe("component artifact descriptors", () => {
  it("reads and composes positional descriptors by stable id", () => {
    const island = () => undefined;
    const component = Object.assign(() => undefined, {
      [exactClientComponentDescriptor]: [1, [["island-id", island]]] as const
    });

    expect(readExactComponentDescriptor(component, "client")).toEqual([
      1,
      [["island-id", island]]
    ]);
    expect(composeExactComponentDescriptors([component], "client")).toEqual({
      "island-id": island
    });
    expect(composeExactComponentDescriptors([component], "server")).toEqual({});
  });

  it("rejects conflicting implementations for one stable id", () => {
    const component = (implementation: () => void) => Object.assign(() => undefined, {
      [exactClientComponentDescriptor]: [1, [["duplicate", implementation]]] as const
    });
    expect(() => composeExactComponentDescriptors([
      component(() => undefined),
      component(() => undefined)
    ], "client")).toThrow("Conflicting eXact component descriptor duplicate");
  });
});
