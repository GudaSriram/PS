export const TRAFFIC_PRESETS = Object.freeze({
  offpeak: { label: "Off-peak", speedMps: 11.8, waitFactor: 0.65, queue: 0.55 },
  normal: { label: "Normal", speedMps: 9.4, waitFactor: 1, queue: 1 },
  peak: { label: "Peak", speedMps: 7.1, waitFactor: 1.55, queue: 1.6 },
});

const nimsJunctions = [
  { id: "J1", name: "Punjagutta", progress: 0.12, coord: [17.4214, 78.4546], wait: 18 },
  { id: "J2", name: "Khairatabad", progress: 0.29, coord: [17.4127, 78.4602], wait: 24 },
  { id: "J3", name: "Lakdikapul", progress: 0.43, coord: [17.4044, 78.4629], wait: 31 },
  { id: "J4", name: "Assembly", progress: 0.54, coord: [17.4024, 78.4685], wait: 22 },
  { id: "J5", name: "Abids", progress: 0.72, coord: [17.3924, 78.4764], wait: 34 },
  { id: "J6", name: "Afzal Gunj", progress: 0.91, coord: [17.3780, 78.4752], wait: 26 },
];

export const SCENARIOS = Object.freeze({
  "nims-ogh": {
    id: "nims-ogh",
    name: "NIMS → Osmania General Hospital",
    unit: "NIMS, Punjagutta",
    destination: "Osmania General Hospital, Afzal Gunj",
    distanceKm: 6.4,
    seed: "HYD-07",
    route: [
      [17.4239, 78.4514], [17.4209, 78.4542], [17.4166, 78.4569],
      [17.4127, 78.4602], [17.4083, 78.4621], [17.4044, 78.4629],
      [17.4024, 78.4685], [17.3983, 78.4730], [17.3924, 78.4764],
      [17.3860, 78.4759], [17.3780, 78.4752], [17.3712, 78.4745],
    ],
    detour: [
      [17.4239, 78.4514], [17.4209, 78.4542], [17.4166, 78.4569],
      [17.4127, 78.4602], [17.4098, 78.4550], [17.4037, 78.4561],
      [17.3971, 78.4626], [17.3983, 78.4730], [17.3924, 78.4764],
      [17.3860, 78.4759], [17.3780, 78.4752], [17.3712, 78.4745],
    ],
    junctions: nimsJunctions,
  },
  "apollo-ogh": {
    id: "apollo-ogh",
    name: "Apollo Jubilee Hills → Osmania General Hospital",
    unit: "Apollo Hospitals, Jubilee Hills",
    destination: "Osmania General Hospital, Afzal Gunj",
    distanceKm: 10.8,
    seed: "HYD-12",
    route: [[17.4141,78.4123],[17.4163,78.4280],[17.4187,78.4428],[17.4127,78.4602],[17.4044,78.4629],[17.3983,78.4730],[17.3860,78.4759],[17.3712,78.4745]],
    detour: [[17.4141,78.4123],[17.4163,78.4280],[17.4187,78.4428],[17.4127,78.4602],[17.4098,78.4550],[17.3971,78.4626],[17.3860,78.4759],[17.3712,78.4745]],
    junctions: nimsJunctions,
  },
  "secunderabad-gandhi": {
    id: "secunderabad-gandhi",
    name: "Secunderabad Station → Gandhi Hospital",
    unit: "Secunderabad Railway Station",
    destination: "Gandhi Hospital, Musheerabad",
    distanceKm: 3.7,
    seed: "HYD-21",
    route: [[17.4337,78.5018],[17.4320,78.4980],[17.4293,78.4926],[17.4267,78.4890],[17.4233,78.4872],[17.4225,78.4860]],
    detour: [[17.4337,78.5018],[17.4362,78.4960],[17.4320,78.4893],[17.4267,78.4890],[17.4225,78.4860]],
    junctions: [
      { id: "J1", name: "Station Road", progress: .18, coord: [17.4320,78.4980], wait: 18 },
      { id: "J2", name: "St. John's", progress: .34, coord: [17.4293,78.4926], wait: 22 },
      { id: "J3", name: "Musheerabad", progress: .56, coord: [17.4267,78.4890], wait: 28 },
      { id: "J4", name: "Gandhi Approach", progress: .82, coord: [17.4233,78.4872], wait: 20 },
    ],
  },
});

export function cloneScenario(id = "nims-ogh") {
  return structuredClone(SCENARIOS[id] || SCENARIOS["nims-ogh"]);
}
