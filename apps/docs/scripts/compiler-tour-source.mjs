/** Authored eXact component compiled for the documentation lowering tour. */
export const compilerTourAuthoredSource = `import type { Component } from '@exactjs/core';

type Product = { id: string; name: string; price: number };

type CatalogState = {
  query: string;
  quantity: number;
  products: Product[];
  selected?: Product;
  subtotal: number;
  loading: boolean;
};

declare function searchCatalog(
  query: string,
  options?: { signal?: AbortSignal }
): Promise<Product[]>;

export function CatalogEditor(this: Component<CatalogState>) {
  this.state.query = '';
  this.state.quantity = 1;
  this.state.products = [];
  this.state.loading = false;

  // The compiler observes quantity and selected.price and republishes
  // subtotal only when either dependency changes.
  this.state.subtotal =
    this.state.quantity * (this.state.selected?.price ?? 0);

  this.task.deferred(async () => {
    // query is inferred as the task dependency.
    const query = this.state.query;
    this.state.loading = true;
    this.state.products = query
      ? await searchCatalog(query)
      : [];
    this.state.loading = false;
  });

  return () => (
    <section aria-busy={this.state.loading}>
      <label>
        Search
        <input type="search" value:input={this.state.query} />
      </label>

      <label>
        Quantity
        <input type="number" min={1} value:change={this.state.quantity} />
      </label>

      <output>
        {this.state.quantity} × {this.state.selected?.price ?? 0}
        {' = '}
        {this.state.subtotal}
      </output>

      {this.state.loading && <p role="status">Searching…</p>}

      <ul>
        {this.map(this.state.products, (product) => (
          <li key={product.id}>
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
