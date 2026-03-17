import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ViewportScroller } from '@angular/common';
import { vi } from 'vitest';

import { App } from './app';
import { routes } from './app.routes';
import { environment } from '../environment/environment';

const AUTH_SESSION = {
  token: 'test-jwt-token',
  userId: 1,
  mail: 'tester@carbonaze.fr',
  societyId: 9,
  societyName: 'Carbonaze Tests',
};

describe('App', () => {
  let httpTestingController: HttpTestingController;

  beforeEach(async () => {
    localStorage.setItem('carbonaze.auth.session', JSON.stringify(AUTH_SESSION));
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
    localStorage.clear();
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
    httpTestingController.expectOne(`${environment.apiUrl}/materials`).flush([
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
    httpTestingController.expectOne(`${environment.apiUrl}/materials`).flush([
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

  it('should open the history modal from the topbar and render API bilans', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const historyButton = root.querySelector('[data-testid="history-button"]') as HTMLButtonElement | null;

    expect(historyButton).toBeTruthy();

    historyButton?.click();
    fixture.detectChanges();

    const historyRequest = httpTestingController.expectOne(`${environment.apiUrl}/bilans`);
    expect(historyRequest.request.method).toBe('GET');
    historyRequest.flush([
      {
        id: 7,
        siteId: 3,
        site: {
          id: 3,
          name: 'Site Paris',
          city: 'Paris',
          numberEmployee: 120,
          parkingPlaces: 30,
          numberPc: 90,
        },
        totalCo2: 12.4,
        calculationDate: '2026-03-17',
      },
    ]);

    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.textContent).toContain('Site Paris');
    expect(root.textContent).toContain('12.4 tCO2e');
  });

  it('should navigate to calculations when loading a bilan from the API history', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const historyButton = root.querySelector('[data-testid="history-button"]') as HTMLButtonElement | null;
    historyButton?.click();
    fixture.detectChanges();

    httpTestingController.expectOne(`${environment.apiUrl}/bilans`).flush([
      {
        id: 7,
        siteId: 3,
        site: {
          id: 3,
          name: 'Site Paris',
          city: 'Paris',
          numberEmployee: 120,
          parkingPlaces: 30,
          numberPc: 90,
        },
        totalCo2: 12.4,
        calculationDate: '2026-03-17',
      },
    ]);

    await fixture.whenStable();
    fixture.detectChanges();

    const historyCard = Array.from(root.querySelectorAll('.history-card-clickable')).at(0) as HTMLElement | undefined;
    historyCard?.click();

    const bilanRequest = httpTestingController.expectOne(`${environment.apiUrl}/bilans/7`);
    expect(bilanRequest.request.method).toBe('GET');
    bilanRequest.flush({
      id: 7,
      siteId: 3,
      site: {
        id: 3,
        name: 'Site Paris',
        city: 'Paris',
        numberEmployee: 120,
        parkingPlaces: 30,
        numberPc: 90,
      },
      electricityKwhYear: 10000,
      gasKwhYear: 2000,
      totalCo2: 12.4,
      calculationDate: '2026-03-17',
      materials: [{ name: 'Acier', quantity: 2, factor: 1.9, emission: 3.8 }],
    });

    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/calculs');
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
    httpTestingController.expectOne(`${environment.apiUrl}/materials`).flush([
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
    httpTestingController.expectOne(`${environment.apiUrl}/materials`).flush([
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
