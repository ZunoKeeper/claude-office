import { describe, it, expect } from 'vitest';
import net from 'node:net';
import { checkPinMatch, portInUse } from '../../scripts/setup.mjs';

describe('checkPinMatch', () => {
  it('matches v-prefixed actual against pin', () => {
    expect(checkPinMatch('22.15.0', 'v22.15.0').ok).toBe(true);
  });

  it('fails on mismatch with reason', () => {
    const r = checkPinMatch('22.15.0', 'v24.13.0');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('24.13.0');
  });

  it('fails when no pin exists', () => {
    expect(checkPinMatch(undefined, 'v22.15.0').ok).toBe(false);
  });
});

describe('portInUse', () => {
  it('detects a listening port', async () => {
    const srv = net.createServer();
    await new Promise((res) => srv.listen(0, '127.0.0.1', () => res(null)));
    const port = (srv.address() as net.AddressInfo).port;
    expect(await portInUse(port)).toBe(true);
    await new Promise((res) => srv.close(() => res(null)));
    expect(await portInUse(port)).toBe(false);
  });
});
