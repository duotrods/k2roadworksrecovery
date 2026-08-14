import { createContext } from 'react';

// Context object lives in its own module (separate from the AuthProvider
// component) so AuthContext.jsx exports only components and stays compatible
// with React Fast Refresh / HMR.
export const AuthContext = createContext({});
