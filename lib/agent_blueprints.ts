export type OrganizationCategory = "school" | "startup" | "enterprise";

export const AGENT_BLUEPRINTS: Record<
  OrganizationCategory,
  { label: string; roles: string[] }
> = {
  school: {
    label: "School",
    roles: [
      "Didaktik-Experte",
      "Lehrer-Agent",
      "Mentor",
      "Curriculum Designer",
      "Student Support",
    ],
  },
  startup: {
    label: "Startup",
    roles: [
      "DevOps-Bot",
      "Growth Validator",
      "Product Strategist",
      "Customer Discovery",
      "Go-To-Market",
    ],
  },
  enterprise: {
    label: "Enterprise",
    roles: [
      "Integration Architect",
      "Process Optimizer",
      "Compliance Analyst",
      "Data Steward",
      "Operations Coordinator",
    ],
  },
};

export const ORGANIZATION_CATEGORY_LABELS: Record<OrganizationCategory, string> =
  {
    school: "School",
    startup: "Startup",
    enterprise: "Enterprise",
  };
