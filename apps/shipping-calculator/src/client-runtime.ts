import type { ExactClient } from "@exact/hydrate";

let client: ExactClient | undefined;

export function installExactClient(value: ExactClient): void { client = value; }
export function exactClient(): ExactClient {
  if (!client) throw new Error("Parcel Lab hydration client is not ready");
  return client;
}
