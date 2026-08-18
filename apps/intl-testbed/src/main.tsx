import { render } from '@exactjs/dom';
import { IntlTestbed } from './testbed-app.js';
import './styles.css';

render(<IntlTestbed />, document.getElementById('app')!);
