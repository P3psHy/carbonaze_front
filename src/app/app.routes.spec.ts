import { CalculationsPageComponent } from './pages/calculations-page.component';
import { LandingPageComponent } from './pages/landing-page.component';
import { routes } from './app.routes';

describe('app routes', () => {
  it('declares landing, calculation and fallback routes', async () => {
    expect(routes).toHaveLength(3);
    expect(routes[0].path).toBe('');
    expect(routes[0].title).toBe('Carbonaze | Landing');
    await expect(routes[0].loadComponent?.()).resolves.toBe(LandingPageComponent);

    expect(routes[1].path).toBe('calculs');
    expect(routes[1].title).toBe('Carbonaze | Calculs');
    await expect(routes[1].loadComponent?.()).resolves.toBe(CalculationsPageComponent);

    expect(routes[2]).toMatchObject({
      path: '**',
      redirectTo: '',
    });
  });
});
