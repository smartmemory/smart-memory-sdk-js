import { useContext } from 'react';
import { AuthContext } from './SmartMemoryProvider.jsx';

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within a SmartMemoryProvider');
  }
  return context;
}
