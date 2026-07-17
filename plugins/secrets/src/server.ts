import type { ExactRuntimePluginExtension } from "@exact/plugin-api";
import { secretPath } from "./index.js";
import type {
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
        if (!values.has(name)) throw new Error(`Required secret ${name} is not configured`);
      }
      initialized = true;
    },
    get(name) {
      if (!initialized) throw new Error("Secret resolver has not been initialized");
      const value = values.get(name);
      if (!value) throw new Error(`Secret ${name} is not configured`);
      return value;
    },
    has(name) {
      return initialized && values.has(name);
    },
    dispose() {
      values.clear();
      initialized = false;
    }
  };
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
