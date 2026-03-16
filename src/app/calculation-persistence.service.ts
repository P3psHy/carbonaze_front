import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, switchMap, throwError } from 'rxjs';

import { SiteImpactResult, SiteInputPayload } from './site-impact.models';

interface CreateSocietyRequest {
  name: string;
}

interface SocietyResponse {
  id: number;
  name: string;
}

interface CreateSiteRequest {
  name: string;
  city: string;
  numberEmployee: number;
  parkingPlaces: number;
  numberPc: number;
  societyId: number;
}

interface SiteResponse {
  id: number;
  name: string;
}

interface CreateBilanRequest {
  electricityKwhYear: number;
  gasKwhYear: number;
  totalCo2: number;
  calculationDate: string;
}

interface BilanResponse {
  id: number;
  totalCo2: number;
  calculationDate: string;
}

export interface SavedCalculationRecord {
  bilanId: number;
  siteId: number;
  siteName: string;
  totalCo2: number;
  calculationDate: string;
}

const API_BASE_URL = '/api';
const DEFAULT_SOCIETY_NAME = 'Carbonaze Front';
const SOCIETY_STORAGE_KEY = 'carbonaze.backend.society';
const SITE_STORAGE_KEY = 'carbonaze.backend.sites';

@Injectable({ providedIn: 'root' })
export class CalculationPersistenceService {
  private readonly http = inject(HttpClient);

  saveCalculation(
    payload: SiteInputPayload,
    result: SiteImpactResult,
  ): Observable<SavedCalculationRecord> {
    return this.saveCalculationInternal(payload, result).pipe(
      catchError((error) => {
        if (!this.shouldResetCache(error)) {
          return throwError(() => error);
        }

        this.clearCachedReferences();
        return this.saveCalculationInternal(payload, result);
      }),
    );
  }

  private saveCalculationInternal(
    payload: SiteInputPayload,
    result: SiteImpactResult,
  ): Observable<SavedCalculationRecord> {
    return this.getOrCreateSocietyId().pipe(
      switchMap((societyId) => this.getOrCreateSite(payload, societyId)),
      switchMap((site) =>
        this.http
          .post<BilanResponse>(
            `${API_BASE_URL}/sites/${site.id}/bilans`,
            this.buildBilanRequest(payload, result),
          )
          .pipe(
            map((bilan) => ({
              bilanId: bilan.id,
              siteId: site.id,
              siteName: site.name,
              totalCo2: bilan.totalCo2,
              calculationDate: bilan.calculationDate,
            })),
          ),
      ),
    );
  }

  private getOrCreateSocietyId(): Observable<number> {
    const cachedSocietyId = this.readCachedSocietyId();

    if (cachedSocietyId !== null) {
      return of(cachedSocietyId);
    }

    const request: CreateSocietyRequest = {
      name: DEFAULT_SOCIETY_NAME,
    };

    return this.http
      .post<SocietyResponse>(`${API_BASE_URL}/societies`, request)
      .pipe(
        map((response) => {
          this.writeCachedSocietyId(response.id);
          return response.id;
        }),
      );
  }

  private getOrCreateSite(payload: SiteInputPayload, societyId: number): Observable<SiteResponse> {
    const cacheKey = this.buildSiteCacheKey(payload, societyId);
    const cachedSiteId = this.readCachedSiteId(cacheKey);

    if (cachedSiteId !== null) {
      return of({
        id: cachedSiteId,
        name: payload.siteName.trim(),
      });
    }

    return this.http
      .post<SiteResponse>(`${API_BASE_URL}/sites`, this.buildSiteRequest(payload, societyId))
      .pipe(
        map((response) => {
          this.writeCachedSiteId(cacheKey, response.id);
          return response;
        }),
      );
  }

  private buildSiteRequest(payload: SiteInputPayload, societyId: number): CreateSiteRequest {
    return {
      name: payload.siteName.trim(),
      city: payload.city.trim(),
      numberEmployee: this.toInteger(payload.employees),
      parkingPlaces: this.toInteger(payload.parkingSpaces),
      numberPc: this.toInteger(payload.computers),
      societyId,
    };
  }

  private buildBilanRequest(
    payload: SiteInputPayload,
    result: SiteImpactResult,
  ): CreateBilanRequest {
    return {
      electricityKwhYear: this.round(payload.energyMwh * 1000, 1),
      gasKwhYear: this.round(payload.gasMwh * 1000, 1),
      totalCo2: this.round(result.totalEmission, 1),
      calculationDate: this.getTodayIsoDate(),
    };
  }

  private buildSiteCacheKey(payload: SiteInputPayload, societyId: number): string {
    return JSON.stringify({
      societyId,
      siteName: payload.siteName.trim().toLowerCase(),
      city: payload.city.trim().toLowerCase(),
      employees: this.toInteger(payload.employees),
      parkingSpaces: this.toInteger(payload.parkingSpaces),
      computers: this.toInteger(payload.computers),
    });
  }

  private shouldResetCache(error: unknown): boolean {
    return error instanceof HttpErrorResponse && error.status === 404;
  }

  private getTodayIsoDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private toInteger(value: number): number {
    return Math.round(value);
  }

  private round(value: number, digits: number): number {
    return Number(value.toFixed(digits));
  }

  private readCachedSocietyId(): number | null {
    try {
      const rawValue = globalThis.localStorage?.getItem(SOCIETY_STORAGE_KEY);

      if (!rawValue) {
        return null;
      }

      const parsedValue = Number(rawValue);
      return Number.isFinite(parsedValue) ? parsedValue : null;
    } catch {
      return null;
    }
  }

  private writeCachedSocietyId(societyId: number): void {
    try {
      globalThis.localStorage?.setItem(SOCIETY_STORAGE_KEY, societyId.toString());
    } catch {
      return;
    }
  }

  private readCachedSiteId(cacheKey: string): number | null {
    try {
      const rawValue = globalThis.localStorage?.getItem(SITE_STORAGE_KEY);

      if (!rawValue) {
        return null;
      }

      const cachedSiteIds = JSON.parse(rawValue) as Record<string, number>;
      const cachedSiteId = cachedSiteIds[cacheKey];

      return typeof cachedSiteId === 'number' && Number.isFinite(cachedSiteId) ? cachedSiteId : null;
    } catch {
      return null;
    }
  }

  private writeCachedSiteId(cacheKey: string, siteId: number): void {
    try {
      const rawValue = globalThis.localStorage?.getItem(SITE_STORAGE_KEY);
      const cachedSiteIds = rawValue ? (JSON.parse(rawValue) as Record<string, number>) : {};

      cachedSiteIds[cacheKey] = siteId;
      globalThis.localStorage?.setItem(SITE_STORAGE_KEY, JSON.stringify(cachedSiteIds));
    } catch {
      return;
    }
  }

  private clearCachedReferences(): void {
    try {
      globalThis.localStorage?.removeItem(SOCIETY_STORAGE_KEY);
      globalThis.localStorage?.removeItem(SITE_STORAGE_KEY);
    } catch {
      return;
    }
  }
}
