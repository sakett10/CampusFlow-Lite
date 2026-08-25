import { describe, it, expect, vi, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProtectedRoute from './ProtectedRoute';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';

vi.mock('@clerk/clerk-react', () => ({
  useAuth: vi.fn(),
}));

describe('ProtectedRoute', () => {
  it('shows loading state when not loaded', () => {
    (useAuth as Mock).mockReturnValue({ isLoaded: false, userId: null });
    
    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    // The SVG loader doesn't have a label but we can query by container or check that content is absent
    expect(screen.queryByText('Protected Content')).toBeNull();
  });

  it('redirects to / when loaded but no user', () => {
    (useAuth as Mock).mockReturnValue({ isLoaded: true, userId: null });
    
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/" element={<div>Home Page</div>} />
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <div>Protected Content</div>
            </ProtectedRoute>
          } />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Home Page')).toBeDefined();
    expect(screen.queryByText('Protected Content')).toBeNull();
  });

  it('renders children when loaded and authenticated', () => {
    (useAuth as Mock).mockReturnValue({ isLoaded: true, userId: 'user_123' });
    
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/" element={<div>Home Page</div>} />
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <div>Protected Content</div>
            </ProtectedRoute>
          } />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Protected Content')).toBeDefined();
    expect(screen.queryByText('Home Page')).toBeNull();
  });
});
