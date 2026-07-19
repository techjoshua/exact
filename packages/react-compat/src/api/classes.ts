import { REACT_CLASS_UPDATER } from '../internals.js';
import type { ReactNode } from '../types.js';

/** Base class for React-compatible class components. */
export class Component<P = Record<string, unknown>, S = Record<string, unknown>> {
	declare readonly isReactComponent: object;
	props: P;
	state!: S;
	context: unknown;
	refs: Record<string, unknown> = {};
	constructor(props: P, context?: unknown) {
		this.props = props;
		this.context = context;
	}
	/** Enqueues a partial state update through the mounted compatibility root. */
	setState(
		state: Partial<S> | null | ((previous: Readonly<S>, props: Readonly<P>) => Partial<S> | null),
		callback?: () => void
	): void {
		classUpdater(this).setState(state as never, callback);
	}
	/** Requests a render even when state and props are otherwise unchanged. */
	forceUpdate(callback?: () => void): void {
		classUpdater(this).forceUpdate(callback);
	}
	/** Produces this component's children; subclasses override this method. */
	render(): ReactNode {
		return null;
	}
}
Object.defineProperty(Component.prototype, 'isReactComponent', { value: {} });
/** Class component base that opts into shallow prop and state comparison. */
export class PureComponent<
	P = Record<string, unknown>,
	S = Record<string, unknown>
> extends Component<P, S> {
	readonly isPureReactComponent = true;
}

function classUpdater(instance: object): {
	setState(
		state: object | null | ((previous: unknown, props: unknown) => object | null),
		callback?: () => void
	): void;
	forceUpdate(callback?: () => void): void;
} {
	const updater = (instance as Record<PropertyKey, unknown>)[REACT_CLASS_UPDATER];
	if (!updater)
		throw new Error('Cannot update a React class component before it is mounted by eXact');
	return updater as ReturnType<typeof classUpdater>;
}
