"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // If already logged in, go straight to intake
  useEffect(() => {
    async function checkSession() {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data?.user) {
        router.replace("/intake");
      }
    }
    checkSession();
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    if (!email || !password) {
      setErrorMsg("Please enter both email and password.");
      setLoading(false);
      return;
    }

    try {
      if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          console.error(error);
          setErrorMsg(error.message || "Sign-in failed.");
        } else if (data?.user) {
          setSuccessMsg("Signed in. Redirecting to intake…");
          router.push("/intake");
        }
      } else {
        // signup mode
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          console.error(error);
          setErrorMsg(error.message || "Sign-up failed.");
        } else {
          setSuccessMsg(
            "Account created. You can now sign in and go to the intake page."
          );
          setMode("signin");
        }
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Something went wrong. Please try again.");
    }

    setLoading(false);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f1f5f9",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        color: "#0f172a",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "380px",
          background: "#ffffff",
          borderRadius: "12px",
          border: "1px solid #cbd5e1",
          padding: "20px 18px",
          boxShadow: "0 10px 25px rgba(15,23,42,0.08)",
        }}
      >
        <h1
          style={{
            fontSize: "18px",
            fontWeight: 700,
            marginBottom: "4px",
            textAlign: "center",
          }}
        >
          EMZlove Luxury
        </h1>
        <p
          style={{
            fontSize: "11px",
            color: "#64748b",
            textAlign: "center",
            marginBottom: "16px",
          }}
        >
          Secure login for intake & inventory
        </p>

        {/* Toggle buttons */}
        <div
          style={{
            display: "flex",
            gap: "4px",
            marginBottom: "14px",
            background: "#e2e8f0",
            padding: "3px",
            borderRadius: "999px",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setErrorMsg("");
              setSuccessMsg("");
            }}
            style={{
              flex: 1,
              padding: "6px 0",
              borderRadius: "999px",
              border: "none",
              fontSize: "12px",
              cursor: "pointer",
              background: mode === "signin" ? "#0f172a" : "transparent",
              color: mode === "signin" ? "#f9fafb" : "#0f172a",
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setErrorMsg("");
              setSuccessMsg("");
            }}
            style={{
              flex: 1,
              padding: "6px 0",
              borderRadius: "999px",
              border: "none",
              fontSize: "12px",
              cursor: "pointer",
              background: mode === "signup" ? "#0f172a" : "transparent",
              color: mode === "signup" ? "#f9fafb" : "#0f172a",
            }}
          >
            Sign up
          </button>
        </div>

        {errorMsg && (
          <p
            style={{
              fontSize: "11px",
              color: "#b91c1c",
              marginBottom: "6px",
            }}
          >
            {errorMsg}
          </p>
        )}
        {successMsg && (
          <p
            style={{
              fontSize: "11px",
              color: "#15803d",
              marginBottom: "6px",
            }}
          >
            {successMsg}
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <label
            style={{
              fontSize: "11px",
              display: "block",
              marginBottom: 4,
              marginTop: 4,
            }}
          >
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            placeholder="you@example.com"
          />

          <label
            style={{
              fontSize: "11px",
              display: "block",
              marginBottom: 4,
              marginTop: 4,
            }}
          >
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            placeholder="••••••••"
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: "12px",
              width: "100%",
              padding: "8px 14px",
              background: loading ? "#0f172a99" : "#0f172a",
              color: "#fff",
              borderRadius: "6px",
              fontSize: "13px",
              border: "none",
              cursor: "pointer",
            }}
          >
            {loading
              ? mode === "signin"
                ? "Signing in…"
                : "Creating account…"
              : mode === "signin"
              ? "Sign in & go to Intake"
              : "Create account"}
          </button>
        </form>

        <p
          style={{
            fontSize: "10px",
            color: "#94a3b8",
            marginTop: "10px",
            textAlign: "center",
          }}
        >
          After signing in, you&apos;ll be taken to the{" "}
          <strong>Intake</strong> page where you can start uploading bags.
        </p>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "6px 8px",
  fontSize: "12px",
  borderRadius: "6px",
  border: "1px solid #cbd5e1",
  marginBottom: "8px",
  boxSizing: "border-box",
  background: "#f8fafc",
};
