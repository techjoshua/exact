import { composeExactComponentDescriptors } from '@exactjs/core';
import { createExactClient, hydrateClientIslands, readExactHydrationConfig } from '@exactjs/hydrate';
import { CalculatorWorkspace } from '../.exact/App.exact.client.js';
import { installExactClient } from './client-runtime.js';
import './styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Parcel Lab root was not found');
const config = readExactHydrationConfig(root);
const exactClientIslands = composeExactComponentDescriptors([CalculatorWorkspace], 'client');
const client = createExactClient(root, {
	...config,
	islands: exactClientIslands,
	batch: true,
	stream: true
});
installExactClient(client);
hydrateClientIslands(root, exactClientIslands, { ...config, stream: true });
