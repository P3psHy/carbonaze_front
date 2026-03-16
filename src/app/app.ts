import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { SiteInputPayload, SiteImpactResult } from './site-impact.models';
import { SiteImpactService } from './site-impact.service';

type MaterialFormGroup = FormGroup<{
  name: FormControl<string>;
  quantity: FormControl<number>;
}>;

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule, DecimalPipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly fb = inject(FormBuilder);
  private readonly siteImpactService = inject(SiteImpactService);

  protected readonly siteForm = this.fb.nonNullable.group({
    siteName: ['Carbonaze Rive Gauche', [Validators.required]],
    city: ['Paris', [Validators.required]],
    energyMwh: [1840, [Validators.required, Validators.min(0)]],
    gasMwh: [620, [Validators.required, Validators.min(0)]],
    employees: [920, [Validators.required, Validators.min(1)]],
    parkingSpaces: [142, [Validators.required, Validators.min(0)]],
    computers: [1037, [Validators.required, Validators.min(0)]],
    materials: this.fb.array<MaterialFormGroup>([
      this.createMaterial('Beton bas carbone', 320),
      this.createMaterial('Acier', 85),
      this.createMaterial('Verre', 40),
    ]),
  });

  protected readonly result = signal<SiteImpactResult | null>(null);
  protected readonly submitAttempted = signal(false);

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

  get materials(): FormArray<MaterialFormGroup> {
    return this.siteForm.controls.materials;
  }

  protected addMaterial(name = '', quantity = 0): void {
    this.materials.push(this.createMaterial(name, quantity));
  }

  protected removeMaterial(index: number): void {
    if (this.materials.length === 1) {
      return;
    }

    this.materials.removeAt(index);
  }

  protected calculate(): void {
    this.submitAttempted.set(true);

    if (this.siteForm.invalid) {
      this.siteForm.markAllAsTouched();
      return;
    }

    const payload = this.siteForm.getRawValue() as SiteInputPayload;

    this.siteImpactService.calculateImpact(payload).subscribe((result) => {
      this.result.set(result);
    });
  }

  protected hasError(control: FormControl<string | number>): boolean {
    return control.invalid && (control.touched || this.submitAttempted());
  }

  protected trackMaterial(_: number, material: MaterialFormGroup): MaterialFormGroup {
    return material;
  }

  private createMaterial(name = '', quantity = 0): MaterialFormGroup {
    return this.fb.nonNullable.group({
      name: [name, [Validators.required]],
      quantity: [quantity, [Validators.required, Validators.min(0.1)]],
    });
  }
}
