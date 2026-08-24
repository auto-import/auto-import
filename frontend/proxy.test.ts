import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

describe('route protection proxy', () => {
  it('redirects direct unauthenticated dashboard navigation to login', () => {
    const response = proxy(new NextRequest('http://localhost:3001/dossiers'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/connexion');
  });

  it('allows protected navigation when the HttpOnly session cookie is present', () => {
    const request = new NextRequest('http://localhost:3001/dossiers', {
      headers: { cookie: 'auto_import_refresh=opaque-session' },
    });
    const response = proxy(request);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});
