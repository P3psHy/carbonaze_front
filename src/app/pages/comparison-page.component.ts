import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';

import {
  ApiSiteComparisonRecord,
  CalculationPersistenceService,
} from '../calculation-persistence.service';
import { environment } from '../../environment/environment';

@Component({
  selector: 'app-comparison-page',
  imports: [DecimalPipe],
  templateUrl: './comparison-page.component.html',
})
export class ComparisonPageComponent {
  private readonly calculationPersistenceService = inject(CalculationPersistenceService);

  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly comparisonSites = signal<ApiSiteComparisonRecord[]>([]);

  protected readonly rankedSites = computed(() => this.comparisonSites());
  protected readonly comparedSitesCount = computed(() =>
    this.rankedSites().filter((site) => typeof site.latestTotalCo2 === 'number').length,
  );
  protected readonly averageTotalEmission = computed(() => {
    const comparedSites = this.rankedSites().filter(
      (site) => typeof site.latestTotalCo2 === 'number',
    );

    if (comparedSites.length === 0) {
      return null;
    }

    const total = comparedSites.reduce((sum, site) => sum + (site.latestTotalCo2 ?? 0), 0);
    return total / comparedSites.length;
  });
  protected readonly topEmitter = computed(() =>
    this.rankedSites().find((site) => typeof site.latestTotalCo2 === 'number'),
  );

  constructor() {
    this.refreshComparison();
  }

  protected refreshComparison(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.calculationPersistenceService
      .getSiteComparisons()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (sites) => {
          this.comparisonSites.set(sites);
        },
        error: () => {
          this.comparisonSites.set([]);
          this.errorMessage.set(
            `Impossible de charger la comparaison. Verifiez que le backend Carbonaze repond sur ${environment.apiUrl}.`,
          );
        },
      });
  }

  protected resolveTotalLabel(site: ApiSiteComparisonRecord): string {
    if (typeof site.latestTotalCo2 !== 'number' || !Number.isFinite(site.latestTotalCo2)) {
      return 'Aucun bilan';
    }

    return `${site.latestTotalCo2.toFixed(1)} tCO2e`;
  }

  protected resolvePerEmployeeLabel(site: ApiSiteComparisonRecord): string {
    if (
      typeof site.latestTotalCo2 !== 'number' ||
      !Number.isFinite(site.latestTotalCo2) ||
      !site.numberEmployee
    ) {
      return 'Indisponible';
    }

    const perEmployee = site.latestTotalCo2 / site.numberEmployee;
    return `${perEmployee.toFixed(2)} tCO2e`;
  }

  protected resolveEnergyLabel(site: ApiSiteComparisonRecord): string {
    if (
      typeof site.latestElectricityKwhYear !== 'number' ||
      !Number.isFinite(site.latestElectricityKwhYear)
    ) {
      return 'Indisponible';
    }

    return `${(site.latestElectricityKwhYear / 1000).toFixed(1)} MWh/an`;
  }

  protected resolveComparisonDate(site: ApiSiteComparisonRecord): string {
    if (!site.latestCalculationDate) {
      return 'Date de bilan inconnue';
    }

    const parsed = new Date(site.latestCalculationDate);

    if (Number.isNaN(parsed.getTime())) {
      return site.latestCalculationDate;
    }

    return parsed.toLocaleDateString('fr-FR');
  }
}
