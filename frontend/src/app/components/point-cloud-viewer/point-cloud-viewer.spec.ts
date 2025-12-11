import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PointCloudViewer } from './point-cloud-viewer';

describe('PointCloudViewer', () => {
  let component: PointCloudViewer;
  let fixture: ComponentFixture<PointCloudViewer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PointCloudViewer]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PointCloudViewer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
