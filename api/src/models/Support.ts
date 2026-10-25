/** Public support form submission. */
export interface SupportRequest {
  /** Sender name */
  name: string;
  /** Address we should reply to */
  email: string;
  /** What they need help with */
  message: string;
}

export interface SupportSubmitResult {
  sent: true;
}
