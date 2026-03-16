import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class BodyScrollLockService {
  private readonly document = inject(DOCUMENT);
  private lockCount = 0;

  lock(): void {
    this.lockCount += 1;
    this.syncBodyClass();
  }

  unlock(): void {
    this.lockCount = Math.max(0, this.lockCount - 1);
    this.syncBodyClass();
  }

  private syncBodyClass(): void {
    this.document.body.classList.toggle('modal-open', this.lockCount > 0);
  }
}
