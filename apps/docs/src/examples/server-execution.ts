/** Distributed server component lesson code for authored. */
export const authoredSource = `import { createContext, type Component } from '@exactjs/core';

export type Product = { id: string; name: string; price: number };

interface ProductRepository {
  /** @exact shared */
  find(id: string): Promise<Product>;
}

export const ProductRepositoryContext = createContext<ProductRepository>(
  'products.repository',
  { scope: 'request', reactive: false }
);

export async function ProductPage(
  this: Component<{ product?: Product; detailsOpen: boolean }>,
  props: { productId: string }
) {
  const products = this.getContext(ProductRepositoryContext);
  this.state.detailsOpen = false;

  // The repository makes this continuation server-only. productId is
  // captured automatically and the public result is staged into state.
  this.state.product = await products.find(props.productId);

  return () => (
    <article>
      <h1>{this.state.product?.name}</h1>
      <button onClick={() => this.state.detailsOpen = !this.state.detailsOpen}>
        {this.state.detailsOpen ? 'Hide details' : 'Show details'}
      </button>
      {this.state.detailsOpen && <p>Product ID: {this.state.product?.id}</p>}
    </article>
  );
}`;

/** Distributed server component lesson code for request context. */
export const requestContextSource = `import {
  composeExactExecutorContract, createExactHydrationConfig
} from '@exactjs/server';
import { createExactServerRuntime } from '@exactjs/ssr';
import {
  ProductPage, ProductRepositoryContext
} from '../.exact/ProductPage.exact.server.js';

// Compose the operations emitted for this server component.
const contract = composeExactExecutorContract([ProductPage], { endpoint: '/__exact' });
// Spread these options into a custom hydratable SSR renderer.
const hydration = createExactHydrationConfig(contract, { includeContinuations: false });

const runtime = createExactServerRuntime({
  contract,
  requestContexts: async ({ platformRequest }) => [
    [ProductRepositoryContext, {
      value: await repositoryForVerifiedRequest(platformRequest)
    }]
  ]
});`;

/** Distributed server component lesson code for shared projection. */
export const sharedProjectionSource = `interface Database {
  // Database and its credentials stay server-only.
  /** @exact shared */
  queryProducts(category: string): Promise<ProductSummary[]>;
}

interface UnsafeDatabase {
  // Without @exact shared, returning this server-resident value to client
  // state is rejected. Secret-qualified results can never be made shared.
  queryInternalRecord(id: string): Promise<InternalRecord>;
}`;
