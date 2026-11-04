// The app's version, shown in Settings → This device and in problem
// reports. Bump it with each release, and add the changes to CHANGELOG.md.
export const APP_VERSION = "1.0.0";

export const ISSUES_URL = "https://github.com/bowo-prasetyo/web-llm/issues";

// A link to a new GitHub issue with the problem form filled in from this
// device (field ids match .github/ISSUE_TEMPLATE/problem.yml). Opening it
// sends nothing: the person reviews the form on GitHub and submits it.
export function problemReportUrl({ version = APP_VERSION, browser = "", gpu = "", shaderF16 = null, model = "", webllm = "" } = {}) {
  const params = new URLSearchParams({
    template: "problem.yml",
    version,
    browser,
    gpu: gpu || "Unknown",
    f16: shaderF16 == null ? "Unknown" : (shaderF16 ? "Yes" : "No"),
    model: model || "None",
    webllm: webllm || "Unknown",
  });
  return `${ISSUES_URL}/new?${params}`;
}
