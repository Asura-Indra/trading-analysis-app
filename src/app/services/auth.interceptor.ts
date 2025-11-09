import { HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';

export const withCredentialsInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  // Clone the request and add the withCredentials option
  const modifiedReq = req.clone({
    withCredentials: true
  });

  // Pass the cloned request with the modified options
  return next(modifiedReq);
};