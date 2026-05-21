import { DB } from "./db";

export const MAX_RETRIES = 3;
export const INITIAL_BACKOFF_MS = 1000;

export const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

export const FALLBACK_MODELS = [
  "anthropic/claude-3.5-sonnet",
  "openai/gpt-4o-mini",
  "google/gemini-flash-1.5"
];

export async function withRetry<T>(
  operation: () => Promise<T>,
  context: string,
  retryableErrorChecker?: (error: any) => boolean
): Promise<T> {
  let lastError: any;
  let delay = INITIAL_BACKOFF_MS;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const errorMsg = error.message || "";
      const isAborted = error.name === "AbortError" || errorMsg.includes("aborted");
      
      let isRetryable = false;
      if (retryableErrorChecker) {
        isRetryable = retryableErrorChecker(error);
      } else {
        // Default fallback check
        const status = error.status || error.response?.status;
        isRetryable = isAborted || RETRYABLE_STATUS_CODES.includes(status);
      }
      
      const level = isAborted ? "WARN" : "ERROR";
      const logMsg = `${context} - Attempt ${attempt}/${MAX_RETRIES} failed: ${errorMsg}`;
      
      if (isRetryable) DB.log(level, logMsg);
      console.error(`[Resilience] ${logMsg}`);

      if (attempt < MAX_RETRIES) {
        DB.log("INFO", `Retrying ${context} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
  }

  console.error(`[Resilience] ${context} exhausted all retries.`);
  throw lastError;
}
