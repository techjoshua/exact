import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	containsCandidate,
	containsModule,
	fallbackDiagnostics,
	fileSignature,
	findUp,
	moduleReplacements,
	recordSelection,
	runtimeSourceExports,
	scriptKind
} from './build/transform-support.js';
import { transformReactJsx, usesReactRuntimeImports } from './transform.js';
import type { ResolvedReactCompatReplacement } from './adapters.js';

describe('automatic React JSX ownership', () => {
	it('detects referenced React value imports but ignores type-only and unused imports', () => {
		expect(
			usesReactRuntimeImports(
				'import { useState } from "react"; export const V = () => { useState(0); return <i />; };',
				'v.tsx'
			)
		).toBe(true);
		expect(
			usesReactRuntimeImports(
				'import type { ReactNode } from "react"; export const value: ReactNode = null;',
				'v.tsx'
			)
		).toBe(false);
		expect(
			usesReactRuntimeImports(
				'import { useState } from "react"; export const V = () => <i />;',
				'v.tsx'
			)
		).toBe(false);
	});

	it('lowers JSX and rewrites public React modules directly', () => {
		const result = transformReactJsx(
			'import { useState } from "react"; export const V = () => <button>{useState(0)[0]}</button>;',
			{
				filename: 'view.tsx',
				target: 18,
				sourceMap: true
			}
		);
		expect(result.code).toContain('from "@exactjs/react-compat/jsx-runtime18"');
		expect(result.code).toContain('from "@exactjs/react-compat/react18"');
		expect(result.code).not.toContain('from "react"');
		expect(result.map).toMatchObject({ sources: ['view.tsx'] });
	});

	it('recognizes default, namespace, class heritage, and value references', () => {
		expect(
			usesReactRuntimeImports(
				'import React from "react"; export class View extends React.Component {}',
				'view.tsx'
			)
		).toBe(true);
		expect(
			usesReactRuntimeImports(
				'import * as React from "react"; export const View = () => React.createElement("i");',
				'view.tsx'
			)
		).toBe(true);
		expect(
			usesReactRuntimeImports(
				'import { type ReactNode, useState as state } from "react"; type T = ReactNode; const x = { state };',
				'view.ts'
			)
		).toBe(true);
		expect(
			usesReactRuntimeImports(
				'import React from "react"; type Constructor = typeof React.Component;',
				'view.ts'
			)
		).toBe(false);
	});

	it('supports classic JSX and optional source maps', () => {
		const classic = transformReactJsx(
			'/** @jsxRuntime classic */\nimport React from "react"; export const V = () => <i />;',
			{
				filename: 'classic.jsx',
				target: 19,
				sourceMap: false
			}
		);

		expect(classic.code).toContain('React.createElement');
		expect(classic.code).toContain('@exactjs/react-compat/react19');
		expect(classic.map).toBeNull();
	});

	it('extracts runtime exports from ESM, CommonJS, and namespace access', () => {
		const source = `
			import React, { useState as state, type ReactNode } from 'react';
			import * as ReactNamespace from 'react';
			export { memo as optimized, type ComponentType } from 'react';
			const { createElement: create, Children, ...rest } = require('react');
			const lazy = require('react').lazy;
			const indexed = require('react')['cache'];
			ReactNamespace.useEffect();
			ReactNamespace['useMemo']();
			ReactNamespace[method]();
			consume(ReactNamespace);
			void state;
		`;

		expect(runtimeSourceExports(source, 'view.tsx', 'react')).toEqual(
			expect.arrayContaining([
				'default',
				'useState',
				'memo',
				'createElement',
				'Children',
				'lazy',
				'cache',
				'useEffect',
				'useMemo',
				'*'
			])
		);
	});

	it('classifies scripts and detects candidate source modules without parsing', () => {
		expect(scriptKind('view.tsx?raw')).toBe(4);
		expect(scriptKind('view.jsx')).toBe(2);
		expect(scriptKind('view.cjs')).toBe(1);
		expect(scriptKind('view.ts')).toBe(3);
		expect(containsModule("import value from 'source'", 'source')).toBe(true);
		expect(containsModule('import value from "other"', 'source')).toBe(false);
		expect(
			containsCandidate("import value from 'library'", { react: '@exactjs/react-compat' }, [
				{
					sourceModule: 'library',
					sourceExport: 'value',
					targetModule: 'replacement',
					targetExport: 'value'
				}
			])
		).toBe(true);
	});

	it('maps replacement contracts and emits diagnostics for unsafe dynamic forms', () => {
		const replacement = fixtureReplacement();
		expect(moduleReplacements([replacement])).toEqual([
			{
				sourceModule: 'library',
				sourceExport: 'hook',
				targetModule: '@exactjs/adapter/runtime',
				targetExport: 'useHook'
			}
		]);

		const diagnostics = fallbackDiagnostics(
			'consumer.ts',
			`
				const dynamic = import('library');
				const { hook, ...rest } = require('library');
			`,
			[replacement],
			'/app'
		);
		expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			'dynamic-export-escape',
			'unsupported-commonjs'
		]);
		expect(diagnostics.every((diagnostic) => diagnostic.moduleId === 'consumer.ts')).toBe(true);
	});

	it('deduplicates selections and fingerprints present and missing watch files', () => {
		const selections = new Map();
		const selection = {
			importer: 'view.ts',
			status: 'substituted' as const,
			sourceLocation: '/app/node_modules/library',
			sourceModule: 'library',
			sourceExport: 'hook',
			installedVersion: '1.0.0',
			adapterPackage: '@exactjs/adapter',
			adapterVersion: '1.0.0',
			targetModule: '@exactjs/adapter/runtime',
			targetExport: 'useHook'
		};
		recordSelection(selections, selection);
		recordSelection(selections, { ...selection });
		expect(selections).toHaveLength(1);

		const root = mkdtempSync(path.join(tmpdir(), 'exact-transform-support-'));
		const present = path.join(root, 'package.json');
		writeFileSync(present, '{}');
		expect(findUp(path.join(root, 'nested'), 'package.json')).toBe(present);
		expect(() => findUp(root, 'missing.lock')).toThrow('was not found above');
		const signature = fileSignature([present, path.join(root, 'missing.json')]);
		expect(signature).toContain(`${present}:2:`);
		expect(signature).toContain('missing.json:missing');
	});
});

function fixtureReplacement(): ResolvedReactCompatReplacement {
	return {
		sourceInstance: '/app/node_modules/library',
		sourceLocation: '/app/node_modules/library',
		sourceModule: 'library',
		sourcePackage: 'library',
		sourceExport: 'hook',
		sourceVersion: '1.0.0',
		adapterPackage: '@exactjs/adapter',
		adapterVersion: '1.0.0',
		subpath: './runtime',
		specifier: '@exactjs/adapter/runtime',
		export: 'useHook'
	};
}
