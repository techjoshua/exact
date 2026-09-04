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
  attachExactCompiledClientComponent,
  disposeExactClientComponent,
  receiveExactClientComponentProps
} from '@exactjs/core/runtime/component-abi';
import {
  createPreparedRenderProgram as prepare,
  prepareCompiledRenderProgram as compileProgram
} from '@exactjs/core/runtime/render-operations';
import {
  activateTaskForHost,
  createIndexedContinuationDependency,
  defineTask,
  dispatchComponentContinuation,
  markComponentContinuationTask
} from '@exactjs/core/runtime/tasks';
import {
  writeIndexedReactiveValue
} from '@exactjs/core/runtime/reactivity';

// Private indexes and operation codes are named here only for readability.
const state = {
  query: 0,
  quantity: 1,
  products: 2,
  selected: 3,
  subtotal: 4
} as const;

// This immutable plan is shared by every CatalogEditor instance.
const catalogProgram = compileProgram({
  version: 8,
  id: '<catalog-view>',
  namespace: 'html',
  template: '<section>...</section>',
  directClaims: true,
  wire: [
    ['section', 'html', 12, 7],
    [/* compiler-known DOM claim paths */],
    [
      // [property, source, slot]: source 0 is component state.
      [12, '<search-input>', '<value-group>', [
        ['value', 0, state.query]
      ], true],
      [11, '<quantity-text>', ['', '', true, 0, state.quantity]],
      [0, '<price-text>'], // arbitrary expression fallback
      [11, '<subtotal-text>', ['', '', true, 0, state.subtotal]],
      [1, '<empty-status>'],
      [3, '<product-list>']
    ]
  ]
});

// The artifact also owns indexed dependency routing and dirty masks.
const updates = {
  bindings: [
    [state.query, '<query operations>'],
    [state.quantity, '<quantity operations>'],
    [state.products, '<list operations>'],
    [state.selected, '<selection operations>'],
    [state.subtotal, '<subtotal operation>']
  ],
  apply(targets, dirtyLow, dirtyHigh) {
    // Generated calls update only operations selected by the masks.
  }
};

function instantiateCatalog(this: Component<CatalogState>) {
  writeIndexedReactiveValue(this.state, state.query, '');
  writeIndexedReactiveValue(this.state, state.quantity, 1);
  writeIndexedReactiveValue(this.state, state.products, []);

  // The arbitrary multiplication remains executable computation work. Its
  // task-shaped owner is distinct from exact render-program operands.
  activateTaskForHost(this, defineTask({ label: 'derived subtotal' },
    (quantity, price) => writeIndexedReactiveValue(
      this.state,
      state.subtotal,
      quantity * (price ?? 0)
    )
  ),
    this.reactive(() => this.state.quantity),
    this.reactive(() => this.state.selected?.price)
  );

  const searchCatalog = defineTask({
    label: 'searchCatalog',
    priority: 'deferred',
    concurrency: 'latest'
  }, markComponentContinuationTask('<catalog-search>',
    (query, task) => dispatchComponentContinuation(
      this, '<catalog-search>', [query], task.signal, []
    )
  ));
  activateTaskForHost(
    this,
    searchCatalog,
    createIndexedContinuationDependency(this.state, state.query)
  );

  // selected.name is a projection, so this browser-only task retains its
  // computation function and reactive owner.
  activateTaskForHost(this, defineTask({ label: 'updateTitle' },
    (name) => { document.title = name ?? 'Catalog'; }
  ), this.reactive(() => this.state.selected?.name));

  return () => prepare(catalogProgram, [
    // Direct query, quantity, and subtotal reads are in catalogProgram.wire.
    undefined,
    () => this.state.selected?.price ?? 0,
    () => this.state.query && this.state.products.length === 0
      ? <p role="status">No matches</p>
      : null,
    () => this.map(
      this.state.products,
      (product) => product.id,
      (product) => <button>{product.name}</button>
    )
  ], this);
}

export const CatalogEditor = attachComponentContract(
  instantiateCatalog,
  {
    artifact: {
      version: 1,
      target: 'client',
      id: '<catalog-component>',
      template: catalogProgram,
      construct: '<compiled instance constructor>',
      attach: attachExactCompiledClientComponent,
      receive: receiveExactClientComponentProps,
      dispose: disposeExactClientComponent,
      instantiate: instantiateCatalog,
      abi: '<compiler-selected capability bits>',
      updates,
      state: ['query', 'quantity', 'products', 'selected', 'subtotal'],
      props: [],
      capabilities: ['tasks', 'continuations', 'collections']
    }
  }
);`;

/** Annotated pseudocode for the server artifact produced by the compiler tour. */
export const compilerTourGeneratedServerSource = `import { CatalogRepositoryContext }
  from './catalog-context.js';
import {
  disposeExactServerComponent,
  issueExactServerComponent,
  writeExactServerComponent
} from '@exactjs/core/runtime/component-abi';
import {
  createPreparedServerRenderProgram as prepare,
  prepareCompiledRenderProgram as compileProgram
} from '@exactjs/core/framework/server-render-structure';
import { taskAwait, withTaskSignal }
  from '@exactjs/core/runtime/tasks';

// The generated writer owns serialization order. Static character and UTF-8
// byte facts are module data; output and dynamic values remain request-owned.
const catalogProgram = compileProgram({
  version: 8,
  id: '<catalog-view>',
  namespace: 'html',
  ssr(operations, request, invocation) {
    const output = operations.output();
    operations.begin(request, 12, 7, '<static characters>', '<static bytes>');

    const query = operations.prepareAttribute(invocation, '<query>');
    operations.rootOpening(
      request,
      output,
      query,
      'section',
      '<section',
      '>',
      '<opening characters>',
      '<static root attributes>'
    );
    operations.static(output, '<label>Search<input type="search"');
    operations.compiledAttribute(
      request, output, query, '<string>', 'value', 'value', 'input', 0
    );
    operations.static(output, '>...</label><output>');
    operations.text(
      request,
      output,
      operations.prepareText(invocation, '<subtotal>'),
      '<subtotal-marker>',
      0,
      true
    );
    operations.child(
      request,
      output,
      operations.prepareChild(invocation, '<product-list>'),
      '<product-list-marker>',
      0
    );
    operations.static(output, '</section>');
    return output;
  }
});

// The task operation is allowlisted beside the render artifact. It is never
// selected from a client-authored function or executable payload.
export const CatalogEditorContract = {
  continuations: [{
    id: '<catalog-search>',
    dependencies: [{ source: 'state', index: 0 }],
    stateWrites: [{ path: 'products' }],
    serverContexts: ['CatalogRepositoryContext']
  }],

  executors: [{
    id: '<catalog-search>',
    async execute(activation, request) {
      const query = activation.dependencies[0];
      const catalog = request.getContext(
        CatalogRepositoryContext,
        'CatalogRepositoryContext'
      );

      const products = query
        ? await taskAwait(request.signal, catalog.search(
            query,
            withTaskSignal(undefined, request.signal)
          ))
        : [];

      const state = { ...activation.state, products };

      // The shared result is validated before this projection leaves the
      // request. The repository and credentials never enter it.
      return { state, contexts: {} };
    }
  }],

  artifact: {
    version: 1,
    target: 'server',
    id: '<catalog-component>',

    // These adapters invoke the request, writer, and frame protocols. The
    // request starts ready work; the writer waits only when required.
    issue: issueExactServerComponent,
    write: writeExactServerComponent,
    dispose: disposeExactServerComponent,

    instantiate: '<setup executor returning prepare(catalogProgram, values)>',
    construct: '<request-frame constructor>',
    abi: '<compiler-selected capability bits>',

    execution: {
      classification: 'scheduled',
      lane: 'direct',
      mode: 'direct',
      render: '<the same compiler-closed setup executor>'
    },

    // Only these schemas are module-owned. Props, state, tasks, output,
    // failures, and compact resumption records remain request-owned.
    state: ['query', 'quantity', 'products', 'selected', 'subtotal'],
    props: [],
    capabilities: ['tasks', 'continuations', 'resumption', 'contexts', 'collections']
  }
};

// request  -> { operation: '<catalog-search>', dependencies: ['desk'] }
// response <- { state: { products: [{ id: 'p1', name: 'Desk' }] } }
// Credentials, clients, and CatalogRepositoryContext never cross.`;
