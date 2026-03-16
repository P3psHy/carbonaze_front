import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/landing-page.component').then((module) => module.LandingPageComponent),
    title: 'Carbonaze | Landing',
  },
  {
    path: 'calculs',
    loadComponent: () =>
      import('./pages/calculations-page.component').then((module) => module.CalculationsPageComponent),
    title: 'Carbonaze | Calculs',
  },
  {
    path: '**',
    redirectTo: '',
  },
];
