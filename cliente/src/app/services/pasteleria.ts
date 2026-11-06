import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';
import { EMPTY, Observable, catchError, map, tap, throwError } from 'rxjs';

/* ---------- Tipos de datos (coinciden con el JSON de server.js) ---------- */
export interface Usuario {
  id?: number;
  username: string;
  name: string;
  role: string;            // 'Administrador' | 'Encargado de Ventas'
  password?: string;
  estado?: number;         // 1 = activo, 0 = inactivo (eliminación lógica)
}

export interface Producto {
  id?: number;
  name: string;
  category: string;        // 'Tortas' | 'Individuales' | 'Salados'
  price: number;
  stock: number;
  image: string;
  estado?: number;         // 1 = activo, 0 = inactivo (eliminación lógica)
}

export interface ItemVenta {
  id: number;
  name: string;
  price: number;
  qty: number;
  total: number;
}

export interface Venta {
  codigo: number;
  id: string;              // número de comprobante: B001-000101
  docType: string;         // 'Boleta' | 'Factura'
  date: string;
  customer: string;
  user: string;
  items: ItemVenta[];
  subtotal: number;
  igv: number;
  total: number;
  paid: number;
  change: number;
  estado: number;          // 1 = vigente, 0 = anulada (eliminación lógica)
}

// Datos que se pueden corregir de una venta
export interface CorreccionVenta {
  docType: string;
  customer: string;
  items: { id: number; qty: number }[];
}

// El vendedor lo toma el servidor de la sesión, por eso ya no se envía
export interface NuevaVenta {
  docType: string;
  customer: string;
  paid: number;
  items: { id: number; qty: number }[];
}

export interface MesResumen {
  mes: string;
  cantidadVentas: number;
  montoTotal: number;
}

export interface Toast {
  id: number;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

/* ---------- Política de contraseña (misma que valida el servidor) ---------- */
export interface ReglaPassword {
  texto: string;
  cumple: boolean;
}

export function evaluarPassword(clave: string): ReglaPassword[] {
  const v = clave ?? '';
  return [
    { texto: 'Mínimo 8 caracteres', cumple: v.length >= 8 },
    { texto: 'Una letra minúscula', cumple: /[a-z]/.test(v) },
    { texto: 'Una letra mayúscula', cumple: /[A-Z]/.test(v) },
    { texto: 'Un dígito', cumple: /\d/.test(v) },
    { texto: 'Un símbolo especial', cumple: /[^A-Za-z0-9\s]/.test(v) }
  ];
}

@Injectable({
  providedIn: 'root'
})
export class Pasteleria {
  private http = inject(HttpClient);
  private router = inject(Router);
  private apiUrl = 'http://localhost:3000/api';

  /* ---------- Sesión ---------- */
  private token = signal<string>(this.leerStorage('pjl_token'));
  usuario = signal<Usuario | null>(this.leerUsuario());
  esAdmin = computed(() => this.usuario()?.role === 'Administrador');

  private leerStorage(clave: string): string {
    try {
      return sessionStorage.getItem(clave) ?? '';
    } catch {
      return '';
    }
  }

  private leerUsuario(): Usuario | null {
    if (!this.token()) return null;
    try {
      const guardado = this.leerStorage('pjl_usuario');
      return guardado ? JSON.parse(guardado) : null;
    } catch {
      return null;
    }
  }

  login(username: string, password: string): Observable<Usuario> {
    return this.http
      .post<{ token: string; usuario: Usuario }>(`${this.apiUrl}/login`, { username, password })
      .pipe(
        tap(r => {
          this.token.set(r.token);
          this.usuario.set(r.usuario);
          sessionStorage.setItem('pjl_token', r.token);
          sessionStorage.setItem('pjl_usuario', JSON.stringify(r.usuario));
        }),
        map(r => r.usuario)
      );
  }

  logout(): void {
    // Avisa al servidor para cerrar la sesión (si falla, igual se cierra aquí)
    if (this.token()) {
      this.http.post(`${this.apiUrl}/logout`, {}, this.opts()).subscribe({ error: () => {} });
    }
    this.limpiarSesion();
  }

  private limpiarSesion(): void {
    this.token.set('');
    this.usuario.set(null);
    this.comprobante.set(null);
    sessionStorage.removeItem('pjl_token');
    sessionStorage.removeItem('pjl_usuario');
  }

  /* Opciones de cada petición: envía el token de la sesión */
  private opts(params?: HttpParams) {
    return {
      headers: new HttpHeaders({ Authorization: `Bearer ${this.token()}` }),
      params
    };
  }

  /* Si el servidor responde 401 (sesión vencida), se cierra la sesión y se vuelve al login */
  private peticion<T>(obs: Observable<T>): Observable<T> {
    return obs.pipe(
      catchError(err => {
        if (err.status === 401 && this.usuario()) {
          this.limpiarSesion();
          this.mostrarToast('Tu sesión expiró. Inicia sesión nuevamente', 'warning');
          this.router.navigate(['/login']);
          return EMPTY;
        }
        return throwError(() => err);
      })
    );
  }

  /* ---------- Productos ---------- */
  // todos = true incluye los inactivos (solo lo permite el servidor al administrador)
  getProductos(todos = false): Observable<Producto[]> {
    const params = todos ? new HttpParams().set('todos', '1') : undefined;
    return this.peticion(this.http.get<Producto[]>(`${this.apiUrl}/productos`, this.opts(params)));
  }

  crearProducto(p: Producto): Observable<Producto> {
    return this.peticion(this.http.post<Producto>(`${this.apiUrl}/productos`, p, this.opts()));
  }

  editarProducto(id: number, p: Producto): Observable<Producto> {
    return this.peticion(this.http.put<Producto>(`${this.apiUrl}/productos/${id}`, p, this.opts()));
  }

  // Eliminación lógica: desactiva (0) o reactiva (1)
  cambiarEstadoProducto(id: number, estado: 0 | 1): Observable<{ id: number; estado: number }> {
    return this.peticion(
      this.http.patch<{ id: number; estado: number }>(`${this.apiUrl}/productos/${id}/estado`, { estado }, this.opts())
    );
  }

  // Eliminación física: borra definitivamente
  eliminarProducto(id: number): Observable<{ message: string }> {
    return this.peticion(this.http.delete<{ message: string }>(`${this.apiUrl}/productos/${id}`, this.opts()));
  }

  /* ---------- Usuarios ---------- */
  getUsuarios(): Observable<Usuario[]> {
    return this.peticion(this.http.get<Usuario[]>(`${this.apiUrl}/usuarios`, this.opts()));
  }

  crearUsuario(u: Usuario): Observable<Usuario> {
    return this.peticion(this.http.post<Usuario>(`${this.apiUrl}/usuarios`, u, this.opts()));
  }

  editarUsuario(id: number, u: Usuario): Observable<Usuario> {
    return this.peticion(this.http.put<Usuario>(`${this.apiUrl}/usuarios/${id}`, u, this.opts()));
  }

  cambiarEstadoUsuario(id: number, estado: 0 | 1): Observable<{ id: number; estado: number }> {
    return this.peticion(
      this.http.patch<{ id: number; estado: number }>(`${this.apiUrl}/usuarios/${id}/estado`, { estado }, this.opts())
    );
  }

  eliminarUsuario(id: number): Observable<{ message: string }> {
    return this.peticion(this.http.delete<{ message: string }>(`${this.apiUrl}/usuarios/${id}`, this.opts()));
  }

  /* ---------- Ventas ---------- */
  getVentas(fecha = '', texto = ''): Observable<Venta[]> {
    let params = new HttpParams();
    if (fecha) params = params.set('fecha', fecha);
    if (texto) params = params.set('texto', texto);
    return this.peticion(this.http.get<Venta[]>(`${this.apiUrl}/ventas`, this.opts(params)));
  }

  getVenta(codigo: number): Observable<Venta> {
    return this.peticion(this.http.get<Venta>(`${this.apiUrl}/ventas/${codigo}`, this.opts()));
  }

  registrarVenta(venta: NuevaVenta): Observable<Venta> {
    return this.peticion(this.http.post<Venta>(`${this.apiUrl}/ventas`, venta, this.opts()));
  }

  // Actualizar: corrige cliente, tipo de comprobante y cantidades
  actualizarVenta(codigo: number, datos: CorreccionVenta): Observable<Venta> {
    return this.peticion(this.http.put<Venta>(`${this.apiUrl}/ventas/${codigo}`, datos, this.opts()));
  }

  // Eliminación lógica: anula la venta y devuelve el stock
  anularVenta(codigo: number): Observable<{ codigo: number; estado: number }> {
    return this.peticion(
      this.http.patch<{ codigo: number; estado: number }>(`${this.apiUrl}/ventas/${codigo}/anular`, {}, this.opts())
    );
  }

  // Eliminación física (solo administrador): borra una venta ya anulada
  eliminarVenta(codigo: number): Observable<{ message: string }> {
    return this.peticion(this.http.delete<{ message: string }>(`${this.apiUrl}/ventas/${codigo}`, this.opts()));
  }

  getResumenMensual(): Observable<MesResumen[]> {
    return this.peticion(this.http.get<MesResumen[]>(`${this.apiUrl}/ventas-resumen/mensual`, this.opts()));
  }

  /* ---------- Comprobante (modal global, se muestra desde app.html) ---------- */
  comprobante = signal<Venta | null>(null);

  verComprobante(venta: Venta): void {
    this.comprobante.set(venta);
  }

  cerrarComprobante(): void {
    this.comprobante.set(null);
  }

  /* ---------- Notificaciones (toast) ---------- */
  toasts = signal<Toast[]>([]);
  private siguienteToast = 1;

  mostrarToast(message: string, type: Toast['type'] = 'info'): void {
    const toast: Toast = { id: this.siguienteToast++, message, type };
    this.toasts.update(lista => [...lista, toast]);
    setTimeout(() => {
      this.toasts.update(lista => lista.filter(t => t.id !== toast.id));
    }, 3000);
  }
}