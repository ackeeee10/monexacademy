/** Keys under "Errors" in messages/*.json that actions can return. */
export type AuthErrorKey =
  | "invalidInput"
  | "invalidCredentials"
  | "emailNotConfirmed"
  | "rateLimited"
  | "captchaFailed"
  | "weakPassword"
  | "samePassword"
  | "linkExpired"
  | "codeIncorrect"
  | "accountBlocked"
  | "emailInvalid"
  | "signupDisabled"
  | "sessionExpired"
  | "usernameTaken"
  | "mustBe18"
  | "termsRequired"
  | "intentsRequired"
  | "confirmationMismatch"
  | "unexpected";

export type ActionResult<T = undefined> =
  | ({ ok: true; redirectTo?: string } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: AuthErrorKey; fields?: Record<string, string> };
