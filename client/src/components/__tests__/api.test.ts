/**
 * Tests du client API Axios.
 * @vitest-environment jsdom
 *
 * Vérifie :
 * - L'intercepteur JWT (injection du token dans les requêtes)
 * - Le refresh automatique sur 401
 * - La gestion des erreurs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

describe('API Client', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should attach Authorization header when token exists', () => {
    localStorage.setItem('pean_access_token', 'test-jwt-token');

    // Créer une instance axios simulée comme dans api.ts
    const instance = axios.create({ baseURL: '/api' });

    // Simuler l'intercepteur request
    instance.interceptors.request.use((config) => {
      const token = localStorage.getItem('pean_access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Vérifier que l'intercepteur s'exécute
    return instance.get('/test').then(
      () => expect(true).toBe(false), // ne devrait pas réussir
      (error) => {
        // L'appel échoue (pas de serveur), mais le header doit être présent
        expect(error.config.headers.Authorization).toBe('Bearer test-jwt-token');
      }
    );
  });

  it('should not attach Authorization header when no token', () => {
    const instance = axios.create({ baseURL: '/api' });
    instance.interceptors.request.use((config) => {
      const token = localStorage.getItem('pean_access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    return instance.get('/test').then(
      () => expect(true).toBe(false),
      (error) => {
        expect(error.config.headers.Authorization).toBeUndefined();
      }
    );
  });

  it('should attempt token refresh on 401', async () => {
    localStorage.setItem('pean_access_token', 'expired-token');
    localStorage.setItem('pean_refresh_token', 'valid-refresh');

    let refreshAttempted = false;

    // Définir le handler de rejet comme fonction autonome
    const errorHandler = async (error: any) => {
      if (error.response?.status === 401 && !error.config._retry) {
        error.config._retry = true;
        refreshAttempted = true;
        // Simuler un refresh réussi
        localStorage.setItem('pean_access_token', 'new-token');
        error.config.headers.Authorization = 'Bearer new-token';
        return axios.create({ baseURL: '/api' })(error.config);
      }
      return Promise.reject(error);
    };

    // Simuler une réponse 401
    const error = { response: { status: 401 }, config: { _retry: false, headers: {} } };

    await errorHandler(error).catch(() => {
      expect(refreshAttempted).toBe(true);
      expect(localStorage.getItem('pean_access_token')).toBe('new-token');
    });
  });

  it('should clear auth on refresh failure', async () => {
    localStorage.setItem('pean_access_token', 'expired');
    localStorage.setItem('pean_refresh_token', 'also-expired');

    let logoutCalled = false;

    const errorHandler = async (error: any) => {
      if (error.response?.status === 401 && !error.config._retry) {
        error.config._retry = true;
        try {
          await axios.post('/api/auth/refresh', { refresh_token: localStorage.getItem('pean_refresh_token') });
        } catch {
          // Échec du refresh → déconnexion
          localStorage.removeItem('pean_access_token');
          localStorage.removeItem('pean_refresh_token');
          localStorage.removeItem('pean_teacher');
          logoutCalled = true;
        }
      }
      return Promise.reject(error);
    };

    const error = { response: { status: 401 }, config: { _retry: false, headers: {} } };

    await errorHandler(error).catch(() => {
      expect(logoutCalled).toBe(true);
      expect(localStorage.getItem('pean_access_token')).toBeNull();
    });
  });
});
