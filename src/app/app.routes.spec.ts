import { CalculationsPageComponent } from './pages/calculations-page.component';
import { ComparisonPageComponent } from './pages/comparison-page.component';
import { LandingPageComponent } from './pages/landing-page.component';
import { LoginPageComponent } from './pages/login-page.component';
import { RegisterPageComponent } from './pages/register-page.component';
import { routes } from './app.routes';

describe('app routes', () => {
  it('declares landing, auth, protected and fallback routes', async () => {
    expect(routes).toHaveLength(6);
    expect(routes[0].path).toBe('');
    expect(routes[0].title).toBe('Carbonaze | Landing');
    await expect(routes[0].loadComponent?.()).resolves.toBe(LandingPageComponent);

    expect(routes[1].path).toBe('calculs');
    expect(routes[1].title).toBe('Carbonaze | Calculs');
    await expect(routes[1].loadComponent?.()).resolves.toBe(CalculationsPageComponent);

    expect(routes[2].path).toBe('comparaison');
    expect(routes[2].title).toBe('Carbonaze | Comparaison');
    await expect(routes[2].loadComponent?.()).resolves.toBe(ComparisonPageComponent);

    expect(routes[3].path).toBe('login');
    expect(routes[3].title).toBe('Carbonaze | Connexion');
    await expect(routes[3].loadComponent?.()).resolves.toBe(LoginPageComponent);

    expect(routes[4].path).toBe('inscription');
    expect(routes[4].title).toBe('Carbonaze | Inscription');
    await expect(routes[4].loadComponent?.()).resolves.toBe(RegisterPageComponent);

    expect(routes[5]).toMatchObject({
      path: '**',
      redirectTo: '',
    });
  });
});
