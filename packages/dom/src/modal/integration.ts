import { bindModalOpen } from './binding.js';
import { registerModalBindingCapability, type ModalBindingCapability } from './capability.js';

const modalBindingCapability: ModalBindingCapability = Object.freeze({ bind: bindModalOpen });

registerModalBindingCapability(modalBindingCapability);
