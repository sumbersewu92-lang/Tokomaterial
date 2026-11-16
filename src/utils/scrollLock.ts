/**
 * Global Scroll Lock Utility & Hook
 * Sistem penguncian scroll mutlak yang bersih, aman, dan tanpa beban CPU.
 * Mengunci scroll body saat modal aktif, dan membersihkan total saat modal ditutup.
 */
import { useEffect, useRef } from 'react';

// Set ID penguncian aktif
const activeLockIds = new Set<string>();
let lockedScrollY = 0;
let isBodyCurrentlyLocked = false;
let listenersActive = false;

// Handler isolasi touchmove & wheel agar tidak tembus ke background modal
const preventBackgroundScroll = (e: TouchEvent | WheelEvent) => {
  const target = e.target as HTMLElement | null;
  if (!target) return;

  const scrollable = target.closest(
    '.overflow-y-auto, .overflow-auto, [data-modal-scroll="true"], .modal-scroll-body'
  );
  if (!scrollable) {
    if (e.cancelable) {
      e.preventDefault();
    }
    e.stopPropagation();
  }
};

/**
 * Pembersihan total seluruh inline style dan class lock pada body dan html.
 */
export function forceResetScrollLock(): void {
  try {
    if (typeof document === 'undefined' || !document.body || !document.documentElement) {
      return;
    }

    activeLockIds.clear();
    isBodyCurrentlyLocked = false;

    if (listenersActive) {
      window.removeEventListener('touchmove', preventBackgroundScroll);
      window.removeEventListener('wheel', preventBackgroundScroll);
      listenersActive = false;
    }

    document.body.classList.remove('modal-scroll-locked');
    document.documentElement.classList.remove('modal-scroll-locked');

    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('overflow-y');
    document.body.style.removeProperty('height');
    document.body.style.removeProperty('position');
    document.body.style.removeProperty('width');
    document.body.style.removeProperty('top');
    document.body.style.removeProperty('padding-right');

    document.documentElement.style.removeProperty('overflow');
    document.documentElement.style.removeProperty('overflow-y');
    document.documentElement.style.removeProperty('height');

    // Tidak menambahkan inline overflowY ke body agar posisi sticky header tetap berfungsi normal di window viewport
  } catch (err) {
    console.warn('Scroll reset notice:', err);
  }
}

/**
 * Kunci scroll body untuk ID modal tertentu
 */
export function lockBodyScroll(lockId: string = 'default'): void {
  try {
    if (typeof document === 'undefined' || !document.body || !document.documentElement) {
      return;
    }

    activeLockIds.add(lockId);

    if (!isBodyCurrentlyLocked) {
      lockedScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;

      const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollBarWidth > 0) {
        document.body.style.paddingRight = `${scrollBarWidth}px`;
      }

      document.body.style.overflow = 'hidden';
      document.body.style.height = '100vh';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${lockedScrollY}px`;

      document.body.classList.add('modal-scroll-locked');
      document.documentElement.classList.add('modal-scroll-locked');

      if (!listenersActive) {
        window.addEventListener('touchmove', preventBackgroundScroll, { passive: false });
        window.addEventListener('wheel', preventBackgroundScroll, { passive: false });
        listenersActive = true;
      }

      isBodyCurrentlyLocked = true;
    }
  } catch (err) {
    console.warn('Scroll lock notice:', err);
  }
}

/**
 * Buka kunci scroll body untuk ID modal tertentu
 */
export function unlockBodyScroll(lockId: string = 'default'): void {
  try {
    if (typeof document === 'undefined' || !document.body || !document.documentElement) {
      return;
    }

    activeLockIds.delete(lockId);

    // Jika tidak ada lagi modal yang mengunci scroll
    if (activeLockIds.size === 0) {
      const previousTop = document.body.style.top;
      const targetScrollY = previousTop ? Math.abs(parseInt(previousTop, 10)) : lockedScrollY;

      document.body.classList.remove('modal-scroll-locked');
      document.documentElement.classList.remove('modal-scroll-locked');

      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('overflow-y');
      document.body.style.removeProperty('height');
      document.body.style.removeProperty('position');
      document.body.style.removeProperty('width');
      document.body.style.removeProperty('top');
      document.body.style.removeProperty('padding-right');

      document.documentElement.style.removeProperty('overflow');
      document.documentElement.style.removeProperty('overflow-y');
      document.documentElement.style.removeProperty('height');

      // Tidak menambahkan inline overflowY ke body agar posisi sticky header tetap berfungsi normal di window viewport

      if (listenersActive) {
        window.removeEventListener('touchmove', preventBackgroundScroll);
        window.removeEventListener('wheel', preventBackgroundScroll);
        listenersActive = false;
      }

      isBodyCurrentlyLocked = false;

      if (typeof targetScrollY === 'number' && !isNaN(targetScrollY) && targetScrollY > 0) {
        window.scrollTo(0, targetScrollY);
      }
    }
  } catch (err) {
    console.warn('Scroll unlock notice:', err);
  }
}

/**
 * Hook deklaratif untuk komponen modal.
 * Mengunci saat isOpen bernilai true, dan selalu membuka kunci saat unmount atau isOpen false.
 */
export function useBodyScrollLock(isOpen: boolean = true): void {
  const lockIdRef = useRef<string>('');
  if (!lockIdRef.current) {
    lockIdRef.current = `lock-${Math.random().toString(36).substring(2, 9)}`;
  }

  useEffect(() => {
    const id = lockIdRef.current;
    if (isOpen) {
      lockBodyScroll(id);
    } else {
      unlockBodyScroll(id);
    }

    return () => {
      unlockBodyScroll(id);
    };
  }, [isOpen]);
}

/**
 * Helper properties untuk backdrop modal
 */
export const modalBackdropProps = {
  'data-modal': 'true',
  onTouchMove: (e: React.TouchEvent) => {
    if (e.target === e.currentTarget && e.cancelable) e.preventDefault();
    e.stopPropagation();
  },
  onWheel: (e: React.WheelEvent) => {
    if (e.target === e.currentTarget && e.cancelable) e.preventDefault();
    e.stopPropagation();
  },
};

/**
 * Helper properties untuk konten internal modal
 */
export const modalContentProps = {
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
  onTouchMove: (e: React.TouchEvent) => e.stopPropagation(),
  onWheel: (e: React.WheelEvent) => e.stopPropagation(),
};

/**
 * Inisialisasi penguncian scroll global (bebas rekursi).
 */
export function initGlobalModalScrollLock(): () => void {
  forceResetScrollLock();
  return () => {
    forceResetScrollLock();
  };
}

// Inisialisasi awal saat load
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    forceResetScrollLock();
  });
  window.addEventListener('pageshow', () => {
    forceResetScrollLock();
  });
}
