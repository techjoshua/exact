/** Server-only context contract used by the compiler tour component. */
export const compilerTourContextSource = `import { createContext } from '@exactjs/core';

export type Product = {
  /** @exact key */ id: string;
  name: string;
  price: number;
};

export interface CatalogRepository {
  /**
   * The repository remains server-only, but this method's plain-data
   * result is allowed to cross into client-visible state.
   * @exact shared
   */
  search(
    query: string,
    options?: { signal?: AbortSignal }
  ): Promise<Product[]>;
}

export const CatalogRepositoryContext =
  createContext<CatalogRepository>('catalog.repository', {
    scope: 'request',
    reactive: false
  });`;

/** Authored eXact component used by the compiler tour. */
export const compilerTourAuthoredSource = `import { TaskContext, type Component } from '@exactjs/core';
import {
  CatalogRepositoryContext,
  type Product
} from './catalog-context.js';

type CatalogState = {
  query: string;
  quantity: number;
  products: Product[];
  selected?: Product;
  subtotal: number;
};

export function CatalogEditor(this: Component<CatalogState>) {
  this.state.query = '';
  this.state.quantity = 1;
  this.state.products = [];

  this.state.subtotal =
    this.state.quantity * (this.state.selected?.price ?? 0);

  async function searchCatalog(
    query: string,
    _task: TaskContext = TaskContext.server().latest().deferred()
  ) {
    // This request-scoped context contains the database/API client.
    // Its use makes this continuation server-only.
    const catalog = this.getContext(CatalogRepositoryContext);
    const products = query
      ? await catalog.search(query)
      : [];

    this.state.products = products;
  }
  searchCatalog(this.state.query);

  function updateTitle(
    selectedName: string | undefined,
    task: TaskContext = TaskContext.client().latest()
  ) {
    // Use of document makes this ordinary task client-only.
    document.title = selectedName ?? 'Catalog';
  }
  updateTitle(this.state.selected?.name);

  return () => (
    <section>
      <label>
        Search
        <input type="search" value:onInput={this.state.query} />
      </label>

      <label>
        Quantity
        <input type="number" min={1} value:onChange={this.state.quantity} />
      </label>

      <output>
        {this.state.quantity} × {this.state.selected?.price ?? 0} = {this.state.subtotal}
      </output>

      {this.state.query &&
        this.state.products.length === 0 && (
          <p role="status">No matches</p>
        )}

      <ul>
        {this.state.products.map((product) => (
          <li>
            <button
              aria-pressed={this.state.selected?.id === product.id}
              onClick={() => {
                this.state.selected = product;
              }}
            >
              {product.name} — {product.price}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}`;
