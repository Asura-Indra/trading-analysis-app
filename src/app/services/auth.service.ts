import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly PROXY_URL = 'http://localhost:3001/api/proxy';
  private _isAuthenticated = new BehaviorSubject<boolean>(false);
  private authState = new BehaviorSubject<{isAuthenticated: boolean}>({ isAuthenticated: false });
  private requestId = '';
  
  get isAuthenticated$() {
    return this._isAuthenticated.asObservable();
  }
  http = inject(HttpClient);
  constructor() {
    // Check if already authenticated
    const enctoken = localStorage.getItem('enctoken');
    if (enctoken) {
      this._isAuthenticated.next(true);
      this.authState.next({ isAuthenticated: true });
    }
  }

  login(userId: string, password: string): Observable<{ data: { request_id: string; status: string } }> {
    return this.http.post<{ data: { request_id: string; status: string } }>(
      `${this.PROXY_URL}/login`, 
      { userId, password }, 
      {
        withCredentials: true // Important for cookies
      }
    ).pipe(
      tap((response) => {
        if (response?.data?.request_id) {
          this.requestId = response.data.request_id;
        }
      }),
      catchError(error => this.handleError('Login failed', error))
    );
  }

  verify2FA(userId: string, twoFACode: string): Observable<any> {
    return this.http.post(
      `${this.PROXY_URL}/verify-2fa`,
      { userId, requestId: this.requestId, twoFACode },
      { 
        withCredentials: true
      }
    ).pipe(
      tap((response: any) => {
        if (response?.cookies?.enctoken) {
          this._isAuthenticated.next(true);
          this.authState.next({ isAuthenticated: true });
        }
      }),
      tap((response) => {
        if (response?.data?.enctoken) {
          localStorage.setItem('__storejs_kite_enctoken', response.data.enctoken);
          this._isAuthenticated.next(true);
        }
      }),
      catchError(error => this.handleError('2FA verification failed', error))
    );
  }

  private handleError(message: string, error: any) {
    console.error(message, error);
    return throwError(() => new Error(message));
  }

  setAuthState(isAuthenticated: boolean): void {
    this._isAuthenticated.next(isAuthenticated);
    this.authState.next({ isAuthenticated });
  }

  getAuthState() {
    return this.authState.asObservable();
  }

  logout() {
    // Clear all stored tokens
    localStorage.removeItem('__storejs_kite_enctoken');
    this.setAuthState(false);
    // You might want to add a call to your proxy's logout endpoint if needed
  }
}
