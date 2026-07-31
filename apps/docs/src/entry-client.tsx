import { render } from '@exactjs/dom';
import { DocsApp } from './DocsApp.jsx';
import './styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing documentation root.');

render(<DocsApp />, root);
