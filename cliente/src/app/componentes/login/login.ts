import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Pasteleria } from '../../services/pasteleria';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login {
  private svc = inject(Pasteleria);
  private router = inject(Router);

  username = '';
  password = '';
  error = signal('');
  cargando = signal(false);
  verPassword = signal(false);   // false = contraseña oculta, true = visible

  alternarPassword(): void {
    this.verPassword.update(v => !v);
  }

  constructor() {
    // Si ya hay sesión iniciada, no se muestra el login
    if (this.svc.usuario()) {
      this.router.navigate(['/dashboard']);
    }
  }

  // Botones de acceso rápido (demo)
  llenar(usuario: string, clave: string): void {
    this.username = usuario;
    this.password = clave;
  }

  ingresar(): void {
    const usuario = this.username.trim();
    if (!usuario || !this.password) {
      this.error.set('Ingresa tu usuario y contraseña.');
      return;
    }

    this.cargando.set(true);
    this.error.set('');

    this.svc.login(usuario, this.password).subscribe({
      next: u => {
        this.cargando.set(false);
        this.svc.mostrarToast(`¡Bienvenido/a, ${u.name}!`, 'success');
        this.router.navigate(['/dashboard']);
      },
      error: err => {
        this.cargando.set(false);
        if (err.status === 401) {
          this.error.set('Usuario o contraseña incorrectos.');
        } else if (err.status === 0) {
          this.error.set('No se pudo conectar con el servidor.');
        } else {
          this.error.set(err.error?.message || 'No se pudo iniciar sesión.');
        }
      }
    });
  }
}