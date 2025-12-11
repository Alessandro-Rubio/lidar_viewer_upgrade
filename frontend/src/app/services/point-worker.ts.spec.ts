import { TestBed } from '@angular/core/testing';

import { PointWorkerTs } from './point-worker.ts';

describe('PointWorkerTs', () => {
  let service: PointWorkerTs;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PointWorkerTs);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
