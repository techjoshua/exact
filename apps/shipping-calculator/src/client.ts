import { createExactClient, readExactHydrationConfig } from '@exactjs/hydrate';
import { exactHydrationRegistration } from '../.exact/hydration-registration.js';
import './styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Parcel Lab root was not found');
const config = readExactHydrationConfig(root);
createExactClient(root, {
	...config,
	...exactHydrationRegistration,
	batch: true,
	stream: true
});
