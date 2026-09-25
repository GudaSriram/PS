import { TRAFFIC_PRESETS } from "./data.js";
import { routeFor } from "./router.js";
import { CorridorOrchestrator } from "./orchestrator.js";

function freshMode(name) {
  return { name, progress: 0, elapsed: 0, stopped: 0, stops: 0, reroutes: 0, crossDelay: 0, crossRecovery: 0, waitRemaining: 0, handled: new Set(), complete: false };
}

export class SimulationEngine {
  constructor(scenario, options = {}) {
    this.scenario = structuredClone(scenario);
    this.traffic = options.traffic || "normal";
    this.closure = Boolean(options.closure);
    this.unavailableSignal = options.unavailableSignal || "";
    this.route = routeFor(this.scenario, this.closure);
    this.orchestrator = new CorridorOrchestrator(this.scenario.junctions, { unavailableSignal: this.unavailableSignal });
    this.baseline = freshMode("baseline");
    this.optimized = freshMode("optimized");
    this.status = "READY";
    this.time = 0;
    this.events = [];
    this.completedNotified = false;
    if (this.closure) this.baseline.reroutes = this.optimized.reroutes = 1;
  }

  start() {
    if (this.status === "RUNNING") return;
    this.status = "RUNNING";
    this.events.push(...this.orchestrator.begin(this.time));
    if (this.closure) this.events.push({ title: "Diversion selected", detail: "Lakdikapul approach closure avoided via Red Hills–Nampally link.", level: "warn", code: "ROUTE", time: this.time });
  }

  togglePause() {
    if (this.status === "RUNNING") this.status = "PAUSED";
    else if (this.status === "PAUSED") this.status = "RUNNING";
    return this.status;
  }

  setClosure(enabled) {
    if (this.closure === enabled) return;
    this.closure = enabled;
    this.route = routeFor(this.scenario, this.closure);
    if (enabled) {
      this.baseline.reroutes += 1;
      this.optimized.reroutes += 1;
      this.events.push({ title: "Roadblock confirmed", detail: "Both modes rerouted around Lakdikapul using the same deterministic graph update.", level: "warn", code: "REROUTE", time: this.time });
    } else {
      this.events.push({ title: "Road reopened", detail: "Original corridor restored for remaining route.", level: "ok", code: "ROUTE", time: this.time });
    }
  }

  setUnavailableSignal(id) {
    this.unavailableSignal = id || "";
    this.orchestrator.setUnavailableSignal(this.unavailableSignal, this.time);
    this.events.push(...this.orchestrator.drainEvents());
  }

  setGpsAvailable(available) {
    this.orchestrator.setGpsAvailable(available, this.time);
    this.events.push(...this.orchestrator.drainEvents());
  }

  stepMode(mode, optimized, dt) {
    if (mode.complete) return;
    mode.elapsed += dt;
    if (mode.waitRemaining > 0) {
      const waited = Math.min(dt, mode.waitRemaining);
      mode.waitRemaining -= waited;
      mode.stopped += waited;
      if (optimized && this.orchestrator.state === "ACTIVE") mode.crossDelay += waited * 0.18;
      return;
    }
    const preset = TRAFFIC_PRESETS[this.traffic];
    const nextJunction = this.scenario.junctions.find(junction => !mode.handled.has(junction.id) && mode.progress >= junction.progress - 0.006);
    if (nextJunction) {
      mode.handled.add(nextJunction.id);
      const canPreempt = optimized && this.orchestrator.gpsAvailable && nextJunction.id !== this.unavailableSignal;
      const wait = canPreempt ? Math.max(1.5, nextJunction.wait * 0.09) : nextJunction.wait * preset.waitFactor;
      mode.waitRemaining = wait;
      mode.stops += wait > 4 ? 1 : 0;
      if (canPreempt) {
        mode.crossDelay += 7.5 * preset.queue;
        mode.crossRecovery = Math.max(mode.crossRecovery, 7 + 5 * preset.queue);
      }
      this.events.push({
        title: canPreempt ? `${nextJunction.name} cleared` : `${optimized ? "Fallback at" : "Baseline stop at"} ${nextJunction.name}`,
        detail: canPreempt ? `Safe clearance accepted; simulated hold ${wait.toFixed(0)} s.` : `Normal-cycle wait ${wait.toFixed(0)} s.`,
        level: canPreempt ? "ok" : "warn",
        code: optimized ? "OPT" : "BASE",
        time: this.time,
      });
      return;
    }
    const speed = preset.speedMps * (optimized ? 1.02 : 1);
    const distanceM = this.route.distanceKm * 1000;
    mode.progress = Math.min(1, mode.progress + speed * dt / distanceM);
    if (mode.progress >= 1) mode.complete = true;
  }

  tick(dt = 1) {
    if (this.status !== "RUNNING") return this.snapshot();
    this.time += dt;
    this.stepMode(this.baseline, false, dt);
    this.stepMode(this.optimized, true, dt);
    this.orchestrator.update(this.optimized.progress, this.time);
    this.events.push(...this.orchestrator.drainEvents());
    if (this.baseline.complete && this.optimized.complete && !this.completedNotified) {
      this.status = "COMPLETE";
      this.completedNotified = true;
      this.events.push(...this.orchestrator.complete(this.time));
      this.events.push({ title: "Comparison complete", detail: `${Math.max(0, this.baseline.elapsed - this.optimized.elapsed).toFixed(0)} simulated seconds saved. All controllers normal.`, level: "ok", code: "DONE", time: this.time + 1 });
    }
    return this.snapshot();
  }

  snapshot() {
    const copyMode = mode => ({ ...mode, handled: [...mode.handled] });
    return {
      status: this.status,
      time: this.time,
      route: structuredClone(this.route),
      baseline: copyMode(this.baseline),
      optimized: copyMode(this.optimized),
      corridor: this.orchestrator.snapshot(),
    };
  }

  drainEvents() {
    return this.events.splice(0);
  }
}
