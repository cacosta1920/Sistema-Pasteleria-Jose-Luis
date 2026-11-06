import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Pasteleria, Producto, Usuario, evaluarPassword } from '../../services/pasteleria';

interface FormProducto {
  id?: number;
  name: string;
  category: string;
  price: number | null;
  stock: number | null;
  image: string;
}

interface FormUsuario {
  id?: number;
  username: string;
  name: string;
  password: string;
  role: string;
}

@Component({
  selector: 'app-gestion',
  imports: [FormsModule],
  templateUrl: './gestion.html',
  styleUrl: './gestion.css'
})
export class Gestion {
  private svc = inject(Pasteleria);
  private router = inject(Router);

  /* Listas completas (activos e inactivos) y filtros de visualización */
  productos = signal<Producto[]>([]);
  usuarios = signal<Usuario[]>([]);
  verProductosInactivos = signal(false);
  verUsuariosInactivos = signal(false);

  productosVisibles = computed(() =>
    this.productos().filter(p => this.verProductosInactivos() || p.estado !== 0)
  );
  usuariosVisibles = computed(() =>
    this.usuarios().filter(u => this.verUsuariosInactivos() || u.estado !== 0)
  );
  productosInactivos = computed(() => this.productos().filter(p => p.estado === 0).length);
  usuariosInactivos = computed(() => this.usuarios().filter(u => u.estado === 0).length); 

  modalProducto = signal(false);
  modalUsuario = signal(false);
  guardando = signal(false);
  verPassword = signal(false);   // false = contraseña oculta, true = visible

  alternarPassword(): void {
    this.verPassword.update(v => !v);
  }

  prod: FormProducto = this.productoVacio();
  usr: FormUsuario = this.usuarioVacio();

  constructor() {
    // Módulo exclusivo del administrador
    if (!this.svc.usuario()) {
      this.router.navigate(['/login']);
      return;
    }
    if (!this.svc.esAdmin()) {
      this.svc.mostrarToast('Acceso restringido a administradores', 'warning');
      this.router.navigate(['/dashboard']);
      return;
    }
    this.cargarProductos();
    this.cargarUsuarios();
  }

  cargarProductos(): void {
    this.svc.getProductos(true).subscribe({
      next: lista => this.productos.set(lista),
      error: () => this.svc.mostrarToast('No se pudieron cargar los productos', 'error')
    });
  }

  cargarUsuarios(): void {
    this.svc.getUsuarios().subscribe({
      next: lista => this.usuarios.set(lista),
      error: () => this.svc.mostrarToast('No se pudieron cargar los usuarios', 'error')
    });
  }

  imagenError(evento: Event): void {
    const img = evento.target as HTMLImageElement;
    if (img.dataset['reemplazada']) return;
    img.dataset['reemplazada'] = '1';
    img.src = 'https://placehold.co/100/ffb8c8/58111e?text=Pastel';
  }

  esMiCuenta(id?: number): boolean {
    return id !== undefined && id === this.svc.usuario()?.id;
  }

  /* =====================================================
     PRODUCTOS
     ===================================================== */
  private productoVacio(): FormProducto {
    return { name: '', category: 'Tortas', price: null, stock: null, image: '' };
  }

  abrirProducto(p?: Producto): void {
    this.prod = p ? { ...p } : this.productoVacio();
    this.modalProducto.set(true);
  }

  cerrarProducto(): void {
    this.modalProducto.set(false);
  }

  /* Validación: tipo de dato, longitud y rango (las mismas reglas del servidor) */
  errorProducto(): string | null {
    const p = this.prod;

    const nombre = (p.name ?? '').trim();
    if (nombre.length < 2 || nombre.length > 100) return 'El nombre debe tener entre 2 y 100 caracteres';

    const precio = Number(p.price);
    if (p.price === null || !Number.isFinite(precio) || precio < 5 || precio > 75) {
      return 'El precio debe estar entre S/ 5.00 y S/ 75.00';
    }
    if (Math.abs(precio * 100 - Math.round(precio * 100)) > 1e-6) return 'El precio admite máximo 2 decimales';

    // Al crear el stock va de 1 a 85; al editar se permite 0 (producto agotado)
    const stockMin = p.id ? 0 : 1;
    const stock = Number(p.stock);
    if (p.stock === null || !Number.isInteger(stock) || stock < stockMin || stock > 85) {
      return `El stock debe ser un número entero entre ${stockMin} y 85`;
    }

    const imagen = (p.image ?? '').trim();
    if (imagen.length > 255 || !/^https?:\/\/\S+$/i.test(imagen)) {
      return 'La imagen debe ser una URL http(s) válida (máximo 255 caracteres)';
    }
    return null;
  }

  guardarProducto(): void {
    if (this.errorProducto()) return;

    const datos: Producto = {
      name: this.prod.name.trim(),
      category: this.prod.category,
      price: Number(this.prod.price),
      stock: Number(this.prod.stock),
      image: this.prod.image.trim()
    };

    const peticion = this.prod.id
      ? this.svc.editarProducto(this.prod.id, datos)
      : this.svc.crearProducto(datos);

    this.guardando.set(true);
    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.cerrarProducto();
        this.cargarProductos();
        this.svc.mostrarToast('Producto guardado con éxito', 'success');
      },
      error: err => {
        this.guardando.set(false);
        this.svc.mostrarToast(err.error?.message || 'No se pudo guardar el producto', 'error');
      }
    });
  }

  /* Eliminación LÓGICA: el producto se conserva pero deja de venderse */
  cambiarEstadoProducto(p: Producto, estado: 0 | 1): void {
    this.svc.cambiarEstadoProducto(p.id!, estado).subscribe({
      next: () => {
        this.cargarProductos();
        this.svc.mostrarToast(estado === 0 ? 'Producto desactivado' : 'Producto reactivado', 'info');
      },
      error: err => this.svc.mostrarToast(err.error?.message || 'No se pudo cambiar el estado', 'error')
    });
  }

  /* Eliminación FÍSICA: borra el registro de la base de datos */
  eliminarProducto(p: Producto): void {
    if (!confirm(`¿Eliminar DEFINITIVAMENTE el producto "${p.name}"?\nEsta acción no se puede deshacer.`)) return;

    this.svc.eliminarProducto(p.id!).subscribe({
      next: () => {
        this.cargarProductos();
        this.svc.mostrarToast('Producto eliminado definitivamente', 'info');
      },
      error: err => this.svc.mostrarToast(err.error?.message || 'No se pudo eliminar el producto', 'warning')
    });
  }

  /* =====================================================
     USUARIOS
     ===================================================== */
  private usuarioVacio(): FormUsuario {
    return { username: '', name: '', password: '', role: 'Encargado de Ventas' };
  }

  abrirUsuario(u?: Usuario): void {
    // La contraseña no viaja desde el servidor: al editar, en blanco = conservar la actual
    this.usr = u
      ? { id: u.id, username: u.username, name: u.name, password: '', role: u.role }
      : this.usuarioVacio();
    this.verPassword.set(false);   // cada vez que se abre, la contraseña inicia oculta
    this.modalUsuario.set(true);
  }

  cerrarUsuario(): void {
    this.modalUsuario.set(false);
  }

  /* ¿Se está escribiendo una contraseña? (siempre al crear; al editar, solo si se escribe algo) */
  pideContrasena(): boolean {
    return !this.usr.id || this.usr.password !== '';
  }

  reglasPassword() {
    return evaluarPassword(this.usr.password);
  }

  errorUsuario(): string | null {
    const username = (this.usr.username ?? '').trim();
    if (!/^[A-Za-z0-9_.]{4,30}$/.test(username)) {
      return 'El usuario debe tener de 4 a 30 caracteres (letras, números, punto o guion bajo)';
    }
    const nombre = (this.usr.name ?? '').trim();
    if (nombre.length < 3 || nombre.length > 80) return 'El nombre completo debe tener entre 3 y 80 caracteres';

    if (this.pideContrasena() && this.reglasPassword().some(r => !r.cumple)) {
      return 'La contraseña no cumple todos los requisitos';
    }
    return null;
  }

  guardarUsuario(): void {
    if (this.errorUsuario()) return;

    const datos: Usuario = {
      username: this.usr.username.trim(),
      name: this.usr.name.trim(),
      role: this.usr.role,
      password: this.usr.password
    };

    const peticion = this.usr.id
      ? this.svc.editarUsuario(this.usr.id, datos)
      : this.svc.crearUsuario(datos);

    this.guardando.set(true);
    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.cerrarUsuario();
        this.cargarUsuarios();
        this.svc.mostrarToast('Usuario guardado con éxito', 'success');
      },
      error: err => {
        this.guardando.set(false);
        this.svc.mostrarToast(err.error?.message || 'No se pudo guardar el usuario', 'error');
      }
    });
  }

  /* Eliminación LÓGICA: un usuario inactivo no puede iniciar sesión */
  cambiarEstadoUsuario(u: Usuario, estado: 0 | 1): void {
    this.svc.cambiarEstadoUsuario(u.id!, estado).subscribe({
      next: () => {
        this.cargarUsuarios();
        this.svc.mostrarToast(estado === 0 ? 'Usuario desactivado' : 'Usuario reactivado', 'info');
      },
      error: err => this.svc.mostrarToast(err.error?.message || 'No se pudo cambiar el estado', 'error')
    });
  }

  /* Eliminación FÍSICA */
  eliminarUsuario(u: Usuario): void {
    if (!confirm(`¿Eliminar DEFINITIVAMENTE al usuario "${u.username}"?\nEsta acción no se puede deshacer.`)) return;

    this.svc.eliminarUsuario(u.id!).subscribe({
      next: () => {
        this.cargarUsuarios();
        this.svc.mostrarToast('Usuario eliminado definitivamente', 'info');
      },
      error: err => this.svc.mostrarToast(err.error?.message || 'No se pudo eliminar el usuario', 'warning')
    });
  }
}