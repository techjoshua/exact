import { describe, expect, it } from "vitest";
import {
  analyzeSource,
  createExactPolicyAuditReport,
  formatExactPolicyAuditReport
} from "./index.js";

describe("policy audit reports", () => {
  it("reports which packages receive which secret-qualified variables", () => {
    const dependency = analyzeSource(`
      import { connect } from "@acme/database";
      declare const secrets: { require(name: string): string };
      /** @exact keep=secret @exact consume=secret */
      const url = secrets.require("DATABASE_URL");
      export const database = connect(url);
    `, {
      filename: "packages/runtime.ts",
      packageType: "library",
      packageName: "@acme/runtime",
      target: "server"
    });
    const report = createExactPolicyAuditReport([dependency], {
      allowPackages: ["@acme/database", "@unused/package"],
      generatedAt: new Date("2026-01-01T00:00:00.000Z")
    });

    expect(report.generatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(report.secretUsage[0]).toEqual(expect.objectContaining({
      selector: "DATABASE_URL",
      consumer: "@acme/database",
      status: "granted"
    }));
    expect(report.warnings).toEqual([
      "Unused secret package permission: @unused/package"
    ]);
    expect(report.errors).toEqual([]);
    expect(formatExactPolicyAuditReport(report)).toContain("DATABASE_URL");
  });

  it("reports unresolved library requirements", () => {
    const manifest = analyzeSource(`
      import { connect } from "@acme/database";
      /** @exact keep=secret @exact consume=secret */
      declare const url: string;
      connect(url);
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
