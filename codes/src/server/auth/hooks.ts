import type { Tx } from '../db';

export interface HookUser {
  id: string;
}

/** Registri hook SPEC-001 (_api-contract.md bagian 7). Dijalankan di dalam transaksi pemicu; kegagalan membatalkan transaksi. */
export type UserCreatedHook = (tx: Tx, user: HookUser) => Promise<void>;
export type UserAnonymizedHook = (tx: Tx, userId: string) => Promise<void>;

export const userCreatedHooks: UserCreatedHook[] = [];
export const userAnonymizedHooks: UserAnonymizedHook[] = [];
