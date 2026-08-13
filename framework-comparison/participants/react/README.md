# React controlled-service participant

This participant implements the incident console with React 19. Queue and detail data use component state,
derived filtering is calculated during render, service events update state through effects, and stable callbacks
connect detail mutations to the queue owner.

It remains `scaffolded` because this slice uses browser rendering rather than hydrating server-rendered HTML.
Its controlled-service behavior is covered by the same black-box tests as the eXact participant.
