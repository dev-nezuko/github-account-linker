import { Component, Inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { GithubAuthService } from '../github-auth.service';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { isPlatformBrowser, NgIf } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-github-integration',
  templateUrl: './github-integration.component.html',
  styleUrls: ['./github-integration.component.css'],
  standalone: true,
  imports: [MatIconModule, MatButtonModule, MatCardModule, MatExpansionModule, NgIf],
})
export class GithubIntegrationComponent implements OnInit {
  isConnected: boolean = false;
  connectionDate: string | null = null;
  readonly panelOpenState = signal(false);

  constructor(
    private githubAuthService: GithubAuthService,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: any
  ) {}

  ngOnInit(): void {
    if (window.location.search) {
      const token = window.location.search.split('=')[1];
      if (token) {
        if (isPlatformBrowser(this.platformId)) {
          localStorage.setItem('accessToken', token);
          this.removeTokenFromUrl();
        }
      }
    }
    this.githubAuthService.getStatus().subscribe((status) => {
      this.isConnected = status.isConnected;
      this.connectionDate = status.connectionDate;
    });
  }

  private removeTokenFromUrl(): void {
    const urlTree = this.router.createUrlTree([], {
      queryParams: { token: null },
      queryParamsHandling: 'merge',
    });
    this.router.navigateByUrl(urlTree);
  }

  connect(): void {
    this.githubAuthService.connect();
  }

  removeIntegration(): void {
    this.githubAuthService.removeIntegration().subscribe(() => {
      this.isConnected = false;
      this.connectionDate = null;
    });

    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('accessToken');
    }
  }
}
