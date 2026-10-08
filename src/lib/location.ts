import * as Location from "expo-location";
import type { Location as Point } from "./types.ts";

const WAIT_MS = 6000;

/** Where the phone is, to register the visit. Never blocks the seller: without permission,
 * GPS off or after a few seconds it returns the last known position or nothing. */
export async function currentLocation(): Promise<Point | null> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return null;
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), WAIT_MS));
    const position =
      (await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), timeout])) ??
      (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 }));
    if (!position) return null;
    return {
      latitude: Number(position.coords.latitude.toFixed(6)),
      longitude: Number(position.coords.longitude.toFixed(6)),
      accuracy_m: position.coords.accuracy === null ? null : Math.round(position.coords.accuracy),
    };
  } catch {
    return null;
  }
}
