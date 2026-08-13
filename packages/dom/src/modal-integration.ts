import { bindModalOpen } from './modal-binding.js';
import { registerModalBindingCapability, type ModalBindingCapability } from './modal-capability.js';

const modalBindingCapability: ModalBindingCapability = Object.freeze({ bind: bindModalOpen });

registerModalBindingCapability(modalBindingCapability);
