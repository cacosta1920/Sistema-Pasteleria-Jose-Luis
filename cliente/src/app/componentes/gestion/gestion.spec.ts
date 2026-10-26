import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Gestion } from './gestion';

describe('Gestion', () => {
  let component: Gestion;
  let fixture: ComponentFixture<Gestion>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Gestion],
    }).compileComponents();

    fixture = TestBed.createComponent(Gestion);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
