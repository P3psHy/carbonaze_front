import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

import {
  ImpactCategory,
  MaterialFactorDefinition,
  MaterialFactorMap,
  MaterialImpact,
  SiteImpactResult,
  SiteInputPayload,
} from './site-impact.models';

export const MATERIAL_FACTOR_DEFINITIONS: MaterialFactorDefinition[] = [
  {
    key: 'beton',
    label: 'Béton',
    helper: 'Tous les bétons et variantes bas carbone',
    defaultFactor: 0.18,
    aliases: ['beton'],
  },
  {
    key: 'acier',
    label: 'Acier',
    helper: 'Structures et composants acier',
    defaultFactor: 1.9,
    aliases: ['acier', 'steel'],
  },
  {
    key: 'verre',
    label: 'Verre',
    helper: 'Façades, vitrages et cloisons',
    defaultFactor: 1.05,
    aliases: ['verre', 'glass', 'vitrage'],
  },
  {
    key: 'bois',
    label: 'Bois',
    helper: 'Bois massif, CLT et dérivés',
    defaultFactor: 0.08,
    aliases: ['bois', 'wood'],
  },
  {
    key: 'aluminium',
    label: 'Aluminium',
    helper: 'Profils, façades et menuiseries',
    defaultFactor: 8.2,
    aliases: ['aluminium', 'alu'],
  },
  {
    key: 'default',
    label: 'Autres',
    helper: 'Facteur appliqué si aucun matériau connu ne correspond',
    defaultFactor: 0.35,
    aliases: [],
  },
];

@Injectable({ providedIn: 'root' })
export class SiteImpactService {
  calculateImpact(
    payload: SiteInputPayload,
    materialFactors?: Partial<MaterialFactorMap>,
  ): Observable<SiteImpactResult> {
    const normalizedFactors = this.normalizeMaterialFactors(materialFactors);
    const materialImpacts = this.buildMaterialImpacts(payload.materials, normalizedFactors);
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

  getDefaultMaterialFactors(): MaterialFactorMap {
    return MATERIAL_FACTOR_DEFINITIONS.reduce(
      (factors, definition) => ({
        ...factors,
        [definition.key]: definition.defaultFactor,
      }),
      {} as MaterialFactorMap,
    );
  }

  normalizeMaterialFactors(materialFactors?: Partial<MaterialFactorMap>): MaterialFactorMap {
    const defaults = this.getDefaultMaterialFactors();

    for (const definition of MATERIAL_FACTOR_DEFINITIONS) {
      const value = materialFactors?.[definition.key];

      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        defaults[definition.key] = this.round(value, 2);
      }
    }

    return defaults;
  }

  private buildMaterialImpacts(
    materials: SiteInputPayload['materials'],
    materialFactors: MaterialFactorMap,
  ): MaterialImpact[] {
    const palette = ['#14532d', '#0f766e', '#ca8a04', '#b45309', '#7c2d12', '#155e75'];

    return materials
      .filter((material) => material.name.trim() && material.quantity > 0)
      .map((material, index) => {
        const factor = this.resolveMaterialFactor(material.name, materialFactors);
        const emission = this.round(material.quantity * factor);

        return {
          name: material.name.trim(),
          quantity: material.quantity,
          factor,
          emission,
          share: 0,
          color: palette[index % palette.length],
        };
      });
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
      `${payload.parkingSpaces} places et ${payload.computers} postes informatiques alimentent deja les stats de pilotage.`,
    ];
  }

  private resolveMaterialFactor(name: string, materialFactors: MaterialFactorMap): number {
    const key = name.trim().toLowerCase();
    const definition = MATERIAL_FACTOR_DEFINITIONS.find(
      (item) => item.key !== 'default' && item.aliases.some((alias) => key.includes(alias)),
    );

    return materialFactors[definition?.key ?? 'default'];
  }

  private sum(values: number[]): number {
    return values.reduce((total, value) => total + value, 0);
  }

  private round(value: number, digits = 1): number {
    return Number(value.toFixed(digits));
  }
}
