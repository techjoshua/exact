import { isExactComponentAuthorizationIdentity } from '@exactjs/core';
import { readExactClientExecutableComponentContract } from '@exactjs/core/framework/component-contracts';
import type { ExactRemoteModule } from './artifacts.js';
import { importIntegrityPinnedRemoteModule } from './client-integrity.js';

/** An unsettled remote import remains owned by its active caller waits. */
type PendingModuleLoad = {
	readonly promise: Promise<ExactRemoteModule>;
	readonly abort: AbortController;
	consumers: number;
};

const moduleLoads = new Map<string, PendingModuleLoad>();

/**
 * Shares validation and loading while callers remain interested in one canonical remote entry.
 * Each caller owns its optional cancellation signal. The last cancellation releases loader work,
 * and settled entries leave this pending-work table. No deadline or concurrency cap is imposed.
 */
export function loadExactRemoteModule(
	url: string,
	integrity?: string,
	signal?: AbortSignal
): Promise<ExactRemoteModule> {
	if (!url) return Promise.reject(new Error('Remote client entry must be a non-empty URL'));
	if (integrity !== undefined && !isValidIntegrity(integrity))
		return Promise.reject(new Error('Remote client entry has invalid integrity metadata'));
	if (signal?.aborted) return Promise.reject(signal.reason);
	const cacheKey = JSON.stringify([url, integrity ?? '']);
	let entry = moduleLoads.get(cacheKey);
	if (!entry) {
		const abort = new AbortController();
		const promise = (
			integrity
				? importIntegrityPinnedRemoteModule(url, integrity, abort.signal)
				: abortableImport(url, abort.signal)
		).then((module) =>
			validateRemoteModule(integrity ? module : (module as { default: unknown }).default)
		);
		entry = { promise, abort, consumers: 0 };
		moduleLoads.set(cacheKey, entry);
		const pending = entry;
		// An older cancelled generation must never remove its replacement's pending entry.
		const retire = () => {
			if (moduleLoads.get(cacheKey) === pending) moduleLoads.delete(cacheKey);
		};
		void promise.then(retire, retire);
	}
	const pending = entry;
	pending.consumers++;
	return (signal ? waitForRemoteModule(pending.promise, signal) : pending.promise).finally(() => {
		if (--pending.consumers === 0 && moduleLoads.get(cacheKey) === pending) {
			moduleLoads.delete(cacheKey);
			pending.abort.abort(signal?.reason);
		}
	});
}

async function importExactRemoteModule(url: string): Promise<{ default: unknown }> {
	return import(/* @vite-ignore */ url) as Promise<{ default: unknown }>;
}

function abortableImport(url: string, signal: AbortSignal): Promise<{ default: unknown }> {
	return waitForRemoteModule(importExactRemoteModule(url), signal);
}

function waitForRemoteModule<T>(load: Promise<T>, signal: AbortSignal): Promise<T> {
	if (signal.aborted) return Promise.reject(signal.reason);
	return new Promise<T>((resolve, reject) => {
		const abort = () => reject(signal.reason);
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
