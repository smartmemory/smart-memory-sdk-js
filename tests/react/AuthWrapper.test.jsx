import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SmartMemoryProvider } from '../../src/react/index.js';
import { AuthWrapper } from '../../src/react/AuthWrapper.jsx';

function TestWrapper({ children, ...config }) {
  return (
    <SmartMemoryProvider
      mode="sso"
      apiBaseUrl="http://localhost:9001"
      webAppUrl="http://localhost:5173"
      endpoints={{ refresh: '/auth/refresh' }}
      storage="memory"
      {...config}
    >
      {children}
    </SmartMemoryProvider>
  );
}

describe('AuthWrapper', () => {
  it('should render fallback when not authenticated', () => {
    render(
      <TestWrapper>
        <AuthWrapper fallback={<div>Please login</div>}>
          <div>Protected content</div>
        </AuthWrapper>
      </TestWrapper>
    );

    expect(screen.getByText('Please login')).toBeDefined();
    expect(screen.queryByText('Protected content')).toBeNull();
  });

  it('should render null fallback by default', () => {
    const { container } = render(
      <TestWrapper>
        <AuthWrapper>
          <div>Protected content</div>
        </AuthWrapper>
      </TestWrapper>
    );

    expect(screen.queryByText('Protected content')).toBeNull();
  });
});
