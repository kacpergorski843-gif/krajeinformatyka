import { afterEach, describe, expect, it, vi } from "vitest";
import { startPlayerActivity } from "./player-activity";

function setup(record = vi.fn(async () => ({ error: null as unknown }))) {
  vi.useFakeTimers();
  const doc = new EventTarget();
  const win = new EventTarget();
  let visible = "visible";
  const onError = vi.fn();
  const stop = startPlayerActivity({
    record, onError,
    document: Object.assign(doc, { get visibilityState() { return visible; } }) as Document,
    window: Object.assign(win, { setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval }) as unknown as Window,
  });
  return { record, stop, doc, win, onError, hide: () => { visible = "hidden"; }, show: () => { visible = "visible"; } };
}
afterEach(() => vi.useRealTimers());
describe("visible app activity", () => {
  it("records immediately for an already authenticated app entry", async () => {
    const s = setup(); await Promise.resolve(); expect(s.record).toHaveBeenCalledTimes(1); s.stop();
  });
  it("refreshes every 10 seconds while visible", async () => {
    const s = setup(); await vi.advanceTimersByTimeAsync(30_000); expect(s.record).toHaveBeenCalledTimes(4); s.stop();
  });
  it("never records hidden time and refreshes on tab return", async () => {
    const s = setup(); await Promise.resolve(); s.hide();
    await vi.advanceTimersByTimeAsync(30_000); expect(s.record).toHaveBeenCalledTimes(1);
    s.show(); s.doc.dispatchEvent(new Event("visibilitychange")); await Promise.resolve();
    expect(s.record).toHaveBeenCalledTimes(2); s.stop();
  });
  it.each(["focus", "pageshow", "online"])("refreshes on %s without login", async (event) => {
    const s = setup(); await Promise.resolve(); s.win.dispatchEvent(new Event(event));
    await Promise.resolve(); expect(s.record).toHaveBeenCalledTimes(2); s.stop();
  });
  it("does not overlap slow requests and reconciles the return", async () => {
    let resolve: ((v: { error: unknown }) => void) | undefined;
    const s = setup(vi.fn(() => new Promise<{ error: unknown }>(r => { resolve = r; })));
    await vi.advanceTimersByTimeAsync(20_000); expect(s.record).toHaveBeenCalledTimes(1);
    resolve?.({ error: null }); await Promise.resolve(); await Promise.resolve();
    expect(s.record).toHaveBeenCalledTimes(2); s.stop();
  });
  it("retries after errors without stopping activity", async () => {
    const s = setup(vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ error: null }));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(s.onError).toHaveBeenCalledTimes(1); expect(s.record).toHaveBeenCalledTimes(2); s.stop();
  });
  it("stops on layout removal/sign-out", async () => {
    const s = setup(); await Promise.resolve(); s.stop();
    await vi.advanceTimersByTimeAsync(20_000); s.win.dispatchEvent(new Event("focus"));
    expect(s.record).toHaveBeenCalledTimes(1);
  });
});