/** Transport- and ORM-neutral records and errors for campaign session lifecycle. */

export interface CampaignSessionRecord {
  id: string;
  campaignId: string;
  sessionNumber: number;
  startedAt: Date;
  endedAt: Date | null;
  savedState: unknown | null;
}

export class SessionLifecycleError extends Error {
  constructor(
    public readonly status: 400 | 404,
    public readonly error: "Bad Request" | "Not Found",
    message: string,
  ) {
    super(message);
    this.name = "SessionLifecycleError";
  }
}
