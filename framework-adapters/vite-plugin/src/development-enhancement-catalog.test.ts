import { expect, it, onTestFinished } from 'vitest';
import { ExactViteDevelopmentEnhancementCatalog } from './development-enhancement-catalog.js';

/** Evaluates the emitted facade as a fresh module, as Vite does after invalidation. */
async function evaluate(
	owner: ExactViteDevelopmentEnhancementCatalog,
	target: 'client' | 'server'
) {
	const id = owner.resolve('@exactjs/core/framework/enhancement-catalog', target, 'serve')!;
	const source = owner.load(id)!;
	return import(
		/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${crypto.randomUUID()}`
	);
}

it('keeps overlapping renderers coherent without letting stale providers replace current ones', async () => {
	const owner = new ExactViteDevelopmentEnhancementCatalog();
	onTestFinished(() => owner.dispose());
	const old = await evaluate(owner, 'server');
	const initial = () => null;
	old.registerExactEnhancement('theme:status', initial);
	expect(() => old.registerExactEnhancement('theme:status', () => null)).toThrow('Conflicting');
	expect(() => old.registerExactEnhancement('invalid', null)).toThrow(TypeError);
	const current = await evaluate(owner, 'server');
	const replacement = () => null;
	current.registerExactEnhancement('theme:status', replacement);
	old.registerExactEnhancement('theme:status', initial);
	expect(old.exactEnhancementCatalog).toBe(current.exactEnhancementCatalog);
	expect(old.exactEnhancementCatalog.get('theme:status')).toBe(replacement);
	const explicit = { enhancementCatalog: new Map(), other: true };
	expect(current.withExactEnhancementCatalog(explicit)).toBe(explicit);
	expect(old.withExactEnhancementCatalog({}).enhancementCatalog).toBe(
		current.exactEnhancementCatalog
	);
});

it('isolates applications and targets, preserves production resolution, and releases owners', async () => {
	const first = new ExactViteDevelopmentEnhancementCatalog();
	const second = new ExactViteDevelopmentEnhancementCatalog();
	onTestFinished(() => {
		first.dispose();
		second.dispose();
	});
	expect(
		first.resolve('@exactjs/core/framework/enhancement-catalog', 'server', 'build')
	).toBeUndefined();
	expect(first.resolve('@exactjs/core', 'server', 'serve')).toBeUndefined();
	const server = await evaluate(first, 'server');
	expect(
		first.resolve('@exactjs/core/framework/enhancement-catalog', 'client', 'serve')
	).toBeUndefined();
	const other = await evaluate(second, 'server');
	server.registerExactEnhancement('theme:status', () => null);

	expect(other.exactEnhancementCatalog.size).toBe(0);
	first.dispose();
	const reopened = await evaluate(first, 'server');
	expect(reopened.exactEnhancementCatalog.size).toBe(0);
	expect(reopened.exactEnhancementCatalog).not.toBe(server.exactEnhancementCatalog);
});
