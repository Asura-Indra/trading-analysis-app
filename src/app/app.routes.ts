import { Route } from '@angular/router';
import { TradingListComponent } from './components/trading-list/trading-list.component';

export const appRoutes: Route[] = [
  {
    path: '',
    component: TradingListComponent
  }
];
