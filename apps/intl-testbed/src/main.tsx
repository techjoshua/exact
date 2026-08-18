import { render } from '@exactjs/dom';
import { _ } from '@exactjs/jsx';
// The compiler consumes this namespace through the theme:* enhancement syntax below.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as theme from '@exactjs/theme/enhancements' with { type: 'exact-enhancement' };
import { IntlTestbed } from './testbed-app.js';
import './styles.css';

render(
	<_
		theme:scope
		theme:tonic="green"
		theme:temperament="balanced"
		theme:depth="elevated"
		theme:typography="humanist"
	>
		<IntlTestbed />
	</_>,
	document.getElementById('app')!
);
