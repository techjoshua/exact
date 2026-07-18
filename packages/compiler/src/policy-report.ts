import { createHash } from "node:crypto";
import type {
  ExactCompilerManifest,
  ExactPolicyAuditReport,
  ExactSecretGrant
} from "./types.js";

export type ExactPolicyAuditReportOptions = {
  grants?: readonly ExactSecretGrant[];
  redactSecretIdentifiers?: boolean;
  generatedAt?: Date;
};

/** Aggregates package requirements and application flows without ever reading secret values. */
export function createExactPolicyAuditReport(
  manifests: readonly ExactCompilerManifest[],
  options: ExactPolicyAuditReportOptions = {}
): ExactPolicyAuditReport {
  const grants = options.grants ?? [];
  const usedGrants = new Set<ExactSecretGrant>();
  const secretUsage = manifests.flatMap(manifest => manifest.policy.secretConsumers.map(use => {
    const grant = grants.find(candidate =>
      candidate.package === use.consumer.package
      && selectorAllowed(use.selector, candidate.secrets)
      && (!candidate.version || candidate.version === use.consumer.provenance?.version)
      && (!candidate.integrity || candidate.integrity === use.consumer.provenance?.integrity)
    );
    if (grant) usedGrants.add(grant);
    const status = use.authorization === "implicit-application-owner"
      ? "implicit" as const
      : use.authorization === "denied" ? "denied" as const
        : grant ? "granted" as const
          : use.authorization === "explicit-grant" ? "granted" as const
            : "required" as const;
    return {
      selector: displaySelector(use.selector, options.redactSecretIdentifiers === true),
      consumer: packageCoordinate(use.consumer.package, use.consumer.provenance?.version),
      symbol: use.consumer.symbol,
      parameter: use.consumer.parameter,
      status,
      source: `${use.source}:${use.line}:${use.column}`
    };
  })).sort((left, right) =>
    left.selector.localeCompare(right.selector)
    || left.consumer.localeCompare(right.consumer)
    || left.source.localeCompare(right.source)
  );
  const warnings = grants
    .filter(grant => !usedGrants.has(grant))
    .map(grant => `Unused secret grant for ${grant.package}: ${grant.secrets.join(", ")}`)
    .sort();
  const errors = secretUsage
    .filter(use => use.status === "denied" || use.status === "required")
    .map(use => `${use.consumer}#${use.symbol} requires ${use.selector} without a resolved grant`)
    .sort();
  return {
    version: 1,
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
    secretUsage,
    warnings,
    errors
  };
}

/** Produces deterministic review output suitable for CI artifacts. */
export function formatExactPolicyAuditReport(report: ExactPolicyAuditReport): string {
  const rows = [
    "Secret\tConsumer\tStatus\tSource",
    ...report.secretUsage.map(use =>
      `${use.selector}\t${use.consumer}#${use.symbol}[${use.parameter}]\t${use.status}\t${use.source}`
    )
  ];
  if (report.warnings.length) rows.push("", "Warnings", ...report.warnings);
  if (report.errors.length) rows.push("", "Errors", ...report.errors);
  return `${rows.join("\n")}\n`;
}

function selectorAllowed(selector: string | undefined, selectors: readonly string[]): boolean {
  if (!selector) return selectors.includes("*");
  return selectors.some(pattern => pattern === selector
    || pattern === "*"
    || pattern.endsWith("*") && selector.startsWith(pattern.slice(0, -1)));
}

function displaySelector(selector: string | undefined, redact: boolean): string {
  if (!selector) return "<dynamic>";
  return redact ? `sha256:${createHash("sha256").update(selector).digest("hex")}` : selector;
}

function packageCoordinate(name: string, version: string | undefined): string {
  return version ? `${name}@${version}` : name;
}
