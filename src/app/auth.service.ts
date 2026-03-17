import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

import { environment } from '../environment/environment';

interface AuthApiResponse {
  token: string;
  userId: number;
  mail: string;
  societyId: number;
  societyName: string;
}

export interface AuthSession {
  token: string;
  userId: number;
  mail: string;
  societyId: number;
  societyName: string;
}

interface LoginPayload {
  mail: string;
  password: string;
}

interface RegisterPayload {
  mail: string;
  password: string;
  societyName: string;
}

const API_BASE_URL = environment.apiUrl;
const AUTH_SESSION_STORAGE_KEY = 'carbonaze.auth.session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router, { optional: true });

  private readonly sessionState = signal<AuthSession | null>(this.readSessionFromStorage());
  readonly session = this.sessionState.asReadonly();
  readonly isAuthenticated = computed(() => Boolean(this.sessionState()?.token));

  login(payload: LoginPayload): Observable<AuthSession> {
    return this.http
      .post<AuthApiResponse>(`${API_BASE_URL}/auth/login`, payload)
      .pipe(tap((session) => this.setSession(session)));
  }

  register(payload: RegisterPayload): Observable<AuthSession> {
    return this.http
      .post<AuthApiResponse>(`${API_BASE_URL}/auth/register`, payload)
      .pipe(tap((session) => this.setSession(session)));
  }

  logout(options?: { redirectToLogin?: boolean }): void {
    this.clearSession();
    if ((options?.redirectToLogin ?? true) && this.router) {
      void this.router.navigateByUrl('/login');
    }
  }

  getToken(): string | null {
    return this.sessionState()?.token ?? null;
  }

  getSocietyId(): number | null {
    const societyId = this.sessionState()?.societyId;
    return typeof societyId === 'number' && Number.isFinite(societyId) ? societyId : null;
  }

  getSessionSummary(): { mail: string; societyName: string } | null {
    const session = this.sessionState();
    if (!session) {
      return null;
    }

    return {
      mail: session.mail,
      societyName: session.societyName,
    };
  }

  resolveApiErrorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }

    if (typeof error.error?.message === 'string' && error.error.message.trim()) {
      return error.error.message.trim();
    }

    if (typeof error.error === 'string' && error.error.trim()) {
      return error.error.trim();
    }

    return fallback;
  }

  private setSession(session: AuthApiResponse): void {
    const normalizedSession: AuthSession = {
      token: session.token,
      userId: session.userId,
      mail: session.mail,
      societyId: session.societyId,
      societyName: session.societyName,
    };

    this.sessionState.set(normalizedSession);
    this.writeSessionToStorage(normalizedSession);
  }

  private clearSession(): void {
    this.sessionState.set(null);
    this.removeSessionFromStorage();
  }

  private readSessionFromStorage(): AuthSession | null {
    try {
      const rawValue = globalThis.localStorage?.getItem(AUTH_SESSION_STORAGE_KEY);
      if (!rawValue) {
        return null;
      }

      const parsed = JSON.parse(rawValue) as Partial<AuthSession>;
      if (
        typeof parsed?.token !== 'string' ||
        typeof parsed?.mail !== 'string' ||
        typeof parsed?.societyName !== 'string' ||
        typeof parsed?.userId !== 'number' ||
        !Number.isFinite(parsed.userId) ||
        typeof parsed?.societyId !== 'number' ||
        !Number.isFinite(parsed.societyId)
      ) {
        return null;
      }

      return {
        token: parsed.token,
        userId: parsed.userId,
        mail: parsed.mail,
        societyId: parsed.societyId,
        societyName: parsed.societyName,
      };
    } catch {
      return null;
    }
  }

  private writeSessionToStorage(session: AuthSession): void {
    try {
      globalThis.localStorage?.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      return;
    }
  }

  private removeSessionFromStorage(): void {
    try {
      globalThis.localStorage?.removeItem(AUTH_SESSION_STORAGE_KEY);
    } catch {
      return;
    }
  }
}
