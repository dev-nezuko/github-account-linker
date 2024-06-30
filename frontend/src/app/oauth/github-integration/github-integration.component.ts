import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { ConnectionStatus, GithubAuthService } from '../github-auth.service';

export type ConnectionView = 'loading' | 'disconnected' | 'connected' | 'unreachable';

export const CALLBACK_ERRORS: Record<string, string> = {
  access_denied: 'GitHub authorization was cancelled. Nothing was linked.',
  invalid_state: 'That sign-in attempt expired or did not start here. Start connecting again.',
  invalid_callback: 'GitHub sent an incomplete response. Start connecting again.',
  oauth_failed: 'GitHub authorization failed. Try connecting again.',
};

@Component({
  selector: 'app-github-integration',
  templateUrl: './github-integration.component.html',
  styleUrls: ['./github-integration.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
})
export class GithubIntegrationComponent implements OnInit {
  private readonly auth = inject(GithubAuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly view = signal<ConnectionView>('loading');
  readonly username = signal<string | null>(null);
  readonly connectedAt = signal<string | null>(null);
  readonly pending = signal<'remove' | 'signout' | null>(null);
  readonly error = signal('');
  readonly initial = computed(() => (this.username() ?? '?').charAt(0).toUpperCase());

  ngOnInit(): void {
    // Tokens from the old URL/localStorage flow are discarded without being read.
    localStorage.removeItem('accessToken');
    const callbackError = this.route.snapshot.queryParamMap.get('error');
    if (callbackError) {
      this.error.set(CALLBACK_ERRORS[callbackError] ?? CALLBACK_ERRORS['oauth_failed']);
      void this.router.navigate([], {queryParams: {}, replaceUrl: true});
    }
    this.refresh();
  }

  refresh(): void {
    this.view.set('loading');
    this.auth.getStatus().subscribe({
      next: status => this.show(status),
      error: (failure: HttpErrorResponse) => {
        if (failure.status === 401) this.show(null);
        else this.view.set('unreachable');
      },
    });
  }

  connect(): void {
    this.auth.connect();
  }

  signOut(): void {
    this.run('signout', this.auth.signOut(), 'Could not sign out. Please try again.');
  }

  removeIntegration(): void {
    this.run('remove', this.auth.removeIntegration(), 'Could not revoke the connection. GitHub did not confirm it, so the link was kept.');
  }

  private run(action: 'remove' | 'signout', request: Observable<unknown>, failure: string): void {
    this.pending.set(action);
    this.error.set('');
    request.subscribe({
      next: () => {
        this.pending.set(null);
        this.show(null);
      },
      error: () => {
        this.pending.set(null);
        this.error.set(failure);
      },
    });
  }

  private show(status: ConnectionStatus | null): void {
    const linked = Boolean(status?.isConnected);
    this.username.set(linked ? (status?.username ?? null) : null);
    this.connectedAt.set(linked ? (status?.connectionDate ?? null) : null);
    this.view.set(linked ? 'connected' : 'disconnected');
  }
}
