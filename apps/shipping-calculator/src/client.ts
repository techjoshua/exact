import { composeExactComponentContracts } from '@exactjs/core';
import { createExactClient, readExactHydrationConfig } from '@exactjs/hydrate';
import { CalculatorWorkspace } from '../.exact/App.exact.client.js';
import { installExactClient } from './client-runtime.js';
import './styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Parcel Lab root was not found');
const config = readExactHydrationConfig(root);
const exactClientContracts = composeExactComponentContracts([CalculatorWorkspace], 'client');
const exactClientIslands = exactClientContracts.implementations;
const client = createExactClient(root, {
	...config,
	islands: exactClientIslands,
	continuations: exactClientContracts.continuations,
	batch: true,
	stream: true
});
installExactClient(client);
