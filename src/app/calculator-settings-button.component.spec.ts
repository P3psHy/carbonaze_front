import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { BodyScrollLockService } from './body-scroll-lock.service';
import { CalculatorSettingsButtonComponent } from './calculator-settings-button.component';
import { CalculatorSettingsService } from './calculator-settings.service';
import { ConfiguredMaterial } from './site-impact.models';

describe('CalculatorSettingsButtonComponent', () => {
  function createSettingsServiceStub() {
    const configuredMaterials = signal<ConfiguredMaterial[]>([
      { id: 'beton', name: 'Beton', factor: 0.18 },
      { id: 'acier', name: 'Acier', factor: 1.9 },
    ]);

    const stub: any = {
      isSettingsOpen: signal(false),
      configuredMaterials,
      shouldFocusNewMaterial: signal(false),
      isSyncingMaterials: signal(false),
      materialsSyncError: signal<string | null>(null),
      openSettings: vi.fn(),
      closeSettings: vi.fn(),
      consumeFocusNewMaterialRequest: vi.fn(),
      refreshConfiguredMaterials: vi.fn(),
      createConfiguredMaterial: vi.fn(),
      saveConfiguredMaterials: vi.fn(),
      getDefaultConfiguredMaterials: vi.fn(),
    };

    stub.openSettings.mockImplementation((options?: { focusNewMaterial?: boolean }) => {
      stub.shouldFocusNewMaterial.set(!!options?.focusNewMaterial);
      stub.isSettingsOpen.set(true);
    });
    stub.closeSettings.mockImplementation(() => {
      stub.isSettingsOpen.set(false);
      stub.shouldFocusNewMaterial.set(false);
    });
    stub.consumeFocusNewMaterialRequest.mockImplementation(() => {
      stub.shouldFocusNewMaterial.set(false);
    });
    stub.refreshConfiguredMaterials.mockImplementation(() => of(configuredMaterials()));
    stub.createConfiguredMaterial.mockImplementation((material: ConfiguredMaterial) =>
      of({
        ...material,
        backendId: 42,
      }),
    );
    stub.saveConfiguredMaterials.mockImplementation((materials: ConfiguredMaterial[]) => {
      configuredMaterials.set(materials);
      stub.closeSettings();
    });
    stub.getDefaultConfiguredMaterials.mockImplementation(() => [
      { id: 'bois', name: 'Bois', factor: 0.08 },
    ]);

    return stub;
  }

  let settingsServiceStub: ReturnType<typeof createSettingsServiceStub>;
  let bodyScrollLockService: { lock: ReturnType<typeof vi.fn>; unlock: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    settingsServiceStub = createSettingsServiceStub();
    bodyScrollLockService = {
      lock: vi.fn(),
      unlock: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [CalculatorSettingsButtonComponent],
      providers: [
        provideRouter([]),
        { provide: CalculatorSettingsService, useValue: settingsServiceStub },
        { provide: BodyScrollLockService, useValue: bodyScrollLockService },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('opens the settings dialog, refreshes the catalog and locks body scrolling', async () => {
    const fixture = TestBed.createComponent(CalculatorSettingsButtonComponent);

    settingsServiceStub.openSettings();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(settingsServiceStub.refreshConfiguredMaterials).toHaveBeenCalledTimes(1);
    expect(bodyScrollLockService.lock).toHaveBeenCalledTimes(1);

    settingsServiceStub.closeSettings();
    fixture.detectChanges();

    expect(bodyScrollLockService.unlock).toHaveBeenCalledTimes(1);
  });

  it('filters the visible materials from the search input', async () => {
    const fixture = TestBed.createComponent(CalculatorSettingsButtonComponent);

    settingsServiceStub.openSettings();
    fixture.detectChanges();
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    const searchInput = root.querySelector('[data-testid="material-search-input"]') as HTMLInputElement;

    searchInput.value = 'aci';
    searchInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const materialNameInputs = Array.from(
      root.querySelectorAll('.catalog-row input[formcontrolname="name"]'),
    ) as HTMLInputElement[];

    expect(materialNameInputs.map((input) => input.value.trim())).toEqual(['Acier']);
  });

  it('rejects duplicate material names before calling the creation API', () => {
    const fixture = TestBed.createComponent(CalculatorSettingsButtonComponent);
    const component = fixture.componentInstance as any;

    settingsServiceStub.openSettings();
    fixture.detectChanges();

    component.openCreateMaterialForm();
    component.newMaterialForm.setValue({
      name: 'Acier',
      factor: 2,
    });
    component.addConfiguredMaterial();

    expect(settingsServiceStub.createConfiguredMaterial).not.toHaveBeenCalled();
    expect(component.newMaterialForm.controls.name.errors).toEqual({ duplicate: true });
  });

  it('adds a created material to the local form state', () => {
    const fixture = TestBed.createComponent(CalculatorSettingsButtonComponent);
    const component = fixture.componentInstance as any;

    settingsServiceStub.openSettings();
    fixture.detectChanges();

    component.openCreateMaterialForm();
    component.newMaterialForm.setValue({
      name: 'Granit',
      factor: 0.6,
    });
    component.addConfiguredMaterial();

    expect(settingsServiceStub.createConfiguredMaterial).toHaveBeenCalledTimes(1);
    expect(component.configuredMaterialsFormArray.length).toBe(3);
    expect(component.isCreateMaterialFormOpen()).toBe(false);
    expect(component.recentlyAddedMaterialId()).toContain('granit-');
  });

  it('saves the trimmed catalog values through the settings service', () => {
    const fixture = TestBed.createComponent(CalculatorSettingsButtonComponent);
    const component = fixture.componentInstance as any;

    settingsServiceStub.openSettings();
    fixture.detectChanges();

    component.configuredMaterialsFormArray.at(0).controls.name.setValue('  Pierre  ');
    component.configuredMaterialsFormArray.at(0).controls.factor.setValue(0.44);
    component.saveCalculatorSettings();

    expect(settingsServiceStub.saveConfiguredMaterials).toHaveBeenCalledWith([
      {
        id: 'beton',
        backendId: undefined,
        name: 'Pierre',
        factor: 0.44,
      },
      {
        id: 'acier',
        backendId: undefined,
        name: 'Acier',
        factor: 1.9,
      },
    ]);
  });

  it('resets the catalog to default values', () => {
    const fixture = TestBed.createComponent(CalculatorSettingsButtonComponent);
    const component = fixture.componentInstance as any;

    settingsServiceStub.openSettings();
    fixture.detectChanges();

    component.resetCalculatorSettingsForm();

    expect(component.configuredMaterialsFormArray.length).toBe(1);
    expect(component.configuredMaterialsFormArray.at(0).controls.name.value).toBe('Bois');
  });
});
