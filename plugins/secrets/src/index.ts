declare const secretQualification: unique symbol;

/**
 * A normal JavaScript value that the eXact compiler keeps server-side until
 * an explicit consume() boundary.
 *
 * @exact keep=secret
 */
export type Secret<T> = T & {
	readonly [secretQualification]: true;
};

/** Introduces a compiler-visible secret source without wrapping the runtime value. */
export function secret<T>(name: string, value: T): Secret<T> {
	if (!name) throw new Error('Secret name must be non-empty');
	return value as Secret<T>;
}

/**
 * Ends compiler secret tracking for this expression. At runtime this is an
 * identity operation; trusted server code owns the returned raw value.
 */
export function consume<T>(value: Secret<T>): T;
export function consume<T>(value: T): T;
export function consume<T>(value: T): T {
	return value;
}

export type { SecretProvider, SecretResolver, SecretsPluginConfig } from './config.js';
