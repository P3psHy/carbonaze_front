import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, finalize, map, Observable, of, tap, throwError } from 'rxjs';

import { MaterialCatalogApiService } from './material-catalog-api.service';
import { ConfiguredMaterial } from './site-impact.models';
import { SiteImpactService } from './site-impact.service';

type OpenSettingsOptions = {
  focusNewMaterial?: boolean;
};

@Injectable({ providedIn: 'root' })
export class CalculatorSettingsService {
  private readonly storageKey = 'carbonaze.material-catalog.v2';
  private readonly legacyStorageKey = 'carbonaze.material-factors.v1';
  private readonly document = inject(DOCUMENT);
  private readonly siteImpactService = inject(SiteImpactService);
  private readonly materialCatalogApiService = inject(MaterialCatalogApiService);

  readonly isSettingsOpen = signal(false);
  readonly configuredMaterials = signal<ConfiguredMaterial[]>(this.loadStoredMaterials());
  readonly shouldFocusNewMaterial = signal(false);
  readonly isSyncingMaterials = signal(false);
  readonly materialsSyncError = signal<string | null>(null);

  openSettings(options?: OpenSettingsOptions): void {
    this.shouldFocusNewMaterial.set(!!options?.focusNewMaterial);
    this.isSettingsOpen.set(true);
  }

  closeSettings(): void {
    this.isSettingsOpen.set(false);
    this.shouldFocusNewMaterial.set(false);
  }

  consumeFocusNewMaterialRequest(): void {
    this.shouldFocusNewMaterial.set(false);
  }

  getDefaultConfiguredMaterials(): ConfiguredMaterial[] {
    return this.siteImpactService.getDefaultConfiguredMaterials();
  }

  refreshConfiguredMaterials(): Observable<ConfiguredMaterial[]> {
    this.isSyncingMaterials.set(true);
    this.materialsSyncError.set(null);

    return this.materialCatalogApiService.getMaterials().pipe(
      map((materials) =>
        this.siteImpactService.normalizeConfiguredMaterials(materials, {
          fallbackToDefaults: false,
        }),
      ),
      tap((materials) => {
        this.configuredMaterials.set(materials);
        this.persistConfiguredMaterials(materials);
      }),
      catchError((error: unknown) => {
        this.materialsSyncError.set(this.toSyncErrorMessage(error));
        return of(this.configuredMaterials());
      }),
      finalize(() => this.isSyncingMaterials.set(false)),
    );
  }

  createConfiguredMaterial(configuredMaterial: ConfiguredMaterial): Observable<ConfiguredMaterial> {
    const [normalizedMaterial] = this.siteImpactService.normalizeConfiguredMaterials([configuredMaterial], {
      fallbackToDefaults: false,
    });

    if (!normalizedMaterial) {
      return throwError(() => new Error('Le materiau a ajouter est invalide.'));
    }

    this.isSyncingMaterials.set(true);
    this.materialsSyncError.set(null);

    return this.materialCatalogApiService.createMaterial(normalizedMaterial).pipe(
      map((createdMaterial) => {
        const [normalizedCreatedMaterial] = this.siteImpactService.normalizeConfiguredMaterials(
          [createdMaterial],
          {
            fallbackToDefaults: false,
          },
        );

        if (!normalizedCreatedMaterial) {
          throw new Error('Le backend a retourne un materiau invalide.');
        }

        return normalizedCreatedMaterial;
      }),
      tap((createdMaterial) => {
        const updatedMaterials = [...this.configuredMaterials(), createdMaterial];
        this.configuredMaterials.set(updatedMaterials);
        this.persistConfiguredMaterials(updatedMaterials);
      }),
      catchError((error: unknown) => {
        this.materialsSyncError.set(this.toSyncErrorMessage(error));
        return throwError(() => error);
      }),
      finalize(() => this.isSyncingMaterials.set(false)),
    );
  }

  saveConfiguredMaterials(configuredMaterials: ConfiguredMaterial[]): void {
    const normalizedMaterials =
      this.siteImpactService.normalizeConfiguredMaterials(configuredMaterials, {
        fallbackToDefaults: false,
      });

    this.configuredMaterials.set(normalizedMaterials);
    this.persistConfiguredMaterials(normalizedMaterials);
    this.closeSettings();
  }

  private loadStoredMaterials(): ConfiguredMaterial[] {
    const defaults = this.siteImpactService.getDefaultConfiguredMaterials();
    const storage = this.document.defaultView?.localStorage;

    if (!storage) {
      return defaults;
    }

    try {
      const rawCatalog = storage.getItem(this.storageKey);

      if (rawCatalog) {
        return this.siteImpactService.normalizeConfiguredMaterials(
          JSON.parse(rawCatalog) as ConfiguredMaterial[],
          {
            fallbackToDefaults: false,
          },
        );
      }

      const legacyRawFactors = storage.getItem(this.legacyStorageKey);

      if (!legacyRawFactors) {
        return defaults;
      }

      const migratedMaterials = this.migrateLegacyMaterialFactors(
        JSON.parse(legacyRawFactors) as Record<string, unknown>,
      );
      this.persistConfiguredMaterials(migratedMaterials);

      return migratedMaterials;
    } catch {
      return defaults;
    }
  }

  private persistConfiguredMaterials(configuredMaterials: ConfiguredMaterial[]): void {
    try {
      this.document.defaultView?.localStorage?.setItem(
        this.storageKey,
        JSON.stringify(configuredMaterials),
      );
    } catch {
      // Ignore storage write failures and keep the in-memory settings active.
    }
  }

  private migrateLegacyMaterialFactors(
    legacyMaterialFactors: Record<string, unknown>,
  ): ConfiguredMaterial[] {
    const defaults = this.siteImpactService.getDefaultConfiguredMaterials();

    return defaults.map((material) => {
      const legacyFactor = legacyMaterialFactors[material.id];

      if (typeof legacyFactor !== 'number' || !Number.isFinite(legacyFactor) || legacyFactor <= 0) {
        return material;
      }

      return {
        ...material,
        factor: Number(legacyFactor.toFixed(2)),
      };
    });
  }

  private toSyncErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 404) {
        return "La route /api/materials n'est pas disponible sur le backend.";
      }

      if (error.status === 0) {
        return 'Le backend Carbonaze est inaccessible pour synchroniser les materiaux.';
      }
    }

    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    return 'La synchronisation des materiaux a echoue.';
  }
}
