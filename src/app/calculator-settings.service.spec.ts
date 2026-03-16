import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { CalculatorSettingsService } from './calculator-settings.service';
import { MaterialCatalogApiService } from './material-catalog-api.service';
import { ConfiguredMaterial } from './site-impact.models';
import { SiteImpactService } from './site-impact.service';

describe('CalculatorSettingsService', () => {
  const storageKey = 'carbonaze.material-catalog.v2';
  const legacyStorageKey = 'carbonaze.material-factors.v1';

  function setup(options?: {
    seedStorage?: () => void;
    getMaterials?: () => Observable<ConfiguredMaterial[]>;
    createMaterial?: (material: ConfiguredMaterial) => Observable<ConfiguredMaterial>;
  }) {
    localStorage.clear();
    options?.seedStorage?.();

    const api = {
      getMaterials: vi.fn(options?.getMaterials ?? (() => of([] as ConfiguredMaterial[]))),
      createMaterial: vi.fn(
        options?.createMaterial ??
          ((material: ConfiguredMaterial) =>
            of({
              ...material,
              backendId: 99,
            })),
      ),
    };

    TestBed.configureTestingModule({
      providers: [
        CalculatorSettingsService,
        SiteImpactService,
        { provide: MaterialCatalogApiService, useValue: api },
      ],
    });

    return {
      service: TestBed.inject(CalculatorSettingsService),
      api,
    };
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('loads defaults and manages the modal open state', () => {
    const { service } = setup();

    expect(service.configuredMaterials().length).toBeGreaterThan(0);
    expect(service.isSettingsOpen()).toBe(false);

    service.openSettings({ focusNewMaterial: true });
    expect(service.isSettingsOpen()).toBe(true);
    expect(service.shouldFocusNewMaterial()).toBe(true);

    service.consumeFocusNewMaterialRequest();
    expect(service.shouldFocusNewMaterial()).toBe(false);

    service.closeSettings();
    expect(service.isSettingsOpen()).toBe(false);
  });

  it('loads a normalized stored catalog when available', () => {
    const { service } = setup({
      seedStorage: () => {
        localStorage.setItem(
          storageKey,
          JSON.stringify([
            {
              id: '  pierre-id  ',
              backendId: 7,
              name: '  Pierre  ',
              factor: 0.444,
            },
          ]),
        );
      },
    });

    expect(service.configuredMaterials()).toEqual([
      {
        id: 'pierre-id',
        backendId: 7,
        name: 'Pierre',
        factor: 0.44,
      },
    ]);
  });

  it('migrates legacy factors into the new catalog storage', () => {
    const { service } = setup({
      seedStorage: () => {
        localStorage.setItem(
          legacyStorageKey,
          JSON.stringify({
            acier: 2.345,
            bois: 0,
          }),
        );
      },
    });

    expect(service.configuredMaterials().find((material) => material.id === 'acier')?.factor).toBe(2.35);
    expect(localStorage.getItem(storageKey)).toContain('acier');
  });

  it('refreshes materials from the API and persists the normalized result', () => {
    const { service, api } = setup({
      getMaterials: () =>
        of([
          {
            id: ' server-id ',
            backendId: 11,
            name: '  Serveur  ',
            factor: 3.333,
          },
        ]),
    });

    let refreshedMaterials: ConfiguredMaterial[] | undefined;

    service.refreshConfiguredMaterials().subscribe((materials) => {
      refreshedMaterials = materials;
    });

    expect(api.getMaterials).toHaveBeenCalledTimes(1);
    expect(service.isSyncingMaterials()).toBe(false);
    expect(service.materialsSyncError()).toBeNull();
    expect(refreshedMaterials).toEqual([
      {
        id: 'server-id',
        backendId: 11,
        name: 'Serveur',
        factor: 3.33,
      },
    ]);
    expect(localStorage.getItem(storageKey)).toContain('Serveur');
  });

  it('returns the current catalog and exposes a clear message when refresh fails', () => {
    const { service } = setup({
      getMaterials: () =>
        throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' })) as never,
    });

    const existingMaterials = service.configuredMaterials();
    let refreshedMaterials: ConfiguredMaterial[] | undefined;

    service.refreshConfiguredMaterials().subscribe((materials) => {
      refreshedMaterials = materials;
    });

    expect(refreshedMaterials).toEqual(existingMaterials);
    expect(service.materialsSyncError()).toContain('/api/materials');
    expect(service.isSyncingMaterials()).toBe(false);
  });

  it('creates a configured material, normalizes it and persists it', () => {
    const { service, api } = setup({
      createMaterial: (material) =>
        of({
          ...material,
          backendId: 12,
          name: '  Pierre  ',
          factor: 0.444,
        }),
    });

    let createdMaterial: ConfiguredMaterial | undefined;

    service
      .createConfiguredMaterial({
        id: 'temp-material',
        name: '  Pierre  ',
        factor: 0.444,
      })
      .subscribe((material) => {
        createdMaterial = material;
      });

    expect(api.createMaterial).toHaveBeenCalledWith({
      id: 'temp-material',
      backendId: undefined,
      name: 'Pierre',
      factor: 0.44,
    });
    expect(createdMaterial).toEqual({
      id: 'temp-material',
      backendId: 12,
      name: 'Pierre',
      factor: 0.44,
    });
    expect(service.configuredMaterials()).toContainEqual(createdMaterial);
  });

  it('rejects an invalid new material before calling the API', () => {
    const { service, api } = setup();

    let thrownError: unknown;

    service
      .createConfiguredMaterial({
        id: 'invalid',
        name: 'Invalid',
        factor: 0,
      })
      .subscribe({
        error: (error) => {
          thrownError = error;
        },
      });

    expect(api.createMaterial).not.toHaveBeenCalled();
    expect(thrownError).toBeInstanceOf(Error);
    expect((thrownError as Error).message).toContain('invalide');
  });

  it('surfaces backend validation errors when the created material cannot be normalized', () => {
    const { service } = setup({
      createMaterial: () =>
        of({
          id: 'bad',
          name: '',
          factor: 0,
        } as ConfiguredMaterial),
    });

    let thrownError: unknown;

    service
      .createConfiguredMaterial({
        id: 'temp-material',
        name: 'Pierre',
        factor: 0.44,
      })
      .subscribe({
        error: (error) => {
          thrownError = error;
        },
      });

    expect(thrownError).toBeInstanceOf(Error);
    expect(service.materialsSyncError()).toContain('backend');
    expect(service.isSyncingMaterials()).toBe(false);
  });

  it('saves a normalized catalog and closes the modal', () => {
    const { service } = setup();

    service.openSettings();
    service.saveConfiguredMaterials([
      {
        id: '  pierre-id  ',
        name: '  Pierre  ',
        factor: 0.444,
      },
      {
        id: 'invalid',
        name: '',
        factor: 0,
      },
    ]);

    expect(service.isSettingsOpen()).toBe(false);
    expect(service.configuredMaterials()).toEqual([
      {
        id: 'pierre-id',
        backendId: undefined,
        name: 'Pierre',
        factor: 0.44,
      },
    ]);
    expect(localStorage.getItem(storageKey)).toContain('Pierre');
  });
});
