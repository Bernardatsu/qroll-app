/**
 * Billing configuration for QRoll.
 *
 * PAYMENTS_LIVE stays false until the Paystack account is verified and the
 * owner switches it on. While false, every feature stays open and free and the
 * checkout button only explains that payments are not switched on yet.
 */
export const PAYMENTS_LIVE = false;

/** Paystack public (publishable) key — safe to ship in the browser bundle. */
export const PAYSTACK_PUBLIC_KEY = "pk_test_401bba4d0231622af9fa9bdd0f1be11dc81980ab";

export const TRIAL_DAYS = 14;

export type PlanCode = "monthly" | "semester" | "yearly";

export const PLANS: {
  code: PlanCode;
  name: string;
  usd: number;
  cadence: string;
  note: string;
  highlight?: boolean;
  features: string[];
}[] = [
  {
    code: "monthly",
    name: "Monthly",
    usd: 6,
    cadence: "per month",
    note: "Billed every month. Cancel anytime.",
    features: ["Unlimited sessions", "Unlimited students", "Excel, CSV & PDF reports", "Geofenced self check-in"],
  },
  {
    code: "semester",
    name: "Per Semester",
    usd: 20,
    cadence: "per 4 months",
    note: "Best for a full academic semester — save 17%.",
    highlight: true,
    features: ["Everything in Monthly", "4 months of access", "Priority email support"],
  },
  {
    code: "yearly",
    name: "Yearly",
    usd: 60,
    cadence: "per year",
    note: "Best value — save 17% versus monthly.",
    features: ["Everything in Per Semester", "12 months of access", "Early access to new features"],
  },
];
