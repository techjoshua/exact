import { describe, expect, it } from 'vitest';
import {
	analyzeExactAnnotations,
	exactCleanupForCall,
	exactKeepPolicy,
	exactKeyContract,
	exactOwnsReturn,
	exactShared
} from './annotations.js';
import { clearExpressionProjectCache, expressionModuleFor } from './expression/session.js';

describe('@exact compiler annotations', () => {
	it('projects key metadata from type members and merged declarations', () => {
		clearExpressionProjectCache();
		const module = expressionModuleFor(
			'annotated-key.ts',
			`
      interface Task { /** @exact key */ id: string; title: string }
      declare const tasks: Task[];
      tasks.map(task => task.title);
    `
		);
		const map = module
			.walk()
			.calls()
			.first((call) => call.target?.isMember('map') === true)!;
		expect(exactKeyContract(map.target?.target?.type?.typeArguments[0])).toEqual({
			member: 'id',
			method: false,
			primitive: false
		});
	});

	it('supports type-level and method key contracts', () => {
		clearExpressionProjectCache();
		const module = expressionModuleFor(
			'annotated-key-method.ts',
			`
      /** @exact key=identity */ interface Task { identity(): string; title: string }
      declare const tasks: Task[];
      tasks.map(task => task.title);
    `
		);
		const map = module
			.walk()
			.calls()
			.first((call) => call.target?.isMember('map') === true)!;
		expect(exactKeyContract(map.target?.target?.type?.typeArguments[0])).toEqual({
			member: 'identity',
			method: true,
			primitive: false
		});
	});

	it('aggregates annotations across declaration merging without wrapper types', () => {
		clearExpressionProjectCache();
		const module = expressionModuleFor(
			'merged-key.ts',
			`
      interface ExternalTask { externalId: string; title: string }
      /** @exact key=externalId */ interface ExternalTask {}
      declare const tasks: ExternalTask[];
      tasks.map(task => task.title);
    `
		);
		const map = module
			.walk()
			.calls()
			.first((call) => call.target?.isMember('map') === true)!;
		expect(exactKeyContract(map.target?.target?.type?.typeArguments[0])).toEqual({
			member: 'externalId',
			method: false,
			primitive: false
		});
	});

	it('projects cleanup and ownership from return contracts', () => {
		clearExpressionProjectCache();
		const module = expressionModuleFor(
			'annotated-cleanup.ts',
			`
      interface Legacy { /** @exact cleanup */ unsubscribe(): void }
      declare function subscribe(): /** @exact own */ Legacy;
      subscribe();
    `
		);
		const call = module.walk().calls().first()!;
		expect(exactOwnsReturn(call)).toBe(true);
		expect(exactCleanupForCall(call)).toBe('unsubscribe');
	});

	it('rejects unknown keys and invalid directive values', () => {
		clearExpressionProjectCache();
		const module = expressionModuleFor(
			'invalid-annotations.ts',
			`
      /** @exact unicornName=Airy */ interface Pony {}
      /** @exact track=value */ declare function run(callback: () => void): void;
    `
		);
		expect(
			analyzeExactAnnotations(module).diagnostics.map((diagnostic) => diagnostic.message)
		).toEqual([
			expect.stringContaining("unknown @exact directive 'unicornName'"),
			expect.stringContaining('@exact track does not accept a value')
		]);
	});

	it('indexes tracked callback parameters', () => {
		clearExpressionProjectCache();
		const module = expressionModuleFor(
			'tracked-callback.ts',
			`
      declare function select<T>(/** @exact track */ callback: () => T): T;
      select(() => 1);
    `
		);
		const call = module.walk().calls().first()!;
		expect(analyzeExactAnnotations(module).trackedCallbacks.get(call.node.id)).toEqual([
			{ parameter: 0 }
		]);
	});

	it('indexes tracked callbacks declared on options properties', () => {
		clearExpressionProjectCache();
		const module = expressionModuleFor(
			'tracked-options.ts',
			`
      interface SelectOptions<T> { /** @exact track */ calculate: () => T }
      declare function select<T>(options: SelectOptions<T>): T;
      select({ calculate: () => 1 });
    `
		);
		const call = module.walk().calls().first()!;
		expect(analyzeExactAnnotations(module).trackedCallbacks.get(call.node.id)).toEqual([
			{ parameter: 0, property: 'calculate' }
		]);
	});

	it('accepts pure callable contracts and rejects invalid pure annotations', () => {
		clearExpressionProjectCache();
		const module = expressionModuleFor(
			'pure-contract.ts',
			`
      /** Computes a deterministic label. @exact pure */
      declare function format(value: string): string;
      declare function invalid(/** @exact pure */ value: string): string;
      /** @exact pure=yes */ declare function valued(value: string): string;
    `
		);

		expect(
			analyzeExactAnnotations(module).diagnostics.map((diagnostic) => diagnostic.message)
		).toEqual(
			expect.arrayContaining([
				'error: @exact pure is not valid on Parameter',
				'error: @exact pure does not accept a value'
			])
		);
	});

	it('accepts the closed keep vocabulary and rejects keep=isomorphic', () => {
		clearExpressionProjectCache();
		const module = expressionModuleFor(
			'keep-policy.ts',
			`
      interface Account {
        /** @exact keep=secret */ token: string;
        /** @exact keep=server */ internal: object;
      }
      /** @exact keep=client */ let element: HTMLElement;
      /** @exact keep=isomorphic */ let publicName: string;
    `
		);
		const token = module
			.walk()
			.ofKind('PropertySignature')
			.first((reference) => reference.node.name === 'token')!;
		const internal = module
			.walk()
			.ofKind('PropertySignature')
			.first((reference) => reference.node.name === 'internal')!;
		const element = module
			.walk()
			.ofKind('VariableDeclaration')
			.first((reference) => reference.node.name === 'element')!;
		expect(exactKeepPolicy(token.node.directives)).toBe('secret');
		expect(exactKeepPolicy(internal.node.directives)).toBe('server');
		expect(exactKeepPolicy(element.children().first()?.variable?.directives)).toBe('client');
		expect(
			analyzeExactAnnotations(module).diagnostics.map((diagnostic) => diagnostic.message)
		).toContain(
			'error: @exact keep=isomorphic is not supported; safe isomorphic residency is inferred'
		);
	});

	it('accepts shared disclosure contracts on projections and callable returns', () => {
		clearExpressionProjectCache();
		const module = expressionModuleFor(
			'shared-policy.ts',
			`
      /** @exact shared */ const product = { id: "p1", name: "Desk" };
      interface Repository {
        /** @exact shared */
        findPublicProducts(): Promise<Array<{ id: string; name: string }>>;
      }
      declare function invalid(/** @exact shared */ value: string): void;
    `
		);
		const product = module
			.walk()
			.ofKind('VariableDeclaration')
			.first((reference) => reference.node.name === 'product')!;
		const method = module
			.walk()
			.ofKind('MethodSignature')
			.first((reference) => reference.node.name === 'findPublicProducts')!;

		expect(exactShared(product.node.directives)).toBe(true);
		expect(exactShared(method.node.directives)).toBe(true);
		expect(
			analyzeExactAnnotations(module).diagnostics.map((diagnostic) => diagnostic.message)
		).toContain('error: @exact shared is not valid on Parameter');
	});

	it('rejects a shared callable contract whose resolved value is secret-qualified', () => {
		clearExpressionProjectCache();
		const module = expressionModuleFor(
			'shared-secret-return.ts',
			`
      import type { Secret } from "@exactjs/secrets";
      interface Repository {
        /** @exact shared */
        readResetToken(): Promise<Secret<string>>;
      }
    `
		);

		expect(
			analyzeExactAnnotations(module).diagnostics.map((diagnostic) => diagnostic.message)
		).toContain('error: @exact shared return cannot contain secret-qualified data');
	});

	it('rejects missing, unknown, and contradictory policy values', () => {
		clearExpressionProjectCache();
		const module = expressionModuleFor(
			'invalid-policy.ts',
			`
      /** @exact keep */ let missing: string;
      /** @exact keep=public */ let unknown: string;
      /** @exact keep=server @exact keep=client */ let conflict: string;
      declare function connect(value: string): void;
      /** @exact consume=secret */ const consumed = unknown;
      connect(consumed);
    `
		);
		expect(
			analyzeExactAnnotations(module).diagnostics.map((diagnostic) => diagnostic.message)
		).toEqual(
			expect.arrayContaining([
				'error: @exact keep requires one of server, client, or secret',
				"error: unknown @exact keep policy 'public'; expected server, client, or secret",
				'error: a declaration cannot have contradictory @exact keep policies',
				expect.stringContaining("unknown @exact directive 'consume'")
			])
		);
	});
});
