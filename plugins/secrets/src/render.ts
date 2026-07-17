import type { ExactRuntimePluginExtension } from "@exact/plugin-api";
import { secretPath } from "./index.js";

export default function createSecretsRenderExtension(): ExactRuntimePluginExtension {
  return Object.freeze({
    output: {
      validate(value: unknown) {
        const path = secretPath(value);
        if (path) throw new Error(`Secret value cannot be emitted at ${path}`);
        return undefined;
      }
    }
  });
}
