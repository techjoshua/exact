import { describe, expect, it } from "vitest";
import { analyzeSource, parseExactCompilerManifest, transformSource } from "./index.js";

const rawHtmlSource = `
  import { unsafeHtml as raw } from "@exact/core";
  import * as exact from "@exact/core";
  export function Article() {
    return () => <main>{raw("<b>article</b>")}{exact.unsafeHtml("<i>tail</i>")}</main>;
  }
`;

describe("unsafeHtml package capabilities", () => {
  it("records source locations, owning symbols, and conservative targets for libraries", () => {
    const manifest = analyzeSource(rawHtmlSource, {
      filename: "src/article.tsx",
      packageType: "library",
      packageName: "@acme/articles"
    });

    expect(manifest.packageName).toBe("@acme/articles");
    expect(manifest.requiredCapabilities?.rawHtml).toEqual([
      expect.objectContaining({ source: "src/article.tsx", symbol: "Article", targets: ["client", "server"] }),
      expect.objectContaining({ source: "src/article.tsx", symbol: "Article", targets: ["client", "server"] })
    ]);
    expect(manifest.diagnostics).not.toContainEqual(expect.stringContaining("unsafeHtml capability"));
  });

  it("requires explicit application opt-in for application-owned call sites", () => {
    expect(() => transformSource(rawHtmlSource, {
      filename: "src/article.tsx",
      packageType: "application",
      packageName: "my-app"
    })).toThrow(/has not explicitly enabled/);

    expect(() => transformSource(rawHtmlSource, {
      filename: "src/article.tsx",
      packageType: "application",
      packageName: "my-app",
      capabilityPolicy: { unsafeHtml: { enabled: true } }
    })).not.toThrow();
  });

  it("requires non-transitive package grants for imported requirements", () => {
    const dependency = analyzeSource(rawHtmlSource, {
      filename: "src/article.tsx",
      packageType: "library",
      packageName: "@acme/articles"
    });
    const application = `export const ready = true;`;

    expect(() => transformSource(application, {
      filename: "src/app.ts",
      packageName: "my-app",
      importedManifests: [dependency],
      capabilityPolicy: { unsafeHtml: { enabled: true } }
    })).toThrow(/@acme\/articles.*without an application grant/);

    expect(() => transformSource(application, {
      filename: "src/app.ts",
      packageName: "my-app",
      importedManifests: [dependency],
      capabilityPolicy: { unsafeHtml: { enabled: true, grants: ["@acme/articles"] } }
    })).not.toThrow();
  });

  it("fails closed for package requirements without stable package identity", () => {
    const dependency = analyzeSource(rawHtmlSource, {
      filename: "src/article.tsx",
      packageType: "library"
    });
    expect(() => transformSource(`export const ready = true;`, {
      filename: "src/app.ts",
      packageName: "my-app",
      importedManifests: [dependency],
      capabilityPolicy: { unsafeHtml: { enabled: true } }
    })).toThrow(/has no package identity/);
  });

  it("rejects malformed capability metadata while loading manifests", () => {
    const manifest = analyzeSource(rawHtmlSource, {
      filename: "src/article.tsx",
      packageType: "library",
      packageName: "@acme/articles"
    });
    const malformed = structuredClone(manifest) as any;
    malformed.requiredCapabilities.rawHtml[0].targets = ["browser"];
    expect(() => parseExactCompilerManifest(malformed)).toThrow(/capability requirements/);
  });
});
