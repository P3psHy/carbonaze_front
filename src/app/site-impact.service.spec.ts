import { TestBed } from '@angular/core/testing';

import { SiteImpactResult, SiteInputPayload } from './site-impact.models';
import { DEFAULT_CONFIGURED_MATERIALS, SiteImpactService } from './site-impact.service';

describe('SiteImpactService', () => {
  let service: SiteImpactService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SiteImpactService],
    });

    service = TestBed.inject(SiteImpactService);
  });

  it('calculates site impact totals, categories and material shares', () => {
    const payload: SiteInputPayload = {
      siteName: 'HQ Paris',
      city: 'Paris',
      energyMwh: 10,
      gasMwh: 2,
      employees: 5,
      parkingSpaces: 3,
      computers: 4,
      materials: [
        { materialId: 'acier', name: 'Acier', quantity: 2 },
        { materialId: 'missing', name: 'Bois', quantity: 10 },
        { materialId: 'beton', name: 'Beton', quantity: 0 },
      ],
    };

    let result: SiteImpactResult | undefined;

    service.calculateImpact(payload).subscribe((value) => {
      result = value;
    });

    expect(result).toMatchObject({
      siteName: 'HQ Paris',
      city: 'Paris',
      totalEmission: 9.7,
      emissionPerEmployee: 1.94,
      materialCount: 2,
    });
    expect(result?.dominantCategory).toContain('Mat');
    expect(result?.materials).toEqual([
      expect.objectContaining({ name: 'Acier', emission: 3.8, share: 39.2 }),
      expect.objectContaining({ name: 'Bois', emission: 0.8, share: 8.2 }),
    ]);
    expect(result?.categories).toHaveLength(5);
    expect(result?.insights).toHaveLength(4);
  });

  it('handles a site without tracked materials', () => {
    const payload: SiteInputPayload = {
      siteName: 'Empty Site',
      city: 'Lyon',
      energyMwh: 0,
      gasMwh: 0,
      employees: 0,
      parkingSpaces: 0,
      computers: 0,
      materials: [],
    };

    let result: SiteImpactResult | undefined;

    service.calculateImpact(payload, []).subscribe((value) => {
      result = value;
    });

    expect(result?.totalEmission).toBe(0);
    expect(result?.emissionPerEmployee).toBe(0);
    expect(result?.materials).toEqual([]);
    expect(result?.insights[2]).toContain('Ajoutez');
  });

  it('normalizes configured materials and falls back to defaults when needed', () => {
    const normalized = service.normalizeConfiguredMaterials([
      {
        id: '  ',
        backendId: 4,
        name: '  Pierre  ',
        factor: 0.444,
      },
      {
        id: 'invalid-name',
        name: '',
        factor: 1.2,
      },
      {
        id: 'invalid-factor',
        name: 'Acier',
        factor: 0,
      },
    ]);

    expect(normalized).toEqual([
      {
        id: 'material-1',
        backendId: 4,
        name: 'Pierre',
        factor: 0.44,
      },
    ]);

    expect(
      service.normalizeConfiguredMaterials(
        [
          {
            id: 'invalid',
            name: '',
            factor: 0,
          },
        ],
        { fallbackToDefaults: false },
      ),
    ).toEqual([]);

    expect(service.normalizeConfiguredMaterials(undefined)).toHaveLength(
      DEFAULT_CONFIGURED_MATERIALS.length,
    );
  });

  it('returns cloned defaults so callers cannot mutate the source catalog', () => {
    const defaults = service.getDefaultConfiguredMaterials();
    defaults[0].name = 'Mutated';

    expect(service.getDefaultConfiguredMaterials()[0].name).not.toBe('Mutated');
  });
});
