import { AuthLayoutShell } from "@/components/auth/AuthLayoutShell";
import { AuthScreen } from "@/components/auth/AuthScreen";

/**
 * AUTH layout — /login and /cadastro. Public; no product stores.
 * The screen lives in the layout (not the pages) so switching between the two URLs keeps it
 * mounted and its tab animation intact; each page only contributes its own metadata.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthLayoutShell>
      <AuthScreen />
      {children}
    </AuthLayoutShell>
  );
}
