import { Routes } from '@angular/router';
import { Login } from './componentes/login/login';
import { Dashboard } from './componentes/dashboard/dashboard';
import { PuntoVenta } from './componentes/punto-venta/punto-venta';
import { HistorialVentas } from './componentes/historial-ventas/historial-ventas';
import { Gestion } from './componentes/gestion/gestion';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'login', component: Login },
  { path: 'dashboard', component: Dashboard },
  { path: 'punto-venta', component: PuntoVenta },
  { path: 'historial', component: HistorialVentas },
  { path: 'gestion', component: Gestion },
  { path: '**', redirectTo: 'dashboard' }
];