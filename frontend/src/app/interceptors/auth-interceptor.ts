import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpHandler, HttpRequest } from '@angular/common/http';
import { AuthService } from '../auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private auth: AuthService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler) {
    const authToken = this.auth.getAuthorizationToken();

    // Only add Authorization header if the token is not empty
    const authReq = authToken
      ? req.clone({
          headers: req.headers.set('Authorization', authToken),
        })
      : req;

    return next.handle(authReq);
  }
}
