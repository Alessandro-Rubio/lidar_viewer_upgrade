import { TestBed } from '@angular/core/testing';

import { LazService } from './laz-service';

describe('LazService', () => {
  let service: LazService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LazService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
