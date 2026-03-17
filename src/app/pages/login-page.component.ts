import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login-page.component.html',
})
export class LoginPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  protected readonly loginForm = this.fb.nonNullable.group({
    mail: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
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

    if (this.loginForm.invalid || this.isSubmitting()) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);

    this.authService
      .login(this.loginForm.getRawValue())
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => {
          void this.router.navigateByUrl('/calculs');
        },
        error: (error: unknown) => {
          this.feedback.set(
            this.authService.resolveApiErrorMessage(error, 'Connexion impossible. Verifiez vos identifiants.'),
          );
        },
      });
  }
}
