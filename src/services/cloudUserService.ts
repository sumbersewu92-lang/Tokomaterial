import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import { AppUser, UserRole } from '../types/index.ts';
import { handleFirestoreError, OperationType } from '../lib/firestoreError.ts';

export const USERS_COLLECTION = 'users';
const META_COLLECTION = '_app_meta';
const USERS_SEED_DOC = 'users_seed_v1';

export const DEFAULT_CLOUD_USERS: AppUser[] = [
  {
    id: 1,
    uid: 'owner-default-uid',
    username: '252500',
    email: 'owner@sumbersewu.id',
    name: 'Hendra (Owner Toko)',
    role: 'owner',
    pin: '8888',
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    uid: 'cashier-default-uid',
    username: '252501',
    email: 'kasir@sumbersewu.id',
    name: 'Siti Rahma (Kasir Toko)',
    role: 'cashier',
    pin: '1234',
    createdAt: new Date().toISOString(),
  },
];

function normalizeUsername(data: Record<string, any>, fallbackId: string | number): string {
  if (typeof data.username === 'string' && data.username.trim() !== '') {
    return data.username.trim();
  }
  const numId = Number(data.id || fallbackId);
  if (numId === 1 || data.role === 'owner' && data.email === 'owner@sumbersewu.id') return '252500';
  if (numId === 2 || data.role === 'cashier' && data.email === 'kasir@sumbersewu.id') return '252501';
  if (typeof data.email === 'string' && data.email.includes('@')) {
    return data.email.split('@')[0];
  }
  return String(fallbackId);
}

/**
 * Seed default Toko Sumber Sewu users sekali saja jika koleksi masih kosong
 */
export async function ensureDefaultUsersSeededOnce(): Promise<void> {
  try {
    const seedRef = doc(db, META_COLLECTION, USERS_SEED_DOC);
    const seedSnap = await getDoc(seedRef);
    const usersRef = collection(db, USERS_COLLECTION);
    const existingSnap = await getDocs(usersRef);

    if (seedSnap.exists() && !existingSnap.empty) {
      return;
    }

    if (existingSnap.empty) {
      for (const defaultUser of DEFAULT_CLOUD_USERS) {
        const userDocRef = doc(db, USERS_COLLECTION, String(defaultUser.id));
        await setDoc(userDocRef, {
          ...defaultUser,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    await setDoc(
      seedRef,
      { seededAt: new Date().toISOString(), version: 1 },
      { merge: true }
    );
  } catch (err) {
    console.warn('Firestore seed default users warning:', err);
  }
}

/**
 * Sinkronisasi data pengguna ke Cloud Firestore
 */
export async function syncUserToFirestore(user: AppUser): Promise<void> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, String(user.id));
    await setDoc(
      userDocRef,
      {
        id: user.id,
        uid: user.uid,
        username: normalizeUsername(user as any, user.id),
        name: user.name,
        email: user.email,
        role: user.role,
        pin: user.pin || '1234',
        createdAt: user.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Firestore sync user warning (offline/cached):', err);
  }
}

/**
 * Tambah pengguna baru langsung ke Cloud Firestore
 */
export async function createUserCloud(payload: {
  username: string;
  name: string;
  role: UserRole;
  pin: string;
}): Promise<AppUser> {
  const cleanUsername = payload.username.trim().replace(/\s+/g, '');
  const cleanName = payload.name.trim();
  const cleanPin = payload.pin.trim();

  if (!cleanUsername || !cleanName) {
    throw new Error('Username / ID Pengguna dan Nama Lengkap wajib diisi.');
  }
  if (cleanPin.length < 4) {
    throw new Error('Password / PIN minimal 4 karakter.');
  }

  try {
    const usersRef = collection(db, USERS_COLLECTION);
    const snap = await getDocs(usersRef);

    let duplicateFound = false;
    let maxNumericId = 2;

    snap.forEach((d) => {
      const data = d.data();
      const existingUsername = normalizeUsername(data, d.id).toLowerCase();
      if (existingUsername === cleanUsername.toLowerCase()) {
        duplicateFound = true;
      }
      const numId = Number(data.id || d.id);
      if (Number.isFinite(numId) && numId > maxNumericId && numId < 1000000) {
        maxNumericId = numId;
      }
    });

    if (duplicateFound) {
      throw new Error(`Username / ID "${cleanUsername}" sudah terdaftar. Gunakan ID lain.`);
    }

    const newId = maxNumericId + 1;
    const now = new Date().toISOString();
    const newUser: AppUser = {
      id: newId,
      uid: `staff-${newId}-${Date.now()}`,
      username: cleanUsername,
      email: `${cleanUsername.toLowerCase()}@sumbersewu.id`,
      name: cleanName,
      role: payload.role,
      pin: cleanPin,
      createdAt: now,
    };

    const userDocRef = doc(db, USERS_COLLECTION, String(newId));
    await setDoc(userDocRef, {
      ...newUser,
      updatedAt: now,
    });

    return newUser;
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.CREATE, USERS_COLLECTION);
    }
    throw err;
  }
}

/**
 * Perbarui data pengguna di Cloud Firestore
 */
export async function updateUserCloud(
  userId: number,
  updates: { username?: string; name?: string; role?: UserRole; pin?: string }
): Promise<void> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, String(userId));
    const snap = await getDoc(userDocRef);
    if (!snap.exists()) {
      throw new Error('Data pengguna tidak ditemukan di database.');
    }

    const updatePayload: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    if (updates.username && updates.username.trim()) {
      const cleanUsername = updates.username.trim().replace(/\s+/g, '');
      // Cek duplikasi username di dokumen lain
      const allSnap = await getDocs(collection(db, USERS_COLLECTION));
      let conflict = false;
      allSnap.forEach((d) => {
        if (String(d.id) !== String(userId)) {
          const data = d.data();
          if (normalizeUsername(data, d.id).toLowerCase() === cleanUsername.toLowerCase()) {
            conflict = true;
          }
        }
      });
      if (conflict) {
        throw new Error(`Username / ID "${cleanUsername}" sudah digunakan akun lain.`);
      }
      updatePayload.username = cleanUsername;
      updatePayload.email = `${cleanUsername.toLowerCase()}@sumbersewu.id`;
    }

    if (updates.name && updates.name.trim()) {
      updatePayload.name = updates.name.trim();
    }
    if (updates.role) {
      updatePayload.role = updates.role;
    }
    if (updates.pin && updates.pin.trim()) {
      if (updates.pin.trim().length < 4) {
        throw new Error('Password baru minimal 4 karakter.');
      }
      updatePayload.pin = updates.pin.trim();
    }

    await setDoc(userDocRef, updatePayload, { merge: true });
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.UPDATE, `${USERS_COLLECTION}/${userId}`);
    }
    throw err;
  }
}

/**
 * Hapus pengguna dari Cloud Firestore
 */
export async function deleteUserFromFirestore(userId: number): Promise<void> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, String(userId));
    await deleteDoc(userDocRef);
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.DELETE, `${USERS_COLLECTION}/${userId}`);
    }
    throw err;
  }
}

/**
 * Berlangganan perubahan real-time koleksi pengguna di Cloud Firestore
 */
export function subscribeCloudUsers(
  onUpdate: (cloudUsers: AppUser[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const usersRef = collection(db, USERS_COLLECTION);
  return onSnapshot(
    usersRef,
    (snapshot) => {
      const list: AppUser[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        const numId = Number(data.id || d.id);
        list.push({
          id: Number.isFinite(numId) ? numId : 0,
          uid: data.uid || d.id,
          username: normalizeUsername(data, d.id),
          email: data.email || '',
          name: data.name || '',
          role: (data.role as UserRole) || 'cashier',
          pin: data.pin || '1234',
          createdAt: data.createdAt || data.updatedAt,
        });
      });

      // Urutkan Owner lebih dulu, lalu berdasarkan ID menaik
      list.sort((a, b) => {
        if (a.role === 'owner' && b.role !== 'owner') return -1;
        if (a.role !== 'owner' && b.role === 'owner') return 1;
        return a.id - b.id;
      });

      onUpdate(list);
    },
    (err) => {
      console.warn('Firestore user subscription error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Verifikasi login langsung melalui Cloud Firestore
 */
export async function authenticateWithFirestore(
  identifier: string,
  secret: string
): Promise<{ success: boolean; user?: AppUser; foundUser?: boolean; message?: string }> {
  try {
    const usersRef = collection(db, USERS_COLLECTION);
    const snap = await getDocs(usersRef);

    if (snap.empty) {
      return { success: false, foundUser: false, message: 'Tidak ada data pengguna di Cloud Firestore' };
    }

    const cleanId = identifier.trim().toLowerCase();
    const cleanSecret = secret.trim();

    let exactMatchedUser: AppUser | null = null;
    let roleMatchedUser: AppUser | null = null;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const u: AppUser = {
        id: Number(data.id || docSnap.id),
        uid: data.uid || docSnap.id,
        username: normalizeUsername(data, docSnap.id),
        email: data.email || '',
        name: data.name || '',
        role: (data.role as UserRole) || 'cashier',
        pin: data.pin || '1234',
        createdAt: data.createdAt || data.updatedAt,
      };

      const username = (u.username || '').toLowerCase();
      const email = u.email.toLowerCase();
      const name = (u.name || '').toLowerCase();
      const role = u.role.toLowerCase();
      const emailPrefix = email.split('@')[0];

      if (username === cleanId || email === cleanId || emailPrefix === cleanId) {
        exactMatchedUser = u;
        break;
      } else if (!roleMatchedUser) {
        if (cleanId === 'owner' && role === 'owner') roleMatchedUser = u;
        else if (cleanId === 'kasir' && role === 'cashier') roleMatchedUser = u;
        else if (cleanId === 'cashier' && role === 'cashier') roleMatchedUser = u;
        else if (cleanId === 'manager' && role === 'manager') roleMatchedUser = u;
        else if (cleanId === 'teknisi' && role === 'technician') roleMatchedUser = u;
        else if (name === cleanId && cleanId.length >= 3) roleMatchedUser = u;
      }
    }

    const targetUser = exactMatchedUser || roleMatchedUser;
    if (!targetUser) {
      return { success: false, foundUser: false, message: 'Username atau ID Pengguna tidak ditemukan' };
    }

    if (targetUser.pin === cleanSecret) {
      return { success: true, foundUser: true, user: targetUser };
    }

    return { success: false, foundUser: true, message: 'Password atau PIN salah. Silakan coba lagi.' };
  } catch (error: any) {
    console.error('Firestore authentication fallback error:', error);
    throw error;
  }
}
