/** Authored eXact component used by the compiler tour. */
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

  this.state.subtotal =
    this.state.quantity * (this.state.selected?.price ?? 0);

  this.task.deferred(async () => {
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

/**
 * Compiler-faithful setup lowering, formatted and annotated for explanation.
 *
 * Unchanged application types and private generated IDs are omitted.
 */
export const compilerTourGeneratedSetupSource = `import {
  createExpression as __exactExpression,
  createDynamicChild as __exactDynamic,
  createCompiledVNode as __exactVNode,
  markComponentContinuationTask as __exactContinuationTask,
  taskAwait as __exactTaskAwait,
  withTaskSignal as __exactTaskOptionsSignal,
  writeReactiveLazy as __exactWrite
} from '@exactjs/core';
import type { Component } from '@exactjs/core';

// Product, CatalogState, and searchCatalog retain their authored declarations.

export function CatalogEditor(this: Component<CatalogState>) {
  // These writes still run once during component setup.
  // __exactWrite preserves assignment semantics and publishes reactivity.
  __exactWrite(this.state, ['query'], () => '');
  __exactWrite(this.state, ['quantity'], () => 1);
  __exactWrite(this.state, ['products'], () => []);
  __exactWrite(this.state, ['loading'], () => false);

  // A derived assignment becomes an owned computation:
  // - quantity and selected.price are dependencies;
  // - subtotal is the effect written by the computation.
  this.task(
    this.reactive(() => this.state.quantity),
    this.reactive(() => this.state.selected?.price),
    __exactContinuationTask(
      '<derived-subtotal>',
      (quantity: number, selectedPrice: number | undefined) => {
        __exactWrite(
          this.state,
          ['subtotal'],
          () => quantity * (selectedPrice ?? 0)
        );
      }
    )
  );

  // Reading query makes it the deferred task's inferred dependency.
  this.task.deferred(
    this.reactive(() => this.state.query),
    __exactContinuationTask(
      '<catalog-search>',
      async (query: string, { signal: __exactSignal }) => {
        __exactWrite(this.state, ['loading'], () => true);

        const products = query
          ? await __exactTaskAwait(
              __exactSignal,
              searchCatalog(
                query,
                // The authored call omitted this argument. The compiler
                // recognized the optional signal-bearing options object.
                __exactTaskOptionsSignal(undefined, __exactSignal)
              )
            )
          : [];

        // The resolved value is published only after the await completes.
        __exactWrite(this.state, ['products'], () => products);

        __exactWrite(this.state, ['loading'], () => false);
      }
    )
  );

  return () => /* generated view below */;
}`;

/**
 * Compiler-faithful view lowering, formatted and annotated for explanation.
 *
 * Stable generated IDs are shortened because their values are intentionally
 * opaque and do not help explain the transformation.
 */
export const compilerTourGeneratedViewSource = `return () =>
  __exactVNode(
    'section',
    {
      'data-exact-id': '<section>',

      // Only this attribute observes loading.
      'aria-busy': __exactExpression(() => this.state.loading)
    },

    __exactVNode(
      'label',
      { 'data-exact-id': '<search-label>' },
      'Search',
      __exactVNode('input', {
        'data-exact-id': '<search-input>',
        type: 'search',

        // value:input becomes a reactive value plus a typed write.
        value: __exactExpression(() => this.state.query ?? ''),
        __exactBindInput: (
          event: Event & { readonly currentTarget: HTMLInputElement }
        ) => {
          this.state.query = event.currentTarget.value;
        }
      })
    ),

    __exactVNode(
      'label',
      { 'data-exact-id': '<quantity-label>' },
      'Quantity',
      __exactVNode('input', {
        'data-exact-id': '<quantity-input>',
        type: 'number',
        min: __exactExpression(() => 1),

        // Number formatting and empty-value conversion are compiler-selected.
        value: __exactExpression(() =>
          this.state.quantity == null ||
          Number.isNaN(this.state.quantity)
            ? ''
            : String(this.state.quantity)
        ),
        __exactBindChange: (
          event: Event & { readonly currentTarget: HTMLInputElement }
        ) => {
          this.state.quantity =
            event.currentTarget.value === ''
              ? Number.NaN
              : event.currentTarget.valueAsNumber;
        }
      })
    ),

    __exactVNode(
      'output',
      { 'data-exact-id': '<subtotal-output>' },

      // Each expression owns its own reactive marker range.
      __exactDynamic(
        () => this.state.quantity,
        '<quantity-range>'
      ),
      ' × ',
      __exactDynamic(
        () => this.state.selected?.price ?? 0,
        '<price-range>'
      ),
      __exactDynamic(
        () => ' = ',
        '<equals-range>'
      ),
      __exactDynamic(
        () => this.state.subtotal,
        '<subtotal-range>'
      )
    ),

    // Structural control flow receives a stable replaceable range.
    __exactDynamic(
      () =>
        this.state.loading &&
        __exactVNode(
          'p',
          { 'data-exact-id': '<status>', role: 'status' },
          'Searching…'
        ),
      '<loading-range>'
    ),

    __exactVNode(
      'ul',
      { 'data-exact-id': '<product-list>' },

      // this.map retains keyed item identity. Expressions inside an item
      // remain independently reactive.
      __exactDynamic(
        () =>
          this.map(this.state.products, (product) =>
            __exactVNode(
              'li',
              {
                'data-exact-id': '<product-row>',
                key: product.id
              },
              __exactVNode(
                'button',
                {
                  'data-exact-id': '<product-button>',
                  'aria-pressed': __exactExpression(
                    () => this.state.selected?.id === product.id
                  ),
                  onClick: () => {
                    __exactWrite(
                      this.state,
                      ['selected'],
                      () => product
                    );
                  }
                },
                __exactDynamic(
                  () => product.name,
                  '<product-name-range>'
                ),
                ' — ',
                __exactDynamic(
                  () => product.price,
                  '<product-price-range>'
                )
              )
            )
          ),
        '<products-range>'
      )
    )
  );`;
