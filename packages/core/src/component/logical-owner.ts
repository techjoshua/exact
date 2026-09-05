import type { ExactExecutableComponentContract } from '../component-contracts.js';
import type {
	AnyComponentInstance,
	ComponentContextValues,
	ComponentDomain,
	ComponentFunction
} from './contracts.js';
import { CompactComponentInstance } from './compact-instance.js';

const logicalOwnerType: ComponentFunction<
	Record<string, never>,
	Record<string, never>
> = function ExactLogicalOwner() {
	return () => null;
};

const unsupportedAttachment = () => {
	throw new TypeError('A framework logical owner has no render attachment');
};

const logicalOwnerContract = Object.freeze({
	version: 3,
	placement: 'client',
	role: 'client',
	implementations: [],
	continuations: [],
	executors: [],
	boundaries: [],
	execution: { version: 1, ports: [], transitions: [], reactive: [] },
	artifact: Object.freeze({
		version: 1,
		id: '@exactjs/core:logical-owner',
		target: 'client',
		abi: 0,
		instantiate: logicalOwnerType,
		construct: unsupportedAttachment,
		attach: unsupportedAttachment,
		receive() {},
		dispose(instance: AnyComponentInstance, reason: unknown) {
			instance.unmount(String(reason ?? 'logical owner disposed'));
		},
		state: [],
		props: [],
		tasks: [],
		reactive: [],
		render: 'returned-function',
		capabilities: []
	})
}) as unknown as ExactExecutableComponentContract;

/** Durable context and lifecycle owner with no component topology or target attachment ABI. */
class FrameworkLogicalOwner extends CompactComponentInstance<
	Record<string, never>,
	Record<string, never>
> {
	constructor(
		parent: AnyComponentInstance | undefined,
		ambientContexts: ComponentContextValues | undefined,
		domain: ComponentDomain
	) {
		super(logicalOwnerType, {}, parent, ambientContexts, domain, logicalOwnerContract);
		this.initializeComponent(() => () => null);
	}
}

/** Creates one framework-owned logical context frame without constructing a component artifact. */
export function createFrameworkLogicalOwner(
	parent: AnyComponentInstance | undefined,
	ambientContexts: ComponentContextValues | undefined,
	domain: ComponentDomain,
	configure?: (owner: AnyComponentInstance) => void
): AnyComponentInstance {
	const owner = new FrameworkLogicalOwner(parent, ambientContexts, domain);
	configure?.(owner);
	return owner;
}
