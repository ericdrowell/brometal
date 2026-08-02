"use client";

import { useCallback, useState } from "react";
import {
  BroMetalError,
  errorTitle,
  isBroMetalError,
  type BroMetalErrorCode,
} from "brometal";

/**
 * Surfaces a BroMetal failure as a toast.
 *
 * The library renders nothing on failure by design — it throws for creation
 * failures and calls `onError` for the asynchronous ones, and leaves the canvas
 * untouched. Deciding what a user sees is the application's job, and this is
 * this application's answer.
 *
 * It matters because these failures are otherwise invisible. A canvas that never
 * draws looks exactly like a scene that drew black, so an unsupported browser
 * and a broken demo are indistinguishable without something like this.
 */

interface ReportedError {
  code: BroMetalErrorCode | "unknown-error";
  message: string;
}

export function useBroMetalError(): {
  error: ReportedError | null;
  report: (value: unknown) => void;
  dismiss: () => void;
} {
  const [error, setError] = useState<ReportedError | null>(null);

  // Stable, so demos can pass it straight into an effect that runs once.
  const report = useCallback((value: unknown) => {
    setError((current) => {
      // First failure wins. A lost device raises follow-on errors as pipelines
      // fail against it, and replacing the message would bury the cause.
      if (current !== null) return current;
      if (isBroMetalError(value)) {
        return { code: value.code, message: value.message };
      }
      return {
        code: "unknown-error",
        message: value instanceof Error ? value.message : String(value),
      };
    });
  }, []);

  const dismiss = useCallback(() => setError(null), []);
  return { error, report, dismiss };
}

export default function ErrorToast({
  error,
  onDismiss,
}: {
  error: ReportedError | null;
  onDismiss: () => void;
}) {
  if (error === null) {
    return null;
  }
  // The library prefixes its messages; the title already says "BroMetal".
  // Recapitalise, or stripping the prefix leaves a lowercase sentence start.
  const stripped = error.message.replace(/^BroMetal:\s*/, "");
  const body = stripped.charAt(0).toUpperCase() + stripped.slice(1);
  return (
    <div className="error-toast" role="alert">
      <div className="error-toast-title">{errorTitle(error.code)}</div>
      <p className="error-toast-body">{body}</p>
      <button
        type="button"
        className="error-toast-close"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

export { BroMetalError };
export type { ReportedError };
