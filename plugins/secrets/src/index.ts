const secretBrand = Symbol.for("@exact/secrets/value");

/** @exact keep=secret */
export interface Secret<T> {
  readonly [secretBrand]: true;
  readonly name: string;
}

class ExactSecret<T> implements Secret<T> {
  readonly [secretBrand] = true as const;
  readonly name: string;
  readonly #value: T;

  constructor(name: string, value: T) {
    this.name = name;
    this.#value = value;
    Object.freeze(this);
  }

  reveal(): T {
    return this.#value;
  }

  toJSON(): never {
    throw new Error(`Secret ${this.name} cannot be serialized`);
  }

  toString(): never {
    throw new Error(`Secret ${this.name} cannot be converted to a string`);
  }

  valueOf(): never {
    throw new Error(`Secret ${this.name} cannot be converted to a primitive`);
  }
}

export function secret<T>(name: string, value: T): Secret<T> {
  if (!name) throw new Error("Secret name must be non-empty");
  return new ExactSecret(name, value);
}

export function isSecret(value: unknown): value is Secret<unknown> {
  return !!value && typeof value === "object" && (value as Partial<Secret<unknown>>)[secretBrand] === true;
}

/** Reveals a value after the caller has intentionally obtained and delivered it. */
export function withSecret<T, R>(value: Secret<T>, consumer: (revealed: T) => R): R {
  if (!(value instanceof ExactSecret)) throw new Error("Secret value was not created by @exact/secrets");
  return consumer(value.reveal());
}

export function deriveSecret<T, R>(name: string, value: Secret<T>, derive: (revealed: T) => R): Secret<R> {
  return secret(name, withSecret(value, derive));
}

export function secretPath(value: unknown, path = "$", seen = new Set<object>()): string | undefined {
  if (isSecret(value)) return path;
  if (!value || typeof value !== "object" || seen.has(value)) return undefined;
  seen.add(value);
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) continue;
    const found = secretPath(descriptor.value, Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`, seen);
    if (found) return found;
  }
  return undefined;
}

export type {
  ScopedSecretResolver,
  SecretAccessGrant,
  SecretAuditEvent,
  SecretConsumerIdentity,
  SecretsPluginConfig,
  SecretProvider,
  SecretResolver
} from "./config.js";
