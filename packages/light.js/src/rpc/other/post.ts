// Copyright 2015-2018 Parity Technologies (UK) Ltd.
// This file is part of Parity.
//
// SPDX-License-Identifier: MIT

import { Observable, Observer } from 'rxjs';

import api from '../../api';
import { distinctReplayRefCount } from '../../utils/operators';
import { RpcObservable, Tx, TxStatus } from '../../types';

/**
 * Post a transaction to the network.
 *
 * Calls, in this order, `eth_estimateGas`, `parity_postTransaction`,
 * `parity_checkRequest` and `eth_getTransactionReceipt` to get the status of
 * the transaction.
 *
 * @param options? - Options to pass.
 * @return - The status of the transaction.
 */
export const post$: RpcObservable<any, TxStatus> = (
  tx: Tx,
  options: { estimate?: boolean } = {}
) => {
  const source$ = Observable.create(async (observer: Observer<TxStatus>) => {
    try {
      if (options.estimate) {
        observer.next({ estimating: true });
        const gas = await api().eth.estimateGas(tx);
        observer.next({ estimated: gas });
      }
      const signerRequestId = await api().parity.postTransaction(tx);
      observer.next({ requested: signerRequestId });
      const transactionHash = await api().pollMethod(
        'parity_checkRequest',
        signerRequestId
      );
      if (tx.condition) {
        observer.next({ signed: transactionHash, schedule: tx.condition });
      } else {
        observer.next({ signed: transactionHash });
        const receipt = await api().pollMethod(
          'eth_getTransactionReceipt',
          transactionHash,
          (
            receipt: any // TODO Receipt use @parity/api type
          ) => receipt && receipt.blockNumber && !receipt.blockNumber.eq(0)
        );
        observer.next({ confirmed: receipt });
      }

      observer.complete();
    } catch (error) {
      observer.next({ failed: error });
      observer.error(error);
    }
  }).pipe(distinctReplayRefCount());

  source$.subscribe(); // Run this Observable immediately;
  return source$;
};
post$.metadata = {
  calls: [
    'eth_estimateGas',
    'parity_postTransaction',
    'parity_checkRequest',
    'eth_getTransactionReceipt'
  ],
  name: 'post$'
};
