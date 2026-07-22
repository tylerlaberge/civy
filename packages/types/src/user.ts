import type { UsStateCode } from "./jurisdiction.js";

/** A user's capabilities. Admins can remove any comment (PRD §5). */
export type UserRole = "member" | "admin";

/** A registered account. */
export interface User {
  id: string;
  email: string;
  /**
   * Home state derived from the self-declared signup address. Determines where
   * the user may comment (federal + their home state — PRD §5). Federal is not
   * a home state, so this is always a US state code.
   */
  homeState: UsStateCode;
  role: UserRole;
  createdAt: string;
}
