import { cloneScenario, SCENARIOS } from "./data.js";
import { pointAlong } from "./router.js";
import { SimulationEngine } from "./simulation.js";
import { sendNotification } from "./integrations.js";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const state = {
  scenario: cloneScenario(), traffic: "normal", closure: false, unavailableSignal: "",
  placementMode: "", engine: null, timer: null, lastConfig: null, map: null, layers: {}, eventIds: new Set(),
};

function formatClock(seconds) {
  const value = Math.max(0, Math.round(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function formatDelay(seconds, count) {
  return count ? `${Math.round(seconds / count)} s` : "0 s";
}

function logEvent(event) {
  const key = `${event.time}-${event.code}-${event.title}`;
  if (state.eventIds.has(key)) return;
  state.eventIds.add(key);
  const item = document.createElement("li");
  item.className = `event-item ${event.level || "ok"}`;
  item.innerHTML = `<div class="event-meta"><span>${formatClock(event.time || 0)}</span><span>${event.code || "ACK"}</span></div><strong>${event.title}</strong><p>${event.detail}</p>`;
  $("#event-log").prepend(item);
}

function seedTimeline() {
  $("#event-log").innerHTML = "";
  state.eventIds.clear();
  [
    { time: 0, code: "DEMO", title: "Scenario ready", detail: `${state.scenario.seed} is deterministic and all traffic values are simulated.`, level: "ok" },
    { time: 0, code: "POLICY", title: "Safety policy loaded", detail: "Maximum two-junction look-ahead; yellow and all-red are mandatory before release.", level: "ok" },
  ].forEach(logEvent);
}

function renderJunctions(snapshot) {
  const junctions = snapshot?.corridor?.junctions || state.scenario.junctions.map(junction => ({ ...junction, phase: junction.id === state.unavailableSignal ? "UNAVAILABLE" : "NORMAL" }));
  const list = $("#junction-list");
  list.innerHTML = "";
  let armed = 0;
  junctions.forEach(junction => {
    const unavailable = junction.id === state.unavailableSignal;
    const phase = unavailable ? "UNAVAILABLE" : junction.phase;
    if (["ARMED", "YELLOW", "ALL_RED", "ACTIVE"].includes(phase)) armed += 1;
    const row = document.createElement("div");
    row.className = `junction-row phase-${phase.toLowerCase().replace("_", "-")}`;
    row.innerHTML = `<i></i><span>${junction.id} · ${junction.name}</span><strong>${phase.replace("_", "-")}</strong>`;
    list.append(row);
  });
  (state.layers.junctions || []).forEach((marker, index) => {
    const phase = junctions[index]?.phase || "NORMAL";
    const colors = { NORMAL: "#60736d", ARMED: "#58b7ff", YELLOW: "#f5c451", ALL_RED: "#ff6b63", ACTIVE: "#29e28f", UNAVAILABLE: "#ff6b63", RECOVERING: "#f5c451" };
    marker.setStyle({ fillColor: colors[phase] || colors.NORMAL, radius: phase === "ACTIVE" ? 9 : 6 });
  });
  $("#armed-count").textContent = `${armed} / ${junctions.length} prepared`;
}

function updateMetrics(snapshot) {
  const baseline = snapshot.baseline;
  const optimized = snapshot.optimized;
  const count = state.scenario.junctions.length;
  const saved = Math.max(0, baseline.elapsed - optimized.elapsed);
  $("#baseline-response").textContent = formatClock(baseline.elapsed);
  $("#optimized-response").textContent = formatClock(optimized.elapsed);
  $("#baseline-stopped").textContent = formatClock(baseline.stopped);
  $("#optimized-stopped").textContent = formatClock(optimized.stopped);
  $("#baseline-stops").textContent = String(baseline.stops);
  $("#optimized-stops").textContent = String(optimized.stops);
  $("#baseline-reroutes").textContent = String(baseline.reroutes);
  $("#optimized-reroutes").textContent = String(optimized.reroutes);
  $("#baseline-cross").textContent = "0 s";
  $("#optimized-cross").textContent = formatClock(optimized.crossDelay);
  $("#baseline-recovery").textContent = "0 s";
  $("#optimized-recovery").textContent = `${Math.round(optimized.crossRecovery)} s`;
  $("#baseline-junction-delay").textContent = formatDelay(baseline.stopped, count);
  $("#optimized-junction-delay").textContent = formatDelay(optimized.stopped, count);
  $("#time-saved").textContent = saved ? formatClock(saved) : "—";
  const percent = baseline.elapsed ? Math.round(saved / baseline.elapsed * 100) : 0;
  $("#saving-percent").textContent = saved ? `${percent}% faster in this simulated run` : "Comparison running";
  const eta = Math.max(0, optimized.elapsed / Math.max(.01, optimized.progress) - optimized.elapsed);
  $("#unit-eta").textContent = formatClock(eta);
  $("#unit-corridor").textContent = snapshot.corridor.state === "DEGRADED" ? "Degraded" : snapshot.corridor.state === "ACTIVE" ? "Active" : "Ready";
}

function updateVehicles(snapshot) {
  const points = snapshot.route.points;
  const baseCoord = pointAlong(points, snapshot.baseline.progress);
  const optCoord = pointAlong(points, snapshot.optimized.progress);
  if (state.layers.baseline) state.layers.baseline.setLatLng(baseCoord);
  if (state.layers.optimized) state.layers.optimized.setLatLng(optCoord);
  (state.layers.traffic || []).forEach((marker, index) => {
    const speedFactor = state.traffic === "peak" ? .18 : state.traffic === "offpeak" ? .38 : .27;
    const flow = (index / state.layers.traffic.length + snapshot.time * speedFactor / 100 + (index % 3) * .027) % 1;
    const queued = state.scenario.junctions.some(junction => Math.abs(flow - junction.progress) < (state.traffic === "peak" ? .018 : .009));
    marker.setLatLng(pointAlong(points, queued ? Math.max(0, flow - .006 * (index % 3)) : flow));
    marker.setStyle({ opacity: queued ? .95 : .58, fillOpacity: queued ? .95 : .58 });
  });
  const next = state.scenario.junctions.find(junction => junction.progress > snapshot.optimized.progress);
  if (next) {
    $("#next-turn").textContent = `Continue toward ${next.name}`;
    $("#distance-next").textContent = `${Math.max(40, Math.round((next.progress - snapshot.optimized.progress) * snapshot.route.distanceKm * 1000 / 10) * 10)} m · ${next.id === state.unavailableSignal ? "signal unavailable" : "corridor monitored"}`;
  } else {
    $("#next-turn").textContent = "Arrive at destination";
    $("#distance-next").textContent = "Final approach";
  }
  $(".unit-vehicle").style.left = `${18 + snapshot.optimized.progress * 60}%`;
}

function updateRun(snapshot) {
  $("#run-state").textContent = snapshot.corridor.state;
  $("#unit-status").textContent = snapshot.status === "COMPLETE" ? "ARRIVED" : snapshot.corridor.state;
  $("#pause-run").disabled = !["RUNNING", "PAUSED"].includes(snapshot.status);
  $("#pause-run").textContent = snapshot.status === "PAUSED" ? "Resume" : "Pause";
  updateVehicles(snapshot);
  updateMetrics(snapshot);
  renderJunctions(snapshot);
  state.engine.drainEvents().forEach(logEvent);
  if (snapshot.status === "COMPLETE") {
    stopTimer();
    $("#start-run").disabled = false;
    $("#start-run span:first-child").textContent = "Run again";
    sendNotification($("#webhook-url").value.trim(), "scenario.completed", { scenario: state.scenario.id, metrics: { baselineSeconds: snapshot.baseline.elapsed, optimizedSeconds: snapshot.optimized.elapsed } }).then(result => {
      if (result.ok === false) logEvent({ time: snapshot.time, code: "WEBHOOK", title: "Notification not delivered", detail: "Optional webhook failed; simulation and controller recovery were unaffected.", level: "warn" });
    });
  }
}

function stopTimer() {
  if (state.timer) window.clearInterval(state.timer);
  state.timer = null;
}

function createEngine(config = {}) {
  state.engine = new SimulationEngine(state.scenario, {
    traffic: config.traffic || state.traffic,
    closure: config.closure ?? state.closure,
    unavailableSignal: config.unavailableSignal ?? state.unavailableSignal,
  });
  return state.engine;
}

function startRun(replayConfig) {
  stopTimer();
  const config = replayConfig || { traffic: state.traffic, closure: state.closure, unavailableSignal: state.unavailableSignal, scenarioId: state.scenario.id };
  if (config.scenarioId && config.scenarioId !== state.scenario.id) selectScenario(config.scenarioId);
  state.lastConfig = structuredClone(config);
  seedTimeline();
  const engine = createEngine(config);
  engine.start();
  engine.drainEvents().forEach(logEvent);
  $("#start-run").disabled = true;
  $("#start-run span:first-child").textContent = "Comparison active";
  updateMapRoute(engine.snapshot().route.points, state.closure);
  updateRun(engine.snapshot());
  sendNotification($("#webhook-url").value.trim(), "scenario.started", { scenario: state.scenario.id, traffic: state.traffic, simulated: true });
  state.timer = window.setInterval(() => updateRun(engine.tick(5)), 250);
}

function resetRun() {
  stopTimer();
  if (state.engine) state.engine.orchestrator.abort(state.engine.time);
  state.engine = null;
  $("#run-state").textContent = "READY";
  $("#unit-status").textContent = "ASSIGNED";
  $("#start-run").disabled = false;
  $("#pause-run").disabled = true;
  $("#start-run span:first-child").textContent = "Start comparison";
  ["#baseline-response", "#optimized-response", "#baseline-stopped", "#optimized-stopped", "#baseline-stops", "#optimized-stops", "#baseline-junction-delay", "#optimized-junction-delay", "#baseline-cross", "#optimized-cross", "#baseline-recovery", "#optimized-recovery"].forEach(selector => $(selector).textContent = "—");
  $("#time-saved").textContent = "—";
  $("#saving-percent").textContent = "Start a run to compare";
  seedTimeline();
  renderJunctions();
  updateMapRoute(state.closure ? state.scenario.detour : state.scenario.route, state.closure);
}

function vehicleIcon(color, label) {
  return L.divIcon({ className: "vehicle-marker-wrap", html: `<span class="map-vehicle" style="--vehicle-color:${color}">${label}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });
}

function endpointIcon(color, glyph) {
  return L.divIcon({ className: "vehicle-marker-wrap", html: `<span class="endpoint-marker" style="--endpoint-color:${color}">${glyph}</span>`, iconSize: [27, 27], iconAnchor: [13, 13] });
}

function updateMapRoute(points, closure = false) {
  if (!state.map) return;
  if (state.layers.route) state.layers.route.remove();
  state.layers.route = L.polyline(points, { color: "#29e28f", weight: 6, opacity: .93, dashArray: closure ? "11 7" : undefined }).addTo(state.map);
  if (state.layers.unit) state.layers.unit.setLatLng(points[0]);
  if (state.layers.destination) state.layers.destination.setLatLng(points.at(-1));
  if (state.layers.baseline) state.layers.baseline.setLatLng(points[0]);
  if (state.layers.optimized) state.layers.optimized.setLatLng(points[0]);
  if (state.layers.closure) state.layers.closure.remove();
  if (closure) state.layers.closure = L.marker([17.4044, 78.4629], { icon: L.divIcon({ className: "closure-marker", html: "×", iconSize: [26,26] }) }).addTo(state.map).bindTooltip("Simulated roadblock");
  state.map.fitBounds(L.latLngBounds(points), { padding: [55, 55] });
}

function rebuildJunctionMarkers() {
  if (!state.map) return;
  (state.layers.junctions || []).forEach(marker => marker.remove());
  state.layers.junctions = state.scenario.junctions.map(junction => L.circleMarker(junction.coord, { radius: 6, color: "#071411", weight: 2, fillColor: junction.id === state.unavailableSignal ? "#ff6b63" : "#f5c451", fillOpacity: 1 }).addTo(state.map).bindTooltip(`${junction.id} · ${junction.name}`));
}

function initMap() {
  if (!window.L) {
    logEvent({ time: 0, code: "MAP", title: "Offline map fallback", detail: "Live tiles unavailable; corridor schematic remains usable.", level: "warn" });
    return;
  }
  const map = L.map("map", { zoomControl: false, preferCanvas: true }).setView([17.398, 78.465], 14);
  state.map = map;
  const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' });
  let tileLoaded = false;
  tiles.on("load", () => { tileLoaded = true; $("#fallback-map").hidden = true; $(".attribution-fallback").hidden = true; });
  tiles.addTo(map);
  L.control.zoom({ position: "bottomleft" }).addTo(map);
  state.layers.unit = L.marker(state.scenario.route[0], { icon: endpointIcon("#58b7ff", "+") }).addTo(map).bindTooltip("Unit · NIMS");
  state.layers.destination = L.marker(state.scenario.route.at(-1), { icon: endpointIcon("#f5c451", "!") }).addTo(map).bindTooltip("Destination · OGH");
  state.layers.baseline = L.marker(state.scenario.route[0], { icon: vehicleIcon("#58b7ff", "B"), zIndexOffset: 600 }).addTo(map).bindTooltip("Baseline vehicle");
  state.layers.optimized = L.marker(state.scenario.route[0], { icon: vehicleIcon("#29e28f", "G"), zIndexOffset: 700 }).addTo(map).bindTooltip("Optimized vehicle");
  state.layers.traffic = Array.from({ length: 18 }, (_, index) => L.circleMarker(pointAlong(state.scenario.route, index / 18), {
    radius: index % 4 === 0 ? 3.5 : 2.5, color: "#d2ded9", weight: 1, fillColor: "#aabdb5", opacity: .58, fillOpacity: .58, interactive: false,
  }).addTo(map));
  rebuildJunctionMarkers();
  updateMapRoute(state.scenario.route);
  map.on("click", event => {
    if (!state.placementMode || state.engine?.status === "RUNNING") return;
    const coord = [event.latlng.lat, event.latlng.lng];
    if (state.placementMode === "unit") {
      state.scenario.route[0] = coord;
      state.scenario.detour[0] = coord;
      $("#placement-help").textContent = "Unit placed. Select destination or start the comparison.";
    } else {
      state.scenario.route[state.scenario.route.length - 1] = coord;
      state.scenario.detour[state.scenario.detour.length - 1] = coord;
      $("#placement-help").textContent = "Destination placed. The corridor keeps the configured junction sequence.";
    }
    clearPlacement();
    updateMapRoute(state.closure ? state.scenario.detour : state.scenario.route, state.closure);
  });
  window.setTimeout(() => {
    if (!tileLoaded) {
      $("#map").style.opacity = ".72";
      $("#fallback-map").hidden = false;
      logEvent({ time: 0, code: "MAP", title: "Basemap tiles delayed", detail: "Offline schematic is visible beneath the deterministic route overlay.", level: "warn" });
    }
  }, 5000);
}

function clearPlacement() {
  state.placementMode = "";
  $$('[data-place]').forEach(button => button.classList.remove("active"));
}

function selectScenario(id) {
  state.scenario = cloneScenario(id);
  $("#corridor").value = state.scenario.id;
  $(".scenario-heading h1").textContent = state.scenario.name;
  $(".section-heading span:last-child").textContent = `Deterministic seed ${state.scenario.seed}`;
  resetRun();
  rebuildJunctionMarkers();
}

function bindControls() {
  $$('[data-view]').forEach(button => button.addEventListener("click", () => {
    $$('[data-view]').forEach(node => node.classList.toggle("active", node === button));
    const unit = button.dataset.view === "unit";
    $("#command-view").hidden = unit;
    $("#unit-view").hidden = !unit;
    if (!unit && state.map) window.setTimeout(() => state.map.invalidateSize(), 50);
  }));
  $$('[data-traffic]').forEach(button => button.addEventListener("click", () => {
    state.traffic = button.dataset.traffic;
    $$('[data-traffic]').forEach(node => node.classList.toggle("active", node === button));
  }));
  $$('[data-place]').forEach(button => button.addEventListener("click", () => {
    state.placementMode = state.placementMode === button.dataset.place ? "" : button.dataset.place;
    $$('[data-place]').forEach(node => node.classList.toggle("active", node.dataset.place === state.placementMode));
    $("#placement-help").textContent = state.placementMode ? `Tap the map to place the ${state.placementMode === "unit" ? "unit" : "destination"}.` : "Choose a corridor or place its endpoints on the map.";
  }));
  $("#corridor").addEventListener("change", event => selectScenario(event.target.value));
  $("#closure-toggle").addEventListener("click", () => {
    state.closure = !state.closure;
    $("#closure-toggle").setAttribute("aria-checked", String(state.closure));
    if (state.engine) {
      state.engine.setClosure(state.closure);
      updateMapRoute(state.engine.route.points, state.closure);
      state.engine.drainEvents().forEach(logEvent);
    } else updateMapRoute(state.closure ? state.scenario.detour : state.scenario.route, state.closure);
  });
  $("#signal-failure").addEventListener("change", event => {
    state.unavailableSignal = event.target.value;
    if (state.engine) state.engine.setUnavailableSignal(state.unavailableSignal);
    rebuildJunctionMarkers();
    renderJunctions(state.engine?.snapshot());
  });
  $("#start-run").addEventListener("click", () => startRun());
  $("#pause-run").addEventListener("click", () => { if (state.engine) updateRun({ ...state.engine.snapshot(), status: state.engine.togglePause() }); });
  $("#reset-run").addEventListener("click", resetRun);
  $("#replay-run").addEventListener("click", () => startRun(state.lastConfig || undefined));
  $("#inject-roadblock").addEventListener("click", () => { if (!state.closure) $("#closure-toggle").click(); });
  $("#inject-failure").addEventListener("click", () => {
    if (!state.engine) return logEvent({ time: 0, code: "INFO", title: "Start the comparison first", detail: "GPS loss can be injected while a run is active.", level: "warn" });
    const available = state.engine.orchestrator.gpsAvailable;
    state.engine.setGpsAvailable(!available);
    $("#inject-failure").textContent = available ? "Restore GPS feed" : "Simulate GPS loss";
    updateRun(state.engine.snapshot());
  });
  $("#share-location").addEventListener("click", () => {
    if (!navigator.geolocation) return $("#share-location").textContent = "Location unavailable";
    $("#share-location").textContent = "Requesting location…";
    navigator.geolocation.getCurrentPosition(position => {
      state.scenario.route[0] = [position.coords.latitude, position.coords.longitude];
      state.scenario.detour[0] = [...state.scenario.route[0]];
      $("#share-location").textContent = "Demo GPS connected";
      updateMapRoute(state.closure ? state.scenario.detour : state.scenario.route, state.closure);
    }, () => $("#share-location").textContent = "Location permission not granted", { enableHighAccuracy: true, timeout: 8000 });
  });
}

function registerWebMcp() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const register = tool => Promise.resolve(context.registerTool(tool)).catch(() => {});
  register({
    name: "configure_corridor_scenario", title: "Configure corridor scenario",
    description: "Stage a visible Hyderabad corridor scenario before running it.",
    inputSchema: { type: "object", properties: { scenarioId: { type: "string", enum: Object.keys(SCENARIOS) }, traffic: { type: "string", enum: ["offpeak", "normal", "peak"] }, closure: { type: "boolean" }, unavailableSignal: { type: "string" } }, additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input = {}) {
      if (input.scenarioId) selectScenario(input.scenarioId);
      if (input.traffic) document.querySelector(`[data-traffic="${input.traffic}"]`)?.click();
      if (typeof input.closure === "boolean" && input.closure !== state.closure) $("#closure-toggle").click();
      if (typeof input.unavailableSignal === "string") { $("#signal-failure").value = input.unavailableSignal; $("#signal-failure").dispatchEvent(new Event("change")); }
      return { scenarioId: state.scenario.id, traffic: state.traffic, closure: state.closure, unavailableSignal: state.unavailableSignal };
    },
  });
  register({
    name: "start_corridor_comparison", title: "Start corridor comparison",
    description: "Start the visible deterministic baseline-versus-optimized simulation.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute() { startRun(); return { status: "RUNNING", scenarioId: state.scenario.id, simulated: true }; },
  });
  register({
    name: "read_corridor_status", title: "Read corridor status",
    description: "Read the current visible simulation state and comparison metrics.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute() { return state.engine?.snapshot() || { status: "READY", scenarioId: state.scenario.id }; },
  });
}

seedTimeline();
renderJunctions();
bindControls();
window.addEventListener("load", initMap);
registerWebMcp();
