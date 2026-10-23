import assert from 'node:assert/strict';
import test from 'node:test';
import {listNotifications, markAllNotificationsRead, markNotificationRead} from '../lib/server/v2/community/notifications.ts';

function strictEventFetcher(calls) {
  return async (path, init = {}) => {
    const url = new URL(path, 'https://db.test');
    calls.push({url, init});
    if (url.pathname.endsWith('/storyflow_creative_events')) {
      const filter = url.searchParams.get('event_type');
      assert.match(filter, /^like\./, 'PostgREST requires the operator followed by a dot');
      assert.equal(url.searchParams.get('owner_id'), 'eq.owner');
      return [];
    }
    return [];
  };
}
test('notification list and mark-all use accepted PostgREST filter syntax', async () => {
  const calls = [];
  await listNotifications(strictEventFetcher(calls), 'owner');
  await markAllNotificationsRead(strictEventFetcher(calls), 'owner');
  assert.equal(calls.length, 2);
});
test('mark-all reports a service failure instead of successful zero when event lookup fails', async () => {
  await assert.rejects(markAllNotificationsRead(async () => {throw new Error('database unavailable');}, 'owner'), error => error.code === 'service_unavailable');
});
test('read-state lookup failure never turns read notifications back into unread', async () => {
  await assert.rejects(listNotifications(async path => {
    if (path.includes('/storyflow_creative_events?')) return [{id:'event',event_type:'notification_comment',owner_id:'owner',payload:{},created_at:'2026-10-23T00:00:00Z'}];
    throw new Error('read table unavailable');
  },'owner'),error=>error.code==='service_unavailable');
});
test('mark-read inserts ignore duplicate read markers for retry-safe acknowledgement', async () => {
  let request;
  await markNotificationRead(async(path,init)=>{request=init;},'event','owner');
  assert.match(request.headers.Prefer, /resolution=ignore-duplicates/);
});
