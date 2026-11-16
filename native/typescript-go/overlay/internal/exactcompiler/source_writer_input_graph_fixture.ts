import { componentContractVersion } from '../component/contract-versions.js';
/** Realm-stable identity marker for compiler-issued operations with WeakMap-private contents. */
export const exactOpaqueOperationIdentity = Symbol.for('@exactjs/opaque-target-operation');
const exactOpaqueOperationExecution = Symbol.for('@exactjs/opaque-target-operation-execution');
const exactOpaqueInputGeneration = Symbol.for('@exactjs/opaque-component-input-generation');
const exactOpaqueOperationMetadata = Symbol.for('@exactjs/opaque-target-operation-metadata');

import type { ComponentDomain } from '../component/contracts.js';

type ExactOpaqueOperationExecutor = (this: object, target: object) => unknown;

const emptyOperationPrototype = Object.freeze(
	Object.defineProperties(
		{},
		{
			[exactOpaqueOperationIdentity]: { value: true },
			[exactOpaqueInputGeneration]: { value: componentContractVersion }
		}
	)
);
const operationPrototypes = new WeakMap<ExactOpaqueOperationExecutor, object>();
const domainOperationPrototypes = new WeakMap<object, WeakMap<ComponentDomain, object>>();

/** Shares immutable dispatch descriptors while every receipt retains a distinct private identity. */
function operationPrototype(execute: ExactOpaqueOperationExecutor | undefined): object {
	if (!execute) return emptyOperationPrototype;
	let prototype = operationPrototypes.get(execute);
	if (!prototype) {
		prototype = Object.freeze(
			Object.defineProperties(
				{},
				{
					[exactOpaqueOperationIdentity]: { value: true },
					[exactOpaqueInputGeneration]: { value: componentContractVersion },
					[exactOpaqueOperationExecution]: { value: execute }
				}
			)
		);
		operationPrototypes.set(execute, prototype);
	}
	return prototype;
}

/** Caches unkeyed ownership metadata weakly so releasing a domain also releases its shared descriptors. */
function domainOperationPrototype(prototype: object, domain: ComponentDomain): object {
	let domains = domainOperationPrototypes.get(prototype);
	if (!domains) domainOperationPrototypes.set(prototype, (domains = new WeakMap()));
	let owned = domains.get(domain);
	if (!owned) {
		const descriptors: object = Object.create(prototype);
		owned = Object.freeze(
			Object.defineProperty(descriptors, exactOpaqueOperationMetadata, {
				value: Object.freeze({ domain })
			})
		);
		domains.set(domain, owned);
	}
	return owned;
}

/** Reconciliation facts that remain independent of an operation's target-local payload. */
export type ExactOpaqueOperationMetadata = Readonly<{
	key?: string;
	/** Resolves current authored sibling identity after the owning environment is prepared. */
	readKey?: () => string | undefined;
	domain?: ComponentDomain;
}>;

/** Returns one private redemption table shared by every copy of the core runtime in this realm. */
export function sharedOpaqueOperationStore<Data>(name: string): WeakMap<object, Data> {
	const key = Symbol.for(`@exactjs/opaque-target-operation-store/${name}`);
	const scope = globalThis as Record<PropertyKey, unknown>;
	const existing = scope[key];
	if (existing instanceof WeakMap) return existing as WeakMap<object, Data>;
	const store = new WeakMap<object, Data>();
	scope[key] = store;
	return store;
}


export function invoke(){sharedOpaqueOperationStore('fixture');return domainOperationPrototype(operationPrototype(()=> 'value'),{} as ComponentDomain)}
