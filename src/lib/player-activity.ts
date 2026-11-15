/** One heartbeat per visible authenticated layout; timestamps are owned by SQL. */
export function startPlayerActivity(options: {
  record: () => PromiseLike<{ error: unknown }>;
  document: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
  window: Pick<Window, "addEventListener" | "removeEventListener" | "setInterval" | "clearInterval">;
  onError: (error: unknown) => void;
}) {
  let stopped = false;
  let inFlight = false;
  let replay = false;

  const record = async () => {
    if (stopped || options.document.visibilityState !== "visible") return;
    if (inFlight) { replay = true; return; }
    inFlight = true;
    try {
      const { error } = await options.record();
      if (error && !stopped) options.onError(error);
    } catch (error) {
      if (!stopped) options.onError(error);
    } finally {
      inFlight = false;
      if (replay && !stopped) {
        replay = false;
        void record();
      }
    }
  };
  const resume = () => { void record(); };
  const timer = options.window.setInterval(resume, 10_000);
  options.document.addEventListener("visibilitychange", resume);
  options.window.addEventListener("focus", resume);
  options.window.addEventListener("pageshow", resume);
  options.window.addEventListener("online", resume);
  resume();

  return () => {
    stopped = true;
    options.window.clearInterval(timer);
    options.document.removeEventListener("visibilitychange", resume);
    options.window.removeEventListener("focus", resume);
    options.window.removeEventListener("pageshow", resume);
    options.window.removeEventListener("online", resume);
  };
}