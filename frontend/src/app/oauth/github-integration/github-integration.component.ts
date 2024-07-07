import { Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { GithubAuthService } from '../github-auth.service';
import { MatButtonModule } from '@angular/material/button';
import { isPlatformBrowser, NgIf } from '@angular/common';
@Component({selector: 'app-github-integration', templateUrl: './github-integration.component.html', styleUrls: ['./github-integration.component.css'], standalone: true, imports: [MatButtonModule, NgIf]})
export class GithubIntegrationComponent implements OnInit {
  isConnected = false;
  connectionDate: string | null = null;
  error = '';
  loading = false;
  constructor(private githubAuthService: GithubAuthService, @Inject(PLATFORM_ID) private platformId: Object) {}
  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    // Discard credentials from the former URL/localStorage flow without reading or reusing them.
    localStorage.removeItem('accessToken');
    const url = new URL(window.location.href);
    if (url.searchParams.has('error')) this.error = 'GitHub authorization failed. Try connecting again.';
    if (url.search) window.history.replaceState(null, '', url.pathname);
    this.githubAuthService.getStatus().subscribe({next: status => {this.isConnected = status.isConnected;this.connectionDate = status.connectionDate;}, error: failure => {if (failure.status !== 401) this.error = 'Could not reach the local API. Check that it is running.';}});
  }
  connect(): void {this.githubAuthService.connect();}
  removeIntegration(): void {
    this.loading = true;this.error = '';
    this.githubAuthService.removeIntegration().subscribe({next: () => {this.isConnected = false;this.connectionDate = null;this.loading = false;}, error: () => {this.loading = false;this.error = 'Could not revoke the connection. Please try again.';}});
  }
}
