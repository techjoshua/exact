import { readFile } from "node:fs/promises";
import path from "node:path";
import { secret } from "./index.js";
import type { SecretProvider } from "./config.js";

export interface EnvironmentSecretsOptions {
  readonly files?: readonly string[];
  readonly includeProcessEnvironment?: boolean;
  readonly optionalFiles?: boolean;
}

export function environmentSecrets(options: EnvironmentSecretsOptions = {}): SecretProvider {
  return Object.freeze({
    name: "environment",
    async load(context: import("./config.js").SecretProviderContext) {
      const values: Record<string, import("./index.js").Secret<string>> = {};
      if (options.includeProcessEnvironment !== false) {
        for (const [name, value] of Object.entries(process.env)) {
          if (value !== undefined) values[name] = secret(name, value);
        }
      }
      for (const file of options.files ?? [".env"]) {
        const filename = path.resolve(context.applicationRoot, file);
        let source: string;
        try { source = await readFile(filename, "utf8"); }
        catch (error) {
          if (options.optionalFiles !== false && isMissingFile(error)) continue;
          throw new Error(`Unable to load secret environment file ${filename}`, { cause: error });
        }
        for (const [name, value] of parseEnvironmentFile(source)) values[name] = secret(name, value);
      }
      return Object.freeze(values);
    }
  });
}

export function parseEnvironmentFile(source: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) throw new Error("Malformed environment secret declaration");
    let value = match[2]!;
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    result.set(match[1]!, value);
  }
  return result;
}

function isMissingFile(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { code?: unknown }).code === "ENOENT";
}
