import {
	ref as reactiveRef,
	type Reactive,
	type ReactiveOptions
} from '@exactjs/reactive/framework/runtime';
import { reactiveObjects } from '@exactjs/reactive/framework/objects';

type GeneralReactiveFactory = (value: object, options?: ReactiveOptions) => Reactive<object>;
let generalReactiveFactory: GeneralReactiveFactory | undefined;

/** Registers opaque reactive context values for collection-capable compiled modules. */
export function registerGeneralReactiveFactory(factory: GeneralReactiveFactory): void {
	if (generalReactiveFactory && generalReactiveFactory !== factory)
		throw new Error('Conflicting eXact general-reactive capability integration');
	generalReactiveFactory = factory;
}

/** Preserves reactive objects while wrapping primitive context values in refs. */
export function reactiveValue<T>(value: T): Reactive<T> {
	if (reactiveRef(value)) return value as Reactive<T>;
	if (value && typeof value === 'object')
		return (generalReactiveFactory ?? reactiveObjects)(value as object) as Reactive<T>;
	return value as Reactive<T>;
}
