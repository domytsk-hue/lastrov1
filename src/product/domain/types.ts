/**
 * Lastro domain models.
 * Money is always stored as a number in BRL (reais, 2-decimal precision).
 * Dates are stored as ISO strings (YYYY-MM-DD) — local calendar days, no timezone.
 */

export type ISODate = string;

export type TransactionType = "expense" | "income" | "transfer" | "investment";

export type Recurrence = "none" | "weekly" | "monthly" | "yearly";

export type CategoryId =
  | "moradia"
  | "alimentacao"
  | "transporte"
  | "lazer"
  | "assinaturas"
  | "saude"
  | "educacao"
  | "compras"
  | "outros"
  | "salario"
  | "freelance"
  | "rendimentos"
  | "outras-receitas";

export interface Category {
  id: CategoryId;
  name: string;
  kind: "expense" | "income";
  /** lucide icon name, resolved in the UI layer */
  icon: string;
  color: string;
  /** Fixed-cost categories are expected to be paid in full early in the month. */
  fixed?: boolean;
  /** Words used by the natural-language parser to infer the category. */
  keywords: string[];
}

export type AccountType = "checking" | "cash" | "savings" | "reserve" | "investment" | "credit_card";

export interface Account {
  id: string;
  name: string;
  institution: string;
  type: AccountType;
  /** Balance before the first recorded transaction. Current balance is derived. */
  openingBalance: number;
  color: string;
}

export interface Installments {
  groupId: string;
  current: number;
  total: number;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  /** Always positive. Direction is given by `type`. */
  amount: number;
  description: string;
  categoryId?: CategoryId;
  accountId: string;
  /** Destination for transfers and investments. */
  toAccountId?: string;
  /** When the transfer funds a goal. */
  goalId?: string;
  /** Investment class bought, for `investment` transactions. */
  investmentClass?: InvestmentClass;
  date: ISODate;
  recurring: Recurrence;
  installments?: Installments;
  tags: string[];
  notes?: string;
  createdAt: string;
}

export interface Budget {
  categoryId: CategoryId;
  limit: number;
}

export type BudgetState = "healthy" | "attention" | "critical" | "exceeded";

export type GoalKind =
  | "trip"
  | "car"
  | "house"
  | "computer"
  | "emergency"
  | "debt"
  | "investment"
  | "custom";

export interface Goal {
  id: string;
  name: string;
  kind: GoalKind;
  target: number;
  targetDate?: ISODate;
  /** Planned automatic monthly contribution. */
  monthlyContribution?: number;
  /** Amount saved before tracking started. Contributions are transfers carrying `goalId`. */
  initialSaved: number;
  color: string;
  createdAt: ISODate;
  /** Milestones (25/50/75/100) already celebrated, so we celebrate only once. */
  celebrated: number[];
}

export type InvestmentClass =
  | "renda-fixa"
  | "acoes"
  | "fiis"
  | "etfs"
  | "fundos"
  | "cripto"
  | "internacional"
  | "outros";

export interface Investment {
  id: string;
  name: string;
  class: InvestmentClass;
  invested: number;
  currentValue: number;
}

export type AssetKind = "property" | "vehicle" | "other";

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  value: number;
}

export type LiabilityKind = "loan" | "financing" | "other";

export interface Liability {
  id: string;
  name: string;
  kind: LiabilityKind;
  balance: number;
}

export interface EmergencyReserve {
  accountId: string;
  /** Essential monthly cost of living used to size the reserve. */
  monthlyCost: number;
  targetMonths: number;
}

export interface NetWorthPoint {
  month: string; // YYYY-MM
  value: number;
}

export interface Milestone {
  id: string;
  date: ISODate;
  title: string;
  kind: "investment" | "reserve" | "debt" | "goal" | "record" | "savings";
}

export interface User {
  name: string;
  /** Profile photo as a small square JPEG data URL (resized on the device). */
  photo?: string;
  monthlyIncome: number;
  objective:
    | "organize"
    | "reserve"
    | "debt"
    | "goal"
    | "invest"
    | "wealth";
  memberSince: ISODate;
}

export interface Lesson {
  id: string;
  title: string;
  category: string;
  minutes: number;
  available: boolean;
  completed: boolean;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlockedAt?: ISODate;
}

export interface Mission {
  id: string;
  title: string;
  progress: number;
  target: number;
  unit: string;
}

export type InsightTone = "positive" | "neutral" | "attention";

export interface FinancialInsight {
  id: string;
  tone: InsightTone;
  title: string;
  body?: string;
  action?: { label: string; href: string };
}

export interface MonthlyPlan {
  investments: number;
  goals: number;
}

export interface FinanceState {
  version: number;
  user: User;
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  investments: Investment[];
  assets: Asset[];
  liabilities: Liability[];
  reserve: EmergencyReserve;
  plan: MonthlyPlan;
  netWorthHistory: NetWorthPoint[];
  milestones: Milestone[];
  lessons: Lesson[];
}
