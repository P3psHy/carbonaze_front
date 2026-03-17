import { DecimalPipe, ViewportScroller } from '@angular/common';
import {
  Component,
  DestroyRef,
  HostListener,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { finalize } from 'rxjs';

import { environment } from '../../environment/environment';
import {
  CalculationPersistenceService,
  SavedCalculationRecord,
} from '../calculation-persistence.service';
import {
  ConfiguredMaterial,
  SiteInputPayload,
  SiteImpactResult,
} from '../site-impact.models';
import { SiteImpactService } from '../site-impact.service';
import { BodyScrollLockService } from '../body-scroll-lock.service';
import { CalculatorSettingsService } from '../calculator-settings.service';

type MaterialFormGroup = FormGroup<{
  materialId: FormControl<string>;
  quantity: FormControl<number | null>;
}>;

type SaveFeedback = {
  kind: 'success' | 'error';
  message: string;
};

type HistoryFeedback = {
  kind: 'error' | 'success';
  message: string;
};

@Component({
  selector: 'app-calculations-page',
  imports: [ReactiveFormsModule, DecimalPipe],
  templateUrl: './calculations-page.component.html',
})
export class CalculationsPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly viewportScroller = inject(ViewportScroller);
  private readonly siteImpactService = inject(SiteImpactService);
  private readonly calculationPersistenceService = inject(CalculationPersistenceService);
  private readonly bodyScrollLockService = inject(BodyScrollLockService);
  private readonly calculatorSettingsService = inject(CalculatorSettingsService);

  protected readonly siteForm = this.fb.nonNullable.group({
    siteName: ['', [Validators.required]],
    city: ['', [Validators.required]],
    energyMwh: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    gasMwh: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    employees: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    parkingSpaces: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    computers: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    materials: this.fb.array<MaterialFormGroup>([
      this.createMaterial(),
    ]),
  });

  protected readonly result = signal<SiteImpactResult | null>(null);
  protected readonly lastCalculatedPayload = signal<SiteInputPayload | null>(null);
  protected readonly submitAttempted = signal(false);
  protected readonly isInputModalOpen = signal(false);
  protected readonly isHistoryModalOpen = signal(false);
  protected readonly isSavingCalculation = signal(false);
  protected readonly isHistoryLoading = signal(false);
  protected readonly saveFeedback = signal<SaveFeedback | null>(null);
  protected readonly historyFeedback = signal<HistoryFeedback | null>(null);
  protected readonly savedCalculations = signal<SavedCalculationRecord[]>([]);
  protected readonly deletingBilanIds = signal<number[]>([]);
  protected readonly configuredMaterials = this.calculatorSettingsService.configuredMaterials;

  protected readonly categoryChart = computed(() => {
    const result = this.result();

    if (!result) {
      return [];
    }

    const highest = Math.max(...result.categories.map((category) => category.emission), 1);

    return result.categories.map((category) => ({
      ...category,
      height: Math.max(Math.round((category.emission / highest) * 100), 8),
    }));
  });

  protected readonly donutGradient = computed(() => {
    const result = this.result();

    if (!result) {
      return '';
    }

    let cursor = 0;
    const stops = result.categories.map((category) => {
      const start = cursor;
      cursor += category.percentage;
      return `${category.color} ${start}% ${cursor}%`;
    });

    return `conic-gradient(${stops.join(', ')})`;
  });

  protected readonly topMaterials = computed(() =>
    [...(this.result()?.materials ?? [])].sort((left, right) => right.emission - left.emission),
  );

  protected readonly materialFactorCards = computed(() => this.configuredMaterials());

  constructor() {
    let modalLockActive = false;
    let previousConfiguredMaterials = this.configuredMaterials();

    effect(() => {
      const shouldLockBody = this.isInputModalOpen() || this.isHistoryModalOpen();

      if (shouldLockBody === modalLockActive) {
        return;
      }

      modalLockActive = shouldLockBody;

      if (shouldLockBody) {
        this.bodyScrollLockService.lock();
        return;
      }

      this.bodyScrollLockService.unlock();
    });

    effect(() => {
      const currentConfiguredMaterials = this.configuredMaterials();

      if (currentConfiguredMaterials === previousConfiguredMaterials) {
        return;
      }

      previousConfiguredMaterials = currentConfiguredMaterials;
      this.syncMaterialSelections();

      if (this.result() && this.siteForm.valid) {
        this.runCalculation(false);
      }
    });

    afterNextRender(() => {
      if (!this.result()) {
        this.openInputModal();
      }
    });

    this.destroyRef.onDestroy(() => {
      if (modalLockActive) {
        this.bodyScrollLockService.unlock();
      }
    });
  }

  @HostListener('document:keydown.escape')
  protected handleEscape(): void {
    if (this.calculatorSettingsService.isSettingsOpen()) {
      return;
    }

    if (this.isHistoryModalOpen()) {
      this.closeHistoryModal();
      return;
    }

    if (this.isInputModalOpen()) {
      this.closeInputModal();
    }
  }

  get materials(): FormArray<MaterialFormGroup> {
    return this.siteForm.controls.materials;
  }

  protected openInputModal(): void {
    this.submitAttempted.set(false);
    this.siteForm.markAsUntouched();
    this.isInputModalOpen.set(true);
  }

  protected openHistoryModal(): void {
    this.isHistoryModalOpen.set(true);
    this.loadSavedCalculations();
  }

  protected closeHistoryModal(): void {
    this.isHistoryModalOpen.set(false);
    this.historyFeedback.set(null);
  }

  protected closeInputModal(): void {
    if (!this.result()) {
      void this.router.navigateByUrl('/').then((navigated) => {
        if (navigated) {
          this.viewportScroller.scrollToPosition([0, 0]);
        }
      });
      return;
    }

    this.isInputModalOpen.set(false);
  }

  protected openCalculatorSettings(): void {
    this.calculatorSettingsService.openSettings();
  }

  protected openCalculatorSettingsForNewMaterial(): void {
    this.calculatorSettingsService.openSettings({ focusNewMaterial: true });
  }

  protected addMaterial(materialId = '', quantity: number | null = null): void {
    this.materials.push(this.createMaterial(materialId, quantity));
  }

  protected removeMaterial(index: number): void {
    if (this.materials.length === 1) {
      return;
    }

    this.materials.removeAt(index);
  }

  protected stepControl(control: FormControl<number | null>, delta: number, min: number): void {
    const currentValue = control.value ?? min;
    const nextValue = Math.max(min, currentValue + delta);

    control.setValue(nextValue);
    control.markAsDirty();
    control.markAsTouched();
  }

  protected calculate(): void {
    this.submitAttempted.set(true);

    if (this.siteForm.invalid) {
      this.siteForm.markAllAsTouched();
      return;
    }

    this.runCalculation(true);
  }

  protected hasError(control: AbstractControl<unknown, unknown>): boolean {
    return control.invalid && (control.touched || this.submitAttempted());
  }

  protected trackMaterial(_: number, material: MaterialFormGroup): MaterialFormGroup {
    return material;
  }

  protected resolveConfiguredMaterial(materialId: string): ConfiguredMaterial | undefined {
    return this.configuredMaterials().find((material) => material.id === materialId);
  }

  protected saveCurrentCalculation(): void {
    const payload = this.lastCalculatedPayload();
    const result = this.result();

    if (!payload || !result || this.isSavingCalculation()) {
      return;
    }

    this.isSavingCalculation.set(true);
    this.saveFeedback.set(null);

    this.calculationPersistenceService
      .saveCalculation(payload, result)
      .pipe(finalize(() => this.isSavingCalculation.set(false)))
      .subscribe({
        next: (savedCalculation) => {
          this.savedCalculations.update((history) => [
            savedCalculation,
            ...history.filter((entry) => entry.bilanId !== savedCalculation.bilanId),
          ]);
          this.saveFeedback.set({
            kind: 'success',
            message: this.buildSuccessMessage(savedCalculation),
          });
        },
        error: () => {
          this.saveFeedback.set({
            kind: 'error',
            message: `Impossible de sauvegarder le calcul. Verifiez que le backend Carbonaze repond sur ${environment.apiUrl}.`,
          });
        },
      });
  }

  protected isDeletingBilan(bilanId: number): boolean {
    return this.deletingBilanIds().includes(bilanId);
  }

  protected deleteSavedCalculation(bilanId: number): void {
    if (this.isDeletingBilan(bilanId)) {
      return;
    }

    this.deletingBilanIds.update((ids) => [...ids, bilanId]);
    this.historyFeedback.set(null);

    this.calculationPersistenceService
      .deleteBilan(bilanId)
      .pipe(
        finalize(() => {
          this.deletingBilanIds.update((ids) => ids.filter((id) => id !== bilanId));
        }),
      )
      .subscribe({
        next: () => {
          this.savedCalculations.update((history) => history.filter((entry) => entry.bilanId !== bilanId));
          this.historyFeedback.set({
            kind: 'success',
            message: "Calcul supprime de l'historique.",
          });
        },
        error: () => {
          this.historyFeedback.set({
            kind: 'error',
            message: `Impossible de supprimer ce calcul. Verifiez que le backend Carbonaze repond sur ${environment.apiUrl}.`,
          });
        },
      });
  }

  private runCalculation(closeInputModalOnSuccess: boolean): void {
    const rawValue = this.siteForm.getRawValue();
    const payload: SiteInputPayload = {
      siteName: rawValue.siteName,
      city: rawValue.city,
      energyMwh: rawValue.energyMwh ?? 0,
      gasMwh: rawValue.gasMwh ?? 0,
      employees: rawValue.employees ?? 0,
      parkingSpaces: rawValue.parkingSpaces ?? 0,
      computers: rawValue.computers ?? 0,
      materials: rawValue.materials.map((material) => ({
        materialId: material.materialId,
        name: this.resolveConfiguredMaterialName(material.materialId),
        quantity: material.quantity ?? 0,
      })),
    };

    this.siteImpactService.calculateImpact(payload, this.configuredMaterials()).subscribe((result) => {
      this.result.set(result);
      this.lastCalculatedPayload.set(payload);
      this.saveFeedback.set(null);

      if (closeInputModalOnSuccess) {
        this.closeInputModal();
        this.viewportScroller.scrollToPosition([0, 0]);
      }
    });
  }

  private buildSuccessMessage(savedCalculation: SavedCalculationRecord): string {
    return `Calcul sauvegarde le ${this.formatIsoDate(savedCalculation.calculationDate)} pour ${savedCalculation.siteName}.`;
  }

  private loadSavedCalculations(): void {
    this.isHistoryLoading.set(true);
    this.historyFeedback.set(null);

    this.calculationPersistenceService
      .getAllBilans()
      .pipe(finalize(() => this.isHistoryLoading.set(false)))
      .subscribe({
        next: (history) => {
          this.savedCalculations.set(history);
        },
        error: () => {
          this.savedCalculations.set([]);
          this.historyFeedback.set({
            kind: 'error',
            message: `Impossible de charger l'historique. Verifiez que le backend Carbonaze repond sur ${environment.apiUrl}.`,
          });
        },
      });
  }

  private createMaterial(materialId = '', quantity: number | null = null): MaterialFormGroup {
    return new FormGroup({
      materialId: this.fb.nonNullable.control(materialId, [Validators.required]),
      quantity: this.fb.control<number | null>(quantity, [Validators.required, Validators.min(0.1)]),
    });
  }

  private resolveConfiguredMaterialName(materialId: string): string {
    return this.resolveConfiguredMaterial(materialId)?.name ?? '';
  }

  private syncMaterialSelections(): void {
    const configuredMaterialIds = new Set(this.configuredMaterials().map((material) => material.id));

    for (const materialControl of this.materials.controls) {
      const materialId = materialControl.controls.materialId.value;

      if (materialId && !configuredMaterialIds.has(materialId)) {
        materialControl.controls.materialId.setValue('', { emitEvent: false });
      }
    }
  }

  private formatIsoDate(isoDate: string): string {
    const [year, month, day] = isoDate.split('-');

    if (!year || !month || !day) {
      return isoDate;
    }

    return `${day}/${month}/${year}`;
  }
}
