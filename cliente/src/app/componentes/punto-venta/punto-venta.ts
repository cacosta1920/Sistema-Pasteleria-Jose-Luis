import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Pasteleria, Producto } from '../../services/pasteleria';

interface ItemCarrito {
  id: number;
  name: string;
  price: number;
  qty: number;
}

@Component({
  selector: 'app-punto-venta',
  imports: [FormsModule],
  templateUrl: './punto-venta.html',
  styleUrl: './punto-venta.css'
})
export class PuntoVenta {
  private svc = inject(Pasteleria);
  private router = inject(Router);

  categorias = [
    { valor: 'todos', nombre: 'Todos' },
    { valor: 'Tortas', nombre: 'Tortas & Pies' },
    { valor: 'Individuales', nombre: 'Individuales' },
    { valor: 'Salados', nombre: 'Salados' }
  ];

  /* Catálogo */
  productos = signal<Producto[]>([]);
  busqueda = signal('');
  categoria = signal('todos');

  productosFiltrados = computed(() => {
    const texto = this.busqueda().toLowerCase();
    return this.productos().filter(p =>
      (this.categoria() === 'todos' || p.category === this.categoria()) &&
      p.name.toLowerCase().includes(texto)
    );
  });

  /* Carrito y pago */
  carrito = signal<ItemCarrito[]>([]);
  cliente = 'Cliente Varios';
  tipoDoc = 'Boleta';
  pagado = signal<number | null>(null);
  procesando = signal(false);

  total = computed(() =>
    Math.round(this.carrito().reduce((acc, i) => acc + i.price * i.qty, 0) * 100) / 100
  );
  igv = computed(() => this.total() * 0.18);
  subtotal = computed(() => this.total() - this.igv());
  alcanza = computed(() => (this.pagado() ?? 0) >= this.total());
  vuelto = computed(() => Math.max(0, (this.pagado() ?? 0) - this.total()));
  faltante = computed(() => Math.max(0, this.total() - (this.pagado() ?? 0)));

  constructor() {
    // Sin sesión no se puede vender
    if (!this.svc.usuario()) {
      this.router.navigate(['/login']);
      return;
    }
    this.cargarProductos();
  }

  cargarProductos(): void {
    this.svc.getProductos().subscribe({
      next: lista => this.productos.set(lista),
      error: () => this.svc.mostrarToast('No se pudieron cargar los productos', 'error')
    });
  }

  /* Si la imagen no carga, se muestra una imagen de reemplazo (una sola vez) */
  imagenError(evento: Event): void {
    const img = evento.target as HTMLImageElement;
    if (img.dataset['reemplazada']) return;
    img.dataset['reemplazada'] = '1';
    img.src = 'https://placehold.co/400x300/ffb8c8/58111e?text=Pasteleria+Jose+Luis';
  }

  /* ---------- Carrito ---------- */
  agregar(producto: Producto): void {
    if (producto.stock <= 0) return;

    const existente = this.carrito().find(i => i.id === producto.id);
    if (existente) {
      const limite = Math.min(producto.stock, 999);
      if (existente.qty >= limite) {
        this.svc.mostrarToast(`Cantidad máxima alcanzada (${limite} u.)`, 'warning');
        return;
      }
      this.carrito.update(lista =>
        lista.map(i => (i.id === producto.id ? { ...i, qty: i.qty + 1 } : i))
      );
    } else {
      this.carrito.update(lista => [
        ...lista,
        { id: producto.id!, name: producto.name, price: producto.price, qty: 1 }
      ]);
    }
    this.svc.mostrarToast(`${producto.name} agregado`, 'success');
  }

  cambiarCantidad(id: number, delta: number): void {
    const producto = this.productos().find(p => p.id === id);
    const item = this.carrito().find(i => i.id === id);
    if (!producto || !item) return;

    const limite = Math.min(producto.stock, 999);
    let nueva = item.qty + delta;
    if (nueva > limite) {
      nueva = limite;
      this.svc.mostrarToast(`Supera la cantidad disponible (${limite})`, 'warning');
    }

    if (nueva <= 0) {
      this.quitar(id);
    } else {
      this.carrito.update(lista => lista.map(i => (i.id === id ? { ...i, qty: nueva } : i)));
    }
  }

  quitar(id: number): void {
    this.carrito.update(lista => lista.filter(i => i.id !== id));
  }

  vaciar(): void {
    this.carrito.set([]);
    this.pagado.set(null);
  }

  /* ---------- Cobro ---------- */
  cobrar(): void {
    if (this.carrito().length === 0) {
      this.svc.mostrarToast('Agrega productos al carrito primero', 'error');
      return;
    }
    if (!this.alcanza()) {
      this.svc.mostrarToast('El monto entregado es menor al total de la venta', 'warning');
      return;
    }

    if ((this.pagado() ?? 0) > 99999.99) {
      this.svc.mostrarToast('El monto entregado no puede superar S/ 99,999.99', 'warning');
      return;
    }

    this.procesando.set(true);
    this.svc.registrarVenta({
      docType: this.tipoDoc,
      customer: this.cliente.trim() || 'Cliente Varios',
      paid: this.pagado() ?? 0,
      items: this.carrito().map(i => ({ id: i.id, qty: i.qty }))
    }).subscribe({
      next: venta => {
        this.procesando.set(false);
        this.svc.verComprobante(venta);   // abre el modal del comprobante
        this.vaciar();
        this.cargarProductos();           // refresca el stock
      },
      error: err => {
        this.procesando.set(false);
        this.svc.mostrarToast(err.error?.message || 'No se pudo registrar la venta', 'error');
        this.cargarProductos();
      }
    });
  }
}