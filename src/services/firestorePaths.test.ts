import { describe, expect, it } from 'vitest';
import {
  KALAI_APP_NAMESPACE,
  accountCollectionPath,
  accountDocumentPath,
  userDataPath
} from './firestoreService';

const uid = 'owner-uid';
const segmentCount = (path: string) => path.split('/').length;

describe('Firestore account paths', () => {
  it('keeps the profile document and nests KALAI data in an app document', () => {
    expect(KALAI_APP_NAMESPACE).toBe('apps/kalai');
    expect(userDataPath(uid)).toBe('users/owner-uid/apps/kalai');
  });

  it('builds collection paths with an odd number of segments', () => {
    for (const name of ['customers', 'bills', 'payments', 'expenses', 'productConfigs', 'frameSizes', 'settings', 'counters']) {
      const path = accountCollectionPath(uid, name);
      expect(path).toBe(`users/${uid}/apps/kalai/${name}`);
      expect(segmentCount(path) % 2).toBe(1);
    }
  });

  it('builds document paths with an even number of segments', () => {
    const customer = accountDocumentPath(uid, 'customers', 'cust_1');
    const rubberRate = accountDocumentPath(uid, 'productConfigs', 'product-flex');
    const settings = accountDocumentPath(uid, 'settings', 'business');
    const counter = accountDocumentPath(uid, 'counters', 'bills');

    expect(customer).toBe(`users/${uid}/apps/kalai/customers/cust_1`);
    for (const path of [customer, rubberRate, settings, counter]) {
      expect(segmentCount(path) % 2).toBe(0);
    }
  });

  it('never produces the invalid four-segment customers path', () => {
    expect(accountCollectionPath(uid, 'customers')).not.toBe(`users/${uid}/kalai/customers`);
  });

  it('rejects missing user, collection or document identifiers', () => {
    expect(() => userDataPath('')).toThrow('not-authenticated');
    expect(() => userDataPath('bad/uid')).toThrow('not-authenticated');
    expect(() => accountCollectionPath(uid, '')).toThrow('invalid-collection');
    expect(() => accountDocumentPath(uid, 'customers', '')).toThrow('invalid-document-id');
  });
});
