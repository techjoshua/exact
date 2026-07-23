import { render } from '@exact/dom';
import { createExactClient } from '@exact/hydrate';
import { createExactRoot } from '@exact/hydrate/internal';
import PortalPage from './PortalPage.js';
import './styles.css';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app');

const pageClient = createExactClient(container, { endpoint: '/__exact' });
render(createExactRoot(pageClient, PortalPage), container);
