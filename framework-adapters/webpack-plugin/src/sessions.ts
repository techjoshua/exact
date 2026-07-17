import { createCompilerSession, type ExactCompilerSession } from "@exact/compiler";

const sessions = new Map<string, ExactCompilerSession>();
let nextSessionId = 0;

export function createWebpackCompilerSession(enabled: boolean): Readonly<{
  id: string;
  session: ExactCompilerSession;
}> {
  const id = `exact-webpack-${++nextSessionId}`;
  const session = createCompilerSession({ languageService: enabled });
  sessions.set(id, session);
  return { id, session };
}

export function webpackCompilerSession(id: string | undefined): ExactCompilerSession | undefined {
  return id ? sessions.get(id) : undefined;
}

export function replaceWebpackCompilerSession(id: string, enabled: boolean): ExactCompilerSession {
  sessions.get(id)?.dispose();
  const session = createCompilerSession({ languageService: enabled });
  sessions.set(id, session);
  return session;
}

export function disposeWebpackCompilerSession(id: string): void {
  sessions.get(id)?.dispose();
  sessions.delete(id);
}

export function webpackCompilerSessionCount(): number {
  return sessions.size;
}
