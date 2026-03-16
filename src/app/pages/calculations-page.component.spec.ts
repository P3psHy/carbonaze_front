import { ViewportScroller } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { BodyScrollLockService } from '../body-scroll-lock.service';
import { CalculationPersistenceService } from '../calculation-persistence.service';
import { CalculatorSettingsService } from '../calculator-settings.service';
import { SiteImpactResult, SiteInputPayload } from '../site-impact.models';
import { SiteImpactService } from '../site-impact.service';
import { CalculationsPageComponent } from './calculations-page.component';

describe('CalculationsPageComponent', () => {
  const configuredMaterials = signal([
    { id: 'acier', name: 'Acier', factor: 1.9 },
    { id: 'bois', name: 'Bois', factor: 0.08 },
  ]);

  const calculatedResult: SiteImpactResult = {
    siteName: 'HQ Paris',
    city: 'Paris',
    totalEmission: 12.4,
    emissionPerEmployee: 1.55,
    dominantCategory: 'Materiaux',
    dominantShare: 48.5,
    materialCount: 1,
    categories: [
      {
        key: 'materials',
        label: 'Materiaux',
        emission: 6,
        percentage: 48.5,
        color: '#14532d',
        helper: 'Impact cumul',
      },
      {
        key: 'energy',
        label: 'Electricite',
        emission: 2,
        percentage: 16.1,
        color: '#0f766e',
        helper: 'Electricite',
      },
      {
        key: 'gas',
        label: 'Gaz',
        emission: 1,
        percentage: 8.1,
        color: '#ca8a04',
        helper: 'Gaz',
      },
      {
        key: 'parking',
        label: 'Mobilite',
        emission: 2.4,
        percentage: 19.4,
        color: '#b45309',
        helper: 'Parking',
      },
      {
        key: 'equipment',
        label: 'IT',
        emission: 1,
        percentage: 8.1,
        color: '#155e75',
        helper: 'IT',
      },
    ],
    materials: [
      {
        name: 'Acier',
        quantity: 2,
        factor: 1.9,
        emission: 3.8,
        share: 30.6,
        color: '#14532d',
      },
    ],
    insights: ['A', 'B', 'C', 'D'],
  };

  const savedCalculation = {
    bilanId: 18,
    siteId: 7,
    siteName: 'HQ Paris',
    totalCo2: 12.4,
    calculationDate: '2026-03-16',
  };

  let siteImpactService: { calculateImpact: ReturnType<typeof vi.fn> };
  let calculationPersistenceService: { saveCalculation: ReturnType<typeof vi.fn> };
  let bodyScrollLockService: { lock: ReturnType<typeof vi.fn>; unlock: ReturnType<typeof vi.fn> };
  let calculatorSettingsService: {
    configuredMaterials: typeof configuredMaterials;
    isSettingsOpen: ReturnType<typeof signal<boolean>>;
    openSettings: ReturnType<typeof vi.fn>;
  };
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };
  let viewportScroller: { scrollToPosition: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    configuredMaterials.set([
      { id: 'acier', name: 'Acier', factor: 1.9 },
      { id: 'bois', name: 'Bois', factor: 0.08 },
    ]);

    siteImpactService = {
      calculateImpact: vi.fn(() => of(calculatedResult)),
    };
    calculationPersistenceService = {
      saveCalculation: vi.fn(() => of(savedCalculation)),
    };
    bodyScrollLockService = {
      lock: vi.fn(),
      unlock: vi.fn(),
    };
    calculatorSettingsService = {
      configuredMaterials,
      isSettingsOpen: signal(false),
      openSettings: vi.fn(),
    };
    router = {
      navigateByUrl: vi.fn(() => Promise.resolve(true)),
    };
    viewportScroller = {
      scrollToPosition: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [CalculationsPageComponent],
      providers: [
        { provide: SiteImpactService, useValue: siteImpactService },
        { provide: CalculationPersistenceService, useValue: calculationPersistenceService },
        { provide: BodyScrollLockService, useValue: bodyScrollLockService },
        { provide: CalculatorSettingsService, useValue: calculatorSettingsService },
        { provide: Router, useValue: router },
        { provide: ViewportScroller, useValue: viewportScroller },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('opens the input modal on first render and locks body scrolling', async () => {
    const fixture = TestBed.createComponent(CalculationsPageComponent);
    const component = fixture.componentInstance as any;

    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isInputModalOpen()).toBe(true);
    expect(bodyScrollLockService.lock).toHaveBeenCalledTimes(1);
  });

  it('runs a calculation from valid form data and closes the modal on success', async () => {
    const fixture = TestBed.createComponent(CalculationsPageComponent);
    const component = fixture.componentInstance as any;

    fixture.detectChanges();
    await fixture.whenStable();

    component.siteForm.controls.siteName.setValue('HQ Paris');
    component.siteForm.controls.city.setValue('Paris');
    component.siteForm.controls.energyMwh.setValue(10);
    component.siteForm.controls.gasMwh.setValue(2);
    component.siteForm.controls.employees.setValue(8);
    component.siteForm.controls.parkingSpaces.setValue(3);
    component.siteForm.controls.computers.setValue(5);
    component.materials.at(0).controls.materialId.setValue('acier');
    component.materials.at(0).controls.quantity.setValue(2);

    component.calculate();

    expect(siteImpactService.calculateImpact).toHaveBeenCalledWith(
      {
        siteName: 'HQ Paris',
        city: 'Paris',
        energyMwh: 10,
        gasMwh: 2,
        employees: 8,
        parkingSpaces: 3,
        computers: 5,
        materials: [{ materialId: 'acier', name: 'Acier', quantity: 2 }],
      },
      configuredMaterials(),
    );
    expect(component.result()).toEqual(calculatedResult);
    expect(component.lastCalculatedPayload()).toEqual({
      siteName: 'HQ Paris',
      city: 'Paris',
      energyMwh: 10,
      gasMwh: 2,
      employees: 8,
      parkingSpaces: 3,
      computers: 5,
      materials: [{ materialId: 'acier', name: 'Acier', quantity: 2 }],
    });
    expect(component.isInputModalOpen()).toBe(false);
    expect(viewportScroller.scrollToPosition).toHaveBeenCalledWith([0, 0]);
  });

  it('navigates back home when closing the modal before the first result', async () => {
    const fixture = TestBed.createComponent(CalculationsPageComponent);
    const component = fixture.componentInstance as any;

    fixture.detectChanges();
    await fixture.whenStable();

    component.closeInputModal();
    await fixture.whenStable();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/');
    expect(viewportScroller.scrollToPosition).toHaveBeenCalledWith([0, 0]);
  });

  it('saves the current calculation and shows a success feedback message', () => {
    const fixture = TestBed.createComponent(CalculationsPageComponent);
    const component = fixture.componentInstance as any;
    const payload: SiteInputPayload = {
      siteName: 'HQ Paris',
      city: 'Paris',
      energyMwh: 10,
      gasMwh: 2,
      employees: 8,
      parkingSpaces: 3,
      computers: 5,
      materials: [{ materialId: 'acier', name: 'Acier', quantity: 2 }],
    };

    component.lastCalculatedPayload.set(payload);
    component.result.set(calculatedResult);

    component.saveCurrentCalculation();

    expect(calculationPersistenceService.saveCalculation).toHaveBeenCalledWith(payload, calculatedResult);
    expect(component.saveFeedback()).toEqual(
      expect.objectContaining({
        kind: 'success',
        message: expect.stringContaining('16/03/2026 pour HQ Paris'),
      }),
    );
  });

  it('shows an error feedback message when saving fails', () => {
    calculationPersistenceService.saveCalculation.mockReturnValueOnce(
      throwError(() => new Error('Backend down')),
    );

    const fixture = TestBed.createComponent(CalculationsPageComponent);
    const component = fixture.componentInstance as any;
    const payload: SiteInputPayload = {
      siteName: 'HQ Paris',
      city: 'Paris',
      energyMwh: 10,
      gasMwh: 2,
      employees: 8,
      parkingSpaces: 3,
      computers: 5,
      materials: [{ materialId: 'acier', name: 'Acier', quantity: 2 }],
    };

    component.lastCalculatedPayload.set(payload);
    component.result.set(calculatedResult);

    component.saveCurrentCalculation();

    expect(component.saveFeedback()).toEqual(
      expect.objectContaining({
        kind: 'error',
        message: expect.stringContaining('http://localhost:8080'),
      }),
    );
  });

  it('opens calculator settings with the new-material focus flag and enforces numeric minimums', () => {
    const fixture = TestBed.createComponent(CalculationsPageComponent);
    const component = fixture.componentInstance as any;

    component.openCalculatorSettingsForNewMaterial();
    component.stepControl(component.siteForm.controls.employees, -5, 1);

    expect(calculatorSettingsService.openSettings).toHaveBeenCalledWith({ focusNewMaterial: true });
    expect(component.siteForm.controls.employees.value).toBe(1);
  });
});
