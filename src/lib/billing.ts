/**
 * Billing configuration for QRoll.
 *
 * Connected with live Paystack integration.
 */
export const PAYMENTS_LIVE = true;

/** Paystack public (publishable) key — safe to ship in the browser bundle. */
export const PAYSTACK_PUBLIC_KEY =
  import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "pk_live_ac2571fc3b7afea0760998dc1188444e833fb7bb";

export const TRIAL_DAYS = 7;

export type PlanCode = "monthly" | "semester" | "yearly";

export const PLANS: {
  code: PlanCode;
  paystackPlanCode: string;
  name: string;
  amountGhs: number;
  cadence: string;
  note: string;
  highlight?: boolean;
  features: string[];
}[] = [
  {
    code: "monthly",
    paystackPlanCode: "PLN_6lgau4crzhh2zxp",
    name: "Monthly Plan",
    amountGhs: 45,
    cadence: "per month",
    note: "Billed every month. Cancel anytime.",
    features: [
      "Unlimited class sessions",
      "Unlimited students & QR codes",
      "Excel, CSV & PDF reports",
      "Live projector QR code check-in",
      "Multi-camera QR scanner",
      "Offline sync mode",
    ],
  },
  {
    code: "semester",
    paystackPlanCode: "PLN_rcs0mzvo98x88lm",
    name: "Semester Plan (3 Months)",
    amountGhs: 120,
    cadence: "per semester (strictly 3 months)",
    note: "Valid for 1 full academic semester (strictly 3 months). Pay via Mobile Money or Card.",
    highlight: true,
    features: [
      "Duration: 3 Months full coverage",
      "Supports Mobile Money (MTN, Telecel, AT) & Cards",
      "Everything in Monthly Plan",
      "Automated attendance % & 10-mark grading",
      "At-risk absentee alerts",
      "Priority lecturer support",
    ],
  },
  {
    code: "yearly",
    paystackPlanCode: "PLN_pbocoi4z5z96mpn",
    name: "Yearly Plan",
    amountGhs: 450,
    cadence: "per academic year",
    note: "Best value for long-term university departments and lecturers.",
    features: [
      "Everything in Per Semester",
      "12 full months of uninterrupted access",
      "Department-wide student imports",
      "Unlimited data exports & backups",
      "Dedicated onboarding assistance",
    ],
  },
];
