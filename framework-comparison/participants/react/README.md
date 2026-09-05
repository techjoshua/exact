# React controlled-service participant

This participant implements the incident console with React 19. Queue and detail data use component state,
derived filtering is calculated during render, service events update state through effects, and stable callbacks
connect detail mutations to the queue owner.

Its controlled-service behavior, production SSR, and hydration are covered by the same black-box tests as
the eXact participant.
