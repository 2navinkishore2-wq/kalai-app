/**
 * KALAI DIGITAL — Firebase emulator verification.
 *
 * Drives the app's real Firestore service, bill service and numbering against
 * the Firebase emulator. It never touches production data.
 *
 * Run: npx tsx scripts/verify-cloud.ts
 * Requires: Firebase emulators running with Auth + Firestore (Java 11+).
 */
import 'fake-indexeddb/auto';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCredential,
  signOut
} from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, disableNetwork, enableNetwork } from 'firebase/firestore';
import { FirestoreDataService } from '../src/services/firestoreService';
import { createCustomer } from '../src/services/customers';
import { createBill, recordBillPayment, type BillDraft } from '../src/services/bills';
import { seedWorkspace } from '../src/services/seed';
import { DEFAULT_SETTINGS } from '../src/lib/constants';
import type { Bill, BillItem, Customer } from '../src/lib/types';

const CFG = {
  apiKey: 'emulator-key',
  authDomain: 'demo-kalai.firebaseapp.com',
  projectId: 'demo-kalai',
  storageBucket: 'demo-kalai.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:000000000000'
};
const EMULATOR = { authHost: '127.0.0.1', authPort: 9099, firestoreHost: '127.0.0.1', firestorePort: 8080 };

const results: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(label: string, fn: () => boolean | Promise<boolean>, timeoutMs = 25000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await fn()) return true;
    } catch {
      /* retry */
    }
    await sleep(200);
  }
  console.error(`  TIMEOUT  ${label}`);
  return false;
}

function makeDevice(name: string) {
  const app = initializeApp(CFG, name);
  const svc = new FirestoreDataService(CFG, { appName: name, emulator: EMULATOR });
  return { app, svc, auth: getAuth(app), db: getFirestore(app) };
}

async function signInAs(device: ReturnType<typeof makeDevice>, email: string, password: string): Promise<boolean> {
  try {
    await createUserWithEmailAndPassword(device.auth, email, password);
  } catch {
    await signInWithEmailAndPassword(device.auth, email, password);
  }
  return waitFor(`sign-in ${email}`, () => device.svc.getAuthUser()?.email === email);
}

/**
 * The Auth emulator accepts an unsigned Google-shaped ID token, which lets us
 * exercise the same `signInWithCredential` path the native Google button uses.
 * A real `signInWithPopup` still requires an interactive Google account.
 */
function fakeGoogleIdToken(email: string): string {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return [
    b64({ alg: 'RS256', typ: 'JWT' }),
    b64({
      iss: 'https://accounts.google.com',
      aud: 'fake-web-client.apps.googleusercontent.com',
      sub: 'google-test-sub',
      email,
      email_verified: true,
      iat: now,
      exp: now + 3600
    }),
    'signature'
  ].join('.');
}

function mirror<T extends { id: string }>(svc: FirestoreDataService, name: string) {
  const list: T[] = [];
  const unsub = svc.watch<T>(name, undefined, (items) => {
    list.length = 0;
    list.push(...items);
  });
  return { list, unsub };
}

function draft(customer: Customer, items: BillItem[], paid = 0): BillDraft {
  return {
    date: new Date().toISOString().slice(0, 10),
    customerId: customer.id,
    customer: { name: customer.name, phone: customer.phone, address: customer.address, email: customer.email },
    items,
    discountType: 'amount',
    discountValue: 0,
    additionalCharges: 0,
    gstEnabled: false,
    gstRate: 18,
    gstInclusive: false,
    payments: paid > 0 ? [{ method: 'Cash', amount: paid, date: new Date().toISOString().slice(0, 10), reference: 'offline' }] : [],
    note: ''
  };
}

const flexItem: BillItem = {
  key: 'line-1',
  product: 'FLEX',
  label: 'Flex',
  widthIn: 120,
  heightIn: 120,
  areaSqft: 100,
  chargeableSqft: 100,
  basisSqft: 16,
  rate: 120,
  qty: 1,
  amount: 750
};

async function main() {
  console.log('KALAI DIGITAL — Firebase emulator verification\n');
  const deviceA = makeDevice('kalaiA');
  const deviceB = makeDevice('kalaiB');

  console.log('[1/8] authentication & paths');
  const okA = await signInAs(deviceA, 'owner@kalai.test', 'password123');
  const owner = deviceA.svc.getAuthUser();
  check('owner signs in', okA && !!owner?.uid);
  check(
    'account data root is users/{uid}/apps/kalai',
    deviceA.svc.basePath === `users/${owner?.uid}/apps/kalai`,
    deviceA.svc.basePath
  );
  const okB = await signInAs(deviceB, 'other@kalai.test', 'password123');
  const other = deviceB.svc.getAuthUser();
  check('second account signs in independently', okB && !!other?.uid && other.uid !== owner?.uid);

  console.log('\n[2/8] user isolation & canonical paths');
  const ownerCustomer = await createCustomer(deviceA.svc, { name: 'Owner Customer', phone: '9876543210' });
  const customerAt = await getDoc(doc(deviceA.db, `users/${owner?.uid}/apps/kalai/customers/${ownerCustomer.id}`));
  check('customer saved to the canonical customers collection', customerAt.exists(), customerAt.ref.path);

  await seedWorkspace(deviceA.svc, owner?.email);
  const settingsAt = await getDoc(doc(deviceA.db, `users/${owner?.uid}/apps/kalai/settings/business`));
  const rateAt = await getDoc(doc(deviceA.db, `users/${owner?.uid}/apps/kalai/productConfigs/product-flex`));
  const frameAt = await getDoc(doc(deviceA.db, `users/${owner?.uid}/apps/kalai/frameSizes/frame-8x6`));
  check('settings saved at the canonical settings path', settingsAt.exists(), settingsAt.ref.path);
  check('product rates saved at the canonical product rate path', rateAt.exists(), rateAt.ref.path);
  check('frame prices saved at the canonical frame price path', frameAt.exists(), frameAt.ref.path);

  let deniedRead = false;
  let deniedWrite = false;
  try {
    await setDoc(doc(deviceB.db, `users/${owner?.uid}/apps/kalai/customers/evil`), { name: 'sneaky' });
  } catch (e) {
    deniedWrite = (e as { code?: string }).code === 'permission-denied';
  }
  try {
    await getDoc(doc(deviceB.db, `users/${owner?.uid}/apps/kalai/customers/${ownerCustomer.id}`));
  } catch (e) {
    deniedRead = (e as { code?: string }).code === 'permission-denied';
  }
  check('another account cannot write to the owner subtree', deniedWrite);
  check('another account cannot read the owner subtree', deniedRead);

  console.log('\n[3/8] realtime sync between devices');
  await signOut(deviceB.auth);
  await signInAs(deviceB, 'owner@kalai.test', 'password123');
  const billsB = mirror<Bill>(deviceB.svc, 'bills');
  await waitFor('device B initial load', () => billsB.list.length >= 0);
  const onlineBill = await createBill(deviceA.svc, DEFAULT_SETTINGS, draft(ownerCustomer, [flexItem], 500), owner);
  const synced = await waitFor('bill appears on device B', () => billsB.list.some((b) => b.id === onlineBill.id));
  check('bill created on device A appears live on device B', synced);
  const billAt = await getDoc(doc(deviceA.db, `users/${owner?.uid}/apps/kalai/bills/${onlineBill.id}`));
  check('bill saved to the canonical bills collection', billAt.exists(), billAt.ref.path);
  check('unique invoice number generated', /^KD-\d{4}-\d{4}$/.test(onlineBill.number), onlineBill.number);

  console.log('\n[4/8] offline bill creation');
  await deviceA.svc.query('settings');
  await deviceA.svc.query('bills', { orderBy: { field: 'createdAt', dir: 'desc' } });
  await disableNetwork(deviceA.db);
  const offlineBill = await createBill(deviceA.svc, DEFAULT_SETTINGS, draft(ownerCustomer, [flexItem], 200), owner);
  const offlineLocal = (await deviceA.svc.get<Bill>('bills', offlineBill.id)) !== null;
  check('bill saved locally while offline', offlineLocal);
  check('offline bill totals are correct (750, balance 550)', offlineBill.total === 750 && offlineBill.balance === 550, `${offlineBill.total}/${offlineBill.balance}`);

  console.log('\n[5/8] reconnect and duplicate prevention');
  await enableNetwork(deviceA.db);
  const resumed = await waitFor('offline bill reaches the server', () => billsB.list.some((b) => b.id === offlineBill.id));
  check('offline bill synchronises after reconnect', resumed);
  const allBills = await deviceB.svc.query<Bill>('bills');
  check('no duplicate document for the offline bill', allBills.filter((b) => b.number === offlineBill.number).length === 1);
  const fixed = await deviceA.svc.reconcileInvoiceNumbers?.({ prefix: DEFAULT_SETTINGS.invoicePrefix, pattern: DEFAULT_SETTINGS.invoiceFormat }, allBills.map((b) => ({ id: b.id, number: b.number, createdAt: b.createdAt })));
  check('invoice reconciliation runs cleanly', (fixed ?? 0) === 0, `renumbered ${fixed ?? 0}`);

  console.log('\n[6/8] payments');
  const updated = await recordBillPayment(deviceA.svc, onlineBill, { method: 'UPI', amount: 250, date: new Date().toISOString().slice(0, 10), reference: 'test-upi' }, owner);
  check('payment reduces the balance and updates status', updated.balance === onlineBill.balance - 250, `${onlineBill.balance} -> ${updated.balance}`);
  const payments = await deviceA.svc.query<{ id: string }>('payments', { where: [{ field: 'billId', op: '==', value: onlineBill.id }] });
  check('payment receipt is stored separately', payments.length === 2, `${payments.length} receipts`);

  console.log('\n[7/8] persistence after a fresh session');
  await signOut(deviceB.auth);
  await signInAs(deviceB, 'owner@kalai.test', 'password123');
  const fresh = await deviceB.svc.query<Bill>('bills');
  check('bills persist after signing out and in again', fresh.some((b) => b.id === offlineBill.id), `${fresh.length} bills`);
  const freshCustomers = await deviceB.svc.query<Customer>('customers');
  check('customers persist after a fresh sign-in', freshCustomers.some((c) => c.id === ownerCustomer.id));

  console.log('\n[8/8] Google credential sign-in');
  const deviceC = makeDevice('kalaiGoogle');
  const googleCredential = GoogleAuthProvider.credential(fakeGoogleIdToken('google.owner@kalai.test'));
  const googleResult = await signInWithCredential(deviceC.auth, googleCredential);
  const googleReady = await waitFor('Google sign-in reaches the data service', () => deviceC.svc.getAuthUser()?.uid === googleResult.user.uid);
  const googleUser = deviceC.svc.getAuthUser();
  check('Google credential sign-in resolves a Firebase user', googleReady && !!googleUser?.uid, googleResult.providerId || '');
  check(
    'Google account gets a UID-scoped data root',
    deviceC.svc.basePath === `users/${googleUser?.uid}/apps/kalai`,
    deviceC.svc.basePath
  );
  const googleCustomer = await createCustomer(deviceC.svc, { name: 'Google Customer', phone: '9000000001' });
  const googleCustomerAt = await getDoc(doc(deviceC.db, `users/${googleUser?.uid}/apps/kalai/customers/${googleCustomer.id}`));
  check('Google account can save and read its own customer', googleCustomerAt.exists(), googleCustomerAt.ref.path);

  const failed = results.filter((r) => !r.ok);
  console.log(failed.length === 0 ? '\nALL CLOUD CHECKS PASSED' : `\n${failed.length} CHECK(S) FAILED`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nScript error:', (e as Error)?.message ?? e);
  console.error('Is the Firebase emulator running? Start it with the Firebase CLI, then rerun this script.');
  process.exit(2);
});
