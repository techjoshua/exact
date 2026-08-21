import { createComponentListController } from './list-controller.js';
import { registerComponentListCapability } from './list-capability.js';

const controllers = new WeakMap<object, ReturnType<typeof createComponentListController>>();

function controller(owner: object): ReturnType<typeof createComponentListController> {
	let value = controllers.get(owner);
	if (!value) {
		value = createComponentListController();
		controllers.set(owner, value);
	}
	return value;
}

registerComponentListCapability(
	Object.freeze({
		map(owner, collection, key, render, id, provenance, keyIdentity) {
			return controller(owner).map(collection, key, render, id, provenance, keyIdentity);
		},
		begin(owner) {
			controllers.get(owner)?.beginRender();
		},
		end(owner) {
			controllers.get(owner)?.endRender();
		},
		dispose(owner) {
			const value = controllers.get(owner);
			if (!value) return;
			controllers.delete(owner);
			value.dispose();
		}
	})
);
