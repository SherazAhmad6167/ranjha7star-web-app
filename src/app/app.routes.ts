import { LogsComponent } from './components/logs/logs.component';
import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { ApplayoutComponent } from './components/applayout/applayout.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { UserDetailsComponent } from './components/user-details/user-details.component';
import { AreaDetailsComponent } from './components/area-details/area-details.component';
import { RecoveryOfficerComponent } from './components/recovery-officer/recovery-officer.component';
import { PackageDetailsComponent } from './components/package-details/package-details.component';
import { AuthGuard } from './shared/auth.guard';
import { PageNotFoundComponent } from './components/page-not-found/page-not-found.component';
import { BillCreatorComponent } from './components/bill-creator/bill-creator.component';
import { UsersCollectionsComponent } from './components/users-collections/users-collections.component';
import { DefaulterUsersComponent } from './components/defaulter-users/defaulter-users.component';
import { CompanyDetailsComponent } from './components/company-details/company-details.component';
import { WebsiteDetailsComponent } from './components/website-details/website-details.component';
import { RoReportComponent } from './components/ro-report/ro-report.component';
import { SettingsComponent } from './components/settings/settings.component';
import { ExpensesComponent } from './components/expenses/expenses.component';
import { NewConnectionComponent } from './components/new-connection/new-connection.component';
import { CityDetailsComponent } from './components/city-details/city-details.component';
import { CustomerStatusComponent } from './components/customer-status/customer-status.component';
import { DocsComponent } from './components/docs/docs.component';
import { RecoveryDetailsComponent } from './components/recovery-details/recovery-details.component';
import { SubAreaDetailsComponent } from './components/sub-area-details/sub-area-details.component';
import { OperatorDetailsComponent } from './components/operator-details/operator-details.component';
import { BorrowAmountComponent } from './components/borrow-amount/borrow-amount.component';
import { PayableDetailsComponent } from './components/payable-details/payable-details.component';
import { StockDetailsComponent } from './components/stock-details/stock-details.component';
import { ComplainDetailsComponent } from './components/complain-details/complain-details.component';
import { MaterialDetailsComponent } from './components/material-details/material-details.component';
import { MikrotikUsersComponent } from './components/mikrotik-users/mikrotik-users.component';
import { SmsComponent } from './components/sms/sms.component';
import { RouterComponent } from './components/router/router.component';
import { ZalSubscribersComponent } from './components/zal-subscribers/zal-subscribers.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  {
    path: '',
    component: ApplayoutComponent,
    canActivate: [AuthGuard],
    canActivateChild: [AuthGuard],
    children: [
      { path: 'dashboard', data: { roles: ['admin'] }, component: DashboardComponent },
      { path: 'user-details', data: { roles: ['operator', 'admin'] }, component: UserDetailsComponent },
      { path: 'area-details', data: { roles: ['admin'] }, component: AreaDetailsComponent },
      { path: 'sub-area-details', data: { roles: ['admin'] }, component: SubAreaDetailsComponent },
      { path: 'recovery-officer', data: { roles: ['admin'] }, component: RecoveryOfficerComponent },
      { path: 'package-details', data: { roles: ['admin'] }, component: PackageDetailsComponent },
      { path: 'bill-creator', data: { roles: ['admin'] }, component: BillCreatorComponent },
      { path: 'user-collections', data: { roles: ['admin', 'operator'] }, component: UsersCollectionsComponent },
      { path: 'logs', data: { roles: ['admin'] }, component: LogsComponent },
      { path: 'defaulter-users', data: { roles: ['admin'] }, component: DefaulterUsersComponent },
      { path: 'company-detail', data: { roles: ['admin'] }, component: CompanyDetailsComponent },
      { path: 'website-detail', data: { roles: ['admin'] }, component: WebsiteDetailsComponent },
      { path: 'ro-reports', data: { roles: ['admin'] }, component: RoReportComponent },
      { path: 'settings', data: { roles: ['admin', 'operator'] }, component: SettingsComponent },
      { path: 'expenses', data: { roles: ['admin'] }, component: ExpensesComponent },
      { path: 'new-connection', data: { roles: ['admin', 'operator'] }, component: NewConnectionComponent },
      { path: 'customer-status', data: { roles: ['admin'] }, component: CustomerStatusComponent },
      { path: 'city-details', data: { roles: ['admin'] }, component: CityDetailsComponent },
      { path: 'upload-docs', data: { roles: ['admin']}, component: DocsComponent},
      { path: 'recovery-details', data: { roles: ['admin', 'operator']}, component: RecoveryDetailsComponent},
      { path:'operator-details', data: { roles: ['admin']}, component: OperatorDetailsComponent},
      { path: 'borrow-details', data: { roles: ['admin']}, component: BorrowAmountComponent},
      { path: 'payable-details', data: { roles: ['admin']}, component: PayableDetailsComponent},
      { path: 'stock-details', data: { roles: ['admin']}, component: StockDetailsComponent},
      { path: 'complain-details', data: { roles: ['admin']}, component: ComplainDetailsComponent},
      { path: 'material-details', data: { roles: ['admin']}, component: MaterialDetailsComponent},
      { path: 'mikrotik-users', data: { roles: ['admin'] }, component: MikrotikUsersComponent },
      { path: 'sms', data: { roles: ['admin'] }, component: SmsComponent },
      { path: 'router-details', data: { roles: ['admin'] }, component: RouterComponent },
      { path: 'zal-subscribers', data: { roles: ['admin'] }, component: ZalSubscribersComponent },
    ],
  },
  { path: 'not-found', component: PageNotFoundComponent },
{ path: '**', redirectTo: 'not-found' },
];
