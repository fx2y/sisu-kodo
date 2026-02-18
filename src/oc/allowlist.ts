export const ALLOWED_TOOLS_PLAN = new Set(["read", "grep", "glob", "ls", "skill"]);
export const ALLOWED_TOOLS_BUILD = new Set([...ALLOWED_TOOLS_PLAN, "edit", "write", "bash", "patch"]);

export function getAllowedTools(agent: string): Set<string> {
  if (agent === "plan") return ALLOWED_TOOLS_PLAN;
  return ALLOWED_TOOLS_BUILD;
}
