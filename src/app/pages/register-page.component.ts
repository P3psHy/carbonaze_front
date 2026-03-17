import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../auth.service';

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register-page.component.html',
})
export class RegisterPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  protected readonly registerForm = this.fb.nonNullable.group({
    mail: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    societyName: ['', [Validators.required, Validators.minLength(2)]],
  });

  protected readonly submitAttempted = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly feedback = signal<string | null>(null);

  constructor() {
    if (this.authService.isAuthenticated()) {
      void this.router.navigateByUrl('/calculs');
    }
  }

  protected submit(): void {
    this.submitAttempted.set(true);
    this.feedback.set(null);

    if (this.registerForm.invalid || this.isSubmitting()) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);

    this.authService
      .register(this.registerForm.getRawValue())
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => {
          void this.router.navigateByUrl('/calculs');
        },
        error: (error: unknown) => {
          this.feedback.set(
            this.authService.resolveApiErrorMessage(
              error,
              "Inscription impossible. Verifiez l'email, le mot de passe et le nom de la societe.",
            ),
          );
        },
      });
  }
}
