import { hydrate } from '@exactjs/hydrate';
import { render } from '@exactjs/dom';
import { DocsApp } from './DocsApp.jsx';
import './styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing documentation root.');

if (root.childNodes.length === 0) {
	render(<DocsApp />, root);
} else {
	hydrate(<DocsApp />, root, { onMismatch: 'replace' });
}
