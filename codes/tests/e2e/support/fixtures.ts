/** `test` kustom: setiap tes memakai IP semu unik (X-Forwarded-For) agar rate limit per-IP tidak menular antar tes. */
import { test as base, expect } from '@playwright/test';
import { freshIp } from './app';

export const test = base.extend({
  extraHTTPHeaders: async ({}, provide) => {
    await provide({ 'x-forwarded-for': freshIp() });
  },
});
export { expect };
