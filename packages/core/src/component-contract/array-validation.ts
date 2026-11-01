import type { ExactArrayRootProof } from '../component-contracts.js';
import { hasOnlyContractKeys, isContractRecord } from './metadata-validation.js';

/** Checks dense exact prefixes without granting their ancestor write authority. */
export function isExactArrayRoots(
	value: unknown,
	path: string,
	confidence: unknown
): value is readonly ExactArrayRootProof[] {
	if (!Array.isArray(value) || confidence !== 'exact' || !value.length) return false;
	const seen = new Set<string>();
	for (let i = 0; i < value.length; i++) {
		if (!Object.hasOwn(value, i)) return false;
		const root: unknown = value[i];
		if (
			!isContractRecord(root) ||
			!['kind', 'path', 'confidence'].every((key) => Object.hasOwn(root, key)) ||
			!hasOnlyContractKeys(root, ['kind', 'path', 'confidence']) ||
			root.kind !== 'array' ||
			root.confidence !== 'exact' ||
			!Array.isArray(root.path) ||
			!root.path.length
		)
			return false;
		for (let j = 0; j < root.path.length; j++)
			if (
				!Object.hasOwn(root.path, j) ||
				typeof root.path[j] !== 'string' ||
				!root.path[j] ||
				['*', '__proto__', 'prototype', 'constructor'].includes(root.path[j])
			)
				return false;
		const key = root.path.join('.');
		if (
			(path !== key && !path.startsWith(key + '.') && !key.startsWith(path + '.')) ||
			seen.has(key)
		)
			return false;
		seen.add(key);
	}
	return true;
}

/** Validates executable binding shape without importing any collection implementation. */
export function isArrayBinding(value: unknown, target: 'client' | 'server'): boolean {
	if (!isContractRecord(value)) return false;
	const keys =
		target === 'client' ? ['capture', 'parse', 'plan', 'apply'] : ['capture', 'diff', 'parse'];
	return hasOnlyContractKeys(value, keys) && keys.every((key) => typeof value[key] === 'function');
}

/** Member-only proofs also require capture even when no server diff is selected. */
export function hasArrayBindings(value: Record<PropertyKey, unknown>): boolean {
	if (!Array.isArray(value.continuations) || !isContractRecord(value.artifact)) return false;
	const needs = value.continuations.some(
		(c) =>
			isContractRecord(c) &&
			Array.isArray(c.stateWrites) &&
			c.stateWrites.some((w) => isContractRecord(w) && w.arrayRoots !== undefined)
	);
	if (value.artifact.target === 'client') return needs === (value.artifact.array !== undefined);
	if (!Array.isArray(value.executors)) return false;
	for (const executor of value.executors) {
		if (!isContractRecord(executor)) return false;
		const descriptor = value.continuations.find((c) => isContractRecord(c) && c.id === executor.id);
		if (!isContractRecord(descriptor) || !Array.isArray(descriptor.stateWrites)) return false;
		const rootDiff = descriptor.stateWrites.some(
			(w) =>
				isContractRecord(w) &&
				Array.isArray(w.arrayRoots) &&
				w.arrayRoots.some(
					(r) => isContractRecord(r) && Array.isArray(r.path) && r.path.join('.') === w.path
				)
		);
		if (rootDiff !== (executor.array !== undefined)) return false;
	}
	return true;
}
