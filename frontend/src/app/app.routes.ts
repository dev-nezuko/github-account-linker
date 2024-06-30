import { Routes } from '@angular/router';
import { GithubIntegrationComponent } from './oauth/github-integration/github-integration.component';

export const routes: Routes = [
  { path: '', redirectTo: '/github-integration', pathMatch: 'full' },
  { path: 'github-integration', component: GithubIntegrationComponent }
];
