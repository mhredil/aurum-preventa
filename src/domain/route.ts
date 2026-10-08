/** Ruta del día: the customers of the seller's routes that are visited today. */

export interface RouteInfo {
  id: string;
  visit_days: number[]; // ISO weekdays: 1 = lunes ... 7 = domingo
}

export interface RouteCustomer {
  id: string;
  route_id: string | null;
  visit_order: number | null;
  legal_name: string;
}

export const isoWeekday = (date: Date): number => ((date.getDay() + 6) % 7) + 1;

export const WEEKDAYS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export function customersForDay<T extends RouteCustomer>(customers: T[], routes: RouteInfo[], date: Date): T[] {
  const day = isoWeekday(date);
  const today = new Set(routes.filter((r) => r.visit_days.includes(day)).map((r) => r.id));
  return customers
    .filter((c) => c.route_id !== null && today.has(c.route_id))
    .sort(
      (a, b) =>
        (a.visit_order ?? Number.MAX_SAFE_INTEGER) - (b.visit_order ?? Number.MAX_SAFE_INTEGER) ||
        a.legal_name.localeCompare(b.legal_name, "es"),
    );
}
