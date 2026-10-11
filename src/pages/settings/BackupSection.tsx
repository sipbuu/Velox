import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { Row, Section } from "@/components/ui/SettingsRows";
import { exportBackup, pickAndImportBackup } from "@/lib/backup";
import { requirePin } from "@/lib/requirePin";

export function BackupSection() {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Section title="Backup & Restore">
      <Row label="Export favorites, hidden items, settings & sources">
        <button
          className="btn-glass"
          onClick={async () => {
            const where = await exportBackup().catch((e: Error) => (setMsg(e.message), null));
            if (where) setMsg(`Saved ${where}. Passwords and API keys are not included.`);
          }}
        >
          <Download size={14} /> Export
        </button>
      </Row>
      <Row label="Import a backup">
        <button
          className="btn-glass"
          onClick={async () => {
            if (!(await requirePin("Import a backup"))) return;
            try {
              const res = await pickAndImportBackup();
              if (res) setMsg(`Imported ${res.sources} new source(s) and ${res.favorites} favorite(s). Re-enter passwords for imported accounts.`);
            } catch (e) {
              setMsg((e as Error).message);
            }
          }}
        >
          <Upload size={14} /> Import
        </button>
      </Row>
      {msg && <p className="py-3 text-xs text-ink-muted">{msg}</p>}
    </Section>
  );
}
