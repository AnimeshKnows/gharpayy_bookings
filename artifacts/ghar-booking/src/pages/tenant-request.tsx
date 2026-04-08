import { useState } from "react";
import { useCreateBookingRequest } from "@workspace/api-client-react";
import "@/styles/tenant-luxury.css";

interface FormData {
  tenantName: string;
  tenantPhone: string;
  tenantEmail: string;
  propertyName: string;
  tenantMessage: string;
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 10, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: "var(--muted)", fontWeight: 600, fontFamily: "var(--font-sans)" }}>
        {label}{required && <span style={{ color: "var(--gold)", marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: 8,
  padding: "11px 13px",
  fontFamily: "var(--font-sans)",
  fontSize: 14,
  outline: "none",
  transition: "border-color 0.2s",
};

export default function TenantRequest() {
  const [form, setForm] = useState<FormData>({
    tenantName: "",
    tenantPhone: "",
    tenantEmail: "",
    propertyName: "",
    tenantMessage: "",
  });
  const [focused, setFocused] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Read ?zone=<slug> from URL to associate with the right zone
  const zoneSlug = new URLSearchParams(window.location.search).get("zone") ?? undefined;

  const createRequest = useCreateBookingRequest();

  const set = (key: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.tenantName.trim() || !form.tenantPhone.trim() || !form.propertyName.trim()) {
      setError("Please fill in your name, phone, and property preference.");
      return;
    }
    createRequest.mutate(
      {
        data: {
          tenantName: form.tenantName.trim(),
          tenantPhone: form.tenantPhone.trim(),
          tenantEmail: form.tenantEmail.trim() || null,
          propertyName: form.propertyName.trim(),
          tenantMessage: form.tenantMessage.trim() || null,
          zoneSlug: zoneSlug ?? null,
        },
      },
      {
        onSuccess: (data) => setSubmitted(data.id),
        onError: () => setError("Something went wrong. Please try again or call us directly."),
      },
    );
  };

  const fieldStyle = (name: string): React.CSSProperties => ({
    ...inputStyle,
    borderColor: focused === name ? "var(--gold)" : "var(--border)",
    boxShadow: focused === name ? "0 0 0 3px rgba(201,168,76,0.08)" : "none",
  });

  const focusProps = (name: string) => ({
    onFocus: () => setFocused(name),
    onBlur: () => setFocused(null),
  });

  // ── Success state ───────────────────────────────────────────────────────
  if (submitted !== null) {
    const ref = `GHR-REQ-${String(submitted).padStart(4, "0")}`;
    return (
      <div className="gp">
        <div className="gp-page">
          <div className="gp-card">
            <div className="gp-hero">
              <div className="gp-hero-logo">
                <div className="gp-logo-mark">G</div>
                <div>
                  <div className="gp-logo-name">GHARPAYY</div>
                  <div className="gp-logo-sub">Room Finder</div>
                </div>
              </div>
              <div className="gp-hero-property">
                <div className="gp-hero-exclusive"><div className="gp-hero-dot" /> Request Received</div>
                <div className="gp-hero-name">We've Got Your Request!</div>
                <div className="gp-hero-room">{form.propertyName}</div>
              </div>
            </div>
            <div className="gp-body" style={{ textAlign: "center" }}>
              <div className="gp-state-icon success" style={{ margin: "0 auto 20px" }}>✓</div>
              <div className="gp-state-title">Request Submitted</div>
              <div className="gp-state-sub">
                Hey {form.tenantName.split(" ")[0]}! We've received your room enquiry and our advisor will reach out within a few hours to discuss your options.
              </div>

              <div className="gp-info-card gold" style={{ textAlign: "left", marginBottom: 20 }}>
                <div className="gp-info-row">
                  <span className="gp-info-dot gold">›</span>
                  <span>Reference: <strong style={{ color: "var(--gold-light)", fontFamily: "monospace" }}>{ref}</strong></span>
                </div>
                <div className="gp-info-row">
                  <span className="gp-info-dot gold">›</span>
                  <span>We'll WhatsApp you on <strong style={{ color: "var(--text2)" }}>{form.tenantPhone}</strong></span>
                </div>
                {form.tenantEmail && (
                  <div className="gp-info-row">
                    <span className="gp-info-dot gold">›</span>
                    <span>Confirmation email to <strong style={{ color: "var(--text2)" }}>{form.tenantEmail}</strong></span>
                  </div>
                )}
                <div className="gp-info-row">
                  <span className="gp-info-dot gold">›</span>
                  <span>Once your personalised offer is ready, you'll get a link to pay the room token and lock it in</span>
                </div>
              </div>

              <a
                className="gp-btn gp-btn-wa"
                href={`https://wa.me/?text=${encodeURIComponent(`Hi Gharpayy! My reference is ${ref}. I just submitted a room request for ${form.propertyName}. Looking forward to hearing from you!`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                💬 Follow Up on WhatsApp
              </a>
              <div className="gp-divider" />
              <p className="gp-footnote">
                No spam, no cold calls — just your personalised room offer.<br />
                <strong style={{ color: "var(--gold)" }}>gharpayy.com</strong>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Request Form ────────────────────────────────────────────────────────
  return (
    <div className="gp">
      <div className="gp-page">
        <div className="gp-card">
          <div className="gp-hero">
            <div className="gp-hero-logo">
              <div className="gp-logo-mark">G</div>
              <div>
                <div className="gp-logo-name">GHARPAYY</div>
                <div className="gp-logo-sub">Room Finder</div>
              </div>
            </div>
            <div className="gp-hero-property">
              <div className="gp-hero-exclusive"><div className="gp-hero-dot" /> Free Service — No Brokerage</div>
              <div className="gp-hero-name">Find Your Perfect Room</div>
              <div className="gp-hero-room">Tell us what you're looking for</div>
            </div>
          </div>

          <div className="gp-body">
            <div className="gp-info-card gold" style={{ marginBottom: 22 }}>
              <div className="gp-info-row">
                <span className="gp-info-dot gold">›</span>
                <span>Share your requirements below and we'll send you a personalised, time-limited offer</span>
              </div>
              <div className="gp-info-row">
                <span className="gp-info-dot gold">›</span>
                <span>Zero brokerage — you pay only the token to lock in your room</span>
              </div>
              <div className="gp-info-row">
                <span className="gp-info-dot gold">›</span>
                <span>Our advisor will contact you on WhatsApp within a few hours</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Your Full Name" required>
                  <input
                    style={fieldStyle("name")}
                    {...focusProps("name")}
                    placeholder="Rahul Sharma"
                    value={form.tenantName}
                    onChange={set("tenantName")}
                    required
                    autoComplete="name"
                  />
                </Field>
                <Field label="WhatsApp Number" required>
                  <input
                    style={fieldStyle("phone")}
                    {...focusProps("phone")}
                    placeholder="+91 98765 43210"
                    value={form.tenantPhone}
                    onChange={set("tenantPhone")}
                    required
                    type="tel"
                    autoComplete="tel"
                  />
                </Field>
              </div>

              <Field label="Email Address (optional)">
                <input
                  style={fieldStyle("email")}
                  {...focusProps("email")}
                  placeholder="rahul@gmail.com"
                  value={form.tenantEmail}
                  onChange={set("tenantEmail")}
                  type="email"
                  autoComplete="email"
                />
              </Field>

              <Field label="Preferred Location / Property" required>
                <input
                  style={fieldStyle("prop")}
                  {...focusProps("prop")}
                  placeholder="e.g. Koramangala, or Sunrise PG near MG Road"
                  value={form.propertyName}
                  onChange={set("propertyName")}
                  required
                />
              </Field>

              <Field label="Any requirements or questions?">
                <textarea
                  style={{ ...fieldStyle("msg"), resize: "vertical", minHeight: 90 }}
                  {...focusProps("msg")}
                  placeholder="e.g. Single room, AC preferred, vegetarian PG, budget around ₹12,000/mo, moving in next month..."
                  value={form.tenantMessage}
                  onChange={set("tenantMessage")}
                />
              </Field>

              {error && (
                <div style={{ background: "rgba(209,79,79,0.10)", border: "1px solid rgba(209,79,79,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#e08080" }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="gp-btn gp-btn-gold"
                style={{ marginTop: 4 }}
                disabled={createRequest.isPending}
              >
                {createRequest.isPending ? "Submitting…" : "Send My Room Request"}
              </button>
            </form>

            <div className="gp-divider" />
            <p className="gp-footnote">
              By submitting, you agree to be contacted on WhatsApp.<br />
              Your info is never sold or shared. <strong style={{ color: "var(--gold)" }}>gharpayy.com</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
