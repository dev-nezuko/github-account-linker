import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { GithubAuthService } from '../github-auth.service';

const CALLBACK_ERRORS: Record<string, string> = {
  access_denied: 'GitHub authorization was cancelled. Nothing was linked.',
  invalid_state: 'That sign-in attempt expired or did not start here. Start connecting again.',
};

@Component({
  selector: 'app-github-integration',
  templateUrl: './github-integration.component.html',
  styleUrls: ['./github-integration.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class GithubIntegrationComponent implements OnInit {
  isConnected = false;
  connectionDate: string | null = null;
  username: string | null = null;
  error = '';
  loading = false;
  constructor(private githubAuthService: GithubAuthService) {}
  ngOnInit(): void {
    // Discard credentials from the former URL/localStorage flow without reading or reusing them.
    localStorage.removeItem('accessToken');
    const url = new URL(window.location.href);
    const callbackError = url.searchParams.get('error');
    if (callbackError) this.error = CALLBACK_ERRORS[callbackError] ?? 'GitHub authorization failed. Try connecting again.';
    if (url.search) window.history.replaceState(null, '', url.pathname);
    this.githubAuthService.getStatus().subscribe({next: status => {this.isConnected = status.isConnected;this.username = status.username ?? null;this.connectionDate = status.connectionDate;}, error: failure => {if (failure.status !== 401) this.error = 'Could not reach the local API. Check that it is running.';}});
  }
  connect(): void {this.githubAuthService.connect();}
  removeIntegration(): void {
    this.loading = true;this.error = '';
    this.githubAuthService.removeIntegration().subscribe({next: () => this.clearConnection(), error: () => {this.loading = false;this.error = 'Could not revoke the connection. Please try again.';}});
  }
  signOut(): void {
    this.loading = true;this.error = '';
    this.githubAuthService.signOut().subscribe({next: () => this.clearConnection(), error: () => {this.loading = false;this.error = 'Could not sign out. Please try again.';}});
  }
  private clearConnection(): void {
    this.isConnected = false;this.username = null;this.connectionDate = null;this.loading = false;
  }
}
