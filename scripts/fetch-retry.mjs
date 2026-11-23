// Bounded retry for the Pages network checks. A 429/5xx answer or a network
// error from a host is an outage, not a verdict on the link: retry a few times,
// then hand the caller the last response (it judges the status) or throw the
// last error. Any other status, and a redirect refused by redirect: "error",
// answers on the first attempt.

export const isTransientStatus = (status) => status === 429 || status >= 500;

const isRedirectRefusal = (error) =>
  /redirect/i.test(error?.cause?.message ?? "") || /redirect/i.test(error?.message ?? "");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchWithRetry(
  url,
  init = {},
  { attempts = 3, timeoutMs, backoffMs = 2000, fetcher = fetch, delay = sleep } = {},
) {
  for (let attempt = 1; ; attempt += 1) {
    // A fresh timeout signal per attempt: a spent one would abort the retry.
    const options = timeoutMs ? { ...init, signal: AbortSignal.timeout(timeoutMs) } : init;
    try {
      const response = await fetcher(url, options);
      if (!isTransientStatus(response.status) || attempt >= attempts) return response;
      await response.body?.cancel?.();
    } catch (error) {
      if (isRedirectRefusal(error) || attempt >= attempts) throw error;
    }
    await delay(backoffMs * attempt);
  }
}
