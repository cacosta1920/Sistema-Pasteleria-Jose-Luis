import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Pasteleria, Venta } from '../../services/pasteleria';

interface LineaEdicion {
  id: number;            // código del producto
  name: string;
  price: number;         // precio con el que se vendió
  qty: number | null;
}

interface FormVenta {
  codigo: number;
  numero: string;
  tipoOriginal: string;
  paid: number;
  docType: string;
  customer: string;
  items: LineaEdicion[];
}

@Component({
  selector: 'app-historial-ventas',
  imports: [FormsModule],
  templateUrl: './historial-ventas.html',
  styleUrl: './historial-ventas.css'
})
export class HistorialVentas {
  private svc = inject(Pasteleria);
  private router = inject(Router);

  esAdmin = this.svc.esAdmin;

  ventas = signal<Venta[]>([]);
  cargando = signal(true);

  /* Filtros */
  fecha = signal('');
  texto = signal('');
  verAnuladas = signal(false);

  ventasFiltradas = computed(() => {
    const fecha = this.fecha();
    const texto = this.texto().toLowerCase();
    return this.ventas().filter(v =>
      (this.verAnuladas() || v.estado !== 0) &&
      (!fecha || v.date.startsWith(fecha)) &&
      (v.customer.toLowerCase().includes(texto) || v.id.toLowerCase().includes(texto))
    );
  });

  anuladas = computed(() => this.ventas().filter(v => v.estado === 0).length); 

  /* Modal de corrección */
  modalEdicion = signal(false);
  guardando = signal(false);
  form: FormVenta = this.formVacio();

  constructor() {
    // Sin sesión no se puede ver el historial
    if (!this.svc.usuario()) {
      this.router.navigate(['/login']);
      return;
    }
    this.cargarVentas();
  }

  cargarVentas(): void {
    this.svc.getVentas().subscribe({
      next: lista => {
        this.ventas.set(lista);
        this.cargando.set(false);
      },
      error: () => {
        this.cargando.set(false);
        this.svc.mostrarToast('No se pudo cargar el historial de ventas', 'error');
      }
    });
  }

  limpiarFiltros(): void {
    this.fecha.set('');
    this.texto.set('');
  }

  verTicket(venta: Venta): void {
    this.svc.verComprobante(venta);
  }

  /* =====================================================
     ACTUALIZAR: cliente, tipo de comprobante y cantidades
     ===================================================== */
  private formVacio(): FormVenta {
    return { codigo: 0, numero: '', tipoOriginal: 'Boleta', paid: 0, docType: 'Boleta', customer: '', items: [] };
  }

  abrirEdicion(v: Venta): void {
    this.form = {
      codigo: v.codigo,
      numero: v.id,
      tipoOriginal: v.docType,
      paid: v.paid,
      docType: v.docType,
      customer: v.customer,
      items: v.items.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty }))
    };
    this.modalEdicion.set(true);
  }

  cerrarEdicion(): void {
    this.modalEdicion.set(false);
  }

  /* Totales de vista previa, recalculados mientras se cambian las cantidades */
  totalEdicion(): number {
    const suma = this.form.items.reduce((acc, l) => acc + l.price * (Number(l.qty) || 0), 0);
    return Math.round(suma * 100) / 100;
  }

  igvEdicion(): number {
    return Math.round(this.totalEdicion() * 0.18 * 100) / 100;
  }

  subtotalEdicion(): number {
    return Math.round((this.totalEdicion() - this.igvEdicion()) * 100) / 100;
  }

  vueltoEdicion(): number {
    return Math.round((this.form.paid - this.totalEdicion()) * 100) / 100;
  }

  /* Validación: tipo de dato, longitud y rango (las mismas reglas del servidor) */
  errorEdicion(): string | null {
    if ((this.form.customer ?? '').trim().length > 100) {
      return 'El nombre del cliente no puede superar los 100 caracteres';
    }
    for (const l of this.form.items) {
      const q = Number(l.qty);
      if (l.qty === null || !Number.isInteger(q) || q < 1 || q > 999) {
        return `La cantidad de "${l.name}" debe ser un número entero entre 1 y 999`;
      }
    }
    if (this.totalEdicion() > this.form.paid) {
      return `El nuevo total (S/ ${this.totalEdicion().toFixed(2)}) supera el monto entregado (S/ ${this.form.paid.toFixed(2)})`;
    }
    return null;
  }

  guardarEdicion(): void {
    if (this.errorEdicion()) return;

    this.guardando.set(true);
    this.svc.actualizarVenta(this.form.codigo, {
      docType: this.form.docType,
      customer: this.form.customer.trim(),
      items: this.form.items.map(l => ({ id: l.id, qty: Number(l.qty) }))
    }).subscribe({
      next: venta => {
        this.guardando.set(false);
        this.cerrarEdicion();
        this.cargarVentas();
        this.svc.mostrarToast(`Venta ${venta.id} actualizada`, 'success');
      },
      error: err => {
        this.guardando.set(false);
        this.svc.mostrarToast(err.error?.message || 'No se pudo actualizar la venta', 'error');
      }
    });
  }

  /* Eliminación LÓGICA: la venta se conserva, queda anulada y el stock vuelve al inventario */
  anular(v: Venta): void {
    if (!confirm(`¿Anular la venta ${v.id}?\nSe devolverá al inventario el stock de sus productos.`)) return;

    this.svc.anularVenta(v.codigo).subscribe({
      next: () => {
        this.cargarVentas();
        this.svc.mostrarToast(`Venta ${v.id} anulada`, 'info');
      },
      error: err => this.svc.mostrarToast(err.error?.message || 'No se pudo anular la venta', 'error')
    });
  }

  /* Eliminación FÍSICA (solo administrador): borra definitivamente una venta anulada */
  eliminar(v: Venta): void {
    if (!confirm(`¿Eliminar DEFINITIVAMENTE la venta ${v.id}?\nEsta acción no se puede deshacer.`)) return;

    this.svc.eliminarVenta(v.codigo).subscribe({
      next: () => {
        this.cargarVentas();
        this.svc.mostrarToast('Venta eliminada definitivamente', 'info');
      },
      error: err => this.svc.mostrarToast(err.error?.message || 'No se pudo eliminar la venta', 'warning')
    });
  }
}