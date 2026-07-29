import { describe, expect, it } from 'vitest';
import { createExactLanguageService, type ExactSourceEntity } from '../index.js';

describe('compiler source inspection', () => {
	it('distinguishes the complete first-release component region vocabulary', async () => {
		const service = createExactLanguageService({ root: process.cwd(), noEmit: true });
		const source = `export function Editor(this: Component<{ name: string }>) {
	this.onMount(() => focus());
	const save = this.action('Save', async () => submit(this.state.name));
	const upper = this.state.name.toUpperCase();
	return () => (
		<input value:input={this.state.name} onInput={() => save()} aria-label={upper} />
	);
}`;
		await service.synchronize([{ kind: 'upsert', filename: 'Editor.tsx', version: 1, source }]);
		const inspection = await service.inspect('Editor.tsx');
		const kinds = inspection.components.flatMap(flatten).map((entity) => entity.kind);
		expect(kinds).toEqual(
			expect.arrayContaining([
				'component',
				'initializer',
				'render',
				'action',
				'derived',
				'binding',
				'interaction',
				'lifecycle'
			])
		);
		await service.dispose();
	});
});

function flatten(entity: ExactSourceEntity): ExactSourceEntity[] {
	return [entity, ...entity.children.flatMap(flatten)];
}
