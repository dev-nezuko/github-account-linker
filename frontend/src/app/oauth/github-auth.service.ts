import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ConnectionStatus {
  isConnected: boolean;
  username?: string;
  connectionDate: string | null;
}

@Injectable({providedIn: 'root'})
export class GithubAuthService {
  private apiUrl = '/api/github';
  constructor(private http: HttpClient) {}
  connect(): void {window.location.href = `${this.apiUrl}/connect`;}
  getStatus(): Observable<ConnectionStatus> {
    return this.http.get<ConnectionStatus>(`${this.apiUrl}/status`, {withCredentials: true});
  }
  signOut(): Observable<void> {return this.http.post<void>(`${this.apiUrl}/logout`, null, {withCredentials: true});}
  removeIntegration(): Observable<void> {return this.http.delete<void>(`${this.apiUrl}/remove`, {withCredentials: true});}
}
