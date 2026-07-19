import { describe, expect, it } from "vitest";
import { createProfileCollector, summarizeProfile, type ExactProfileEvent } from "./index.js";

describe("@exact/instrumentation", () => {
  it("collects immutable snapshots and clears without global state", () => {
    const collector = createProfileCollector<ExactProfileEvent<"compiler", "transform">>();
    collector.sink(Object.freeze({
      subsystem: "compiler",
      phase: "transform",
      elapsedMs: 2,
      counts: Object.freeze({ modules: 1 })
    }));

    const snapshot = collector.snapshot();
    collector.clear();

    expect(snapshot).toEqual([expect.objectContaining({ subsystem: "compiler", phase: "transform" })]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(collector.snapshot()).toEqual([]);
  });

  it("summarizes subsystem phases by cumulative elapsed time", () => {
    const events: ExactProfileEvent[] = [
      { subsystem: "dom", phase: "render", elapsedMs: 2 },
      { subsystem: "dom", phase: "render", elapsedMs: 3 },
      { subsystem: "ssr", phase: "render", elapsedMs: 1 }
    ];

    expect(summarizeProfile(events)).toEqual([
      { subsystem: "dom", phase: "render", elapsedMs: 5, events: 2 },
      { subsystem: "ssr", phase: "render", elapsedMs: 1, events: 1 }
    ]);
  });
});
