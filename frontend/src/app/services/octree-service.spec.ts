import { TestBed } from '@angular/core/testing';

import { OctreeService } from './octree-service';

describe('OctreeService', () => {
  let service: OctreeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(OctreeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
