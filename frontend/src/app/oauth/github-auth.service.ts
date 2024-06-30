import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ConnectionStatus {
  isConnected: boolean;
  username?: string;
  connectionDate: string | null;
}

@Injectable({providedIn: 'root'})
export class GithubAuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/github';

  // A full-page navigation: the API answers with a redirect to GitHub's consent screen.
  connect(): void {
    window.location.assign(`${this.apiUrl}/connect`);
  }

  getStatus(): Observable<ConnectionStatus> {
    return this.http.get<ConnectionStatus>(`${this.apiUrl}/status`, {withCredentials: true});
  }

  signOut(): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/logout`, null, {withCredentials: true});
  }

  removeIntegration(): Observable<{isConnected: false}> {
    return this.http.delete<{isConnected: false}>(`${this.apiUrl}/remove`, {withCredentials: true});
  }
}
