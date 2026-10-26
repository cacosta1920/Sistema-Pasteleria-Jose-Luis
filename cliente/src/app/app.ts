import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Pasteleria, Toast } from './services/pasteleria';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  svc = inject(Pasteleria);
  private router = inject(Router);

  menuAbierto = signal(false);

  /* Reloj en vivo */
  private ahora = signal(new Date());
  hora = computed(() =>
    this.ahora().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );
  fecha = computed(() =>
    this.ahora().toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
  );

  constructor() {
    const reloj = setInterval(() => this.ahora.set(new Date()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }

  alternarMenu(): void {
    this.menuAbierto.update(v => !v);
  }

  cerrarMenu(): void {
    this.menuAbierto.set(false);
  }

  cerrarSesion(): void {
    this.svc.logout();
    this.menuAbierto.set(false);
    this.svc.mostrarToast('Sesión cerrada correctamente', 'info');
    this.router.navigate(['/login']);
  }

  imprimir(): void {
    window.print();
  }

  /* Estilo de cada notificación según su tipo */
  claseToast(tipo: Toast['type']): string {
    switch (tipo) {
      case 'success': return 'bg-emerald-600 text-white';
      case 'warning': return 'bg-amber-500 text-white';
      case 'error': return 'bg-red-600 text-white';
      default: return 'bg-slate-800 text-white';
    }
  }

  iconoToast(tipo: Toast['type']): string {
    switch (tipo) {
      case 'success': return 'fa-circle-check';
      case 'warning': return 'fa-triangle-exclamation';
      case 'error': return 'fa-circle-xmark';
      default: return 'fa-circle-info';
    }
  }
}