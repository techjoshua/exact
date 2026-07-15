/**
 * @vitest-environment jsdom
 */
import { beforeAll, describe, expect, it } from "vitest";
import { act, createElement } from "@exact/react-compat";
import { createRoot } from "./client.js";

let Airplay: any;
let useForm: any;
let create: any;

beforeAll(async () => {
  ({ Airplay, useForm, create } = await import("../fixtures/phase2.mjs"));
});

describe("React compatibility Phase 2 package fixtures", () => {
  it("renders current context-dependent lucide-react icons", async () => {
    const container = document.createElement("div");
    await act(() => createRoot(container).render(createElement(Airplay as never, {
      size: 20,
      color: "teal",
      "aria-label": "Airplay"
    })));
    const icon = container.querySelector("svg");
    expect(icon?.getAttribute("width")).toBe("20");
    expect(icon?.getAttribute("stroke")).toBe("teal");
    expect(icon?.getAttribute("aria-label")).toBe("Airplay");
  });

  it("runs react-hook-form state and effects", async () => {
    function FormView() {
      const form = useForm({ defaultValues: { name: "Ada" } });
      const name = form.watch("name");
      return createElement("div", null,
        createElement("span", { id: "name" }, name),
        createElement("button", { onClick: () => form.setValue("name", "Grace") }, "change")
      );
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(() => root.render(createElement(FormView, null)));
    expect(container.querySelector("#name")?.textContent).toBe("Ada");
    await act(() => container.querySelector("button")!.click());
    expect(container.querySelector("#name")?.textContent).toBe("Grace");
  });

  it("runs zustand through useSyncExternalStore", async () => {
    const useCounter = create((set: (update: (state: { count: number }) => { count: number }) => void) => ({
      count: 0,
      increment: () => set(state => ({ count: state.count + 1 }))
    }));
    function Counter() {
      const count = useCounter((state: { count: number }) => state.count);
      return createElement("button", { onClick: () => useCounter.getState().increment() }, String(count));
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(() => root.render(createElement(Counter, null)));
    expect(container.textContent).toBe("0");
    await act(() => container.querySelector("button")!.click());
    expect(container.textContent).toBe("1");
    root.unmount();
  });
});
