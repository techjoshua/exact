import './billing.css';

export default function Billing() {
	return () => (
		<section class="billing-area">
			<h2>Billing</h2>
			<button>Refresh balance</button>
		</section>
	);
}

Billing.loadDetails = () => import('./details.js');
