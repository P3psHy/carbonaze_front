import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

import {
  ConfiguredMaterial,
  ImpactCategory,
  MaterialImpact,
  SiteImpactResult,
  SiteInputPayload,
} from './site-impact.models';

export const DEFAULT_CONFIGURED_MATERIALS: ConfiguredMaterial[] = [
  {
    id: 'beton',
    name: 'Béton',
    factor: 0.18,
  },
  {
    id: 'acier',
    name: 'Acier',
    factor: 1.9,
  },
  {
    id: 'verre',
    name: 'Verre',
    factor: 1.05,
  },
  {
    id: 'bois',
    name: 'Bois',
    factor: 0.08,
  },
  {
    id: 'aluminium',
    name: 'Aluminium',
    factor: 8.2,
  },
];

@Injectable({ providedIn: 'root' })
export class SiteImpactService {
  calculateImpact(
    payload: SiteInputPayload,
    configuredMaterials?: ConfiguredMaterial[],
  ): Observable<SiteImpactResult> {
    const normalizedMaterials = this.normalizeConfiguredMaterials(configuredMaterials);
    const materialImpacts = this.buildMaterialImpacts(payload.materials, normalizedMaterials);
    const materialsEmission = this.sum(materialImpacts.map((material) => material.emission));
    const energyEmission = payload.energyMwh * 0.055;
    const gasEmission = payload.gasMwh * 0.227;
    const parkingEmission = payload.parkingSpaces * 0.95 + payload.employees * 0.12;
    const equipmentEmission = payload.computers * 0.16;

    const totalEmission = this.round(
      materialsEmission + energyEmission + gasEmission + parkingEmission + equipmentEmission,
    );

    const categories = this.buildCategories({
      materialsEmission,
      energyEmission,
      gasEmission,
      parkingEmission,
      equipmentEmission,
      totalEmission,
    });

    const dominantCategory = [...categories].sort((left, right) => right.emission - left.emission)[0];
    const materialBreakdown = materialImpacts.map((material) => ({
      ...material,
      share: totalEmission > 0 ? this.round((material.emission / totalEmission) * 100, 1) : 0,
    }));

    return of({
      siteName: payload.siteName,
      city: payload.city,
      totalEmission,
      emissionPerEmployee: payload.employees > 0 ? this.round(totalEmission / payload.employees, 2) : 0,
      dominantCategory: dominantCategory.label,
      dominantShare: dominantCategory.percentage,
      materialCount: materialBreakdown.length,
      categories,
      materials: materialBreakdown,
      insights: this.buildInsights(payload, categories, materialBreakdown, totalEmission),
    });
  }

  getDefaultConfiguredMaterials(): ConfiguredMaterial[] {
    return DEFAULT_CONFIGURED_MATERIALS.map((material) => ({ ...material }));
  }

  normalizeConfiguredMaterials(
    configuredMaterials?: ConfiguredMaterial[],
    options?: {
      fallbackToDefaults?: boolean;
    },
  ): ConfiguredMaterial[] {
    const fallbackToDefaults = options?.fallbackToDefaults ?? true;

    if (!Array.isArray(configuredMaterials)) {
      return this.getDefaultConfiguredMaterials();
    }

    const normalizedMaterials = configuredMaterials.reduce<ConfiguredMaterial[]>((materials, material, index) => {
      const normalizedName = material?.name?.trim();
      const normalizedFactor = material?.factor;

      if (
        !normalizedName ||
        typeof normalizedFactor !== 'number' ||
        !Number.isFinite(normalizedFactor) ||
        normalizedFactor <= 0
      ) {
        return materials;
      }

      materials.push({
        id: this.normalizeMaterialId(material?.id, index),
        backendId:
          typeof material?.backendId === 'number' && Number.isFinite(material.backendId)
            ? material.backendId
            : undefined,
        name: normalizedName,
        factor: this.round(normalizedFactor, 2),
      });

      return materials;
    }, []);

    return normalizedMaterials.length > 0 || !fallbackToDefaults
      ? normalizedMaterials
      : this.getDefaultConfiguredMaterials();
  }

  private buildMaterialImpacts(
    materials: SiteInputPayload['materials'],
    configuredMaterials: ConfiguredMaterial[],
  ): MaterialImpact[] {
    const palette = ['#14532d', '#0f766e', '#ca8a04', '#b45309', '#7c2d12', '#155e75'];
    const materialsById = new Map(configuredMaterials.map((material) => [material.id, material]));

    return materials
      .filter((material) => material.quantity > 0)
      .map((material, index) => {
        const configuredMaterial =
          materialsById.get(material.materialId) ?? this.findMaterialByName(material.name, configuredMaterials);

        if (!configuredMaterial) {
          return null;
        }

        const emission = this.round(material.quantity * configuredMaterial.factor);

        return {
          name: configuredMaterial.name,
          quantity: material.quantity,
          factor: configuredMaterial.factor,
          emission,
          share: 0,
          color: palette[index % palette.length],
        };
      })
      .filter((material): material is MaterialImpact => material !== null);
  }

  private buildCategories(values: {
    materialsEmission: number;
    energyEmission: number;
    gasEmission: number;
    parkingEmission: number;
    equipmentEmission: number;
    totalEmission: number;
  }): ImpactCategory[] {
    const items = [
      {
        key: 'materials' as const,
        label: 'Matériaux',
        emission: this.round(values.materialsEmission),
        color: '#14532d',
        helper: 'Impact cumulé des matériaux saisis',
      },
      {
        key: 'energy' as const,
        label: 'Électricité',
        emission: this.round(values.energyEmission),
        color: '#0f766e',
        helper: 'Consommation électrique annuelle',
      },
      {
        key: 'gas' as const,
        label: 'Gaz',
        emission: this.round(values.gasEmission),
        color: '#ca8a04',
        helper: 'Consommation de gaz annuelle',
      },
      {
        key: 'parking' as const,
        label: 'Mobilité & parking',
        emission: this.round(values.parkingEmission),
        color: '#b45309',
        helper: 'Stationnement et mobilité collaborateurs',
      },
      {
        key: 'equipment' as const,
        label: 'Équipement IT',
        emission: this.round(values.equipmentEmission),
        color: '#155e75',
        helper: 'Ordinateurs et équipements postes',
      },
    ];

    return items.map((item) => ({
      ...item,
      percentage: values.totalEmission > 0 ? this.round((item.emission / values.totalEmission) * 100, 1) : 0,
    }));
  }

  private buildInsights(
    payload: SiteInputPayload,
    categories: ImpactCategory[],
    materials: MaterialImpact[],
    totalEmission: number,
  ): string[] {
    const dominantCategory = [...categories].sort((left, right) => right.emission - left.emission)[0];
    const topMaterial = [...materials].sort((left, right) => right.emission - left.emission)[0];

    return [
      `${dominantCategory.label} représente ${dominantCategory.percentage}% des émissions estimées du site.`,
      `Le site émet environ ${this.round(totalEmission / Math.max(payload.employees, 1), 2)} tCO2e par employé.`,
      topMaterial
        ? `${topMaterial.name} est le matériau le plus impactant avec ${topMaterial.emission} tCO2e estimées.`
        : "Ajoutez des matériaux pour enrichir l'analyse construction.",
      `${payload.parkingSpaces} places et ${payload.computers} postes informatiques alimentent déjà les stats de pilotage.`,
    ];
  }

  private findMaterialByName(name: string, configuredMaterials: ConfiguredMaterial[]): ConfiguredMaterial | undefined {
    const normalizedName = name.trim().toLowerCase();

    return configuredMaterials.find((material) => material.name.trim().toLowerCase() === normalizedName);
  }

  private normalizeMaterialId(id: string | undefined, index: number): string {
    const normalizedId = id?.trim();

    if (normalizedId) {
      return normalizedId;
    }

    return `material-${index + 1}`;
  }

  private sum(values: number[]): number {
    return values.reduce((total, value) => total + value, 0);
  }

  private round(value: number, digits = 1): number {
    return Number(value.toFixed(digits));
  }
}
