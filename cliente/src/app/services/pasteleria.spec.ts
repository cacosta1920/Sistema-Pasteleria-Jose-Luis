import { TestBed } from '@angular/core/testing';
import { Pasteleria } from './pasteleria';

describe('Pasteleria', () => {
  let service: Pasteleria;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Pasteleria);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
