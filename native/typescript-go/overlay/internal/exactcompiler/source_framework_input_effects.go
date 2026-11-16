package exactcompiler

import (
	"path/filepath"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// frameworkInputSymbol reads an already selected package declaration, never an
// implementation body or a newly loaded module. The package owns these symbol
// exports; arbitrary same-named application declarations are not contracts.
func (q *sourceValueQuery) frameworkInputSymbol(view sourceFrameworkStorageView, name string) (string, *ast.Symbol) {
	source := ast.GetSourceFileOfNode(view.declaration)
	if source == nil || q.owner == nil || q.owner.program == nil {
		return "", nil
	}
	path := filepath.Join(filepath.Dir(source.FileName()), "..", "internal", "symbols.d.ts")
	symbols := q.owner.program.GetSourceFile(path)
	if symbols == nil || !symbols.IsDeclarationFile {
		return "", nil
	}
	module := q.owner.checker.GetSymbolAtLocation(symbols.AsNode())
	if module == nil {
		return "", nil
	}
	for _, symbol := range q.owner.checker.GetExportsAndPropertiesOfModule(module) {
		if symbol.Name != name || symbol.ValueDeclaration == nil || ast.GetSourceFileOfNode(symbol.ValueDeclaration) != symbols {
			continue
		}
		value := q.owner.checker.GetTypeOfSymbol(symbol)
		if value != nil && value.Flags()&checker.TypeFlagsUniqueESSymbol != 0 {
			return checker.GetPropertyNameFromType(value), symbol
		}
	}
	return "", nil
}

// declaredCallbackInputEffects adds the authenticated framework's implicit MAY
// Gets inside the existing original invocation consumer. It receives the actual
// prepared alternatives and caller bindings; no second query, callee acquisition
// or result projection is performed. Native callback handling remains unchanged.
func (q *sourceValueQuery) declaredCallbackInputEffects(call *ast.Node, bindings sourceValueBindings, prepared sourcePreparedInvocation, result *accessorCandidates) {
	q.nativeCallbackInputEffects(call, bindings, prepared, result)
	if !q.dependenciesOnly || q.operation != nil || q.returnObservation != nil {
		return
	}
	declaration := reactiveObjectsViewDeclaration(call, prepared.declarations, q.executable)
	if declaration == nil {
		return
	}
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	if len(actuals) != 1 || ast.IsSpreadElement(actuals[0]) {
		return
	}
	part := accessorCandidates{}
	q.withActiveInvocation(call, func() {
		inputs := q.bindInputs(declaration, call, bindings, &part)
		if inputs == nil || len(declaration.Parameters()) == 0 {
			part.valueIncomplete = true
			return
		}
		symbol := q.owner.checker.GetSymbolAtLocation(declaration.Parameters()[0].Name())
		if symbol == nil {
			part.valueIncomplete = true
			return
		}
		values := inputs.bindings[ast.GetSymbolId(symbol)]
		input, gap := q.describeFrameworkViewInput(call, declaration, values)
		view, valid := describeReactiveObjectsStorageView(call, prepared.declarations, input, gap, q.relativeInputCut(call), q.executable)
		if !valid {
			return
		}
		// The runtime contract permits transformed/unknown results and Throw. This
		// residual is additive even while real argument/selection work stays pending.
		name := "framework input"
		if q.effectOwner != nil && q.effectOwner.Name() != nil {
			name = callableNameText(q.effectOwner.Name())
		}
		part.environmentEffects = append(part.environmentEffects, frameworkRuntimeMay(view, q.effectOwner, name))
		for _, value := range values {
			// A declaration-relative formal is retained symbolically. Inspecting its
			// absent value would confuse definition Effects with normal input proof.
			if value.node != nil && ast.IsIdentifier(value.node) {
				s := q.owner.checker.GetSymbolAtLocation(value.node)
				if s != nil && s.ValueDeclaration != nil && ast.IsParameterDeclaration(s.ValueDeclaration) {
					continue
				}
			}
			for _, name := range []string{"proxyMarker", "rawTarget"} {
				key, property := q.frameworkInputSymbol(view, name)
				if property == nil {
					part.valueIncomplete = true
					continue
				}
				get := &sourceGetInputs{operation: call, receiver: value, symbol: property, propertyKey: key}
				// An explicit original Get is lent only to its canonical
				// one-key projection. The generic binding helper's name-form
				// read is a different shape and correctly refuses this loan.
				effects := q.accessorsAtGet(value.node, []string{key}, "", accessorRead, bindings, nil, get, value)
				mergeAccessorCandidates(&part, effects)
			}
		}
	})
	// Keep all original known getter/Proxy/capture/environment contributions and
	// uncertainty in the very same result consumed by the three fact appenders.
	mergeAccessorCandidates(result, part)
}
