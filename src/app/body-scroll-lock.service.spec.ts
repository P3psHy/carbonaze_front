import { TestBed } from '@angular/core/testing';

import { BodyScrollLockService } from './body-scroll-lock.service';

describe('BodyScrollLockService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    document.body.classList.remove('modal-open');
  });

  it('adds the body class while at least one lock is active', () => {
    const service = TestBed.inject(BodyScrollLockService);

    service.lock();
    expect(document.body.classList.contains('modal-open')).toBe(true);

    service.lock();
    service.unlock();
    expect(document.body.classList.contains('modal-open')).toBe(true);

    service.unlock();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });

  it('never decrements below zero when unlocking repeatedly', () => {
    const service = TestBed.inject(BodyScrollLockService);

    service.unlock();
    service.unlock();

    expect(document.body.classList.contains('modal-open')).toBe(false);
  });
});
