import { DecimalPipe, ViewportScroller } from '@angular/common';
import { Component, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { finalize } from 'rxjs';

import { BodyScrollLockService } from './body-scroll-lock.service';
import { CalculationPersistenceService, SavedCalculationRecord } from './calculation-persistence.service';
import { CalculatorSettingsButtonComponent } from './calculator-settings-button.component';
import { environment } from '../environment/environment';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CalculatorSettingsButtonComponent, DecimalPipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly viewportScroller = inject(ViewportScroller);
  private readonly calculationPersistenceService = inject(CalculationPersistenceService);
  private readonly bodyScrollLockService = inject(BodyScrollLockService);

  protected readonly isHistoryModalOpen = signal(false);
  protected readonly isHistoryLoading = signal(false);
  protected readonly savedCalculations = signal<SavedCalculationRecord[]>([]);
  protected readonly deletingBilanIds = signal<number[]>([]);
  protected readonly historyFeedback = signal<{ kind: 'success' | 'error'; message: string } | null>(null);

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

  @HostListener('document:keydown.escape')
  protected handleEscape(): void {
    if (this.isHistoryModalOpen()) {
      this.closeHistoryModal();
    }
  }

  protected openHistoryModal(): void {
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
}
