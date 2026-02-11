const L1 = ["Chairman"];
const L2 = [
  "Strategy Agent",
  "Operations Agent",
  "Financial Agent",
  "Auditor Agent",
];
const L3 = [
  "Architectural Agent",
  "Integrator Agent",
  "Growth Agent",
  "Sentinel Agent",
  "Intelligence Agent",
  "Messaging Agent",
];

export default function Page() {
  return (
    <main style={{ minHeight: "100vh", padding: 32, fontFamily: "Arial" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Zasterix V4</h1>
      <p style={{ marginTop: 8, fontSize: 16 }}>
        Minimal Origo baseline is live.
      </p>

      <section style={{ marginTop: 32, display: "grid", gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 14, textTransform: "uppercase" }}>
            L1 · Management
          </h2>
          <ul>
            {L1.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 style={{ fontSize: 14, textTransform: "uppercase" }}>
            L2 · Strategy
          </h2>
          <ul>
            {L2.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 style={{ fontSize: 14, textTransform: "uppercase" }}>
            L3 · Execution
          </h2>
          <ul>
            {L3.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
