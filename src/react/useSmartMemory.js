import { useContext } from 'react';
import { ClientContext } from './SmartMemoryProvider.jsx';

export function useSmartMemory() {
  const client = useContext(ClientContext);
  if (!client) {
    throw new Error('useSmartMemory must be used within a SmartMemoryProvider');
  }
  return client;
}
