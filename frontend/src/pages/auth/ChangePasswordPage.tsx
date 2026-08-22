import { FormEvent, useState } from "react";
import { AlertCircle, KeyRound, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Button from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { PASSWORD_REQUIREMENTS } from "@/utils/validation";

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { changePassword, logout, user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const requirementsMet = PASSWORD_REQUIREMENTS.map((requirement) =>
    requirement.test(password),
  );
  const valid =
    currentPassword.length > 0 &&
    requirementsMet.every(Boolean) &&
    password !== currentPassword &&
    password === confirmPassword;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setError("");
    setLoading(true);
    try {
      await changePassword(currentPassword, password);
      navigate("/dashboard", { replace: true });
    } catch (caught: unknown) {
      const message = (
        caught as { response?: { data?: { message?: string } } }
      ).response?.data?.message;
      setError(message || "Failed to change password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    navigate("/auth/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <main
        id="main-content"
        className="glass-panel max-w-md w-full p-8 space-y-6"
      >
        <div className="text-center">
          <KeyRound
            className="w-10 h-10 text-moss-green mx-auto mb-3"
            aria-hidden="true"
          />
          <h1 className="text-2xl font-bold text-moss-green font-heading">
            Choose your password
          </h1>
          <p className="mt-2 text-sm text-stone-gray">
            {user?.displayName ? `Welcome, ${user.displayName}. ` : ""}
            Replace the temporary password to continue.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 bg-danger/10 border border-danger/30 rounded-lg p-3"
          >
            <AlertCircle
              className="w-4 h-4 text-danger-ink mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <p className="text-sm text-danger-ink">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordField
            id="current-password"
            label="Temporary password"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
            autoFocus
            disabled={loading}
          />
          <PasswordField
            id="new-password"
            label="New password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            disabled={loading}
          />
          {password && (
            <ul className="space-y-1" aria-label="Password requirements">
              {PASSWORD_REQUIREMENTS.map((requirement, index) => (
                <li
                  key={requirement.label}
                  className={`text-xs ${requirementsMet[index] ? "text-moss-green" : "text-stone-gray"}`}
                >
                  {requirementsMet[index] ? "Met: " : "Needed: "}
                  {requirement.label}
                </li>
              ))}
            </ul>
          )}
          <PasswordField
            id="confirm-password"
            label="Confirm new password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            disabled={loading}
          />
          {password === currentPassword && password.length > 0 && (
            <p className="text-xs text-danger-ink">
              New password must differ from the temporary password.
            </p>
          )}
          {confirmPassword && password !== confirmPassword && (
            <p className="text-xs text-danger-ink">Passwords do not match.</p>
          )}
          <Button type="submit" disabled={loading || !valid} className="w-full">
            {loading ? "Saving..." : "Set Password and Continue"}
          </Button>
        </form>

        <button
          type="button"
          onClick={handleSignOut}
          className="w-full inline-flex items-center justify-center gap-1.5 text-sm text-stone-gray hover:text-moss-green transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
          Sign out instead
        </button>
      </main>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  autoFocus = false,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
  disabled: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-moss-green mb-1">
        {label}
      </label>
      <input
        id={id}
        type="password"
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input-cozy w-full"
        disabled={disabled}
        required
      />
    </div>
  );
}
