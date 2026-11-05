import styles from "./dashboard.module.css";

// Keep every dashboard selector local; Tailwind utilities remain available globally.
export function dashboardClass(names: string) {
  return names.split(/\s+/).filter(Boolean).map(name => styles[name] ?? name).join(" ");
}
