import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

interface Verify2FAResponse {
  status: string;
  data: {
    profile: Record<string, unknown>;
  };
  cookies: {
    enctoken: string;
    public_token: string;
    user_id: string;
    kf_session: string;
    __cf_bm: string;
    _cfuvid: string;
  };
}

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.less'],
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule]
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  twoFAForm: FormGroup;
  show2FA = false;
  loginError = '';
  loading = false;
  userId = '';

  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);


  ngOnInit(): void {
    // Check if already authenticated
    this.authService.isAuthenticated$.subscribe(isAuthenticated => {
      if (isAuthenticated) {
        this.router.navigate(['/dashboard']);
      }
    });

    this.loginForm = this.fb.group({
      userId: ['', [Validators.required]],
      password: ['', [Validators.required]]
    });

    this.twoFAForm = this.fb.group({
      twoFACode: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]]
    });
  }

  onLogin(): void {
    if (this.loginForm.invalid) {
      return;
    }

    this.loading = true;
    this.loginError = '';
    const { userId, password } = this.loginForm.value;
    this.userId = userId;

    this.authService.login(userId, password).subscribe({
      next: (response) => {
        this.show2FA = true;
        this.loading = false;
      },
      error: (error) => {
        console.error('Login failed:', error);
        this.loginError = 'Login failed. Please check your credentials.';
        this.loading = false;
      }
    });
  }

  onVerify2FA(): void {
    if (this.twoFAForm.invalid) {
      return;
    }

    this.loading = true;
    const { twoFACode } = this.twoFAForm.value;

    this.authService.verify2FA(this.userId, twoFACode).subscribe({
      next: (response: unknown) => {
        const res = response as Verify2FAResponse;
        if (res?.cookies?.enctoken) {
          localStorage.setItem('enctoken', res.cookies.enctoken);
          localStorage.setItem('public_token', res.cookies.public_token);
          localStorage.setItem('user_id', res.cookies.user_id);
          this.authService.setAuthState(true);
          this.router.navigate(['/dashboard']);
        } else {
          this.loginError = 'Invalid response from server';
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('2FA verification failed:', error);
        this.loginError = 'Verification failed. Please try again.';
        this.loading = false;
      }
    });
  }
}
