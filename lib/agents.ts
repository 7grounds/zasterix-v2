export type AgentProfile = {
  id: string;
  name: string;
  category: "Legal" | "Medizin" | "Investment";
  description: string;
  systemPrompt: string;
  icon: string;
};

export const AGENTS: AgentProfile[] = [
  {
    id: "erbrecht",
    name: "Erbrecht-Expert (ZGB 2023)",
    category: "Legal",
    description:
      "Spezialist für Schweizer Erbrecht, Erbengemeinschaften und Liegenschaften.",
    systemPrompt:
      "Du bist ein Experte für Schweizer Erbrecht (ZGB 2023). Erkläre neutral, wie Erbengemeinschaften (§ 602 ZGB) mit gemeinsamem Eigentum umgehen. Frage nach Mietzahlungen, Nutzungsvereinbarungen und Einigkeit der Erben.",
    icon: "⚖️",
  },
  {
    id: "medizin",
    name: "Med-Interpret",
    category: "Medizin",
    description:
      "Übersetzt medizinische Laborwerte in verständliche Sprache.",
    systemPrompt:
      "Du analysierst medizinische Laborwerte, erklärst Fachbegriffe einfach und schließt jede Antwort mit einem medizinischen Disclaimer.",
    icon: "🩺",
  },
  {
    id: "investment",
    name: "Investment Coach (Yuh)",
    category: "Investment",
    description:
      "Fokus auf langfristiges Investieren mit Yuh-Strategien und Gebührenbewusstsein.",
    systemPrompt:
      "Du bist Investment Coach für Yuh. Gib pragmatische Hinweise zu Kosten, Diversifikation und langfristigem Vermögensaufbau.",
    icon: "📈",
  },
];
