import { Routes } from '@angular/router';

import { authGuard } from './auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/landing-page.component').then((module) => module.LandingPageComponent),
    title: 'Carbonaze | Landing',
  },
  {
    path: 'calculs',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/calculations-page.component').then((module) => module.CalculationsPageComponent),
    title: 'Carbonaze | Calculs',
  },
  {
    path: 'comparaison',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/comparison-page.component').then((module) => module.ComparisonPageComponent),
    title: 'Carbonaze | Comparaison',
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login-page.component').then((module) => module.LoginPageComponent),
    title: 'Carbonaze | Connexion',
  },
  {
    path: 'inscription',
    loadComponent: () =>
      import('./pages/register-page.component').then((module) => module.RegisterPageComponent),
    title: 'Carbonaze | Inscription',
  },
  {
    path: '**',
    redirectTo: '',
  },
];
