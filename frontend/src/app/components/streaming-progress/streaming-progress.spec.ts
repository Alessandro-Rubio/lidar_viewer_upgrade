import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StreamingProgress } from './streaming-progress';

describe('StreamingProgress', () => {
  let component: StreamingProgress;
  let fixture: ComponentFixture<StreamingProgress>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StreamingProgress]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StreamingProgress);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
