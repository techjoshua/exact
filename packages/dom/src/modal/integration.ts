import { bindModalOpen } from './binding.js';
import { registerModalBindingCapability, type ModalBindingCapability } from './capability.js';

const modalBindingCapability: ModalBindingCapability = Object.freeze({ bind: bindModalOpen });

/** Installs native modal binding support when its compiler-selected entry is reachable. */
export function installModalBindingIntegration(): void {
	registerModalBindingCapability(modalBindingCapability);
}
