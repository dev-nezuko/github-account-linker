import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  getAuthorizationToken(): string {
    if (isPlatformBrowser(this.platformId)) {
      // Only access localStorage in the browser
      return `Bearer ${localStorage.getItem('accessToken') || ''}`;
    }
    return ''; // Return an empty string or handle SSR scenario
  }
}
