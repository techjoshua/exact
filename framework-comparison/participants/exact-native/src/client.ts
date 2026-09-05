import { createExactComparisonClient } from '../.exact/hydration-registration.js';
import '../../exact/src/styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Native eXact comparison root was not found');

createExactComparisonClient(root, {
	batch: true,
	stream: true
});
