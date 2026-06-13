import { WRITERS_ROOM_ROLES } from "@/lib/universe/writersRoom";

const readyRoles = new Set(["story-architect", "script-doctor", "market-analyst"]);

export function WritersPanel() {
  return (
    <aside className="kk-writers-panel" aria-labelledby="kk-writers-title">
      <div className="kk-panel-head">
        <span>AI Writers</span>
        <h2 id="kk-writers-title">Writers Room</h2>
      </div>

      <div className="kk-writer-list">
        {WRITERS_ROOM_ROLES.map((role) => {
          const status = readyRoles.has(role.id) ? "Ready" : "Idle";

          return (
            <div className="kk-writer-row" key={role.id}>
              <div>
                <strong>{role.name}</strong>
                <span>{role.responsibility}</span>
              </div>
              <small data-state={status.toLowerCase()}>{status}</small>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
