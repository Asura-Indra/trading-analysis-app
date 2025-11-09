import { Routes } from '@angular/router';
import { TradingListComponent } from './components/trading-list/trading-list.component';
import { LoginComponent } from './components/login/login.component';
import { authGuard } from './services/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        component: TradingListComponent
      }
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
