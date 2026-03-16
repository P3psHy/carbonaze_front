import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  ViewChild,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { filter } from 'rxjs';

import { BodyScrollLockService } from './body-scroll-lock.service';
import { CalculatorSettingsService } from './calculator-settings.service';
import { ConfiguredMaterial } from './site-impact.models';

type MaterialSettingsFormGroup = FormGroup<{
  id: FormControl<string>;
  backendId: FormControl<number | null>;
  name: FormControl<string>;
  factor: FormControl<number | null>;
}>;

type FilteredMaterialEntry = {
  index: number;
  material: MaterialSettingsFormGroup;
};

@Component({
  selector: 'app-calculator-settings-button',
  imports: [ReactiveFormsModule],
  templateUrl: './calculator-settings-button.component.html',
  styleUrl: './calculator-settings-button.component.css',
})
export class CalculatorSettingsButtonComponent {
  @ViewChild('newMaterialNameInput')
  private newMaterialNameInput?: ElementRef<HTMLInputElement>;

  @ViewChild('catalogList')
  private catalogList?: ElementRef<HTMLElement>;

  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly bodyScrollLockService = inject(BodyScrollLockService);
  protected readonly calculatorSettingsService = inject(CalculatorSettingsService);
  protected readonly isCalculationsRoute = signal(false);
  protected readonly isCreateMaterialFormOpen = signal(false);
  protected readonly isCreatingMaterial = signal(false);
  protected readonly recentlyAddedMaterialId = signal<string | null>(null);
  protected readonly settingsSubmitAttempted = signal(false);
  protected readonly materialSearchControl = this.fb.nonNullable.control('');
  protected readonly isSyncingMaterials = this.calculatorSettingsService.isSyncingMaterials;
  protected readonly materialsSyncError = this.calculatorSettingsService.materialsSyncError;
  protected readonly calculatorSettingsForm = this.fb.group({
    materials: this.fb.array<MaterialSettingsFormGroup>([], {
      validators: [Validators.minLength(1), this.uniqueMaterialNamesValidator.bind(this)],
    }),
  });
  protected readonly newMaterialForm = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required]),
    factor: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
  });

  protected get filteredConfiguredMaterials(): FilteredMaterialEntry[] {
    const searchTerm = this.materialSearchControl.value.trim().toLowerCase();

    return this.configuredMaterialsFormArray.controls.reduce<FilteredMaterialEntry[]>(
      (entries, material, index) => {
        if (searchTerm && !material.controls.name.value.trim().toLowerCase().includes(searchTerm)) {
          return entries;
        }

        entries.push({ index, material });
        return entries;
      },
      [],
    );
  }

  constructor() {
    this.isCalculationsRoute.set(this.router.url.startsWith('/calculs'));

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.isCalculationsRoute.set(this.router.url.startsWith('/calculs'));
      });

    let wasOpen = false;

    effect(() => {
      const isOpen = this.calculatorSettingsService.isSettingsOpen();

      if (!isOpen) {
        this.settingsSubmitAttempted.set(false);
      }

      if (isOpen && !wasOpen) {
        this.hydrateMaterials(
          untracked(() => this.calculatorSettingsService.configuredMaterials()),
        );
        this.materialSearchControl.setValue('', { emitEvent: false });
        this.resetNewMaterialForm();
        this.isCreateMaterialFormOpen.set(false);
        this.recentlyAddedMaterialId.set(null);
        this.refreshMaterialsFromApi();
      }

      if (isOpen === wasOpen) {
        return;
      }

      wasOpen = isOpen;

      if (isOpen) {
        this.bodyScrollLockService.lock();
        return;
      }

      this.bodyScrollLockService.unlock();
    });

    effect(() => {
      const isOpen = this.calculatorSettingsService.isSettingsOpen();
      const shouldFocusNewMaterial = this.calculatorSettingsService.shouldFocusNewMaterial();

      if (!isOpen || !shouldFocusNewMaterial) {
        return;
      }

      this.openCreateMaterialForm();
      untracked(() => this.calculatorSettingsService.consumeFocusNewMaterialRequest());
    });

    effect(() => {
      if (!this.isCreateMaterialFormOpen()) {
        return;
      }

      this.focusNewMaterialInput();
    });

    this.destroyRef.onDestroy(() => {
      if (wasOpen) {
        this.bodyScrollLockService.unlock();
      }
    });
  }

  get configuredMaterialsFormArray(): FormArray<MaterialSettingsFormGroup> {
    return this.calculatorSettingsForm.controls.materials;
  }

  @HostListener('document:keydown.escape')
  protected handleEscape(): void {
    if (this.isCreateMaterialFormOpen()) {
      this.closeCreateMaterialForm();
      return;
    }

    if (this.calculatorSettingsService.isSettingsOpen()) {
      this.calculatorSettingsService.closeSettings();
    }
  }

  protected openCalculatorSettings(): void {
    this.calculatorSettingsService.openSettings();
  }

  protected closeCalculatorSettings(): void {
    this.calculatorSettingsService.closeSettings();
  }

  protected addConfiguredMaterial(): void {
    if (this.newMaterialForm.invalid) {
      this.newMaterialForm.markAllAsTouched();
      return;
    }

    const rawValue = this.newMaterialForm.getRawValue();
    const name = rawValue.name.trim();
    const factor = rawValue.factor;

    if (!name || factor === null) {
      this.newMaterialForm.markAllAsTouched();
      return;
    }

    const hasDuplicateName = this.configuredMaterialsFormArray.controls.some(
      (materialControl) => materialControl.controls.name.value.trim().toLowerCase() === name.toLowerCase(),
    );

    if (hasDuplicateName) {
      this.newMaterialForm.controls.name.setErrors({ duplicate: true });
      this.newMaterialForm.controls.name.markAsTouched();
      return;
    }

    this.isCreatingMaterial.set(true);

    this.calculatorSettingsService
      .createConfiguredMaterial({
        id: this.createMaterialId(name),
        backendId: undefined,
        name,
        factor,
      })
      .pipe(
        finalize(() => this.isCreatingMaterial.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (configuredMaterial) => {
          this.configuredMaterialsFormArray.push(
            this.createConfiguredMaterialFormGroup(configuredMaterial),
          );
          this.materialSearchControl.setValue('', { emitEvent: false });
          this.recentlyAddedMaterialId.set(configuredMaterial.id);
          this.resetNewMaterialForm();
          this.isCreateMaterialFormOpen.set(false);
          this.scrollToMaterial(configuredMaterial.id);
        },
      });
  }

  protected removeConfiguredMaterial(index: number): void {
    if (this.configuredMaterialsFormArray.length === 1) {
      return;
    }

    this.configuredMaterialsFormArray.removeAt(index);
  }

  protected saveCalculatorSettings(): void {
    if (this.isCreatingMaterial() || this.isSyncingMaterials()) {
      return;
    }

    this.settingsSubmitAttempted.set(true);
    this.materialSearchControl.markAsUntouched();

    if (this.hasPendingNewMaterialDraft()) {
      if (this.newMaterialForm.invalid) {
        this.newMaterialForm.markAllAsTouched();
        return;
      }

      this.addConfiguredMaterial();
      return;
    }

    if (this.calculatorSettingsForm.invalid) {
      this.calculatorSettingsForm.markAllAsTouched();
      return;
    }

    this.calculatorSettingsService.saveConfiguredMaterials(
      this.configuredMaterialsFormArray.getRawValue().map((material) => ({
        id: material.id,
        backendId: material.backendId ?? undefined,
        name: material.name.trim(),
        factor: material.factor ?? 0,
      })),
    );
  }

  protected resetCalculatorSettingsForm(): void {
    this.hydrateMaterials(this.calculatorSettingsService.getDefaultConfiguredMaterials());
    this.materialSearchControl.setValue('', { emitEvent: false });
    this.resetNewMaterialForm();
    this.isCreateMaterialFormOpen.set(false);
    this.recentlyAddedMaterialId.set(null);
    this.settingsSubmitAttempted.set(false);
  }

  protected hasSettingsError(control: AbstractControl<unknown, unknown>): boolean {
    return control.invalid && (control.touched || this.settingsSubmitAttempted());
  }

  protected hasVisibleConfiguredMaterials(): boolean {
    return this.filteredConfiguredMaterials.length > 0;
  }

  protected trackConfiguredMaterial(_: number, material: MaterialSettingsFormGroup): string {
    return material.controls.id.value;
  }

  protected isRecentlyAddedMaterial(materialId: string): boolean {
    return this.recentlyAddedMaterialId() === materialId;
  }

  protected openCreateMaterialForm(): void {
    this.resetNewMaterialForm();
    this.isCreateMaterialFormOpen.set(true);
  }

  protected closeCreateMaterialForm(): void {
    this.resetNewMaterialForm();
    this.isCreateMaterialFormOpen.set(false);
  }

  private hydrateMaterials(materials: ConfiguredMaterial[]): void {
    this.configuredMaterialsFormArray.clear();

    for (const material of materials) {
      this.configuredMaterialsFormArray.push(this.createConfiguredMaterialFormGroup(material));
    }

    this.calculatorSettingsForm.markAsUntouched();
  }

  private createConfiguredMaterialFormGroup(
    material?: ConfiguredMaterial,
  ): MaterialSettingsFormGroup {
    return new FormGroup({
      id: this.fb.nonNullable.control(material?.id ?? this.createMaterialId()),
      backendId: this.fb.control<number | null>(material?.backendId ?? null),
      name: this.fb.nonNullable.control(material?.name ?? '', [Validators.required]),
      factor: this.fb.control<number | null>(material?.factor ?? null, [
        Validators.required,
        Validators.min(0.01),
      ]),
    });
  }

  private uniqueMaterialNamesValidator(control: AbstractControl): ValidationErrors | null {
    if (!(control instanceof FormArray)) {
      return null;
    }

    const materialControls = control.controls as MaterialSettingsFormGroup[];
    const normalizedNames = materialControls
      .map((materialControl) => materialControl.controls.name.value.trim().toLowerCase())
      .filter((name) => name.length > 0);

    return new Set(normalizedNames).size === normalizedNames.length
      ? null
      : { duplicateNames: true };
  }

  private createMaterialId(seed = ''): string {
    const normalizedSeed = seed
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const suffix = Math.random().toString(36).slice(2, 8);

    return normalizedSeed ? `${normalizedSeed}-${suffix}` : `material-${suffix}`;
  }

  private hasPendingNewMaterialDraft(): boolean {
    return (
      !!this.newMaterialForm.controls.name.value.trim() ||
      this.newMaterialForm.controls.factor.value !== null
    );
  }

  private resetNewMaterialForm(): void {
    this.newMaterialForm.reset({
      name: '',
      factor: null,
    });
    this.newMaterialForm.markAsUntouched();
  }

  private refreshMaterialsFromApi(): void {
    this.calculatorSettingsService
      .refreshConfiguredMaterials()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((materials) => {
        if (this.calculatorSettingsForm.dirty || this.isCreateMaterialFormOpen()) {
          return;
        }

        this.hydrateMaterials(materials);
      });
  }

  private focusNewMaterialInput(): void {
    setTimeout(() => {
      this.newMaterialNameInput?.nativeElement.focus();
    });
  }

  private scrollToMaterial(materialId: string): void {
    setTimeout(() => {
      const materialRow = this.catalogList?.nativeElement.querySelector<HTMLElement>(
        `[data-material-id="${materialId}"]`,
      );

      if (!materialRow) {
        return;
      }

      if (typeof materialRow.scrollIntoView === 'function') {
        materialRow.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        });
      }
    });
  }
}
