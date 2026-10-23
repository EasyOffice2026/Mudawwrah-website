import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientIp, clientIpInfo, ipAllowed } from '../src/services/authService.js';

const request = (headers = {}, socket = '10.0.0.5') => ({ headers, socket: { remoteAddress: socket } });

test('the edge header wins, and says where the address came from', () => {
  const req = request({ 'cf-connecting-ip': '188.71.216.23', 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2, 3.3.3.3' });
  assert.deepEqual(clientIpInfo(req), { ip: '188.71.216.23', source: 'cf-connecting-ip' });
});

test('without the edge header it falls back in order: real-ip, first forwarded address, the connection itself', () => {
  assert.deepEqual(clientIpInfo(request({ 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' })), { ip: '1.1.1.1', source: 'x-real-ip' });
  assert.deepEqual(clientIpInfo(request({ 'x-forwarded-for': '2.2.2.2, 3.3.3.3' })), { ip: '2.2.2.2', source: 'x-forwarded-for' });
  assert.deepEqual(clientIpInfo(request({}, '::ffff:9.9.9.9')), { ip: '9.9.9.9', source: 'socket' });
  assert.deepEqual(clientIpInfo({ headers: {} }), { ip: '', source: 'none' });
});

test('blank headers are ignored, not treated as an address', () => {
  assert.deepEqual(clientIpInfo(request({ 'cf-connecting-ip': '  ', 'x-forwarded-for': ' , 3.3.3.3' }, '8.8.8.8')), { ip: '8.8.8.8', source: 'socket' });
});

test('clientIp is the address part of it', () => {
  assert.equal(clientIp(request({ 'cf-connecting-ip': ' 188.70.21.47 ' })), '188.70.21.47');
});

test('the branch lock: an IPv4 must match exactly, an IPv6 only needs the same /64', () => {
  const ardiya = ['188.71.216.23', '2a00:1851:22:b693::'];
  assert.equal(ipAllowed('188.71.216.23', ardiya), true);
  assert.equal(ipAllowed('188.71.216.24', ardiya), false);
  assert.equal(ipAllowed('2a00:1851:22:b693:1a2b:3c4d:5e6f:7788', ardiya), true);
  assert.equal(ipAllowed('2a00:1851:22:b694:1a2b:3c4d:5e6f:7788', ardiya), false);
  assert.equal(ipAllowed('', ardiya), false);
});
