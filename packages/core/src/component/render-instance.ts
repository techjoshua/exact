import type { ExactExecutableComponentContract } from '../component-contracts.js';
import type {
	AnyComponentInstance,
	ComponentContextValues,
	ComponentFunction,
	ComponentInstance
} from './contracts.js';
import { CompactComponentInstance } from './compact-instance.js';

/** Compact durable record selected for compiler artifacts without task, lifecycle, or list work. */
export class RenderComponentInstance<
	State extends object,
	Props extends Record<string, unknown>
> extends CompactComponentInstance<State, Props> {
	constructor(
		type: ComponentFunction<State, Props>,
		rawProps: Props,
		parent: AnyComponentInstance | undefined,
		ambientContexts: ComponentContextValues | undefined,
		domain: ComponentInstance<State>['domain'],
		contract: ExactExecutableComponentContract
	) {
		super(type, rawProps, parent, ambientContexts, domain, contract);
		this.initializeComponent(() =>
			(contract.artifact.instantiate as ComponentFunction<State, Props>).call(
				this,
				this.props as Props
			)
		);
	}
}
