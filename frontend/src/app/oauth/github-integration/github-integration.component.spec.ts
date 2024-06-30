import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { GithubAuthService } from '../github-auth.service';
import { CALLBACK_ERRORS, GithubIntegrationComponent } from './github-integration.component';

const LINKED = {isConnected: true, username: 'demo-linker', connectionDate: '2026-11-09T08:15:00.000Z'};

describe('GithubIntegrationComponent', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;

  async function open(url = '/github-integration') {
    harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(url, GithubIntegrationComponent);
    http = TestBed.inject(HttpTestingController);
    return component;
  }
  const text = () => (harness.routeNativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
  const button = (label: string) =>
    [...(harness.routeNativeElement as HTMLElement).querySelectorAll('button')].find(b => b.textContent?.includes(label));
  const answerStatus = (body: object | null, init?: {status: number; statusText: string}) => {
    http.expectOne('/api/github/status').flush(body, init);
    harness.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()]});
  });

  afterEach(() => http.verify());

  it('shows a loading state until the status arrives', async () => {
    const component = await open();
    expect(component.view()).toBe('loading');
    expect(text()).toContain('Checking this browser');
    answerStatus(null, {status: 401, statusText: 'Unauthorized'});
    expect(component.view()).toBe('disconnected');
    expect(text()).toContain('Not linked');
    expect(text()).not.toContain('did not answer');
    expect(button('Connect GitHub')).toBeTruthy();
  });

  it('names the linked login and formats the link date', async () => {
    await open();
    answerStatus(LINKED);
    expect(text()).toContain('@demo-linker');
    expect(text()).toContain('Linked');
    expect(text()).toMatch(/9 Nov 2026, \d\d:\d\d/);
    expect(button('Sign out')).toBeTruthy();
    expect(button('Revoke and remove')).toBeTruthy();
  });

  it('treats a server error as unknown and lets the user retry', async () => {
    const component = await open();
    answerStatus({message: 'Request failed'}, {status: 500, statusText: 'Server Error'});
    expect(component.view()).toBe('unreachable');
    expect(text()).toContain('did not answer');
    button('Try again')!.click();
    answerStatus(LINKED);
    expect(component.view()).toBe('connected');
  });

  it('explains a callback error and removes it from the address bar', async () => {
    const component = await open('/github-integration?error=access_denied');
    answerStatus(null, {status: 401, statusText: 'Unauthorized'});
    await harness.fixture.whenStable();
    expect(component.error()).toBe(CALLBACK_ERRORS['access_denied']);
    expect(text()).toContain('cancelled');
    expect(TestBed.inject(Router).url).toBe('/github-integration');
  });

  it('falls back to a generic message for an unknown error code', async () => {
    const component = await open('/github-integration?error=something_else');
    answerStatus(null, {status: 401, statusText: 'Unauthorized'});
    expect(component.error()).toBe(CALLBACK_ERRORS['oauth_failed']);
  });

  it('starts the OAuth redirect through the service', async () => {
    const connect = vi.spyOn(TestBed.inject(GithubAuthService), 'connect').mockImplementation(() => undefined);
    await open();
    answerStatus(null, {status: 401, statusText: 'Unauthorized'});
    button('Connect GitHub')!.click();
    expect(connect).toHaveBeenCalledOnce();
  });

  it('returns to the not-linked view after a confirmed revoke', async () => {
    const component = await open();
    answerStatus(LINKED);
    button('Revoke and remove')!.click();
    harness.detectChanges();
    expect(button('Revoking')?.disabled).toBe(true);
    http.expectOne({method: 'DELETE', url: '/api/github/remove'}).flush({isConnected: false});
    harness.detectChanges();
    expect(component.view()).toBe('disconnected');
    expect(component.username()).toBeNull();
  });

  it('keeps the link and shows an alert when revocation fails', async () => {
    const component = await open();
    answerStatus(LINKED);
    button('Revoke and remove')!.click();
    http.expectOne('/api/github/remove').flush({message: 'Failed'}, {status: 502, statusText: 'Bad Gateway'});
    harness.detectChanges();
    expect(component.view()).toBe('connected');
    expect((harness.routeNativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('link was kept');
    expect(button('Revoke and remove')?.disabled).toBe(false);
  });

  it('signs out without revoking', async () => {
    const component = await open();
    answerStatus(LINKED);
    button('Sign out')!.click();
    http.expectOne({method: 'POST', url: '/api/github/logout'}).flush(null, {status: 204, statusText: 'No Content'});
    http.expectNone('/api/github/remove');
    harness.detectChanges();
    expect(component.view()).toBe('disconnected');
  });

  it('discards an access token left by the old localStorage flow', async () => {
    localStorage.setItem('accessToken', 'legacy-fixture');
    await open();
    answerStatus(null, {status: 401, statusText: 'Unauthorized'});
    expect(localStorage.getItem('accessToken')).toBeNull();
  });
});
