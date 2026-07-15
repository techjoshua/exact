import type { InitialModel, MailpieceKind, RateQuote, RateRequest, ShipmentDraft } from "./types.js";

const zipPattern = /^\d{5}(?:-\d{4})?$/;

export const defaultDraft: ShipmentDraft = {
  version: 1,
  originZip: "97205",
  destinationZip: "10001",
  kind: "parcel",
  preset: "small-box",
  pounds: "2",
  ounces: "0",
  length: "12",
  width: "9",
  height: "5",
  declaredValue: "",
  tracking: true,
  signature: "none",
  insurance: false,
  residential: true,
  machinable: true,
  shipDate: new Date().toISOString().slice(0, 10)
};

export const packagePresets: Record<ShipmentDraft["preset"], Partial<ShipmentDraft> & { kind?: MailpieceKind }> = {
  custom: {},
  mailer: { kind: "parcel", length: "13", width: "10", height: "2" },
  "small-box": { kind: "parcel", length: "12", width: "9", height: "5" },
  "medium-box": { kind: "parcel", length: "16", width: "12", height: "8" },
  "large-box": { kind: "parcel", length: "20", width: "16", height: "12" },
  letter: { kind: "envelope", length: "9.5", width: "4.125", height: "0.2" },
  "large-envelope": { kind: "flat", length: "12", width: "9", height: "0.5" }
};

export function normalizeDraft(draft: ShipmentDraft): RateRequest {
  const originZip = draft.originZip.trim();
  const destinationZip = draft.destinationZip.trim();
  if (!zipPattern.test(originZip) || !zipPattern.test(destinationZip)) throw new Error("Enter valid 5-digit or ZIP+4 codes");
  const pounds = finite(draft.pounds || "0", "pounds", 0, 70);
  const ounces = finite(draft.ounces || "0", "ounces", 0, 15.999);
  const weightOunces = Math.round((pounds * 16 + ounces) * 1000) / 1000;
  if (weightOunces <= 0) throw new Error("Weight must be greater than zero");
  const dimensions = {
    lengthInches: finite(draft.length, "length", 0.01, 120),
    widthInches: finite(draft.width, "width", 0.01, 120),
    heightInches: finite(draft.height, draft.kind === "parcel" ? "height" : "thickness", 0.001, 120)
  };
  const value = draft.declaredValue.trim() ? finite(draft.declaredValue, "declared value", 0, 50_000) : undefined;
  if (draft.insurance && value === undefined) throw new Error("Enter a declared value to price insurance");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.shipDate)) throw new Error("Enter a valid mailing date");
  return {
    version: 1,
    originZip,
    destinationZip,
    originZip5: originZip.slice(0, 5),
    destinationZip5: destinationZip.slice(0, 5),
    kind: draft.kind,
    weightOunces,
    dimensions,
    declaredValueCents: value === undefined ? undefined : Math.round(value * 100),
    services: { tracking: draft.tracking, signature: draft.signature, insurance: draft.insurance },
    residential: draft.residential,
    machinable: draft.machinable,
    shipDate: draft.shipDate
  };
}

export function parseRateRequest(value: unknown): RateRequest {
  if (!value || typeof value !== "object") throw new Error("Invalid rate request");
  const record = value as Record<string, unknown>;
  const services = record.services as Record<string, unknown> | undefined;
  const dimensions = record.dimensions as Record<string, unknown> | undefined;
  const draft: ShipmentDraft = {
    ...defaultDraft,
    originZip: string(record.originZip),
    destinationZip: string(record.destinationZip),
    kind: oneOf(record.kind, ["parcel", "envelope", "flat"] as const),
    pounds: String(Math.floor(number(record.weightOunces) / 16)),
    ounces: String(number(record.weightOunces) % 16),
    length: String(number(dimensions?.lengthInches)),
    width: String(number(dimensions?.widthInches)),
    height: String(number(dimensions?.heightInches)),
    declaredValue: record.declaredValueCents === undefined ? "" : String(number(record.declaredValueCents) / 100),
    tracking: boolean(services?.tracking),
    signature: oneOf(services?.signature, ["none", "standard", "adult"] as const),
    insurance: boolean(services?.insurance),
    residential: boolean(record.residential),
    machinable: boolean(record.machinable),
    shipDate: string(record.shipDate)
  };
  return normalizeDraft(draft);
}

export function draftFromUrl(url: URL): { draft: ShipmentDraft; explicit: boolean } {
  const params = url.searchParams;
  const explicit = ["from", "to", "kind", "weight", "size"].some(key => params.has(key));
  if (!explicit) return { draft: { ...defaultDraft }, explicit: false };
  const draft = { ...defaultDraft };
  if (params.get("from")) draft.originZip = params.get("from")!;
  if (params.get("to")) draft.destinationZip = params.get("to")!;
  if (["parcel", "envelope", "flat"].includes(params.get("kind") ?? "")) draft.kind = params.get("kind") as MailpieceKind;
  const weight = params.get("weight")?.match(/^(\d+(?:\.\d+)?)lb(?:-(\d+(?:\.\d+)?)oz)?$/);
  if (weight) { draft.pounds = weight[1]!; draft.ounces = weight[2] ?? "0"; }
  const size = params.get("size")?.split("x");
  if (size?.length === 3 && size.every(Boolean)) [draft.length, draft.width, draft.height] = size;
  draft.declaredValue = params.get("value") ?? "";
  draft.tracking = params.get("tracking") !== "0";
  const signature = params.get("signature");
  if (signature === "standard" || signature === "adult") draft.signature = signature;
  draft.insurance = params.get("insurance") === "1";
  draft.residential = params.get("residential") !== "0";
  draft.machinable = params.get("machinable") !== "0";
  draft.shipDate = params.get("date") ?? draft.shipDate;
  draft.preset = "custom";
  return { draft, explicit: true };
}

export function draftUrl(draft: ShipmentDraft, base: URL): URL {
  const url = new URL(base);
  const params = new URLSearchParams();
  params.set("from", draft.originZip.trim());
  params.set("to", draft.destinationZip.trim());
  params.set("kind", draft.kind);
  params.set("weight", `${draft.pounds || "0"}lb-${draft.ounces || "0"}oz`);
  params.set("size", `${draft.length}x${draft.width}x${draft.height}`);
  if (draft.declaredValue) params.set("value", draft.declaredValue);
  if (!draft.tracking) params.set("tracking", "0");
  if (draft.signature !== "none") params.set("signature", draft.signature);
  if (draft.insurance) params.set("insurance", "1");
  if (!draft.residential) params.set("residential", "0");
  if (!draft.machinable) params.set("machinable", "0");
  params.set("date", draft.shipDate);
  url.search = params.toString();
  return url;
}

export function rankQuotes(quotes: RateQuote[], sort: "recommended" | "cheapest" | "fastest" | "carrier"): RateQuote[] {
  return [...quotes].sort((left, right) => {
    const compatibility = Number(right.compatible) - Number(left.compatible);
    if (compatibility) return compatibility;
    if (sort === "carrier") return left.providerName.localeCompare(right.providerName) || left.totalPriceCents - right.totalPriceCents;
    if (sort === "fastest") return deliveryDays(left) - deliveryDays(right) || left.totalPriceCents - right.totalPriceCents;
    return left.totalPriceCents - right.totalPriceCents || deliveryDays(left) - deliveryDays(right);
  });
}

export function emptyInitialModel(draft: ShipmentDraft, request: RateRequest, explicitUrlState: boolean): InitialModel {
  return { version: 1, draft, request, explicitUrlState, configuredProviders: ["doop"], route: { status: "unavailable" }, providers: [] };
}

function deliveryDays(quote: RateQuote): number { return quote.delivery.maximumDays ?? quote.delivery.minimumDays ?? 999; }
function finite(value: string, name: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`Enter a valid ${name}`);
  return parsed;
}
function string(value: unknown): string { if (typeof value !== "string") throw new Error("Invalid rate request"); return value; }
function number(value: unknown): number { if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid rate request"); return value; }
function boolean(value: unknown): boolean { if (typeof value !== "boolean") throw new Error("Invalid rate request"); return value; }
function oneOf<const T extends readonly string[]>(value: unknown, allowed: T): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error("Invalid rate request");
  return value as T[number];
}
