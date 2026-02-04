export interface IssueContext {
  ref: string;
  title: string;
  body: string;
  status: string;
  labels: string[];
}

const TEMPLATE_VARS: Record<string, (ctx: IssueContext) => string> = {
  "${issue.ref}": (ctx) => ctx.ref,
  "${issue.title}": (ctx) => ctx.title,
  "${issue.body}": (ctx) => ctx.body,
  "${issue.status}": (ctx) => ctx.status,
  "${issue.labels}": (ctx) => ctx.labels.join(","),
};

export function interpolate(text: string, issueContext?: IssueContext): string {
  if (!issueContext) return text;

  let result = text;
  for (const [pattern, resolve] of Object.entries(TEMPLATE_VARS)) {
    result = result.replaceAll(pattern, resolve(issueContext));
  }
  return result;
}
