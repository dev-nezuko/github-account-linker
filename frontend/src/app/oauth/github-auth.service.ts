import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root',
})
export class GithubAuthService {
  private apiUrl = 'http://localhost:3000/api/github';

  constructor(private http: HttpClient, @Inject(PLATFORM_ID) private platformId: Object) {}

  private getAuthorizationHeader(): HttpHeaders {
    let headers = new HttpHeaders();

    if (isPlatformBrowser(this.platformId)) {
      const token = localStorage.getItem('accessToken') || '';
      headers = headers.set('Authorization', token);
    }

    return headers;
  }

  connect(): void {
    window.location.href = `${this.apiUrl}/connect`;
  }

  getStatus(): Observable<{ isConnected: boolean; connectionDate: string | null }> {
    const headers = this.getAuthorizationHeader();
    return this.http.get<{ isConnected: boolean; connectionDate: string | null }>(`${this.apiUrl}/status`, { headers });
  }

  removeIntegration(): Observable<void> {
    const headers = this.getAuthorizationHeader();
    return this.http.delete<void>(`${this.apiUrl}/remove`, { headers });
  }
}
