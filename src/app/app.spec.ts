import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ViewportScroller } from '@angular/common';
import { vi } from 'vitest';

import { App } from './app';
import { routes } from './app.routes';

describe('App', () => {
  let httpTestingController: HttpTestingController;

  beforeEach(async () => {
    window.scrollTo = (() => {}) as typeof window.scrollTo;
    HTMLElement.prototype.scrollIntoView =
      (() => {}) as typeof HTMLElement.prototype.scrollIntoView;

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should navigate home and reset the scroll position from the brand button', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const viewportScroller = TestBed.inject(ViewportScroller);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const scrollSpy = vi.spyOn(viewportScroller, 'scrollToPosition');

    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const brandButton = root.querySelector('.brand-home-button') as HTMLButtonElement | null;

    expect(brandButton).toBeTruthy();

    brandButton?.click();
    await fixture.whenStable();

    expect(navigateSpy).toHaveBeenCalledWith('/');
    expect(scrollSpy).toHaveBeenCalledWith([0, 0]);
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
    fixture.detectChanges();
    httpTestingController.expectOne('/api/materials').flush([
      { id: 1, name: 'Béton', energeticValue: 0.18, quantity: 0 },
      { id: 2, name: 'Acier', energeticValue: 1.9, quantity: 0 },
    ]);

    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('[data-testid="calculator-settings-form"]')).toBeTruthy();
  });

  it('should filter the materials catalog from the search input', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const settingsButton = root.querySelector(
      '.floating-settings-button',
    ) as HTMLButtonElement | null;

    expect(settingsButton).toBeTruthy();
    settingsButton?.click();
    fixture.detectChanges();
    httpTestingController.expectOne('/api/materials').flush([
      { id: 1, name: 'Béton', energeticValue: 0.18, quantity: 0 },
      { id: 2, name: 'Acier', energeticValue: 1.9, quantity: 0 },
      { id: 3, name: 'Bois', energeticValue: 0.08, quantity: 0 },
    ]);

    await fixture.whenStable();
    fixture.detectChanges();

    const searchInput = root.querySelector(
      '[data-testid="material-search-input"]',
    ) as HTMLInputElement | null;

    expect(searchInput).toBeTruthy();

    if (!searchInput) {
      return;
    }

    searchInput.value = 'aci';
    searchInput.dispatchEvent(new Event('input'));

    await fixture.whenStable();
    fixture.detectChanges();

    const materialNameInputs = Array.from(
      root.querySelectorAll('.catalog-row input[formcontrolname="name"]'),
    ) as HTMLInputElement[];

    expect(materialNameInputs.map((input) => input.value.trim())).toEqual(['Acier']);
  });

  it('should open the input modal and show results after calculation', async () => {
    const harness = await RouterTestingHarness.create('/calculs');

    await harness.fixture.whenStable();
    harness.detectChanges();

    const compiled = harness.routeNativeElement as HTMLElement;
    const siteForm = compiled.querySelector('[data-testid="site-form"]') as HTMLFormElement | null;
    expect(siteForm).toBeTruthy();

    siteForm?.dispatchEvent(new Event('submit'));

    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement).toBeTruthy();
  });

  it('should create a new material from the input modal and expose it in the selector', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/calculs');
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const openNewMaterialSettingsButton = root.querySelector(
      '[data-testid="open-new-material-settings"]',
    ) as HTMLButtonElement | null;

    expect(openNewMaterialSettingsButton).toBeTruthy();

    openNewMaterialSettingsButton?.click();
    fixture.detectChanges();
    httpTestingController.expectOne('/api/materials').flush([
      { id: 1, name: 'Béton', energeticValue: 0.18, quantity: 0 },
      { id: 2, name: 'Acier', energeticValue: 1.9, quantity: 0 },
    ]);

    await fixture.whenStable();
    fixture.detectChanges();

    const nameInput = root.querySelector(
      '[data-testid="new-material-name-input"]',
    ) as HTMLInputElement | null;
    const factorInput = root.querySelector(
      '[data-testid="new-material-factor-input"]',
    ) as HTMLInputElement | null;
    const addMaterialButton = root.querySelector(
      '[data-testid="add-material-definition-button"]',
    ) as HTMLButtonElement | null;

    expect(nameInput).toBeTruthy();
    expect(factorInput).toBeTruthy();
    expect(addMaterialButton).toBeTruthy();

    if (!nameInput || !factorInput || !addMaterialButton) {
      return;
    }

    nameInput.value = 'Pierre';
    nameInput.dispatchEvent(new Event('input'));
    factorInput.value = '0.44';
    factorInput.dispatchEvent(new Event('input'));
    addMaterialButton.click();
    fixture.detectChanges();
    httpTestingController.expectOne('/api/materials').flush([
      { id: 3, name: 'Pierre', energeticValue: 0.44, quantity: 0 },
    ]);

    await fixture.whenStable();
    fixture.detectChanges();

    const materialSelectAfterCreation = root.querySelector(
      'select[formcontrolname="materialId"]',
    ) as HTMLSelectElement | null;
    const optionTextsAfterCreation = Array.from(
      materialSelectAfterCreation?.querySelectorAll('option') ?? [],
    ).map((option) => option.textContent?.trim());

    expect(optionTextsAfterCreation).toContain('Pierre');

    const saveSettingsButton = root.querySelector(
      '[data-testid="save-settings-button"]',
    ) as HTMLButtonElement | null;

    expect(saveSettingsButton).toBeTruthy();
    saveSettingsButton?.click();

    await fixture.whenStable();
    fixture.detectChanges();

    const materialSelect = root.querySelector(
      'select[formcontrolname="materialId"]',
    ) as HTMLSelectElement | null;
    const optionTexts = Array.from(materialSelect?.querySelectorAll('option') ?? []).map((option) =>
      option.textContent?.trim(),
    );

    expect(optionTexts).toContain('Pierre');
  });

  it('should redirect to the landing page when closing the input modal before any calculation', async () => {
    const harness = await RouterTestingHarness.create('/calculs');
    const router = TestBed.inject(Router);

    await harness.fixture.whenStable();
    harness.detectChanges();

    const compiled = harness.routeNativeElement as HTMLElement;
    const closeButton = compiled.querySelector(
      'button[aria-label="Fermer la modal"]',
    ) as HTMLButtonElement;

    closeButton.click();

    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(router.url).toBe('/');
    expect(harness.routeNativeElement?.textContent).toContain('Centralisez vos données site');
  });
});
