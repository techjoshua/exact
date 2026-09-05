# TanStack Start controlled-service participant

This participant implements the incident workspace with TanStack Start and React 19. Its root route
loads the controlled-service snapshot through TanStack Router's server-rendered loader, and Start
serializes that loader result for hydration. Client navigation uses TanStack Router while local
interaction, optimistic state, and the shared event stream remain React-owned.

The production build uses TanStack Start's Vite plugin and Nitro's Node deployment output. The
participant intentionally does not share UI or state modules with the standalone React participant.
