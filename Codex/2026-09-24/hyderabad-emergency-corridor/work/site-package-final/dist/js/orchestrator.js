const ORDER = ["NORMAL", "ARMED", "YELLOW", "ALL_RED", "ACTIVE"];

export class CorridorOrchestrator {
  constructor(junctions, options = {}) {
    this.junctions = junctions.map(junction => ({ ...junction, phase: "NORMAL", passed: false }));
    this.lookahead = options.lookahead ?? 2;
    this.state = "REQUESTED";
    this.unavailableSignal = options.unavailableSignal || "";
    this.gpsAvailable = true;
    this.events = [];
  }

  emit(title, detail, level = "ok", code = "ACK", time = 0) {
    this.events.push({ title, detail, level, code, time });
  }

  transition(state, time, detail) {
    if (this.state === state) return;
    this.state = state;
    this.emit(state.replaceAll("_", " "), detail, state === "DEGRADED" ? "warn" : "ok", "STATE", time);
  }

  begin(time = 0) {
    this.transition("VERIFIED", time, "Dispatch and unit identity acknowledged.");
    this.transition("ROUTE_LOCKED", time, "Corridor graph and diversion policy loaded.");
    this.transition("ARMED", time, `Two-junction look-ahead armed for ${this.junctions.length} controllers.`);
    return this.drainEvents();
  }

  setUnavailableSignal(id, time = 0) {
    this.unavailableSignal = id || "";
    const junction = this.junctions.find(item => item.id === id);
    if (junction) {
      junction.phase = "NORMAL";
      this.emit("Signal unavailable", `${junction.name} will remain on its normal local plan; vehicle receives a degraded warning.`, "warn", "FALLBACK", time);
    }
  }

  setGpsAvailable(available, time = 0) {
    this.gpsAvailable = available;
    if (!available) {
      this.transition("DEGRADED", time, "Position feed lost. All simulated preemptions released to normal operation.");
      this.junctions.forEach(junction => {
        if (junction.phase !== "NORMAL") this.emit("Safe release", `${junction.name} returned through recovery to normal plan.`, "warn", "SAFE", time);
        junction.phase = "NORMAL";
      });
    } else if (this.state === "DEGRADED") {
      this.transition("RECOVERING", time, "Position feed restored; route verification is running before re-arm.");
      this.transition("ARMED", time + 1, "Verified position accepted; two-junction look-ahead restored.");
    }
  }

  advance(junction, target, time) {
    if (junction.phase === target) return;
    if (target === "NORMAL") {
      if (["ACTIVE", "ALL_RED", "YELLOW", "ARMED"].includes(junction.phase)) {
        junction.phase = "RECOVERING";
        this.emit("Junction recovering", `${junction.name} clearing cross-traffic hold before normal cycle.`, "ok", junction.id, time);
      }
      junction.phase = "NORMAL";
      this.emit("Normal plan restored", `${junction.name} returned to local signal timing.`, "ok", junction.id, time + 1);
      return;
    }
    const start = Math.max(0, ORDER.indexOf(junction.phase));
    const end = ORDER.indexOf(target);
    for (let index = start + 1; index <= end; index += 1) {
      const phase = ORDER[index];
      junction.phase = phase;
      const details = {
        ARMED: "Controller acknowledged request; no lamp change yet.",
        YELLOW: "Conflicting approach entering safe yellow clearance.",
        ALL_RED: "All approaches held red for clearance interval.",
        ACTIVE: "Emergency approach released after clearance acknowledgement.",
      };
      this.emit(`${junction.name}: ${phase.replace("_", "-")}`, details[phase], phase === "YELLOW" ? "warn" : "ok", junction.id, time + index / 10);
    }
  }

  update(progress, time = 0) {
    if (!this.gpsAvailable) return this.snapshot();
    if (["ARMED", "RECOVERING"].includes(this.state) && progress > 0) this.transition("ACTIVE", time, "Moving corridor active; only the next two junctions may be prepared.");
    const upcoming = this.junctions.filter(junction => junction.progress >= progress - 0.025 && !junction.passed).slice(0, this.lookahead).map(junction => junction.id);
    this.junctions.forEach(junction => {
      if (junction.id === this.unavailableSignal) {
        junction.phase = "NORMAL";
        return;
      }
      if (progress > junction.progress + 0.04) {
        junction.passed = true;
        this.advance(junction, "NORMAL", time);
        return;
      }
      if (!upcoming.includes(junction.id)) {
        if (!junction.passed) this.advance(junction, "NORMAL", time);
        return;
      }
      const delta = junction.progress - progress;
      let target = "ARMED";
      if (delta <= 0.065) target = "YELLOW";
      if (delta <= 0.045) target = "ALL_RED";
      if (delta <= 0.022) target = "ACTIVE";
      this.advance(junction, target, time);
    });
    return this.snapshot();
  }

  complete(time = 0) {
    this.junctions.forEach(junction => this.advance(junction, "NORMAL", time));
    this.transition("COMPLETE", time + 1, "Vehicle arrived; all simulated controllers confirmed normal operation.");
    return this.drainEvents();
  }

  abort(time = 0) {
    this.junctions.forEach(junction => this.advance(junction, "NORMAL", time));
    this.transition("ABORTED", time + 1, "Corridor cancelled and every controller released to its normal plan.");
  }

  snapshot() {
    return { state: this.state, gpsAvailable: this.gpsAvailable, junctions: this.junctions.map(junction => ({ ...junction })) };
  }

  drainEvents() {
    return this.events.splice(0);
  }
}
