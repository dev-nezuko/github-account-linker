import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
@Injectable({providedIn: 'root'})
export class GithubAuthService {
  private apiUrl = 'http://localhost:3000/api/github';
  constructor(private http: HttpClient) {}
  connect(): void {window.location.href = `${this.apiUrl}/connect`;}
  getStatus(): Observable<{isConnected: boolean; connectionDate: string | null}> {
    return this.http.get<{isConnected: boolean; connectionDate: string | null}>(`${this.apiUrl}/status`, {withCredentials: true});
  }
  removeIntegration(): Observable<void> {return this.http.delete<void>(`${this.apiUrl}/remove`, {withCredentials: true});}
}
