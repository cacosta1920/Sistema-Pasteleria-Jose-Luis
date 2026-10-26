import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HistorialVentas } from './historial-ventas';

describe('HistorialVentas', () => {
  let component: HistorialVentas;
  let fixture: ComponentFixture<HistorialVentas>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HistorialVentas],
    }).compileComponents();

    fixture = TestBed.createComponent(HistorialVentas);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
