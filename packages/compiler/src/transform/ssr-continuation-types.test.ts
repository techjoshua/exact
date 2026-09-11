import path from 'node:path';
import { expect, it } from 'vitest';
import { transformSource } from '../compilation/transformation.js';

it('typechecks numeric keyed identities through the generated list helper', () => {
	const result = transformSource(
		`import type { Component } from '@exactjs/core';
		type Row = { /** @exact key */ id: number; label: string };
		export function Rows(this: Component<{ rows: Row[] }>) {
			this.state.rows = [{ id: 1, label: 'one' }];
			return () => <ul>{this.state.rows.map(row => <li>{row.label}</li>)}</ul>;
		}`,
		{
			filename: path.resolve('src/fixtures/numeric-keyed-writer.tsx'),
			generatedValidation: 'semantic'
		}
	);
	expect(result.code.length).toBeGreaterThan(0);
});

it.each(['client', 'server'] as const)(
	'typechecks resumable native writers in the %s projection',
	(target) => {
		// Package builds check generated TypeScript before erasure. Recursive writers must
		// retain typed arguments and character counts after their suspension frame is restored.
		const result = transformSource(
			`function Child(props: { label: string }) {
				return () => <span>{props.label}</span>;
			}
			export function Page(props: { label: string }) {
				return () => <main title={props.label}><Child label={props.label} /><p>{props.label}</p><Child label="last" /></main>;
			}`,
			{
				filename: path.resolve('src/fixtures/ssr-continuation-types.tsx'),
				target,
				generatedValidation: 'semantic'
			}
		);
		expect(result.code.length).toBeGreaterThan(0);
	}
);
