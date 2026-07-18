import type { ExactRuntimePluginExtension } from "@exact/plugin-api";
import { createHash } from "node:crypto";
import { secretPath } from "./index.js";
import type {
  SecretConsumerIdentity,
  SecretProviderContext,
  SecretResolver,
  SecretsPluginConfig
} from "./config.js";

export function createSecretResolver(
  config: SecretsPluginConfig,
  context: SecretProviderContext
): SecretResolver {
  const values = new Map<string, import("./index.js").Secret<string>>();
  let initialized = false;
  return {
    async initialize() {
      if (initialized) return;
      for (const provider of config.providers) {
        const loaded = await provider.load(context);
        for (const [name, value] of Object.entries(loaded)) values.set(name, value);
      }
      for (const name of config.required) {
        if (!values.has(name)) throw new Error(`Required secret ${displaySelector(name)} is not configured`);
      }
      initialized = true;
    },
    scope(consumer) {
      const grant = consumer.applicationOwner ? undefined : config.grants.find(candidate =>
        candidate.package === consumer.package
        && (!candidate.version || candidate.version === consumer.version)
        && (!candidate.integrity || candidate.integrity === consumer.integrity)
      );
      return Object.freeze({
        require(name: string) {
          const value = resolve(name, "require", consumer, grant);
          if (!value) throw new Error(`Secret ${displaySelector(name)} is not configured`);
          return value;
        },
        optional(name: string) {
          return resolve(name, "optional", consumer, grant);
        }
      });
    },
    dispose() {
      values.clear();
      initialized = false;
    }
  };

  function resolve(
    name: string,
    operation: "require" | "optional",
    consumer: SecretConsumerIdentity,
    grant: SecretsPluginConfig["grants"][number] | undefined
  ): import("./index.js").Secret<string> | undefined {
    if (!initialized) throw new Error("Secret resolver has not been initialized");
    const allowed = !!consumer.applicationOwner || !!grant && selectorAllowed(name, grant.secrets);
    emitAudit(name, operation, consumer, allowed ? consumer.applicationOwner
      ? "implicit-application-owner"
      : "explicit-grant"
      : "denied");
    if (!allowed) throw new Error(`Package ${consumer.package} is not permitted to access secret ${displaySelector(name)}`);
    return values.get(name);
  }

  function emitAudit(
    name: string,
    operation: "require" | "optional",
    consumer: SecretConsumerIdentity,
    authorization: "implicit-application-owner" | "explicit-grant" | "denied"
  ): void {
    if (!config.audit) return;
    const redacted = config.audit.redactIdentifiers === true;
    const requestId = config.audit.requestId?.();
    config.audit.onEvent(Object.freeze({
      operation,
      selector: redacted ? createHash("sha256").update(name).digest("hex") : name,
      selectorRedacted: redacted,
      consumer: {
        package: consumer.package,
        ...(consumer.version ? { version: consumer.version } : {}),
        ...(consumer.integrity ? { integrity: consumer.integrity } : {})
      },
      authorization,
      ...(requestId ? { requestId } : {})
    }));
  }

  function displaySelector(name: string): string {
    return config.audit?.redactIdentifiers
      ? `sha256:${createHash("sha256").update(name).digest("hex")}`
      : name;
  }
}

function selectorAllowed(selector: string, selectors: readonly string[]): boolean {
  return selectors.some(pattern => pattern === selector
    || pattern === "*"
    || pattern.endsWith("*") && selector.startsWith(pattern.slice(0, -1)));
}

export default function createSecretsServerExtension(resolver: SecretResolver): ExactRuntimePluginExtension {
  return Object.freeze({
    async validate() {
      await resolver.initialize();
      return undefined;
    },
    async initializeApplication() {
      await resolver.initialize();
      return { dispose: () => resolver.dispose() };
    },
    output: {
      validate(value: unknown) {
        const path = secretPath(value);
        if (path) throw new Error(`Secret value cannot enter server output at ${path}`);
        return undefined;
      }
    }
  });
}
