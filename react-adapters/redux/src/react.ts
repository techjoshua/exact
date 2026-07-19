import { exposeExactComponent, useExactContext } from '@exact/react-compat/interop';
import {
	createElement,
	useEffect,
	useMemo,
	useSyncExternalStore,
	type ReactComponentType,
	type ReactContext,
	type ReactNode
} from '@exact/react-compat';
import { unwrap } from '@exact/reactive';
import {
	createReduxSubscription,
	ExactReduxProvider,
	ReduxServerStateContext,
	ReduxStoreContext,
	type ExactReduxProviderProps,
	type ReduxStore
} from './index.js';

const NativeProvider = exposeExactComponent(ExactReduxProvider, 'ReduxProvider');
export const Provider: ReactComponentType<ExactReduxProviderProps> = function ReduxProvider(
	props
): ReactNode {
	if (!props.context) return createElement(NativeProvider, props);
	return createElement(CustomContextProvider, props);
};

function CustomContextProvider(props: ExactReduxProviderProps): ReactNode {
	const store = unwrap(props.store);
	const subscription = useMemo(() => createReduxSubscription(store), [store]);
	useEffect(() => {
		subscription.trySubscribe();
		return subscription.tryUnsubscribe;
	}, [subscription]);
	const native = createElement(NativeProvider, { ...props, context: undefined });
	const context = props.context as ReactContext<any>;
	return createElement(context.Provider, {
		value: new ReduxContextValue(store, subscription, props.serverState),
		children: native
	});
}

class ReduxContextValue {
	readonly getServerState?: () => unknown;
	constructor(
		readonly store: ReduxStore<any, any>,
		readonly subscription: ReturnType<typeof createReduxSubscription>,
		serverState: unknown
	) {
		if (serverState !== undefined) this.getServerState = () => serverState;
	}
}
export function useStore<State = unknown, Action = unknown>(): ReduxStore<State, Action> {
	return useExactContext(ReduxStoreContext) as ReduxStore<State, Action>;
}
export function useDispatch<Action = unknown>(): ReduxStore<unknown, Action>['dispatch'] {
	return useStore<unknown, Action>().dispatch;
}
export function useSelector<State, Selected>(
	selector: (state: State) => Selected,
	equality: (left: Selected, right: Selected) => boolean = Object.is
): Selected {
	const store = useStore<State>();
	let selected = selector(store.getState());
	const snapshot = () => {
		const next = selector(store.getState());
		if (!equality(selected, next)) selected = next;
		return selected;
	};
	let getServerSnapshot = snapshot;
	try {
		const serverState = useExactContext(ReduxServerStateContext) as State;
		getServerSnapshot = () => selector(serverState);
	} catch {}
	return useSyncExternalStore(store.subscribe, snapshot, getServerSnapshot);
}
