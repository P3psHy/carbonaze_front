import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../environment/environment';
import { MaterialCatalogApiService } from './material-catalog-api.service';
import { ConfiguredMaterial } from './site-impact.models';

describe('MaterialCatalogApiService', () => {
  let service: MaterialCatalogApiService;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MaterialCatalogApiService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(MaterialCatalogApiService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('maps backend materials into configured materials', () => {
    let materials: ConfiguredMaterial[] | undefined;

    service.getMaterials().subscribe((value) => {
      materials = value;
    });

    const request = httpTestingController.expectOne(`${environment.apiUrl}/materials`);
    expect(request.request.method).toBe('GET');
    request.flush([
      { id: 4, name: '  Pierre  ', energeticValue: 0.444, quantity: 12 },
      { id: Number.NaN, name: ' Bois ', energeticValue: 0.081, quantity: 4 },
    ]);

    expect(materials).toEqual([
      { id: 'material-4', backendId: 4, name: 'Pierre', factor: 0.44 },
      { id: 'material-2', backendId: undefined, name: 'Bois', factor: 0.08 },
    ]);
  });

  it('posts a new material and returns the created configured material', () => {
    let createdMaterial: ConfiguredMaterial | undefined;

    service
      .createMaterial({
        id: 'pierre',
        backendId: 7,
        name: '  Pierre  ',
        factor: 0.444,
      })
      .subscribe((value) => {
        createdMaterial = value;
      });

    const request = httpTestingController.expectOne(`${environment.apiUrl}/materials`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual([
      {
        id: 7,
        name: 'Pierre',
        energeticValue: 0.44,
        quantity: 0,
      },
    ]);

    request.flush([{ id: 12, name: ' Pierre ', energeticValue: 0.444, quantity: 0 }]);

    expect(createdMaterial).toEqual({
      id: 'material-12',
      backendId: 12,
      name: 'Pierre',
      factor: 0.44,
    });
  });

  it('fails when the backend returns an empty creation payload', () => {
    let thrownError: unknown;

    service
      .createMaterial({
        id: 'pierre',
        name: 'Pierre',
        factor: 0.44,
      })
      .subscribe({
        error: (error) => {
          thrownError = error;
        },
      });

    const request = httpTestingController.expectOne(`${environment.apiUrl}/materials`);
    request.flush([]);

    expect(thrownError).toBeInstanceOf(Error);
    expect((thrownError as Error).message).toContain('Aucun materiau');
  });
});
