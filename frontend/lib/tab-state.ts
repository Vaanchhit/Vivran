"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * State that outlives the page showing it.
 *
 * Every sidebar tab is its own route, so leaving one unmounts it and plain
 * useState is thrown away: a half-written prompt, the dropdowns, the result
 * on screen. Values kept here survive that.
 *
 * - useTabState: kept in sessionStorage, so it also survives a refresh. It is
 *   scoped to the browser tab and gone once the tab is closed.
 * - useLiveState: kept in memory only, for "something is running right now"
 *   flags. A request in flight keeps going across in-app navigation but dies on
 *   a refresh, so a flag that survived the refresh would spin forever.
 *
 * Writes go through the store, not the component, so a request that finishes
 * after its page was left still lands where the page will look for it.
 */

const PREFIX = "vivran_tab:";
type Updater<T> = T | ((prev: T) => T);

const live = new Map<string, unknown>();
const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();

function emit(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

function subscribeKey(key: string, fn: () => void) {
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(fn);
  return () => {
    set!.delete(fn);
  };
}

function readSession<T>(key: string, initial: T): T {
  if (cache.has(key)) return cache.get(key) as T;
  let value = initial;
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    if (raw !== null) value = JSON.parse(raw) as T;
  } catch {
    // Storage blocked or a malformed entry: start from the initial value.
  }
  cache.set(key, value);
  return value;
}

export function setTabValue<T>(key: string, next: Updater<T>, initial: T) {
  const prev = readSession(key, initial);
  const value = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
  if (Object.is(value, prev)) return;
  cache.set(key, value);
  try {
    if (value === undefined || value === null || value === initial) window.sessionStorage.removeItem(PREFIX + key);
    else window.sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Quota or blocked storage: the value still lives for this page load.
  }
  emit(key);
}

export function getLiveValue<T>(key: string, initial: T): T {
  return (live.has(key) ? live.get(key) : initial) as T;
}

export function setLiveValue<T>(key: string, next: Updater<T>, initial: T) {
  const prev = getLiveValue(key, initial);
  const value = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
  if (Object.is(value, prev)) return;
  live.set(key, value);
  emit(key);
}

export function useTabState<T>(key: string, initial: T): [T, (next: Updater<T>) => void] {
  const subscribe = useCallback((fn: () => void) => subscribeKey(key, fn), [key]);
  // `initial` is only a fallback; callers pass literals, so it is not a dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useSyncExternalStore(subscribe, () => readSession(key, initial), () => initial);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const set = useCallback((next: Updater<T>) => setTabValue(key, next, initial), [key]);
  return [value, set];
}

export function useLiveState<T>(key: string, initial: T): [T, (next: Updater<T>) => void] {
  const subscribe = useCallback((fn: () => void) => subscribeKey(key, fn), [key]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useSyncExternalStore(subscribe, () => getLiveValue(key, initial), () => initial);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const set = useCallback((next: Updater<T>) => setLiveValue(key, next, initial), [key]);
  return [value, set];
}

/** Drops every kept value whose key starts with `scope` (all of them when omitted). */
export function clearTabState(scope = "") {
  const keys = new Set<string>([...cache.keys(), ...live.keys()]);
  try {
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const k = window.sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.add(k.slice(PREFIX.length));
    }
  } catch {
    // ignore
  }
  keys.forEach((k) => {
    if (!k.startsWith(scope)) return;
    cache.delete(k);
    live.delete(k);
    try {
      window.sessionStorage.removeItem(PREFIX + k);
    } catch {
      // ignore
    }
    emit(k);
  });
}

// ── Pages currently on screen ─────────────────────────────────────────────
// A finished request needs to know whether anyone is looking at its result:
// if not, the teacher gets a notice instead of silence.

const mounted = new Map<string, number>();

export function isScopeOnScreen(scope: string) {
  return (mounted.get(scope) ?? 0) > 0;
}

export function useOnScreen(scope: string) {
  useEffect(() => {
    mounted.set(scope, (mounted.get(scope) ?? 0) + 1);
    return () => {
      mounted.set(scope, (mounted.get(scope) ?? 1) - 1);
    };
  }, [scope]);
}

// ── Notices for work that finished off screen ─────────────────────────────

export interface Notice {
  id: number;
  tone: "success" | "error";
  message: string;
  href?: string;
  linkLabel?: string;
}

let notices: Notice[] = [];
let nextNoticeId = 1;
const noticeListeners = new Set<() => void>();

function emitNotices() {
  noticeListeners.forEach((fn) => fn());
}

export function pushNotice(n: Omit<Notice, "id">) {
  notices = [...notices, { ...n, id: nextNoticeId++ }];
  emitNotices();
}

export function dismissNotice(id: number) {
  notices = notices.filter((n) => n.id !== id);
  emitNotices();
}

/** Tells the teacher about finished work only when its page isn't on screen. */
export function noticeIfAway(scope: string, n: Omit<Notice, "id">) {
  if (!isScopeOnScreen(scope)) pushNotice(n);
}

export function useNotices(): Notice[] {
  return useSyncExternalStore(
    (fn) => {
      noticeListeners.add(fn);
      return () => {
        noticeListeners.delete(fn);
      };
    },
    () => notices,
    () => notices,
  );
}

/** Warns before leaving while `active`: on refresh/close, and (unless
 * `links` is false) on any in-app link. */
export function useLeaveWarning(active: boolean, message: string, { links = true }: { links?: boolean } = {}) {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    // Next's router has no navigation guard, so internal links are caught in
    // the capture phase, before Link's own handler runs.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.origin !== window.location.origin) return;
      if (a.pathname === window.location.pathname && a.search === window.location.search) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    if (links) document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [active, message, links]);
}
