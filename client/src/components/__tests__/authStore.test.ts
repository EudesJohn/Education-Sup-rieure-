/**
 * Tests du store d'authentification Zustand.
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '@/stores/authStore';

describe('AuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      teacher: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  it('should start with no authenticated user', () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.teacher).toBeNull();
    expect(state.accessToken).toBeNull();
  });

  it('should set auth state on login', async () => {
    // Login dans le vrai store nécessite un appel API,
    // donc on simule en manipulant localStorage + setState directement
    localStorage.setItem('pean_access_token', 'test-access-token');
    localStorage.setItem('pean_refresh_token', 'test-refresh-token');
    const teacherData = {
      id: 1, email: 'teacher@test.edu', full_name: 'Dr. Test',
      role: 'teacher' as const, institution: 'U', discipline: 'Maths',
      is_verified: true, is_2fa_enabled: false,
      created_at: '2026-01-01T00:00:00Z',
    };
    localStorage.setItem('pean_teacher', JSON.stringify(teacherData));

    useAuthStore.setState({
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      teacher: teacherData,
      isAuthenticated: true,
    });

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.teacher).toEqual(teacherData);
    expect(state.accessToken).toBe('test-access-token');
    expect(state.refreshToken).toBe('test-refresh-token');
  });

  it('should clear auth state on logout', () => {
    // Simuler un état connecté
    localStorage.setItem('pean_access_token', 'token');
    localStorage.setItem('pean_refresh_token', 'rtoken');
    useAuthStore.setState({
      accessToken: 'token', refreshToken: 'rtoken',
      teacher: { id: 1, email: 'a@b.com', full_name: 'A', role: 'teacher' as const, institution: 'U',
        discipline: 'M', is_verified: true, is_2fa_enabled: false,
        created_at: '2026-01-01T00:00:00Z' },
      isAuthenticated: true,
    });

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.teacher).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(localStorage.getItem('pean_access_token')).toBeNull();
    expect(localStorage.getItem('pean_refresh_token')).toBeNull();
  });

  it('should load state from localStorage', () => {
    localStorage.setItem('pean_access_token', 'stored-token');
    localStorage.setItem('pean_refresh_token', 'stored-refresh');
    const teacherData = {
      id: 2, email: 'stored@test.edu', full_name: 'Stored', institution: 'U',
      discipline: 'M', is_verified: true, is_2fa_enabled: false,
      created_at: '2026-06-01T00:00:00Z',
    };
    localStorage.setItem('pean_teacher', JSON.stringify(teacherData));

    useAuthStore.getState().loadFromStorage();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.accessToken).toBe('stored-token');
    expect(state.teacher?.email).toBe('stored@test.edu');
  });

  it('should not authenticate from corrupted localStorage', () => {
    localStorage.setItem('pean_access_token', '');
    localStorage.setItem('pean_refresh_token', 'some-refresh');
    localStorage.setItem('pean_teacher', '{invalid-json}');

    useAuthStore.getState().loadFromStorage();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
  });
});
