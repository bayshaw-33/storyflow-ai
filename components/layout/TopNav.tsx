import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { LogIn, Settings, UserPlus } from "lucide-react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { BRAND_NAME } from "@/lib/brand";

type TopNavProps = {
  session: Session | null;
  onSignIn: () => void;
  onSignUp: () => void;
  onSignOut: () => void;
};

export function TopNav({ session, onSignIn, onSignOut, onSignUp }: TopNavProps) {
  return (
    <header className="kk-top-nav">
      <Link className="kk-nav-brand" href="/">
        <span className="kk-logo-mark">KK</span>
        <span>{BRAND_NAME}</span>
      </Link>

      <nav className="kk-nav-links" aria-label="Primary">
        <a href="#projects">Projects</a>
        <a href="#workflows">Workflows</a>
        <Link href="/universes">Universe</Link>
        <Link href="/settings">Subscription</Link>
        <Link href="/settings">
          <Settings size={15} />
          Settings
        </Link>
      </nav>

      <div className="kk-nav-actions">
        <LanguageToggle />
        <div className="kk-indicator" aria-label="KK companion status">
          <span />
          KK
        </div>
        {session ? (
          <>
            <span className="kk-nav-email">{session.user.email}</span>
            <button className="kk-icon-button" type="button" title="Sign out" onClick={onSignOut}>
              <LogIn size={17} />
            </button>
          </>
        ) : (
          <>
            <button className="kk-icon-button" type="button" title="Sign up" onClick={onSignUp}>
              <UserPlus size={17} />
            </button>
            <button className="kk-icon-button" type="button" title="Sign in" onClick={onSignIn}>
              <LogIn size={17} />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
