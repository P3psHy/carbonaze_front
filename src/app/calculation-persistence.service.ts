import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, switchMap, tap, throwError } from 'rxjs';

import { AuthService } from './auth.service';
import { environment } from '../environment/environment';
import { SiteImpactResult, SiteInputPayload } from './site-impact.models';

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

interface CreateBilanResponse {
  id: number;
  totalCo2: number;
  calculationDate: string;
}

export interface ApiBilanRecord {
  id: number;
  electricityKwhYear?: number;
  gasKwhYear?: number;
  siteId?: number;
  totalCo2?: number;
  calculationDate?: string;
  site?: {
    id?: number;
    name?: string;
    city?: string;
    numberEmployee?: number;
    parkingPlaces?: number;
    numberPc?: number;
    societyId?: number;
  };
}

export interface ApiSiteComparisonRecord {
  id: number;
  name: string;
  city: string;
  numberEmployee: number;
  parkingPlaces: number;
  numberPc: number;
  createdAt: string;
  societyId: number;
  latestBilanId?: number;
  latestCalculationDate?: string;
  latestTotalCo2?: number;
  latestElectricityKwhYear?: number;
  latestGasKwhYear?: number;
}

export interface SavedCalculationRecord {
  bilanId: number;
  siteId: number;
  siteName: string;
  totalCo2: number;
  calculationDate: string;
}

export interface LoadedBilanDraft {
  bilanId: number;
  siteId?: number;
  siteName: string;
  city: string;
  energyMwh: number | null;
  gasMwh: number | null;
  employees?: number | null;
  parkingSpaces?: number | null;
  computers?: number | null;
  totalCo2: number | null;
  calculationDate: string;
}

const API_BASE_URL = environment.apiUrl;
const SITE_STORAGE_KEY = 'carbonaze.backend.sites';
const HISTORY_STORAGE_KEY = 'carbonaze.backend.calculation-history';
const MAX_HISTORY_ENTRIES = 50;

@Injectable({ providedIn: 'root' })
export class CalculationPersistenceService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  saveCalculation(
    payload: SiteInputPayload,
    result: SiteImpactResult,
  ): Observable<SavedCalculationRecord> {
    return this.saveCalculationInternal(payload, result).pipe(
      tap((savedRecord) => {
        this.storeSavedCalculation(savedRecord);
      }),
      catchError((error) => {
        if (!this.shouldResetCache(error)) {
          return throwError(() => error);
        }

        this.clearCachedReferences();
        return this.saveCalculationInternal(payload, result);
      }),
    );
  }

  getAllBilans(): Observable<ApiBilanRecord[]> {
    return this.http.get<ApiBilanRecord[]>(`${API_BASE_URL}/bilans`).pipe(
      map((bilans) => [...bilans].sort((left, right) => this.sortApiBilans(right, left))),
    );
  }

  getBilanById(bilanId: number): Observable<ApiBilanRecord> {
    return this.http.get<ApiBilanRecord>(`${API_BASE_URL}/bilans/${bilanId}`);
  }

  getSiteComparisons(): Observable<ApiSiteComparisonRecord[]> {
    return this.http.get<ApiSiteComparisonRecord[]>(`${API_BASE_URL}/sites/comparison`).pipe(
      map((sites) => [...sites].sort((left, right) => this.sortSiteComparisons(left, right))),
    );
  }

  deleteBilan(bilanId: number): Observable<void> {
    return this.http.delete<void>(`${API_BASE_URL}/bilans/${bilanId}`).pipe(
      tap(() => this.removeSavedCalculation(bilanId)),
    );
  }

  getSavedCalculationsHistory(): SavedCalculationRecord[] {
    try {
      const rawValue = globalThis.localStorage?.getItem(HISTORY_STORAGE_KEY);

      if (!rawValue) {
        return [];
      }

      const parsedValue = JSON.parse(rawValue) as SavedCalculationRecord[];

      if (!Array.isArray(parsedValue)) {
        return [];
      }

      return parsedValue.filter((entry) => this.isSavedCalculationRecord(entry));
    } catch {
      return [];
    }
  }

  private saveCalculationInternal(
    payload: SiteInputPayload,
    result: SiteImpactResult,
  ): Observable<SavedCalculationRecord> {
    return this.getAuthenticatedSocietyId().pipe(
      switchMap((societyId) => this.getOrCreateSite(payload, societyId)),
      switchMap((site) =>
        this.http
          .post<CreateBilanResponse>(
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

  private getAuthenticatedSocietyId(): Observable<number> {
    const societyId = this.authService.getSocietyId();

    if (societyId === null) {
      return throwError(() => new Error("Vous devez etre connecte pour sauvegarder un calcul."));
    }

    return of(societyId);
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
      globalThis.localStorage?.removeItem(SITE_STORAGE_KEY);
    } catch {
      return;
    }
  }

  private storeSavedCalculation(savedRecord: SavedCalculationRecord): void {
    try {
      const history = this.getSavedCalculationsHistory().filter(
        (entry) => entry.bilanId !== savedRecord.bilanId,
      );

      history.unshift(savedRecord);
      this.writeSavedCalculationsHistory(history);
    } catch {
      return;
    }
  }

  private removeSavedCalculation(bilanId: number): void {
    try {
      const history = this.getSavedCalculationsHistory().filter((entry) => entry.bilanId !== bilanId);
      this.writeSavedCalculationsHistory(history);
    } catch {
      return;
    }
  }

  private writeSavedCalculationsHistory(history: SavedCalculationRecord[]): void {
    try {
      globalThis.localStorage?.setItem(
        HISTORY_STORAGE_KEY,
        JSON.stringify(history.slice(0, MAX_HISTORY_ENTRIES)),
      );
    } catch {
      return;
    }
  }

  private sortApiBilans(left: ApiBilanRecord, right: ApiBilanRecord): number {
    const leftDate = left.calculationDate ? new Date(left.calculationDate).getTime() : 0;
    const rightDate = right.calculationDate ? new Date(right.calculationDate).getTime() : 0;
    const dateDifference = leftDate - rightDate;

    if (dateDifference !== 0) {
      return dateDifference;
    }

    return left.id - right.id;
  }

  private sortSiteComparisons(left: ApiSiteComparisonRecord, right: ApiSiteComparisonRecord): number {
    const leftTotal = typeof left.latestTotalCo2 === 'number' ? left.latestTotalCo2 : -1;
    const rightTotal = typeof right.latestTotalCo2 === 'number' ? right.latestTotalCo2 : -1;

    if (leftTotal !== rightTotal) {
      return rightTotal - leftTotal;
    }

    return left.name.localeCompare(right.name, 'fr');
  }

  private isSavedCalculationRecord(value: unknown): value is SavedCalculationRecord {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const entry = value as Partial<SavedCalculationRecord>;

    return (
      typeof entry.bilanId === 'number' &&
      Number.isFinite(entry.bilanId) &&
      typeof entry.siteId === 'number' &&
      Number.isFinite(entry.siteId) &&
      typeof entry.siteName === 'string' &&
      typeof entry.totalCo2 === 'number' &&
      Number.isFinite(entry.totalCo2) &&
      typeof entry.calculationDate === 'string'
    );
  }

}
