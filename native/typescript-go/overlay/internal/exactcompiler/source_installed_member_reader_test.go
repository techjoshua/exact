package exactcompiler

import (
	"context"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The unchanged selected-recursive source supplies the real original binder,
// Get and enrolled event. This controls only the synchronous reader API; the
// unchanged public policy tests independently require full output and closure.
func TestInstalledMemberReaderOriginalScope(t *testing.T) {
	const id = "/virtual/selected-recursive-reader.tsx"
	request := Request{Kind: "compile", ID: id, Source: installedReaderOriginalSource, Target: TargetDefault}
	project, diagnostics, err := newProjectStateWithSources(request, id, map[string]string{id: request.Source})
	if err != nil {
		t.Fatal(err, diagnostics)
	}
	for _, diagnostic := range diagnostics {
		if converted := projectDiagnostic(diagnostic); hasErrorDiagnostic([]Diagnostic{converted}) {
			t.Fatal(converted)
		}
	}
	generation, err := project.advance(context.Background(), id, request.Source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	cache, _ := prepareProjectCallableContexts(project, generation.sourceFile, generation.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
	collection := beginProjectCallableCollection(cache, cache.owner)
	defer collection.close()
	reached := 0
	for _, publisher := range cache.owner.pendingMemberPublishers {
		if publisher.workRegistrar == nil {
			continue
		}
		original := publisher.workRegistrar.installedPhase
		if original == nil {
			continue
		}
		publisher.workRegistrar.installedPhase = func(q *sourceValueQuery, parent sourceStagedOperationRequest, get *sourceGetInputs, read *sourceMemberWriterReadCut, phase sourceInstalledMemberPhase, key string, receiver sourceRelativeEndpoint) (*sourceInstalledMemberEvent, func(), bool) {
			event, revoke, ok := original(q, parent, get, read, phase, key, receiver)
			if !ok || phase != installedMemberRead || key != "value" || get == nil || !ast.IsPropertyAccessExpression(get.operation) || !ast.IsCallExpression(get.operation.Expression()) {
				return event, revoke, ok
			}
			callee := get.operation.Expression().Expression()
			if !ast.IsIdentifier(callee) || callee.Text() != "select" {
				return event, revoke, ok
			}
			completed := false
			defer func() {
				if !completed {
					revoke()
				}
			}()
			if event.application.memberCut.returning == nil {
				t.Fatal("UNREACHED: original return context")
			}
			assertInstalledReaderScope(t, q, event, get, read)
			reached++
			completed = true
			return event, func() {
				revoke()
				revoke()
				if event.live || event.readerActive || event.work != nil || event.self != nil || q.liveInstalledMemberPhase(event, get, read) {
					t.Fatal("revoked event retained reader authority")
				}
			}, ok
		}
	}
	collection.collect()
	collection.resolve(generation.sourceFile)
	if reached == 0 {
		t.Fatal("UNREACHED: real selected-recursive installed Get; reader API controls not qualified")
	}
}

func assertInstalledReaderScope(t *testing.T, q *sourceValueQuery, event *sourceInstalledMemberEvent, get *sourceGetInputs, read *sourceMemberWriterReadCut) {
	t.Helper()
	semantic := event.application.memberCut
	if !q.liveInstalledMemberPhase(event, get, read) || event.readerActive {
		t.Fatal("original semantic owner unavailable")
	}
	reject := func(candidate *sourceValueQuery, actual *sourceGetInputs, reader *sourceMemberWriterReadCut) {
		t.Helper()
		restore := candidate.memberWriterRead(actual, reader)
		defer restore()
		if event.readerActive {
			t.Fatal("foreign owner opened original reader scope")
		}
	}
	copiedQuery := *q
	reject(&copiedQuery, get, read)
	copiedGet := *get
	reject(q, &copiedGet, read)
	wrongGet := *get
	wrongGet.receiver.node, wrongGet.propertyKey, wrongGet.hasOnly = get.operation, "other", true
	reject(q, &wrongGet, read)
	copiedRead := *read
	reject(q, get, &copiedRead)
	originalOwner := q.owner
	foreignOwner := *originalOwner
	foreignOwner.generation = &projectGeneration{}
	q.owner = &foreignOwner
	reject(q, get, read)
	q.owner = originalOwner
	originalEpoch := event.epoch
	event.epoch = &sourceStagedOperationEpoch{}
	reject(q, get, read)
	event.epoch = originalEpoch
	copiedEvent := *event
	q.installedMemberPhase = &copiedEvent
	restoreCopy := q.memberWriterRead(get, read)
	if copiedEvent.readerActive {
		t.Fatal("copied event inherited reader authority")
	}
	restoreCopy()
	q.installedMemberPhase = event
	q.returning = nil
	if q.liveInstalledMemberPhase(event, get, read) {
		t.Fatal("unissued physical projection borrowed semantic owner")
	}
	q.returning = semantic.returning
	restore := q.memberWriterRead(get, read)
	if !event.readerActive || q.returning != nil || !q.liveInstalledMemberPhase(event, get, read) || q.memberSourceObservationCut(get, read) != semantic {
		t.Fatal("same original reader did not retain separate semantic and physical cuts")
	}
	for _, field := range []**ast.Node{&q.reading, &q.initializing, &q.invoking} {
		prior := *field
		*field = get.operation.Parent
		if q.liveInstalledMemberPhase(event, get, read) {
			t.Fatal("changed physical context borrowed reader scope")
		}
		*field = prior
	}
	if q.liveInstalledMemberPhase(event, &copiedGet, read) || q.liveInstalledMemberPhase(event, get, &copiedRead) {
		t.Fatal("copy borrowed active reader scope")
	}
	restore()
	newScope := q.memberWriterRead(get, read)
	restore()
	if !event.readerActive {
		t.Fatal("old cleanup revoked a later reader scope")
	}
	newScope()
	if event.readerActive || q.relativeInputCut(get.operation) != semantic || !q.liveInstalledMemberPhase(event, get, read) {
		t.Fatal("reader cleanup lost original scope")
	}
	func() {
		defer func() {
			if recover() == nil {
				t.Fatal("panic control did not run")
			}
		}()
		release := q.memberWriterRead(get, read)
		defer release()
		panic("reader cleanup control")
	}()
	if event.readerActive || q.relativeInputCut(get.operation) != semantic {
		t.Fatal("panic retained physical reader scope")
	}
}

const installedReaderOriginalSource = `export {};declare const marker:unique symbol;
/** @exact keep=secret */ type Protected<T>=T&{readonly[marker]:true};
interface Chain<T>{value:T;resolved:Chain<Awaited<T>>;not:Chain<unknown>;}
function select<T>(value:T):Chain<T>{return {value} as Chain<T>;}
interface Service{select<T>(value:T):Chain<T>;field:<T>(value:T)=>Chain<T>;readonly selected:typeof select;}
declare const service:Service;
declare const credential:Protected<string>;
function overloaded(value:number):Chain<number>;
function overloaded(value:Protected<string>):Chain<Protected<string>>;
function overloaded(value:unknown):Chain<unknown>{return {value} as Chain<unknown>;}
function reference(){void select;void service.select;void overloaded;}export function Panel(){return()=> <p>{select(1).value}</p>;}`
