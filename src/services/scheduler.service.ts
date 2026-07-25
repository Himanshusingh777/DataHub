// Mirrors the canonical schedule values in lib/server/db.ts's
// SCHEDULE_INTERVALS_MIN and the choices offered in the flow creation
// wizard (components/flows/flow-wizard-modal.tsx) so both places where a
// user picks a schedule stay in sync.
export const SCHEDULE_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: "manual",     label: "Manual only",   description: "Run only when you click sync" },
  { value: "every_hour", label: "Every hour",    description: "Syncs continuously, hourly" },
  { value: "every_6h",   label: "Every 6 hours", description: "4× per day" },
  { value: "every_day",  label: "Daily",         description: "Once per day at midnight UTC" },
  { value: "every_week", label: "Weekly",        description: "Every Monday at midnight UTC" },
];
