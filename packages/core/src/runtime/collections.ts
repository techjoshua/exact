import { indexedReactive, reactive, type Reactive, type ReactiveOptions } from '@exactjs/reactive';
import {
	registerCollectionComponentPropsFactory,
	registerCollectionComponentStateFactory
} from '../component/state.js';
import { registerGeneralReactiveFactory } from '../component/reactive-value.js';

const factory = <State extends object>(
	indexedKeys: readonly string[] | undefined,
	options: ReactiveOptions
): Reactive<State> =>
	indexedKeys?.length
		? indexedReactive<State>(indexedKeys, options)
		: reactive({} as State, options);

registerCollectionComponentStateFactory(factory);
registerCollectionComponentPropsFactory((value, options) => reactive(value, options));
registerGeneralReactiveFactory(reactive);
