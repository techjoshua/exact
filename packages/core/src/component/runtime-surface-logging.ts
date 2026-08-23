import type { ComponentLog } from '../logging.js';
import type { AnyComponentInstance } from './contracts.js';
import { createComponentLog } from './log.js';
import { registerComponentRuntimeSurface } from './runtime-surface-registration.js';

const logs = new WeakMap<AnyComponentInstance, ComponentLog>();

function log(this: AnyComponentInstance): ComponentLog {
	let value = logs.get(this);
	if (!value) {
		value = createComponentLog(this);
		logs.set(this, value);
	}
	return value;
}

registerComponentRuntimeSurface({
	log: { configurable: true, get: log }
});
