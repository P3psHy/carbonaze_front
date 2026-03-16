import { ViewportScroller } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { App } from './app';
import { routes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the landing page on the default route', async () => {
    const harness = await RouterTestingHarness.create('/');

    expect(harness.routeNativeElement?.textContent).toContain('Centralisez vos données site');
  });

  it('should open the calculator settings from the global gear button', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const settingsButton = root.querySelector('.floating-settings-button') as HTMLButtonElement;

    expect(settingsButton).toBeTruthy();

    settingsButton.click();

    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('[data-testid="calculator-settings-form"]')).toBeTruthy();
  });

  it('should open the input modal and show results after calculation', async () => {
    const harness = await RouterTestingHarness.create('/calculs');
    const viewportScroller = TestBed.inject(ViewportScroller);
    let scrolledTo: [number, number] | null = null;
    viewportScroller.scrollToPosition = (position: [number, number]) => {
      scrolledTo = position;
    };

    await harness.fixture.whenStable();
    harness.detectChanges();

    const compiled = harness.routeNativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="site-form"]')).toBeTruthy();

    (compiled.querySelector('button[type="submit"]') as HTMLButtonElement).click();

    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(compiled.querySelector('[data-testid="results-panel"]')?.textContent).toContain(
      'Tableau de bord emissions',
    );
    expect(scrolledTo).toEqual([0, 0]);
  });

  it("should redirect to the landing page when closing the input modal before any calculation", async () => {
    const harness = await RouterTestingHarness.create('/calculs');
    const router = TestBed.inject(Router);

    await harness.fixture.whenStable();
    harness.detectChanges();

    const compiled = harness.routeNativeElement as HTMLElement;
    const closeButton = compiled.querySelector('button[aria-label="Fermer la modal"]') as HTMLButtonElement;

    closeButton.click();

    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(router.url).toBe('/');
    expect(harness.routeNativeElement?.textContent).toContain('Centralisez vos données site');
  });
});
