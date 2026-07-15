import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { defaultDraft, normalizeDraft } from "../model.js";
import { createDhlProvider, createFedexProvider, createUpsProvider, createUspsProvider, ProviderHttpError } from "./live.js";

const request = normalizeDraft({ ...defaultDraft, declaredValue: "200", insurance: true, signature: "standard" });
const fixture = async (name: string) => JSON.parse(await readFile(new URL(`./fixtures/${name}-rates.json`, import.meta.url), "utf8"));

describe("live carrier adapters", () => {
  it.each([
    ["usps", createUspsProvider, { USPS_CLIENT_ID: "id", USPS_CLIENT_SECRET: "secret", USPS_RATE_URL: "https://fixture.test/rate" }],
    ["ups", createUpsProvider, { UPS_CLIENT_ID: "id", UPS_CLIENT_SECRET: "secret", UPS_ACCOUNT_NUMBER: "account", UPS_RATE_URL: "https://fixture.test/rate" }],
    ["fedex", createFedexProvider, { FEDEX_CLIENT_ID: "id", FEDEX_CLIENT_SECRET: "secret", FEDEX_ACCOUNT_NUMBER: "account", FEDEX_RATE_URL: "https://fixture.test/rate" }],
    ["dhl", createDhlProvider, { DHL_API_KEY: "id", DHL_API_SECRET: "secret", DHL_ACCOUNT_NUMBER: "account", DHL_RATE_URL: "https://fixture.test/rate" }]
  ] as const)("maps sanitized %s responses into shared quotes", async (id, create, env) => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = String(input); calls.push({ url, init });
      if (url.includes("oauth") || url.includes("token")) return Response.json({ access_token: `token-${id}`, expires_in: 3600 });
      return Response.json(await fixture(id));
    };
    const provider = create(env as NodeJS.ProcessEnv);
    const quotes = await provider.quote(request, { signal: new AbortController().signal, fetch: fetchMock as typeof fetch });
    expect(quotes[0]).toMatchObject({ providerId: id, source: "live", currency: "USD" });
    expect(quotes[0]!.totalPriceCents).toBeGreaterThan(0);
    expect(quotes[0]!.totalPriceCents).toBe(quotes[0]!.charges.reduce((sum, charge) => sum + charge.amountCents, 0));
    expect(JSON.stringify(quotes)).not.toContain("secret");
    expect(calls.at(-1)?.url).toContain("fixture.test/rate");
    if (id === "usps") expect(JSON.parse(String(calls.at(-1)?.init?.body))).toMatchObject({ priceType: "RETAIL", processingCategory: "MACHINABLE", rateIndicator: "SP" });
    if (id === "fedex") expect(String(calls[0]?.init?.body)).toContain("client_id=id");
  });

  it("surfaces HTTP status and Retry-After without response contents", async () => {
    const provider = createDhlProvider({ DHL_API_KEY: "id", DHL_API_SECRET: "secret", DHL_ACCOUNT_NUMBER: "account", DHL_RATE_URL: "https://fixture.test/rate" });
    await expect(provider.quote(request, { signal: new AbortController().signal, fetch: (async () => new Response("account data", { status: 429, headers: { "retry-after": "12" } })) as typeof fetch }))
      .rejects.toEqual(expect.objectContaining<Partial<ProviderHttpError>>({ status: 429, retryAfterSeconds: 12 }));
  });
});
