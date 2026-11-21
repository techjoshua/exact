package exactcompiler

import (
	"slices"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// iterationEffects describes source bodies at a loop in this checker and
// executable selection. The demand and propagation walks share this result.
type iterationEffects struct {
	generatorCall *ast.Node
	bodies        []*ast.Node
	opaque        bool
}

func (e *iterationEffects) add(body *ast.Node) {
	if !slices.Contains(e.bodies, body) {
		e.bodies = append(e.bodies, body)
	}
}

func (owner *executableBodyOwner) loopEffects(loop *ast.Node) iterationEffects {
	if e, found := owner.iterations[loop]; found {
		return e
	}
	var e iterationEffects
	flow := sourceValueQuery{owner: owner.values, executable: owner, effectOwner: enclosingCallableNode(loop), dependenciesOnly: true, active: make(map[*ast.Node]bool)}
	if possible, _ := flow.reachable(loop, nil); possible {
		e.collect(loop, owner)
	}
	if owner.iterations == nil {
		owner.iterations = make(map[*ast.Node]iterationEffects)
	}
	owner.iterations[loop] = e
	return e
}

// Creating the generator object does not advance it. GetAsyncIterator may
// select the synchronous iterator when the async method is absent.
func (e *iterationEffects) collect(loop *ast.Node, owner *executableBodyOwner) {
	iteration := loop.AsForInOrOfStatement()
	receiver := iteration.Expression
	c := owner.checker
	root, fields := immutableEffectArgumentRoot(receiver, c, make(map[ast.SymbolId]bool))
	if len(fields) == 0 && ast.IsCallExpression(root) {
		body := owner.invocationBody(root, c)
		if body != nil && ast.IsFunctionLike(body) && body.Body() != nil {
			if _, ordinary := ordinaryResultCategory(body); !ordinary {
				e.add(body)
				e.generatorCall = root
				return
			}
		}
	}
	if len(fields) == 0 && ast.IsObjectLiteralExpression(root) {
		receiver = root
	}
	for _, t := range c.GetTypeAtLocation(receiver).Distributed() {
		if iteration.AwaitModifier != nil {
			async := c.GetPropertyOfType(t, taskResourceDisposalSymbolKey(c, "asyncIterator"))
			e.iterator(c, async, loop, true)
			if async != nil {
				method := c.GetTypeOfSymbol(async)
				if async.Flags&ast.SymbolFlagsOptional == 0 && c.GetNonNullableType(method) == method {
					continue
				}
			}
		}
		e.iterator(c, c.GetPropertyOfType(t, taskResourceDisposalSymbolKey(c, "iterator")), loop, false)
	}
}

// Iterator acquisition, advancement, the result Gets and conditional closing
// belong to this loop. A signature without an implementation remains opaque.
func (e *iterationEffects) iterator(c *checker.Checker, symbol *ast.Symbol, loop *ast.Node, async bool) {
	if symbol == nil || symbol.ValueDeclaration == nil {
		return
	}
	if standardLibrarySource(ast.GetSourceFileOfNode(symbol.ValueDeclaration)) {
		// A declared iterable interface admits arbitrary authored implementations.
		// Concrete standard collections retain their built-in iteration contract.
		if p := symbol.ValueDeclaration.Parent; p != nil && ast.IsInterfaceDeclaration(p) {
			switch p.Name().Text() {
			case "Iterable", "IterableIterator", "AsyncIterable", "AsyncIterableIterator", "Generator", "AsyncGenerator":
				e.opaque = true
			}
		}
		return
	}
	for _, factory := range e.method(c, symbol) {
		for _, iterator := range c.GetReturnTypeOfSignature(factory).Distributed() {
			mayYield := false
			asyncFromSync := !async && loop.AsForInOrOfStatement().AwaitModifier != nil
			for _, next := range e.method(c, c.GetPropertyOfType(iterator, "next")) {
				step := c.GetReturnTypeOfSignature(next)
				if async {
					e.await(c, step)
					if settled := c.GetPromisedTypeOfPromise(step); settled != nil {
						step = settled
					}
				}
				for _, record := range step.Distributed() {
					yielded := e.step(c, record, asyncFromSync)
					mayYield = mayYield || yielded
				}
			}
			if mayYield && iterationMayClose(loop) {
				for _, close := range e.method(c, c.GetPropertyOfType(iterator, "return")) {
					result := c.GetReturnTypeOfSignature(close)
					if async {
						e.await(c, result)
					} else if asyncFromSync {
						for _, record := range result.Distributed() {
							e.step(c, record, true)
						}
					}
				}
			}
		}
	}
}

func (e *iterationEffects) step(c *checker.Checker, record *checker.Type, asyncFromSync bool) bool {
	done := c.GetPropertyOfType(record, "done")
	e.getter(done)
	finished := false
	if done != nil {
		t := c.GetTypeOfSymbol(done)
		finished = t.Flags()&checker.TypeFlagsBooleanLiteral != 0 && t.AsLiteralType().Value() == true
	}
	// AsyncFromSyncIteratorContinuation also acquires a completed step's value.
	if !finished || asyncFromSync {
		value := c.GetPropertyOfType(record, "value")
		e.getter(value)
		if asyncFromSync && value != nil {
			e.await(c, c.GetTypeOfSymbol(value))
		}
	}
	return !finished
}

// Await reads then and invokes it when callable. A standard Promise supplies
// its own settlement; an authored getter or method remains an executable edge.
func (e *iterationEffects) await(c *checker.Checker, value *checker.Type) {
	for _, v := range value.Distributed() {
		then := c.GetPropertyOfType(v, "then")
		if then == nil {
			continue
		}
		if decl := then.ValueDeclaration; decl != nil && standardLibrarySource(ast.GetSourceFileOfNode(decl)) && decl.Parent != nil && ast.IsInterfaceDeclaration(decl.Parent) && decl.Parent.Name().Text() == "Promise" {
			continue
		}
		e.method(c, then)
	}
}

func (e *iterationEffects) method(c *checker.Checker, symbol *ast.Symbol) []*checker.Signature {
	if symbol == nil {
		return nil
	}
	e.getter(symbol)
	signatures := c.GetSignaturesOfType(c.GetNonNullableType(c.GetTypeOfSymbol(symbol)), checker.SignatureKindCall)
	for _, sig := range signatures {
		if decl := sig.Declaration(); decl != nil && ast.IsFunctionLike(decl) && decl.Body() != nil {
			e.add(decl)
		} else {
			e.opaque = true
		}
	}
	return signatures
}

func (e *iterationEffects) getter(symbol *ast.Symbol) {
	if symbol != nil {
		if decl := symbol.ValueDeclaration; decl != nil && ast.IsGetAccessorDeclaration(decl) && decl.Body() != nil {
			e.add(decl)
		}
	}
}

// Destructuring or assignment may close an iterator even with an empty body.
func iterationMayClose(loop *ast.Node) bool {
	iteration := loop.AsForInOrOfStatement()
	target := iteration.Initializer
	simple := ast.IsVariableDeclarationList(target) && len(target.AsVariableDeclarationList().Declarations.Nodes) == 1 && ast.IsIdentifier(target.AsVariableDeclarationList().Declarations.Nodes[0].Name()) && target.Flags&ast.NodeFlagsUsing == 0
	stmt := iteration.Statement
	return !simple || !(ast.IsEmptyStatement(stmt) || ast.IsBlock(stmt) && len(stmt.AsBlock().Statements.Nodes) == 0)
}
