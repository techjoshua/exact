import { isExactComponentAuthorizationIdentity } from '@exactjs/core';
import { readExactClientExecutableComponentContract } from '@exactjs/core/framework/component-contracts';
import type { ExactRemoteModule } from './artifacts.js';
import { importIntegrityPinnedRemoteModule } from './client-integrity.js';

const moduleLoads = new Map<
	string,
	Readonly<{ promise: Promise<ExactRemoteModule>; abort: AbortController }>
>();
const maxModuleLoads = 64;
const remoteLoadTimeoutMilliseconds = 30_000;

/** Loads and validates the public shape of one canonical remote entry. */
export function loadExactRemoteModule(
	url: string,
	integrity?: string,
	signal?: AbortSignal
): Promise<ExactRemoteModule> {
	if (!url) return Promise.reject(new Error('Remote client entry must be a non-empty URL'));
	if (integrity !== undefined && !isValidIntegrity(integrity))
		return Promise.reject(new Error('Remote client entry has invalid integrity metadata'));
	const cacheKey = JSON.stringify([url, integrity ?? '']);
	let entry = moduleLoads.get(cacheKey);
	if (!entry) {
		const abort = new AbortController();
		const timeout = setTimeout(
			() => abort.abort(new Error('Remote client entry loading timed out')),
			remoteLoadTimeoutMilliseconds
		);
		const promise = (
			integrity
				? importIntegrityPinnedRemoteModule(url, integrity, abort.signal)
				: abortableImport(url, abort.signal)
		)
			.then((module) => {
				const validated = validateRemoteModule(
					integrity ? module : (module as { default: unknown }).default
				);
				// Keep successful deployments bounded. Recovery URLs deliberately
				// change across generations, so an unbounded process cache would
				// otherwise retain every deployed entry for the shell's lifetime.
				moduleLoads.delete(cacheKey);
				return validated;
			})
			.catch((error) => {
				moduleLoads.delete(cacheKey);
				throw error;
			})
			.finally(() => clearTimeout(timeout));
		entry = { promise, abort };
		moduleLoads.set(cacheKey, entry);
		while (moduleLoads.size > maxModuleLoads) {
			const oldest = moduleLoads.keys().next().value;
			if (oldest === undefined || oldest === cacheKey) break;
			const evicted = moduleLoads.get(oldest);
			moduleLoads.delete(oldest);
			evicted?.abort.abort(new Error('Remote client entry was evicted from the load cache'));
		}
	}
	return signal ? waitForRemoteModule(entry.promise, signal) : entry.promise;
}

async function importExactRemoteModule(url: string): Promise<{ default: unknown }> {
	return import(/* @vite-ignore */ url) as Promise<{ default: unknown }>;
}

function abortableImport(url: string, signal: AbortSignal): Promise<{ default: unknown }> {
	return waitForRemoteModule(importExactRemoteModule(url), signal);
}

function waitForRemoteModule<T>(load: Promise<T>, signal: AbortSignal): Promise<T> {
	if (signal.aborted)
		return Promise.reject(signal.reason ?? new Error('Remote module load aborted'));
	return new Promise<T>((resolve, reject) => {
		const abort = () => reject(signal.reason ?? new Error('Remote module load aborted'));
		signal.addEventListener('abort', abort, { once: true });
		load.then(
			(value) => {
				signal.removeEventListener('abort', abort);
				resolve(value);
			},
			(error) => {
				signal.removeEventListener('abort', abort);
				reject(error);
			}
		);
	});
}

function isValidIntegrity(value: string): boolean {
	const entries = value.trim().split(/\s+/);
	return (
		!!entries.length &&
		entries.every((entry) => /^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/.test(entry))
	);
}

function validateRemoteModule(value: unknown): ExactRemoteModule {
	if (!value || typeof value !== 'object') throw new Error('Invalid eXact remote module');
	const module = value as Partial<ExactRemoteModule>;
	if (
		!/^[0-9a-f]{40}$/i.test(module.buildKey ?? '') ||
		!module.root ||
		(module.componentAuthorization !== undefined &&
			(!isExactComponentAuthorizationIdentity(module.componentAuthorization) ||
				module.componentAuthorization.buildKey !== module.buildKey)) ||
		typeof module.component !== 'function' ||
		!module.registration ||
		typeof module.registration !== 'object'
	)
		throw new Error('Invalid eXact remote module');
	let contract;
	try {
		contract = readExactClientExecutableComponentContract(module.component);
	} catch {
		throw new Error('Invalid eXact remote module: component is not a compiled client artifact');
	}
	if (contract.placement === 'server')
		throw new Error('Invalid eXact remote module: component is server-only');
	return module as ExactRemoteModule;
}
