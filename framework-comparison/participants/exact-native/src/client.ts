import { createExactClient, readExactHydrationConfig } from '@exactjs/hydrate';
import { exactHydrationRegistration } from '../.exact/hydration-registration.js';
import '../../exact/src/styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Native eXact comparison root was not found');

createExactClient(root, {
	...readExactHydrationConfig(root),
	...exactHydrationRegistration,
	batch: true,
	stream: true
});
