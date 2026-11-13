import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { MesResumen, Pasteleria, Venta } from '../../services/pasteleria';

Chart.register(...registerables);

const redondear = (n: number) => Math.round(n * 100) / 100;

/* Valor actual (último mes), máximo, mínimo y promedio de una serie */
function resumir(valores: number[]) {
  if (valores.length === 0) return { actual: 0, max: 0, min: 0, prom: 0 };
  return {
    actual: valores[valores.length - 1],
    max: Math.max(...valores),
    min: Math.min(...valores),
    prom: valores.reduce((a, b) => a + b, 0) / valores.length
  };
}

/* Total, promedio y venta de mayor y menor valor de una lista de ventas (la lista no puede estar vacía).
   Si dos ventas empatan, se muestra la primera de la lista (la más reciente). */
function resumenDe(lista: Venta[]) {
  const total = redondear(lista.reduce((acc, v) => acc + v.total, 0));
  return {
    cantidad: lista.length,
    total,
    promedio: redondear(total / lista.length),
    maxima: lista.reduce((a, b) => (b.total > a.total ? b : a)),
    minima: lista.reduce((a, b) => (b.total < a.total ? b : a))
  };
}

/* Suma de subtotal, IGV y total de una lista de ventas */
function sumarIngresos(lista: Venta[]) {
  return {
    cantidad: lista.length,
    subtotal: redondear(lista.reduce((acc, v) => acc + v.subtotal, 0)),
    igv: redondear(lista.reduce((acc, v) => acc + v.igv, 0)),
    total: redondear(lista.reduce((acc, v) => acc + v.total, 0))
  };
}

/* Agrupa las ventas por una clave (comprobante, vendedor...) y suma sus ingresos */
function agruparIngresos(lista: Venta[], clave: (v: Venta) => string) {
  const grupos = new Map<string, Venta[]>();
  for (const v of lista) {
    const k = clave(v) || '—';
    grupos.set(k, [...(grupos.get(k) ?? []), v]);
  }
  return [...grupos]
    .map(([nombre, ventas]) => ({ nombre, ...sumarIngresos(ventas) }))
    .sort((a, b) => b.total - a.total);
}

/* 'AAAA-MM-DD' -> 'DD/MM/AAAA' */
function fechaCorta(dia: string): string {
  return dia.split('-').reverse().join('/');
}

/* 'AAAA-MM' -> 'sep 2026' */
function etiquetaMes(mes: string): string {
  const [anio, m] = mes.split('-').map(Number);
  return new Date(anio, m - 1, 1).toLocaleDateString('es-PE', { month: 'short', year: 'numeric' });
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard {
  private svc = inject(Pasteleria);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  usuarioActual = this.svc.usuario;
  fechaCorta = fechaCorta;
  sol = (n: number) => `S/ ${n.toFixed(2)}`;

  /* Datos reales: todas las ventas registradas en el sistema */
  ventas = signal<Venta[]>([]);
  cargando = signal(true);

  /* Qué reporte se muestra y con qué rango de fechas */
  vista = signal<'indicadores' | 'ventas' | 'ingresos'>('indicadores');
  desde = signal('');
  hasta = signal('');
  generado = signal('');

  rangoInvalido = computed(() => !!this.desde() && !!this.hasta() && this.desde() > this.hasta());

  /* Ventas vigentes (las anuladas no cuentan) dentro del rango elegido */
  vigentes = computed(() => {
    const desde = this.desde();
    const hasta = this.hasta();
    return this.ventas().filter(v => {
      const dia = v.date.slice(0, 10);
      return v.estado !== 0 && (!desde || dia >= desde) && (!hasta || dia <= hasta);
    });
  });
  hayDatos = computed(() => this.vigentes().length > 0);

  private salesCanvas = viewChild<ElementRef<HTMLCanvasElement>>('salesChart');
  private growthCanvas = viewChild<ElementRef<HTMLCanvasElement>>('growthChart');
  private salesChart?: Chart;
  private growthChart?: Chart;

  /* ---------- Reporte 1: INDICADORES (agrupados por mes) ---------- */
  meses = computed<MesResumen[]>(() => {
    const grupos = new Map<string, { cant: number; monto: number }>();
    for (const v of this.vigentes()) {
      const mes = v.date.slice(0, 7);                       // 'AAAA-MM'
      const g = grupos.get(mes) ?? { cant: 0, monto: 0 };
      grupos.set(mes, { cant: g.cant + 1, monto: g.monto + v.total });
    }
    return [...grupos]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, g]) => ({ mes: etiquetaMes(mes), cantidadVentas: g.cant, montoTotal: redondear(g.monto) }));
  });

  /* Crecimiento porcentual de cada mes respecto al anterior */
  private crecimientos = computed(() => {
    const m = this.meses();
    const resultado: number[] = [];
    for (let i = 1; i < m.length; i++) {
      const anterior = m[i - 1].montoTotal;
      resultado.push(anterior ? ((m[i].montoTotal - anterior) / anterior) * 100 : 0);
    }
    return resultado;
  });

  /* Último mes con ventas ('AAAA-MM') y sus ventas: las tarjetas 2 y 3 se calculan sobre ellas */
  private ultimoMes = computed(() => {
    let ultimo = '';
    for (const v of this.vigentes()) {
      const mes = v.date.slice(0, 7);
      if (mes > ultimo) ultimo = mes;
    }
    return ultimo;
  });

  private ventasUltimoMes = computed(() => {
    const mes = this.ultimoMes();
    return mes ? this.vigentes().filter(v => v.date.startsWith(mes)) : [];
  });

  /* Promedio por operación de cada día del último mes */
  private promediosDiarios = computed(() => {
    const porDia = new Map<string, number[]>();
    for (const v of this.ventasUltimoMes()) {
      const dia = v.date.slice(0, 10);
      porDia.set(dia, [...(porDia.get(dia) ?? []), v.total]);
    }
    return [...porDia.values()].map(totales => totales.reduce((a, b) => a + b, 0) / totales.length);
  });

  /* PATRÓN 4: Tarjetas de los 4 indicadores */
  tarjetas = computed(() => {
    const m = this.meses();
    const mes = m.length ? m[m.length - 1].mes : '';           // etiqueta del último mes, ej. 'nov. 2026'
    const cant = resumir(m.map(h => h.cantidadVentas));
    const crec = resumir(this.crecimientos());

    // Ventas individuales del último mes (tarjetas 2 y 3)
    const ventasMes = this.ventasUltimoMes();
    const delMes = ventasMes.length ? resumenDe(ventasMes) : null;
    const diario = resumir(this.promediosDiarios());

    const ops = (n: number) => `${n} ops`;
    const sol = (n: number) => `S/ ${n.toFixed(2)}`;
    const pct = (n: number) => `${n.toFixed(2)}%`;

    return [
      {
        titulo: '1. Cantidad de Ventas', icono: 'fa-receipt', color: 'bg-blue-50 text-blue-600',
        actual: ops(cant.actual), max: ops(cant.max), min: ops(cant.min), prom: `${cant.prom.toFixed(1)} ops`,
        base: `Último mes: ${mes} · máx, mín y promedio entre meses`
      },
      {
        titulo: '2. Monto Total Mes', icono: 'fa-sack-dollar', color: 'bg-emerald-50 text-emerald-600',
        actual: sol(delMes?.total ?? 0), max: sol(delMes?.maxima.total ?? 0),
        min: sol(delMes?.minima.total ?? 0), prom: sol(delMes?.promedio ?? 0),
        base: `Último mes: ${mes} · máx, mín y promedio por venta`
      },
      {
        titulo: '3. Prom. / Operación', icono: 'fa-calculator', color: 'bg-amber-50 text-amber-600',
        actual: sol(delMes?.promedio ?? 0), max: sol(diario.max), min: sol(diario.min), prom: sol(diario.prom),
        base: `Último mes: ${mes} · máx, mín y promedio de los promedios diarios`
      },
      {
        titulo: '4. Crecimiento (%)', icono: 'fa-chart-line', color: 'bg-purple-50 text-purple-600',
        actual: pct(crec.actual), max: pct(crec.max), min: pct(crec.min), prom: pct(crec.prom),
        base: `${mes} vs. mes anterior · máx, mín y promedio entre meses`
      }
    ];
  });

  /* Detalle mes a mes (para el PDF de indicadores) */
  filasMeses = computed(() => {
    const crec = this.crecimientos();
    return this.meses().map((h, i) => ({
      mes: h.mes,
      cantidad: h.cantidadVentas,
      monto: h.montoTotal,
      promedio: h.cantidadVentas ? redondear(h.montoTotal / h.cantidadVentas) : 0,
      crecimiento: i === 0 ? null : crec[i - 1]
    }));
  });

  /* ---------- Reporte 2: MÁXIMO, MÍNIMO Y PROMEDIO POR VENTA ---------- */
  resumenGeneral = computed(() => {
    const lista = this.vigentes();
    return lista.length ? resumenDe(lista) : null;
  });

  resumenPorDia = computed(() => {
    const grupos = new Map<string, Venta[]>();
    for (const v of this.vigentes()) {
      const dia = v.date.slice(0, 10);                      // 'AAAA-MM-DD'
      grupos.set(dia, [...(grupos.get(dia) ?? []), v]);
    }
    return [...grupos]
      .map(([dia, lista]) => ({ dia, ...resumenDe(lista) }))
      .sort((a, b) => b.dia.localeCompare(a.dia));
  });

  /* ---------- Reporte 3: INGRESOS GENERADOS POR LAS VENTAS ---------- */
  ingresosTotales = computed(() => sumarIngresos(this.vigentes()));

  ingresosPorDia = computed(() => {
    const grupos = new Map<string, Venta[]>();
    for (const v of this.vigentes()) {
      const dia = v.date.slice(0, 10);
      grupos.set(dia, [...(grupos.get(dia) ?? []), v]);
    }
    return [...grupos]
      .map(([dia, lista]) => ({ dia, ...sumarIngresos(lista) }))
      .sort((a, b) => b.dia.localeCompare(a.dia));
  });

  ingresosPorComprobante = computed(() => agruparIngresos(this.vigentes(), v => v.docType));
  ingresosPorVendedor = computed(() => agruparIngresos(this.vigentes(), v => v.user));

  /* Porcentaje del ingreso total que representa una parte */
  porcentaje(parte: number): string {
    const total = this.ingresosTotales().total;
    return total ? `${((parte / total) * 100).toFixed(1)}%` : '0.0%';
  }

  tituloReporte = computed(() => {
    switch (this.vista()) {
      case 'indicadores': return 'Reporte de Indicadores';
      case 'ventas': return 'Reporte de Ventas: máximo, mínimo y promedio';
      default: return 'Reporte de Ingresos por Ventas';
    }
  });

  constructor() {
    // Sin sesión no se puede ver el dashboard
    if (!this.svc.usuario()) {
      this.router.navigate(['/login']);
      return;
    }

    // Dibuja los gráficos cuando ya hay datos y los canvas existen
    // (los canvas solo existen en la vista "Indicadores", así que se redibujan al volver a ella)
    effect(() => {
      const datos = this.meses();
      const canvasVentas = this.salesCanvas();
      const canvasCrecimiento = this.growthCanvas();
      if (!canvasVentas || !canvasCrecimiento || datos.length === 0) {
        this.salesChart?.destroy();
        this.growthChart?.destroy();
        this.salesChart = undefined;
        this.growthChart = undefined;
        return;
      }
      this.dibujarGraficos(datos, canvasVentas.nativeElement, canvasCrecimiento.nativeElement);
    });

    this.destroyRef.onDestroy(() => {
      this.salesChart?.destroy();
      this.growthChart?.destroy();
    });

    this.svc.getVentas().subscribe({
      next: lista => {
        this.ventas.set(lista);
        this.cargando.set(false);
      },
      error: () => {
        this.cargando.set(false);
        this.svc.mostrarToast('No se pudieron cargar las ventas', 'error');
      }
    });
  }

  limpiarFiltros(): void {
    this.desde.set('');
    this.hasta.set('');
  }

  filtrosAplicados(): string {
    return [
      this.desde() ? `Desde: ${fechaCorta(this.desde())}` : '',
      this.hasta() ? `Hasta: ${fechaCorta(this.hasta())}` : ''
    ].filter(Boolean).join('  |  ');
  }

  /* =====================================================
     EXPORTAR A PDF (de la vista que se está mostrando)
     Se imprime el reporte (#printableDashboard) con el mismo mecanismo del ticket y del historial;
     en el diálogo de impresión se elige "Guardar como PDF".
     ===================================================== */
  exportarPdf(): void {
    if (!this.hayDatos()) {
      this.svc.mostrarToast('No hay ventas para exportar', 'warning');
      return;
    }

    const ahora = new Date();
    this.generado.set(ahora.toLocaleString('es-PE'));

    // El navegador propone el título de la página como nombre del archivo PDF
    const tituloOriginal = document.title;
    const dd = String(ahora.getDate()).padStart(2, '0');
    const mm = String(ahora.getMonth() + 1).padStart(2, '0');
    const base = { indicadores: 'Reporte-Indicadores', ventas: 'Reporte-Ventas-Max-Min-Prom', ingresos: 'Reporte-Ingresos' }[this.vista()];
    document.title = `${base}-${ahora.getFullYear()}-${mm}-${dd}`;
    document.body.classList.add('imprimiendo-dashboard');

    window.addEventListener('afterprint', () => {
      document.body.classList.remove('imprimiendo-dashboard');
      document.title = tituloOriginal;
    }, { once: true });

    // Pequeña espera para que Angular pinte la fecha de generación antes de abrir la impresión
    setTimeout(() => window.print(), 100);
  }

  private dibujarGraficos(datos: MesResumen[], canvasVentas: HTMLCanvasElement, canvasCrecimiento: HTMLCanvasElement): void {
    this.salesChart?.destroy();
    this.growthChart?.destroy();

    // Gráfico 1: Evolución mensual del monto
    this.salesChart = new Chart(canvasVentas, {
      type: 'bar',
      data: {
        labels: datos.map(h => h.mes),
        datasets: [{
          label: 'Monto Total (S/)',
          data: datos.map(h => h.montoTotal),
          backgroundColor: '#ee5379',
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });

    // Gráfico 2: Crecimiento porcentual mensual (el primer mes no tiene mes anterior)
    this.growthChart = new Chart(canvasCrecimiento, {
      type: 'line',
      data: {
        labels: datos.map(h => h.mes),
        datasets: [{
          label: 'Crecimiento %',
          data: [0, ...this.crecimientos()],
          borderColor: '#db3158',
          backgroundColor: 'rgba(219, 49, 88, 0.1)',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });
  }
}