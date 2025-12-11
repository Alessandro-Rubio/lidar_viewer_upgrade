import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FileExplorer } from './file-explorer';

describe('FileExplorer', () => {
  let component: FileExplorer;
  let fixture: ComponentFixture<FileExplorer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FileExplorer]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FileExplorer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
