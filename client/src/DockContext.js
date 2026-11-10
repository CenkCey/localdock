import { createContext, useContext } from 'react';

export const DockContext = createContext(null);

export function useDockContext() {
  return useContext(DockContext);
}
