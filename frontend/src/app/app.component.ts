import { Component } from '@angular/core';
import { GithubIntegrationComponent } from './oauth/github-integration/github-integration.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: true,
  imports: [GithubIntegrationComponent],
})
export class AppComponent {}
