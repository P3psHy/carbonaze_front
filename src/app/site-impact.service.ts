import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

import {
  ImpactCategory,
  MaterialImpact,
  SiteImpactResult,
  SiteInputPayload,
} from './site-impact.models';

@Injectable({ providedIn: 'root' })
export class SiteImpactService {
  calculateImpact(payload: SiteInputPayload): Observable<SiteImpactResult> {
    const materialImpacts = this.buildMaterialImpacts(payload.materials);
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

  private buildMaterialImpacts(materials: SiteInputPayload['materials']): MaterialImpact[] {
    const palette = ['#14532d', '#0f766e', '#ca8a04', '#b45309', '#7c2d12', '#155e75'];

    return materials
      .filter((material) => material.name.trim() && material.quantity > 0)
      .map((material, index) => {
        const factor = this.resolveMaterialFactor(material.name);
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
        label: 'Materiaux',
        emission: this.round(values.materialsEmission),
        color: '#14532d',
        helper: 'Impact cumule des materiaux saisis',
      },
      {
        key: 'energy' as const,
        label: 'Electricite',
        emission: this.round(values.energyEmission),
        color: '#0f766e',
        helper: 'Consommation electrique annuelle',
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
        label: 'Mobilite & parking',
        emission: this.round(values.parkingEmission),
        color: '#b45309',
        helper: 'Stationnement et mobilite collaborateurs',
      },
      {
        key: 'equipment' as const,
        label: 'Equipement IT',
        emission: this.round(values.equipmentEmission),
        color: '#155e75',
        helper: 'Ordinateurs et equipements postes',
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
      `${dominantCategory.label} represente ${dominantCategory.percentage}% des emissions estimees du site.`,
      `Le site emet environ ${this.round(totalEmission / Math.max(payload.employees, 1), 2)} tCO2e par employe.`,
      topMaterial
        ? `${topMaterial.name} est le materiau le plus impactant avec ${topMaterial.emission} tCO2e estimees.`
        : 'Ajoutez des materiaux pour enrichir l analyse construction.',
      `${payload.parkingSpaces} places et ${payload.computers} postes informatiques alimentent deja les stats de pilotage.`,
    ];
  }

  private resolveMaterialFactor(name: string): number {
    const key = name.trim().toLowerCase();

    if (key.includes('beton')) {
      return 0.18;
    }

    if (key.includes('acier')) {
      return 1.9;
    }

    if (key.includes('verre')) {
      return 1.05;
    }

    if (key.includes('bois')) {
      return 0.08;
    }

    if (key.includes('aluminium')) {
      return 8.2;
    }

    return 0.35;
  }

  private sum(values: number[]): number {
    return values.reduce((total, value) => total + value, 0);
  }

  private round(value: number, digits = 1): number {
    return Number(value.toFixed(digits));
  }
}
