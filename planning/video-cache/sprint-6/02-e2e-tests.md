# Task 6.2: End-to-End Tests

## Objective

Write Playwright end-to-end tests that verify the complete video caching pipeline works in a real browser environment, including Service Worker registration, cache hits/misses, and UI indicators.

## Test Suites

### 1. Service Worker Lifecycle

```typescript
test.describe('Service Worker', () => {
  test('registers on app load')
  test('activates and controls the page')
  test('survives page navigation')
  test('updates when new version is deployed')
  test('intercepts /haven/v/* requests')
  test('passes through non-haven requests')
})
```

### 2. Cache-First Video Playback

```typescript
test.describe('Cache-First Playback', () => {
  test('first play: shows decryption progress, then plays video')
  test('first play: video is cached after decryption')
  test('second play: video plays instantly from cache (no progress UI)')
  test('cached video supports seeking (Range requests)')
  test('cache indicator shows "Cached" badge after first play')
})
```

### 3. Cache Management

```typescript
test.describe('Cache Management', () => {
  test('settings page shows cached videos list')
  test('settings page shows storage usage')
  test('individual video can be removed from cache')
  test('clear all removes all cached videos')
  test('evicted video requires re-decryption on next play')
})
```

### 4. Error Recovery

```typescript
test.describe('Error Recovery', () => {
  test('corrupted cache entry is evicted and video is re-fetched')
  test('quota exceeded triggers eviction of oldest entries')
})
```

### 5. Security Cleanup

```typescript
test.describe('Security Cleanup', () => {
  test('wallet disconnect clears auth caches')
  test('account switch clears old account state')
})
```

## Test Infrastructure

- Use Playwright with Chromium (Service Worker support required)
- Mock Synapse SDK responses for deterministic tests
- Mock Lit Protocol responses to avoid real wallet interactions
- Use test fixtures for encrypted video data

## Acceptance Criteria

- [ ] All test suites pass in Playwright with Chromium
- [ ] Tests are deterministic (no flaky tests)
- [ ] Tests clean up after themselves (no leftover cache data)
- [ ] Tests can run in CI
- [ ] Test fixtures are documented

## Dependencies

- All Sprint 1-5 tasks

## Estimated Effort

Large (8-10 hours)