'use client';

import { createContext, useContext } from 'react';

const ApiBaseContext = createContext<string>('http://localhost:3002');

export function ApiBaseProvider({ apiBase, children }: { apiBase: string; children: React.ReactNode }) {
  return <ApiBaseContext.Provider value={apiBase}>{children}</ApiBaseContext.Provider>;
}

export function useApiBase() {
  return useContext(ApiBaseContext);
}
