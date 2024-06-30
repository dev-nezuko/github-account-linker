import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GithubAuthService } from './github-auth.service';

describe('GithubAuthService', () => {
  let service: GithubAuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({providers: [provideHttpClient(), provideHttpClientTesting()]});
    service = TestBed.inject(GithubAuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the status from the same-origin API with the session cookie', () => {
    let linked: boolean | undefined;
    service.getStatus().subscribe(status => (linked = status.isConnected));
    const request = http.expectOne('/api/github/status');
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    request.flush({isConnected: true, username: 'demo-linker', connectionDate: '2026-11-09T08:00:00.000Z'});
    expect(linked).toBe(true);
  });

  it('signs out with a POST and revokes with a DELETE', () => {
    service.signOut().subscribe();
    service.removeIntegration().subscribe();
    const signOut = http.expectOne('/api/github/logout');
    expect(signOut.request.method).toBe('POST');
    expect(signOut.request.withCredentials).toBe(true);
    const remove = http.expectOne('/api/github/remove');
    expect(remove.request.method).toBe('DELETE');
    expect(remove.request.withCredentials).toBe(true);
    signOut.flush(null, {status: 204, statusText: 'No Content'});
    remove.flush({isConnected: false});
  });
});
