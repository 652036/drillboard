export const PRESETS = Object.freeze({
  outage: {
    name: 'Checkout outage',
    subtitle: 'A cascading payment failure during a high-traffic product launch.',
    metrics: { impact: 48, uncertainty: 62, fatigue: 16, trust: 76, service: 58 },
    resources: [
      { id: 'sre', name: 'SRE responders', total: 5 },
      { id: 'support', name: 'Support leads', total: 3 },
      { id: 'comms', name: 'Communications', total: 2 },
      { id: 'vendor', name: 'Vendor escalation', total: 2 },
    ],
    objectives: [
      { id: 'contain', title: 'Contain failed checkout requests', priority: 'critical', deadline: 45, owner: 'SRE', progress: 20, status: 'open' },
      { id: 'cause', title: 'Confirm the failure domain', priority: 'high', deadline: 60, owner: 'Engineering', progress: 10, status: 'open' },
      { id: 'customers', title: 'Set customer expectations', priority: 'high', deadline: 30, owner: 'Comms', progress: 0, status: 'open' },
    ],
    injects: [
      { id: 'inject-launch-spike', title: 'Payment timeouts spike', description: 'Checkout success falls below 60% while retry traffic multiplies.', category: 'technical', severity: 4, createdAt: 0, deadline: 35, status: 'active', effects: { impact: 8, uncertainty: 5, fatigue: 2, trust: -2, service: -7 } },
      { id: 'inject-social', title: 'Complaints trend publicly', description: 'Customers report duplicate charges and post screenshots.', category: 'reputation', severity: 3, createdAt: 5, deadline: 30, status: 'active', effects: { impact: 2, uncertainty: 2, fatigue: 1, trust: -6, service: 0 } },
    ],
  },
  ransomware: {
    name: 'Ransomware drill',
    subtitle: 'A logistics operator loses dispatch visibility after suspicious encryption activity.',
    metrics: { impact: 42, uncertainty: 75, fatigue: 20, trust: 72, service: 63 },
    resources: [
      { id: 'security', name: 'Security analysts', total: 4 },
      { id: 'it', name: 'IT operations', total: 5 },
      { id: 'legal', name: 'Legal / privacy', total: 2 },
      { id: 'continuity', name: 'Continuity leads', total: 3 },
    ],
    objectives: [
      { id: 'isolate', title: 'Define and isolate affected segments', priority: 'critical', deadline: 40, owner: 'Security', progress: 15, status: 'open' },
      { id: 'dispatch', title: 'Restore minimum dispatch capability', priority: 'critical', deadline: 90, owner: 'Continuity', progress: 5, status: 'open' },
      { id: 'scope', title: 'Preserve evidence and scope exposure', priority: 'high', deadline: 70, owner: 'Legal', progress: 0, status: 'open' },
    ],
    injects: [
      { id: 'inject-encryption', title: 'Shared drives become unreadable', description: 'Multiple depots report encrypted files and disabled endpoint agents.', category: 'security', severity: 5, createdAt: 0, deadline: 30, status: 'active', effects: { impact: 9, uncertainty: 7, fatigue: 3, trust: -2, service: -8 } },
      { id: 'inject-driver-calls', title: 'Drivers lose route updates', description: 'Dispatch phones are overloaded and manual routing begins.', category: 'operations', severity: 4, createdAt: 10, deadline: 45, status: 'active', effects: { impact: 7, uncertainty: 3, fatigue: 4, trust: -3, service: -7 } },
    ],
  },
  festival: {
    name: 'Festival heat drill',
    subtitle: 'A crowded outdoor event faces a fast-rising heat index and transport delays.',
    metrics: { impact: 32, uncertainty: 52, fatigue: 24, trust: 82, service: 76 },
    resources: [
      { id: 'medical', name: 'First-aid teams', total: 6 },
      { id: 'water', name: 'Water stations', total: 8 },
      { id: 'stewards', name: 'Event stewards', total: 12 },
      { id: 'transport', name: 'Transport coordinators', total: 3 },
    ],
    objectives: [
      { id: 'heat', title: 'Reduce heat exposure in dense zones', priority: 'critical', deadline: 45, owner: 'Safety', progress: 20, status: 'open' },
      { id: 'flow', title: 'Keep exits and shaded routes clear', priority: 'high', deadline: 60, owner: 'Operations', progress: 20, status: 'open' },
      { id: 'message', title: 'Publish clear hydration guidance', priority: 'high', deadline: 25, owner: 'Comms', progress: 0, status: 'open' },
    ],
    injects: [
      { id: 'inject-heat', title: 'Heat index exceeds forecast', description: 'Shade areas fill and water queues lengthen rapidly.', category: 'safety', severity: 4, createdAt: 0, deadline: 35, status: 'active', effects: { impact: 7, uncertainty: 2, fatigue: 5, trust: -1, service: -4 } },
      { id: 'inject-trains', title: 'Rail service is delayed', description: 'Arrivals bunch while outbound capacity drops.', category: 'operations', severity: 3, createdAt: 10, deadline: 55, status: 'active', effects: { impact: 4, uncertainty: 4, fatigue: 2, trust: -3, service: -4 } },
    ],
  },
});

export function getPreset(key = 'outage') {
  return structuredClone(PRESETS[key] ?? PRESETS.outage);
}
