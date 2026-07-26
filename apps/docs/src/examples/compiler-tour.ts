/** Server-only context contract used by the compiler tour component. */
export const compilerTourContextSource = `import { createContext } from '@exactjs/core';

export type Product = { id: string; name: string; price: number };

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
export const compilerTourAuthoredSource = `import type { Component } from '@exactjs/core';
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

  this.task.deferred(async () => {
    // This request-scoped context contains the database/API client.
    // Its use makes this continuation server-only.
    const catalog = this.getContext(CatalogRepositoryContext);
    const query = this.state.query;
    const products = query
      ? await catalog.search(query)
      : [];

    this.state.products = products;
  });

  this.task(() => {
    // Use of document makes this ordinary task client-only.
    document.title = this.state.selected?.name ?? 'Catalog';
  });

  return () => (
    <section>
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

      {this.state.query &&
        this.state.products.length === 0 && (
          <p role="status">No matches</p>
        )}

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
 * Compiler-faithful browser lowering, formatted and annotated for explanation.
 *
 * Unchanged application types and private generated IDs are omitted.
 */
export const compilerTourGeneratedClientSource = `import {
  createExpression as __exactExpression,
  createDynamicChild as __exactDynamic,
  createCompiledVNode as __exactVNode,
  dispatchComponentContinuation as __exactDispatchContinuation,
  markComponentContinuationTask as __exactContinuationTask,
  writeReactiveLazy as __exactWrite
} from '@exactjs/core';
import type { Component } from '@exactjs/core';

// The repository value and its implementation dependency graph are absent.

export function CatalogEditor(this: Component<CatalogState>) {
  // These writes still run once during component setup.
  __exactWrite(this.state, ['query'], () => '');
  __exactWrite(this.state, ['quantity'], () => 1);
  __exactWrite(this.state, ['products'], () => []);

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

  // The server body becomes a small transport stub. Only query is captured.
  this.task.deferred(
    this.reactive(() => this.state.query),
    __exactContinuationTask(
      '<catalog-search>',
      (query: string, { signal: __exactSignal }) =>
        __exactDispatchContinuation(
          this,
          '<catalog-search>',
          [query],
          __exactSignal,
          []
        )
    )
  );

  // The browser-only task remains local and observes only selected.name.
  this.task(
    this.reactive(() => this.state.selected?.name),
    (selectedName: string | undefined) => {
      document.title = selectedName ?? 'Catalog';
    }
  );

  return () => /* generated view below */;
}`;

/**
 * Compiler-faithful server executor, formatted and annotated for explanation.
 *
 * Contract-registration boilerplate and private generated IDs are shortened.
 */
export const compilerTourGeneratedServerSource = `import { CatalogRepositoryContext } from './catalog-context.js';
import {
  taskAwait as __exactTaskAwait,
  withTaskSignal as __exactTaskOptionsSignal,
  writeReactiveLazy as __exactWrite
} from '@exactjs/core';

const CatalogEditorContract = {
  continuations: [
    {
      id: '<catalog-search>',
      readiness: 'nonblocking',
      dependencies: [{ source: 'state' }],
      stateReads: [{ path: 'query', kind: 'read' }],
      stateWrites: [{ path: 'products', kind: 'write' }],
      serverContexts: ['CatalogRepositoryContext']
    }
  ],

  executors: [
    {
      id: '<catalog-search>',
      async execute(activation: any, execution: any) {
        // The browser sent the compiler-selected query dependency.
        const query = activation.dependencies[0] as string;

        // The repository is resolved from trusted request context. It is
        // never accepted from, or serialized back to, the browser.
        const catalog = execution.getContext(
          CatalogRepositoryContext,
          'CatalogRepositoryContext'
        );

        const products = query
          ? await __exactTaskAwait(
              execution.signal,
              catalog.search(
                query,
                // The compiler injects cancellation into the optional
                // signal-bearing argument.
                __exactTaskOptionsSignal(
                  undefined,
                  execution.signal
                )
              )
            )
          : [];

        const state = { ...activation.state };
        __exactWrite(state, ['products'], () => products);

        // The @exact shared return contract and serialization policy are
        // validated before this projected state crosses the boundary.
        return {
          state,
          contexts: {}
        };
      }
    }
  ]
};

// Conceptual exchange:
// request  -> { operation: '<catalog-search>',
//               dependencies: ['desk'], state: { query: 'desk' } }
// response <- { state: { products: [{ id: 'p1', name: 'Desk', price: 499 }] } }
//
// CatalogRepositoryContext, credentials, database clients, and query-library
// dependencies exist only in this server artifact.`;

/**
 * Compiler-faithful view lowering, formatted and annotated for explanation.
 *
 * Stable generated IDs are shortened because their values are intentionally
 * opaque and do not help explain the transformation.
 */
export const compilerTourGeneratedViewSource = `return () =>
  __exactVNode(
    'section',
    { 'data-exact-id': '<section>' },

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
        this.state.query &&
        this.state.products.length === 0 &&
        __exactVNode(
          'p',
          { 'data-exact-id': '<status>', role: 'status' },
          'No matches'
        ),
      '<status-range>'
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
