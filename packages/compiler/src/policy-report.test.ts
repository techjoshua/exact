import { describe, expect, it } from "vitest";
import {
  analyzeSource,
  createExactPolicyAuditReport,
  formatExactPolicyAuditReport
} from "./index.js";

describe("policy audit reports", () => {
  it("aggregates, resolves, and optionally redacts secret package requirements", () => {
    const dependency = analyzeSource(`
      import { connect } from "@acme/database";
      declare const secrets: { require(name: string): string };
      /** @exact keep=secret */
      const url = secrets.require("DATABASE_URL");
      export const database = connect(/** @exact consume=secret */ url);
    `, {
      filename: "packages/runtime.ts",
      packageType: "library",
      packageName: "@acme/runtime",
      packageVersion: "2.0.0",
      target: "server"
    });
    const grant = {
      package: "@acme/database",
      secrets: ["DATABASE_URL"],
      version: "3.1.0",
      integrity: "sha512-fixture"
    };
    dependency.policy.secretConsumers[0]!.consumer.provenance = {
      name: "@acme/database",
      version: "3.1.0",
      integrity: "sha512-fixture",
      source: "installed"
    };
    const report = createExactPolicyAuditReport([dependency], {
      grants: [grant, { package: "@unused/package", secrets: ["OTHER"] }],
      redactSecretIdentifiers: true,
      generatedAt: new Date("2026-01-01T00:00:00.000Z")
    });

    expect(report.generatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(report.secretUsage[0]).toEqual(expect.objectContaining({
      consumer: "@acme/database@3.1.0",
      status: "granted"
    }));
    expect(report.secretUsage[0]!.selector).toMatch(/^sha256:/);
    expect(report.warnings).toEqual(["Unused secret grant for @unused/package: OTHER"]);
    expect(report.errors).toEqual([]);
    expect(formatExactPolicyAuditReport(report)).not.toContain("DATABASE_URL");
  });

  it("reports unresolved library requirements as build-review errors", () => {
    const manifest = analyzeSource(`
      import { connect } from "@acme/database";
      /** @exact keep=secret */
      declare const url: string;
      connect(/** @exact consume=secret */ url);
    `, {
      filename: "runtime.ts",
      packageType: "library",
      packageName: "@acme/runtime",
      target: "server"
    });
    const report = createExactPolicyAuditReport([manifest], {
      generatedAt: new Date("2026-01-01T00:00:00.000Z")
    });
    expect(report.secretUsage[0]?.status).toBe("required");
    expect(report.errors).toHaveLength(1);
  });
});
