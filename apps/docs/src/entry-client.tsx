import { hydrate } from '@exactjs/hydrate';
import { DocsApp } from './DocsApp.jsx';
import './styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing documentation root.');

hydrate(<DocsApp />, root, { onMismatch: 'replace' });
