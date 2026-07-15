import { describe, expect, it } from "vitest";
import { defaultDraft, draftFromUrl, draftUrl, normalizeDraft, rankQuotes } from "./model.js";
import type { RateQuote } from "./types.js";

describe("shipment model", () => {
  it("normalizes imperial values without floating-point currency drift", () => {
    const request = normalizeDraft({ ...defaultDraft, originZip: "97205-1234", pounds: "1", ounces: "8.5", declaredValue: "123.45", insurance: true });
    expect(request.originZip).toBe("97205-1234");
    expect(request.originZip5).toBe("97205");
    expect(request.weightOunces).toBe(24.5);
    expect(request.declaredValueCents).toBe(12_345);
  });

  it("rejects malformed ZIPs, zero weight, non-finite dimensions, and insurance without value", () => {
    expect(() => normalizeDraft({ ...defaultDraft, originZip: "972" })).toThrow(/ZIP/);
    expect(() => normalizeDraft({ ...defaultDraft, pounds: "0", ounces: "0" })).toThrow(/Weight/);
    expect(() => normalizeDraft({ ...defaultDraft, length: "Infinity" })).toThrow(/length/);
    expect(() => normalizeDraft({ ...defaultDraft, declaredValue: "", insurance: true })).toThrow(/declared value/);
  });

  it("round-trips readable URL state in stable order", () => {
    const draft = { ...defaultDraft, signature: "adult" as const, declaredValue: "250", insurance: true, machinable: false };
    const url = draftUrl(draft, new URL("https://example.test/calculator"));
    expect([...url.searchParams.keys()].slice(0, 5)).toEqual(["from", "to", "kind", "weight", "size"]);
    const parsed = draftFromUrl(url);
    expect(parsed.explicit).toBe(true);
    expect(normalizeDraft(parsed.draft)).toEqual(normalizeDraft({ ...draft, preset: "custom" }));
  });

  it("uses defaults when no explicit shipment parameters exist", () => {
    const parsed = draftFromUrl(new URL("https://example.test/?utm_source=test"));
    expect(parsed.explicit).toBe(false);
    expect(parsed.draft).toEqual(defaultDraft);
  });

  it("always ranks compatible quotes above incompatible quotes", () => {
    const quote = (id: string, cents: number, compatible: boolean, days: number): RateQuote => ({
      version: 1, id, providerId: "doop", providerName: "DOOP", serviceCode: id, serviceName: id, currency: "USD",
      basePriceCents: cents, totalPriceCents: cents, delivery: { maximumDays: days, guaranteed: false },
      charges: [], features: [], compatible, warnings: [], source: "mock"
    });
    expect(rankQuotes([quote("cheap-bad", 1, false, 1), quote("good", 500, true, 5)], "cheapest").map(item => item.id)).toEqual(["good", "cheap-bad"]);
  });
});
