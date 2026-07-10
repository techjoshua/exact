/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { createVNode } from "@exact/core";
import { hydrate, applyPatches } from "./index.js";

const noopLogger = {
  isEnabled: () => false,
  log() {}
};

describe("@exact/hydrate", () => {
  it("hydrates by falling back to normal render when markers are missing", () => {
    const container = document.createElement("div");

    hydrate(createVNode("p", null, "ready"), container, { logger: noopLogger });

    expect(container.querySelector("p")?.textContent).toBe("ready");
  });

  it("applies text patches to exact marker ranges", () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--exact:title-->Old<!--/exact:title-->";

    applyPatches(container, [{ type: "text", id: "title", value: "New" }]);

    expect(container.textContent).toBe("New");
  });

  it("applies replacement patches to exact marker ranges", () => {
    const container = document.createElement("div");
    container.innerHTML = "<!--exact:panel--><p>Old</p><!--/exact:panel-->";

    applyPatches(container, [{ type: "replace", id: "panel", html: "<section>New</section>" }]);

    expect(container.innerHTML).toBe("<!--exact:panel--><section>New</section><!--/exact:panel-->");
  });

  it("applies prop and style patches to exact id elements", () => {
    const container = document.createElement("div");
    container.innerHTML = "<button data-exact-id=\"save\">Save</button>";

    applyPatches(container, [
      { type: "prop", id: "save", name: "disabled", value: true },
      { type: "style", id: "save", name: "color", value: "red" }
    ]);

    const button = container.querySelector("button")!;
    expect(button.getAttribute("disabled")).toBe("true");
    expect(button.getAttribute("style")).toContain("color: red");
  });

  it("throws on patch mismatch in strict mode", () => {
    const container = document.createElement("div");

    expect(() => applyPatches(container, [{ type: "text", id: "missing", value: "x" }], { onMismatch: "throw", logger: noopLogger })).toThrow("Could not apply exact patch");
  });
});
