import { describe, expect, test } from "bun:test";
import {
  BUSES,
  BUS_ROUTES,
  BUS_STOP_GROUPS,
  activeSignalAdjustments,
  busSnapshot,
  signalAdjustmentLog,
  stopArrivals,
  upcomingArrivals,
} from "../suroboyoBus";

const START = Date.UTC(2026, 9, 10, 3, 0, 0);

describe("simulasi Suroboyo Bus", () => {
  test("jadwal tiap koridor berurutan dan menutup satu putaran", () => {
    for (const route of BUS_ROUTES) {
      expect(route.events.length).toBeGreaterThan(20);
      route.events.forEach((event, i) => {
        expect(event.depart).toBeGreaterThanOrEqual(event.arrive);
        if (i > 0) {
          expect(event.at).toBeGreaterThanOrEqual(route.events[i - 1].at);
          expect(event.arrive).toBeGreaterThanOrEqual(route.events[i - 1].depart);
        }
      });
      expect(route.cycle).toBeGreaterThan(route.events[route.events.length - 1].depart - 1);
    }
  });

  test("bus tidak pernah mundur dan tidak melompat", () => {
    for (const bus of BUSES) {
      const length = bus.route.loopLength;
      let previous = busSnapshot(bus, START).progress * length;
      for (let second = 1; second <= 3 * 3600; second++) {
        const current = busSnapshot(bus, START + second * 1000).progress * length;
        let step = current - previous;
        if (step < -length / 2) step += length;
        expect(step).toBeGreaterThanOrEqual(-0.001);
        // Di bawah 70 km/jam.
        expect(step).toBeLessThan(19.5);
        previous = current;
      }
    }
  });

  test("bus berada di halte tepat pada ETA yang dilaporkan", () => {
    for (const bus of BUSES) {
      const arrivals = upcomingArrivals(bus, START, 6, "stop");
      expect(arrivals).toHaveLength(6);
      arrivals.forEach((arrival, i) => {
        expect(arrival.etaSec).toBeGreaterThanOrEqual(0);
        if (i > 0) expect(arrival.etaSec).toBeGreaterThan(arrivals[i - 1].etaSec);
        const then = busSnapshot(bus, START + arrival.etaSec * 1000 + 500);
        expect(then.dwellingAt).toBe(arrival.event.name);
      });
    }
  });

  test("prioritas sinyal hanya untuk bus yang terlambat", () => {
    for (let minute = 0; minute < 120; minute += 3) {
      const now = START + minute * 60000;
      const late = new Set(
        BUSES.filter((bus) => busSnapshot(bus, now).late).map((bus) => bus.code),
      );
      for (const adjustment of activeSignalAdjustments(now)) {
        expect(late.has(adjustment.busCode)).toBe(true);
        expect(adjustment.extendSec).toBeGreaterThanOrEqual(5);
        expect(adjustment.extendSec).toBeLessThanOrEqual(15);
      }
    }
    const log = signalAdjustmentLog(START, 30 * 60000, 50);
    expect(log.length).toBeGreaterThan(0);
    log.forEach((entry, i) => {
      expect(entry.timeMs).toBeLessThanOrEqual(START);
      if (i > 0) expect(entry.timeMs).toBeLessThanOrEqual(log[i - 1].timeMs);
    });
  });

  test("papan kedatangan halte terurut dari yang paling dekat", () => {
    const shared = BUS_STOP_GROUPS.find((group) => group.routeIds.length > 1)!;
    const arrivals = stopArrivals(shared, START, 5);
    expect(arrivals.length).toBeGreaterThan(1);
    arrivals.forEach((arrival, i) => {
      expect(shared.routeIds).toContain(arrival.bus.route.id);
      if (i > 0) expect(arrival.etaSec).toBeGreaterThanOrEqual(arrivals[i - 1].etaSec);
    });
  });
});
