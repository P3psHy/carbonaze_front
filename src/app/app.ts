import { ViewportScroller } from '@angular/common';
import { Component, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from './auth.service';
import { BodyScrollLockService } from './body-scroll-lock.service';
import {
  ApiBilanRecord,
  CalculationPersistenceService,
  LoadedBilanDraft,
} from './calculation-persistence.service';
import { CalculatorSettingsButtonComponent } from './calculator-settings-button.component';
import { environment } from '../environment/environment';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CalculatorSettingsButtonComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly viewportScroller = inject(ViewportScroller);
  private readonly calculationPersistenceService = inject(CalculationPersistenceService);
  private readonly bodyScrollLockService = inject(BodyScrollLockService);
  private readonly authService = inject(AuthService);

  protected readonly isHistoryModalOpen = signal(false);
  protected readonly isHistoryLoading = signal(false);
  protected readonly savedCalculations = signal<ApiBilanRecord[]>([]);
  protected readonly deletingBilanIds = signal<number[]>([]);
  protected readonly historyFeedback = signal<{ kind: 'success' | 'error'; message: string } | null>(null);
  protected readonly authSession = this.authService.session;
  protected readonly isAuthenticated = this.authService.isAuthenticated;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.isHistoryModalOpen()) {
        this.bodyScrollLockService.unlock();
      }
    });
  }

  goToHome(): void {
    void this.router.navigateByUrl('/').then(() => {
      this.viewportScroller.scrollToPosition([0, 0]);
    });
  }

  protected goToLogin(): void {
    void this.router.navigateByUrl('/login');
  }

  protected goToRegister(): void {
    void this.router.navigateByUrl('/inscription');
  }

  protected logout(): void {
    this.closeHistoryModal();
    this.authService.logout();
  }

  @HostListener('document:keydown.escape')
  protected handleEscape(): void {
    if (this.isHistoryModalOpen()) {
      this.closeHistoryModal();
    }
  }

  protected openHistoryModal(): void {
    if (!this.isAuthenticated()) {
      this.goToLogin();
      return;
    }

    if (!this.isHistoryModalOpen()) {
      this.bodyScrollLockService.lock();
    }

    this.isHistoryModalOpen.set(true);
    this.loadSavedCalculations();
  }

  protected closeHistoryModal(): void {
    if (this.isHistoryModalOpen()) {
      this.bodyScrollLockService.unlock();
    }

    this.isHistoryModalOpen.set(false);
    this.historyFeedback.set(null);
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
          this.savedCalculations.update((history) => history.filter((entry) => entry.id !== bilanId));
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

  protected loadSavedCalculation(bilanId: number): void {
    const historyEntry = this.savedCalculations().find((entry) => entry.id === bilanId);

    if (!historyEntry) {
      return;
    }

    this.isHistoryLoading.set(true);
    this.historyFeedback.set(null);

    this.calculationPersistenceService
      .getBilanById(bilanId)
      .pipe(finalize(() => this.isHistoryLoading.set(false)))
      .subscribe({
        next: (bilan) => {
          const loadedBilan = this.buildLoadedBilanDraft(bilan, historyEntry);

          this.closeHistoryModal();
          void this.router.navigate(['/calculs'], { state: { loadedBilan } }).then((navigated) => {
            if (navigated) {
              this.viewportScroller.scrollToPosition([0, 0]);
            }
          });
        },
        error: () => {
          this.historyFeedback.set({
            kind: 'error',
            message: `Impossible de charger ce bilan. Verifiez que le backend Carbonaze repond sur ${environment.apiUrl}.`,
          });
        },
      });
  }

  protected resolveHistoryTitle(bilan: ApiBilanRecord): string {
    const siteName = bilan.site?.name?.trim();
    return siteName || `Bilan #${bilan.id}`;
  }

  protected resolveHistorySubtitle(bilan: ApiBilanRecord): string {
    const segments = [this.formatHistoryDate(bilan.calculationDate)];
    const city = bilan.site?.city?.trim();

    if (city) {
      segments.push(city);
    }

    return segments.join(' - ');
  }

  protected resolveHistoryTotal(bilan: ApiBilanRecord): string {
    if (typeof bilan.totalCo2 !== 'number' || !Number.isFinite(bilan.totalCo2)) {
      return 'Total indisponible';
    }

    return `${bilan.totalCo2.toFixed(1)} tCO2e`;
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

  private buildLoadedBilanDraft(bilan: ApiBilanRecord, historyEntry: ApiBilanRecord): LoadedBilanDraft {
    const sourceSite = bilan.site ?? historyEntry.site;

    return {
      bilanId: bilan.id,
      siteId: bilan.siteId ?? historyEntry.siteId,
      siteName: sourceSite?.name?.trim() ?? '',
      city: sourceSite?.city?.trim() ?? '',
      energyMwh:
        typeof bilan.electricityKwhYear === 'number' && Number.isFinite(bilan.electricityKwhYear)
          ? bilan.electricityKwhYear / 1000
          : null,
      gasMwh:
        typeof bilan.gasKwhYear === 'number' && Number.isFinite(bilan.gasKwhYear)
          ? bilan.gasKwhYear / 1000
          : null,
      employees:
        typeof sourceSite?.numberEmployee === 'number' && Number.isFinite(sourceSite.numberEmployee)
          ? sourceSite.numberEmployee
          : null,
      parkingSpaces:
        typeof sourceSite?.parkingPlaces === 'number' && Number.isFinite(sourceSite.parkingPlaces)
          ? sourceSite.parkingPlaces
          : null,
      computers:
        typeof sourceSite?.numberPc === 'number' && Number.isFinite(sourceSite.numberPc)
          ? sourceSite.numberPc
          : null,
      materials: bilan.materials ?? historyEntry.materials ?? [],
      totalCo2: typeof bilan.totalCo2 === 'number' && Number.isFinite(bilan.totalCo2) ? bilan.totalCo2 : null,
      calculationDate: bilan.calculationDate ?? historyEntry.calculationDate ?? '',
    };
  }

  private formatHistoryDate(value?: string): string {
    if (!value) {
      return 'Date inconnue';
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return parsed.toLocaleDateString('fr-FR');
  }
}
