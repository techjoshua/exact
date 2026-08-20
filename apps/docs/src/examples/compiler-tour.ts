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

/** Annotated pseudocode for the browser artifact produced by the compiler tour. */
export const compilerTourGeneratedClientSource = `import {
  createDynamicChild as __exactDynamic,
  createExpression as __exactExpression,
  createCompiledVNode as __exactVNode
} from '@exactjs/core/runtime/render';
import {
  activateTaskForHost as __exactActivateTask,
  defineTask as __exactDefineTask,
  dispatchComponentContinuation as __exactDispatch,
  markComponentContinuationTask as __exactContinuation
} from '@exactjs/core/runtime/tasks';
import { writeReactiveLazy as __exactWrite }
  from '@exactjs/core/runtime/reactivity';

// Conceptual output: private helper names and opaque IDs are shortened.
// The repository context and server implementation are absent here.
export function CatalogEditor(this: Component<CatalogState>) {
  // Defaults initialize one durable component state machine.
  __exactWrite(this.state, ['query'], () => '');
  __exactWrite(this.state, ['quantity'], () => 1);
  __exactWrite(this.state, ['products'], () => []);

  // A derived assignment becomes owned reactive work. Only these two
  // dependencies can invalidate the subtotal computation.
  __exactActivateTask(this, __exactDefineTask({ label: 'derived subtotal' },
    (quantity, price) => {
      __exactWrite(this.state, ['subtotal'],
        () => quantity * (price ?? 0));
    }
  ),
    this.reactive(() => this.state.quantity),
    this.reactive(() => this.state.selected?.price)
  );

  // The server task body is replaced by a transport continuation. The
  // compiler captures query, not the component or server repository.
  __exactActivateTask(this, __exactDefineTask({
    label: 'searchCatalog', priority: 'deferred', concurrency: 'latest'
  }, __exactContinuation('<catalog-search>',
    (query, task) => __exactDispatch(
      this, '<catalog-search>', [query], task.signal, []
    )
  )), this.reactive(() => this.state.query));

  // Browser-only work stays local and observes selected.name directly.
  __exactActivateTask(this, __exactDefineTask({ label: 'updateTitle' },
    (name) => { document.title = name ?? 'Catalog'; }
  ), this.reactive(() => this.state.selected?.name));

  return () => __exactVNode('section', null,
    __exactVNode('input', {
      type: 'search',
      // A binding is a reactive read paired with a typed state write.
      value: __exactExpression(() => this.state.query),
      __exactBindInput: (event) => {
        this.state.query = event.currentTarget.value;
      }
    }),
    __exactVNode('output', null,
      // Each dynamic child owns a narrow DOM marker range.
      __exactDynamic(() => this.state.quantity, '<quantity>'),
      ' × ',
      __exactDynamic(() => this.state.selected?.price ?? 0, '<price>'),
      ' = ',
      __exactDynamic(() => this.state.subtotal, '<subtotal>')
    ),
    __exactDynamic(() =>
      this.state.query && this.state.products.length === 0
        ? __exactVNode('p', { role: 'status' }, 'No matches')
        : null,
      '<empty-status>'
    ),
    // The Product @exact key annotation supplies stable row identity.
    __exactDynamic(() => this.map(
      this.state.products,
      (product) => product.id,
      (product) => __exactVNode('button', {
        onClick: () => { this.state.selected = product; }
      }, product.name)
    ), '<product-list>')
  );
}`;

/** Annotated pseudocode for the server artifact produced by the compiler tour. */
export const compilerTourGeneratedServerSource = `import { CatalogRepositoryContext }
  from './catalog-context.js';
import { taskAwait, withTaskSignal }
  from '@exactjs/core/runtime/tasks';
import { writeReactiveLazy as __exactWrite }
  from '@exactjs/core/runtime/reactivity';

// The operation is registered in the server artifact's allowlisted catalog.
export const CatalogEditorContract = {
  continuations: [{
    id: '<catalog-search>',
    dependencies: [{ source: 'state', path: ['query'] }],
    stateWrites: [{ path: ['products'] }],
    serverContexts: ['CatalogRepositoryContext']
  }],

  executors: [{
    id: '<catalog-search>',
    async execute(activation, request) {
      // Only the compiler-selected public dependency crossed the wire.
      const query = activation.dependencies[0];

      // Trusted request context resolves the repository on the server. It
      // is never accepted from or serialized back to the browser.
      const catalog = request.getContext(
        CatalogRepositoryContext,
        'CatalogRepositoryContext'
      );

      const products = query
        ? await taskAwait(request.signal, catalog.search(
            query,
            // Cancellation is injected into the declared signal slot.
            withTaskSignal(undefined, request.signal)
          ))
        : [];

      const state = { ...activation.state };
      __exactWrite(state, ['products'], () => products);

      // Serialization and the @exact shared result contract are validated
      // before this state projection leaves the server request.
      return { state, contexts: {} };
    }
  }]
};

// request  -> { operation: '<catalog-search>', dependencies: ['desk'] }
// response <- { state: { products: [{ id: 'p1', name: 'Desk' }] } }
// Credentials, clients, and CatalogRepositoryContext never cross.`;
