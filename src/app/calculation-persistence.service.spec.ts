import { provideHttpClient } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { CalculationPersistenceService, SavedCalculationRecord } from './calculation-persistence.service';
import { SiteImpactResult, SiteInputPayload } from './site-impact.models';

describe('CalculationPersistenceService', () => {
  let service: CalculationPersistenceService;
  let httpTestingController: HttpTestingController;

  const payload: SiteInputPayload = {
    siteName: '  HQ Paris  ',
    city: '  Paris  ',
    energyMwh: 1.2346,
    gasMwh: 0.4562,
    employees: 12.6,
    parkingSpaces: 4.4,
    computers: 8.2,
    materials: [],
  };

  const result: SiteImpactResult = {
    siteName: 'HQ Paris',
    city: 'Paris',
    totalEmission: 9.66,
    emissionPerEmployee: 0.77,
    dominantCategory: 'Materiaux',
    dominantShare: 40,
    materialCount: 0,
    categories: [],
    materials: [],
    insights: [],
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-16T09:30:00Z'));
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [CalculationPersistenceService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(CalculationPersistenceService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
    localStorage.clear();
    vi.useRealTimers();
  });

  it('creates society, site and bilan, then caches their identifiers', () => {
    let savedRecord: SavedCalculationRecord | undefined;

    service.saveCalculation(payload, result).subscribe((value) => {
      savedRecord = value;
    });

    const societyRequest = httpTestingController.expectOne('/api/societies');
    expect(societyRequest.request.method).toBe('POST');
    expect(societyRequest.request.body).toEqual({ name: 'Carbonaze Front' });
    societyRequest.flush({ id: 9, name: 'Carbonaze Front' });

    const siteRequest = httpTestingController.expectOne('/api/sites');
    expect(siteRequest.request.method).toBe('POST');
    expect(siteRequest.request.body).toEqual({
      name: 'HQ Paris',
      city: 'Paris',
      numberEmployee: 13,
      parkingPlaces: 4,
      numberPc: 8,
      societyId: 9,
    });
    siteRequest.flush({ id: 21, name: 'HQ Paris' });

    const bilanRequest = httpTestingController.expectOne('/api/sites/21/bilans');
    expect(bilanRequest.request.method).toBe('POST');
    expect(bilanRequest.request.body).toEqual({
      electricityKwhYear: 1234.6,
      gasKwhYear: 456.2,
      totalCo2: 9.7,
      calculationDate: '2026-03-16',
    });
    bilanRequest.flush({
      id: 55,
      totalCo2: 9.7,
      calculationDate: '2026-03-16',
    });

    expect(savedRecord).toEqual({
      bilanId: 55,
      siteId: 21,
      siteName: 'HQ Paris',
      totalCo2: 9.7,
      calculationDate: '2026-03-16',
    });
    expect(localStorage.getItem('carbonaze.backend.society')).toBe('9');
    expect(Object.values(JSON.parse(localStorage.getItem('carbonaze.backend.sites') ?? '{}'))).toContain(21);
  });

  it('reuses cached society and site ids when available', () => {
    localStorage.setItem('carbonaze.backend.society', '9');
    localStorage.setItem(
      'carbonaze.backend.sites',
      JSON.stringify({
        [JSON.stringify({
          societyId: 9,
          siteName: 'hq paris',
          city: 'paris',
          employees: 13,
          parkingSpaces: 4,
          computers: 8,
        })]: 21,
      }),
    );

    let savedRecord: SavedCalculationRecord | undefined;

    service.saveCalculation(payload, result).subscribe((value) => {
      savedRecord = value;
    });

    const bilanRequest = httpTestingController.expectOne('/api/sites/21/bilans');
    expect(bilanRequest.request.body.calculationDate).toBe('2026-03-16');
    bilanRequest.flush({
      id: 56,
      totalCo2: 9.7,
      calculationDate: '2026-03-16',
    });

    expect(savedRecord).toEqual({
      bilanId: 56,
      siteId: 21,
      siteName: 'HQ Paris',
      totalCo2: 9.7,
      calculationDate: '2026-03-16',
    });
  });

  it('clears cached references and retries when the backend returns 404', () => {
    localStorage.setItem('carbonaze.backend.society', '9');
    localStorage.setItem(
      'carbonaze.backend.sites',
      JSON.stringify({
        [JSON.stringify({
          societyId: 9,
          siteName: 'hq paris',
          city: 'paris',
          employees: 13,
          parkingSpaces: 4,
          computers: 8,
        })]: 21,
      }),
    );

    let savedRecord: SavedCalculationRecord | undefined;

    service.saveCalculation(payload, result).subscribe((value) => {
      savedRecord = value;
    });

    const failedBilanRequest = httpTestingController.expectOne('/api/sites/21/bilans');
    failedBilanRequest.flush('missing', {
      status: 404,
      statusText: 'Not Found',
    });

    const societyRequest = httpTestingController.expectOne('/api/societies');
    societyRequest.flush({ id: 18, name: 'Carbonaze Front' });

    const siteRequest = httpTestingController.expectOne('/api/sites');
    siteRequest.flush({ id: 32, name: 'HQ Paris' });

    const bilanRequest = httpTestingController.expectOne('/api/sites/32/bilans');
    bilanRequest.flush({
      id: 77,
      totalCo2: 9.7,
      calculationDate: '2026-03-16',
    });

    expect(savedRecord?.siteId).toBe(32);
    expect(localStorage.getItem('carbonaze.backend.society')).toBe('18');
    expect(Object.values(JSON.parse(localStorage.getItem('carbonaze.backend.sites') ?? '{}'))).toContain(32);
  });

  it('propagates non-404 backend errors without wiping the cache', () => {
    localStorage.setItem('carbonaze.backend.society', '9');
    localStorage.setItem(
      'carbonaze.backend.sites',
      JSON.stringify({
        [JSON.stringify({
          societyId: 9,
          siteName: 'hq paris',
          city: 'paris',
          employees: 13,
          parkingSpaces: 4,
          computers: 8,
        })]: 21,
      }),
    );

    let thrownError: unknown;

    service.saveCalculation(payload, result).subscribe({
      error: (error) => {
        thrownError = error;
      },
    });

    const bilanRequest = httpTestingController.expectOne('/api/sites/21/bilans');
    bilanRequest.flush('server error', {
      status: 500,
      statusText: 'Server Error',
    });

    expect(thrownError).toBeInstanceOf(HttpErrorResponse);
    expect(localStorage.getItem('carbonaze.backend.society')).toBe('9');
  });
});
