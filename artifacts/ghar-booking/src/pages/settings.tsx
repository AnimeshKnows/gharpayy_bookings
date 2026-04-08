import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../contexts/auth";

interface Zone {
  id: number;
  name: string;
  description: string | null;
  slug: string;
  upiId: string | null;
  adminPhone: string | null;
}

interface TeammateRow {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  role: string;
  zoneId: number | null;
  zoneName: string | null;
  isActive: boolean;
}

function useZones() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { token } = useAuth();

  async function load() {
    const res = await fetch("/api/zones", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setZones(await res.json());
    setLoaded(true);
  }

  return { zones, loaded, load, setZones };
}

function useTeammates() {
  const [teammates, setTeammates] = useState<TeammateRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { token } = useAuth();

  async function load() {
    const res = await fetch("/api/teammates", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setTeammates(await res.json());
    setLoaded(true);
  }

  return { teammates, loaded, load, setTeammates };
}

export default function SettingsPage() {
  const [, navigate] = useLocation();
  const { teammate, isSuperAdmin, isZoneAdmin, token, logout } = useAuth();

  const zonesHook = useZones();
  const teammatesHook = useTeammates();

  const [tab, setTab] = useState<"zones" | "teammates">("teammates");
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [showTeammateForm, setShowTeammateForm] = useState(false);

  const [zoneName, setZoneName] = useState("");
  const [zoneDesc, setZoneDesc] = useState("");
  const [zoneSlug, setZoneSlug] = useState("");
  const [zoneUpiId, setZoneUpiId] = useState("");
  const [zoneAdminPhone, setZoneAdminPhone] = useState("");

  const [tmName, setTmName] = useState("");
  const [tmPhone, setTmPhone] = useState("");
  const [tmPin, setTmPin] = useState("");
  const [tmRole, setTmRole] = useState("agent");
  const [tmZoneId, setTmZoneId] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [resetPinTeammateId, setResetPinTeammateId] = useState<number | null>(null);
  const [resetPinValue, setResetPinValue] = useState("");
  const [resetPinSaving, setResetPinSaving] = useState(false);

  function init() {
    if (!zonesHook.loaded) zonesHook.load();
    if (!teammatesHook.loaded) teammatesHook.load();
  }

  if (!zonesHook.loaded || !teammatesHook.loaded) {
    init();
  }

  async function createZone(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/zones", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: zoneName, description: zoneDesc, slug: zoneSlug }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await zonesHook.load();
      setShowZoneForm(false);
      setZoneName(""); setZoneDesc(""); setZoneSlug("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteZone(id: number) {
    if (!confirm("Delete this zone? Teammates in it will lose their zone.")) return;
    await fetch(`/api/zones/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    await zonesHook.load();
  }

  async function createTeammate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        name: tmName,
        phone: tmPhone,
        pin: tmPin,
        role: tmRole,
      };
      if (isSuperAdmin && tmZoneId) body.zoneId = tmZoneId;
      const res = await fetch("/api/teammates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await teammatesHook.load();
      setShowTeammateForm(false);
      setTmName(""); setTmPhone(""); setTmPin(""); setTmRole("agent"); setTmZoneId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: number, current: boolean) {
    await fetch(`/api/teammates/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ isActive: !current }),
    });
    await teammatesHook.load();
  }

  async function doResetPin(e: React.FormEvent) {
    e.preventDefault();
    if (!resetPinTeammateId || resetPinValue.length < 4) return;
    setResetPinSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/teammates/${resetPinTeammateId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pin: resetPinValue }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setResetPinTeammateId(null);
      setResetPinValue("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reset PIN");
    } finally {
      setResetPinSaving(false);
    }
  }

  const roleLabel = (r: string) =>
    r === "superadmin" ? "Superadmin" : r === "zone_admin" ? "Zone Admin" : "Agent";
  const roleBadge = (r: string) =>
    r === "superadmin"
      ? "bg-purple-100 text-purple-700"
      : r === "zone_admin"
        ? "bg-blue-100 text-blue-700"
        : "bg-gray-100 text-gray-600";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="text-gray-400 hover:text-gray-600"
          >
            ←
          </button>
          <div>
            <h1 className="text-base font-semibold text-gray-900">Team Settings</h1>
            <p className="text-xs text-gray-400">
              {teammate?.name} · {roleLabel(teammate?.role ?? "")}
              {teammate?.zoneName ? ` · ${teammate.zoneName}` : ""}
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="text-sm text-gray-500 hover:text-red-600 transition-colors"
        >
          Sign out
        </button>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="flex gap-2 border-b border-gray-200 pb-0">
          {["teammates", ...(isSuperAdmin ? ["zones"] : [])]
            .filter(Boolean)
            .map((t) => (
              <button
                key={t}
                onClick={() => setTab(t as "zones" | "teammates")}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors capitalize ${
                  tab === t
                    ? "border-orange-500 text-orange-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {t}
              </button>
            ))}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        {tab === "zones" && isSuperAdmin && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Zones ({zonesHook.zones.length})
              </h2>
              <button
                onClick={() => setShowZoneForm(!showZoneForm)}
                className="text-sm text-orange-600 font-medium"
              >
                {showZoneForm ? "Cancel" : "+ Add Zone"}
              </button>
            </div>

            {showZoneForm && (
              <form
                onSubmit={createZone}
                className="bg-white rounded-xl border border-gray-200 p-4 space-y-3"
              >
                <h3 className="text-sm font-medium text-gray-900">New Zone</h3>
                <input
                  value={zoneName}
                  onChange={(e) => {
                    setZoneName(e.target.value);
                    if (!zoneSlug) {
                      setZoneSlug(
                        e.target.value.toLowerCase().replace(/\s+/g, "-"),
                      );
                    }
                  }}
                  placeholder="Zone name (e.g. Koramangala)"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <input
                  value={zoneSlug}
                  onChange={(e) => setZoneSlug(e.target.value)}
                  placeholder="Slug (e.g. koramangala)"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <input
                  value={zoneDesc}
                  onChange={(e) => setZoneDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-orange-500 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-60"
                >
                  {saving ? "Creating..." : "Create Zone"}
                </button>
              </form>
            )}

            {zonesHook.zones.length === 0 && !showZoneForm ? (
              <p className="text-sm text-gray-400 text-center py-8">
                No zones yet. Create your first zone to start assigning teammates.
              </p>
            ) : (
              zonesHook.zones.map((z) => (
                <div
                  key={z.id}
                  className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{z.name}</p>
                    <p className="text-xs text-gray-400">
                      /{z.slug}
                      {z.description ? ` · ${z.description}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteZone(z.id)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "teammates" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Teammates ({teammatesHook.teammates.length})
              </h2>
              {isZoneAdmin && (
                <button
                  onClick={() => setShowTeammateForm(!showTeammateForm)}
                  className="text-sm text-orange-600 font-medium"
                >
                  {showTeammateForm ? "Cancel" : "+ Add Teammate"}
                </button>
              )}
            </div>

            {showTeammateForm && (
              <form
                onSubmit={createTeammate}
                className="bg-white rounded-xl border border-gray-200 p-4 space-y-3"
              >
                <h3 className="text-sm font-medium text-gray-900">New Teammate</h3>
                <input
                  value={tmName}
                  onChange={(e) => setTmName(e.target.value)}
                  placeholder="Full name"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <input
                  value={tmPhone}
                  onChange={(e) => setTmPhone(e.target.value)}
                  placeholder="Phone number"
                  type="tel"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <input
                  value={tmPin}
                  onChange={(e) => setTmPin(e.target.value)}
                  placeholder="PIN (min 4 digits)"
                  type="password"
                  inputMode="numeric"
                  minLength={4}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                {isSuperAdmin && (
                  <>
                    <select
                      value={tmRole}
                      onChange={(e) => setTmRole(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="agent">Agent</option>
                      <option value="zone_admin">Zone Admin</option>
                      <option value="superadmin">Superadmin</option>
                    </select>
                    <select
                      value={tmZoneId ?? ""}
                      onChange={(e) =>
                        setTmZoneId(e.target.value ? Number(e.target.value) : null)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="">No zone (superadmin only)</option>
                      {zonesHook.zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-orange-500 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-60"
                >
                  {saving ? "Adding..." : "Add Teammate"}
                </button>
              </form>
            )}

            {teammatesHook.teammates.length === 0 && !showTeammateForm ? (
              <p className="text-sm text-gray-400 text-center py-8">
                No teammates yet.
              </p>
            ) : (
              teammatesHook.teammates.map((t) => (
                <div
                  key={t.id}
                  className={`bg-white rounded-xl border p-4 space-y-3 ${
                    t.isActive ? "border-gray-200" : "border-gray-100 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">{t.name}</p>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleBadge(t.role)}`}
                        >
                          {roleLabel(t.role)}
                        </span>
                        {!t.isActive && (
                          <span className="text-xs text-gray-400">Inactive</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {t.phone}
                        {t.zoneName ? ` · ${t.zoneName}` : " · No zone"}
                      </p>
                    </div>
                    {isZoneAdmin && t.id !== teammate?.id && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            if (resetPinTeammateId === t.id) {
                              setResetPinTeammateId(null); setResetPinValue("");
                            } else {
                              setResetPinTeammateId(t.id); setResetPinValue("");
                            }
                          }}
                          className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                        >
                          {resetPinTeammateId === t.id ? "Cancel" : "Reset PIN"}
                        </button>
                        <button
                          onClick={() => toggleActive(t.id, t.isActive)}
                          className="text-xs text-gray-400 hover:text-gray-700"
                        >
                          {t.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    )}
                  </div>

                  {resetPinTeammateId === t.id && (
                    <form onSubmit={doResetPin} className="flex gap-2 items-center pt-1 border-t border-gray-100">
                      <input
                        type="password"
                        inputMode="numeric"
                        minLength={4}
                        placeholder="New PIN (min 4 digits)"
                        value={resetPinValue}
                        onChange={(e) => setResetPinValue(e.target.value)}
                        required
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      <button
                        type="submit"
                        disabled={resetPinSaving || resetPinValue.length < 4}
                        className="bg-orange-500 text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-60 whitespace-nowrap"
                      >
                        {resetPinSaving ? "Saving…" : "Set PIN"}
                      </button>
                    </form>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
