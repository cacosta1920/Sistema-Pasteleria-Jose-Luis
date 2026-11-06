import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { MesResumen, Pasteleria } from '../../services/pasteleria';

Chart.register(...registerables);

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

  meses = signal<MesResumen[]>([]);

  private salesCanvas = viewChild<ElementRef<HTMLCanvasElement>>('salesChart');
  private growthCanvas = viewChild<ElementRef<HTMLCanvasElement>>('growthChart');
  private salesChart?: Chart;
  private growthChart?: Chart;

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

  /* PATRÓN 4: Tarjetas de los 4 indicadores */
  tarjetas = computed(() => {
    const m = this.meses();
    const cant = resumir(m.map(h => h.cantidadVentas));
    const monto = resumir(m.map(h => h.montoTotal));
    const promOp = resumir(m.map(h => (h.cantidadVentas ? h.montoTotal / h.cantidadVentas : 0)));
    const crec = resumir(this.crecimientos());

    const ops = (n: number) => `${n} ops`;
    const sol = (n: number) => `S/ ${n.toFixed(2)}`;
    const pct = (n: number) => `${n.toFixed(2)}%`;

    return [
      {
        titulo: '1. Cantidad de Ventas', icono: 'fa-receipt', color: 'bg-blue-50 text-blue-600',
        actual: ops(cant.actual), max: ops(cant.max), min: ops(cant.min), prom: `${cant.prom.toFixed(1)} ops`
      },
      {
        titulo: '2. Monto Total Mes', icono: 'fa-sack-dollar', color: 'bg-emerald-50 text-emerald-600',
        actual: sol(monto.actual), max: sol(monto.max), min: sol(monto.min), prom: sol(monto.prom)
      },
      { 
        titulo: '3. Prom. / Operación', icono: 'fa-calculator', color: 'bg-amber-50 text-amber-600',
        actual: sol(promOp.actual), max: sol(promOp.max), min: sol(promOp.min), prom: sol(promOp.prom)
      },
      {
        titulo: '4. Crecimiento (%)', icono: 'fa-chart-line', color: 'bg-purple-50 text-purple-600',
        actual: pct(crec.actual), max: pct(crec.max), min: pct(crec.min), prom: pct(crec.prom)
      }
    ];
  });

  constructor() {
    // Sin sesión no se puede ver el dashboard
    if (!this.svc.usuario()) {
      this.router.navigate(['/login']);
      return;
    }

    // Dibuja los gráficos cuando ya hay datos y los canvas existen
    effect(() => {
      const datos = this.meses();
      const canvasVentas = this.salesCanvas();
      const canvasCrecimiento = this.growthCanvas();
      if (datos.length === 0 || !canvasVentas || !canvasCrecimiento) return;
      this.dibujarGraficos(datos, canvasVentas.nativeElement, canvasCrecimiento.nativeElement);
    });

    this.destroyRef.onDestroy(() => {
      this.salesChart?.destroy();
      this.growthChart?.destroy();
    });

    this.svc.getResumenMensual().subscribe({
      next: datos => this.meses.set(datos),
      error: () => this.svc.mostrarToast('No se pudo cargar el resumen mensual', 'error')
    });
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