import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import {
  ArrowRight,
  CheckCircle2,
  Database,
  Lock,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react';
import { auth, FIREBASE_PROJECT_ID, googleProvider } from '../firebase';
import authHeroImg from '../assets/images/auth_hero_communication_1792852725005.jpg';

export interface AuthScreenProps {
  onOpenAdmin?: () => void;
}

export function AuthScreen({ onOpenAdmin }: AuthScreenProps = {}) {
  const [authTab, setAuthTab] = useState<'signin' | 'signup'>('signin');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailProviderDisabled, setEmailProviderDisabled] = useState(false);
  const [heroBroken, setHeroBroken] = useState(false);

  const handleGoogleContinue = async () => {
    setBusy(true);
    setErrorMessage(null);
    setEmailProviderDisabled(false);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        setErrorMessage('Google sign-in window was closed before completing login.');
      } else if (code === 'auth/popup-blocked') {
        setErrorMessage('Sign-in popup was blocked by your browser. Please allow popups for this site.');
      } else {
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to sign in with Google right now.'
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMessage(null);
    setEmailProviderDisabled(false);

    try {
      if (authTab === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (fullName.trim()) {
          await updateProfile(cred.user, { displayName: fullName.trim().slice(0, 60) });
        }
        await sendEmailVerification(cred.user);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        setEmailProviderDisabled(true);
        setErrorMessage(
          'Email/Password sign-in is not yet enabled in your Firebase project. Continue with Google immediately, or enable Email/Password in Firebase Console.'
        );
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setErrorMessage('Incorrect email or password. Try again or continue with Google.');
      } else if (code === 'auth/email-already-in-use') {
        setErrorMessage('An account already exists with this email. Switch to Sign In or continue with Google.');
      } else if (code === 'auth/weak-password') {
        setErrorMessage('Choose a password with at least 6 characters.');
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Authentication failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6F5] text-[#111B21] flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="w-full bg-white border-b border-neutral-200 px-6 lg:px-12 py-4 flex items-center justify-between gap-8">
        <a
          href="#top"
          className="text-lg font-bold tracking-tight text-[#0B3B31] whitespace-nowrap shrink-0"
        >
          WhatsConnect
        </a>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-neutral-600">
          <a
            href="#features"
            className="hover:text-[#008069] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Messaging
          </a>
          <a
            href="#data-transfer"
            className="hover:text-[#008069] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Data Packets
          </a>
          <a
            href="#security"
            className="hover:text-[#008069] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Security
          </a>
          <a
            href="#how-it-works"
            className="hover:text-[#008069] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            How It Works
          </a>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          {onOpenAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="text-xs font-semibold text-neutral-600 hover:text-[#008069] flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors cursor-pointer"
              title="Admin Portal (/admin)"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#008069]" />
              <span>Admin</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleGoogleContinue}
            disabled={busy}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#008069] hover:bg-[#006D59] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            Continue with Google
          </button>
        </div>
      </header>

      {/* Main 1440px Split Workspace */}
      <main
        id="top"
        className="flex-1 max-w-[1360px] w-full mx-auto px-6 lg:px-12 py-10 lg:py-14 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch"
      >
        {/* Left Column: Editorial Product Showcase */}
        <section className="lg:col-span-7 flex flex-col justify-between space-y-8">
          <div className="space-y-4 max-w-2xl">
            <p className="text-xs font-medium text-[#008069]">
              Direct Messaging · Structured Data Transfer · Google Identity
            </p>
            <h1
              className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-[#111B21] leading-[1.15]"
              style={{ textWrap: 'balance' } as React.CSSProperties}
            >
              Send instant messages and structured data from person to person.
            </h1>
            <p className="text-base text-neutral-600 leading-relaxed max-w-[62ch]">
              Sign in or create your account with Google in one click. Connect with anyone using
              their email address or unique handle to exchange real-time messages, structured
              records, code snippets, and downloadable data files.
            </p>
          </div>

          {/* Studio Visual with Resilient Fallback */}
          <div className="relative rounded-xl overflow-hidden border border-neutral-200 bg-neutral-100 aspect-[16/10]">
            {!heroBroken ? (
              <img
                src={authHeroImg}
                alt="Minimalist oak desk workspace with tablet for direct messaging and correspondence"
                referrerPolicy="no-referrer"
                onError={() => setHeroBroken(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#E6F3F0] via-[#F4F6F5] to-[#E2ECE9] flex flex-col items-center justify-center p-8 text-center">
                <MessageSquare className="w-10 h-10 text-[#008069] mb-3" />
                <p className="text-sm font-semibold text-[#111B21]">
                  WhatsConnect Web Workspace
                </p>
                <p className="text-xs text-neutral-600 mt-1">
                  Real-time 1-to-1 conversations and structured data packets
                </p>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent p-6 text-white">
              <p className="text-sm font-semibold">
                Built for fast personal chats and clean person-to-person data handoffs
              </p>
              <p className="text-xs text-white/80 mt-1">
                Live read receipts · Structured key-value cards · Instant file packet downloads
              </p>
            </div>
          </div>

          {/* Feature Highlights Strip */}
          <div
            id="features"
            className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2 border-t border-neutral-200"
          >
            <div id="how-it-works" className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#111B21]">
                <CheckCircle2 className="w-4 h-4 text-[#008069] shrink-0" />
                <span>1-Click Google Login</span>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Create a new account or sign back in automatically using verified Google Auth.
              </p>
            </div>

            <div id="data-transfer" className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#111B21]">
                <Database className="w-4 h-4 text-[#008069] shrink-0" />
                <span>Structured Data Packets</span>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Send labeled records, JSON/SQL/code snippets, or text/CSV files directly in chat.
              </p>
            </div>

            <div id="security" className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#111B21]">
                <ShieldCheck className="w-4 h-4 text-[#008069] shrink-0" />
                <span>Private Email Isolation</span>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Find contacts via SHA-256 email hash or handle without exposing private directories.
              </p>
            </div>
          </div>
        </section>

        {/* Right Column: Authentication Card */}
        <section className="lg:col-span-5 flex flex-col justify-center">
          <div className="bg-white border border-neutral-200 rounded-xl p-7 sm:p-9 space-y-6">
            {/* Segmented Mode Control */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#F0F2F5] rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setAuthTab('signin');
                  setErrorMessage(null);
                }}
                className={`py-2 px-4 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  authTab === 'signin'
                    ? 'bg-white text-[#111B21] shadow-xs'
                    : 'text-neutral-600 hover:text-[#111B21]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab('signup');
                  setErrorMessage(null);
                }}
                className={`py-2 px-4 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  authTab === 'signup'
                    ? 'bg-white text-[#111B21] shadow-xs'
                    : 'text-neutral-600 hover:text-[#111B21]'
                }`}
              >
                Create Account
              </button>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-2xl font-bold tracking-tight text-[#111B21]">
                {authTab === 'signin' ? 'Welcome to WhatsConnect' : 'Create your WhatsConnect account'}
              </h2>
              <p className="text-sm text-neutral-600">
                {authTab === 'signin'
                  ? 'Continue with your Google account to open your conversations and shared data.'
                  : 'Get started in seconds with Google to receive your unique handle and start messaging.'}
              </p>
            </div>

            {/* Primary Google Authentication CTA */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleGoogleContinue}
                disabled={busy}
                className="w-full py-3 px-4 bg-[#008069] hover:bg-[#006D59] text-white font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                <span className="w-5 h-5 rounded-sm bg-white flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
                    />
                  </svg>
                </span>
                <span>
                  {busy
                    ? 'Connecting to Google...'
                    : authTab === 'signin'
                      ? 'Continue with Google'
                      : 'Sign up with Google'}
                </span>
                <ArrowRight className="w-4 h-4 ml-auto opacity-80" />
              </button>

              <p className="text-xs text-neutral-500 text-center">
                Works for both new and existing users · Verified Google account
              </p>
            </div>

            {/* Optional Email/Password Accordion */}
            <div className="pt-2 border-t border-neutral-200 space-y-4">
              <button
                type="button"
                onClick={() => setShowEmailForm((prev) => !prev)}
                className="w-full text-xs font-medium text-neutral-600 hover:text-[#008069] transition-colors flex items-center justify-between py-1 cursor-pointer"
              >
                <span>
                  {showEmailForm
                    ? 'Hide email & password option'
                    : authTab === 'signin'
                      ? 'Or sign in with email & password'
                      : 'Or create account with email & password'}
                </span>
                <span className="text-neutral-400">{showEmailForm ? '−' : '+'}</span>
              </button>

              {showEmailForm && (
                <form onSubmit={handleEmailSubmit} className="space-y-3.5">
                  {authTab === 'signup' && (
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 mb-1">
                        Your Name
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={60}
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Srijesh Nair"
                        className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAF9] border border-neutral-300 rounded-lg focus:outline-none focus:border-[#008069]"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      maxLength={254}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAF9] border border-neutral-300 rounded-lg focus:outline-none focus:border-[#008069]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full px-3.5 py-2.5 text-sm bg-[#F8FAF9] border border-neutral-300 rounded-lg focus:outline-none focus:border-[#008069]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full py-2.5 px-4 bg-[#111B21] hover:bg-neutral-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
                  >
                    {authTab === 'signin' ? 'Sign In with Email' : 'Create Email Account'}
                  </button>
                </form>
              )}
            </div>

            {errorMessage && (
              <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 space-y-2">
                <p className="font-medium">{errorMessage}</p>
                {emailProviderDisabled && (
                  <div className="text-[11px] text-red-700 space-y-1 pt-1 border-t border-red-200">
                    <p className="font-semibold">To enable Email/Password in Firebase Console:</p>
                    <p>
                      1. Open{' '}
                      <a
                        href={`https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/providers`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline font-medium"
                      >
                        Firebase Authentication Providers
                      </a>
                      .
                    </p>
                    <p>2. Select Email/Password, toggle Enable, and click Save.</p>
                  </div>
                )}
              </div>
            )}

            <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500">
              <div className="flex items-center gap-2 min-w-0">
                <Lock className="w-3.5 h-3.5 text-[#008069] shrink-0" />
                <span className="truncate">Messages and data packets are access-controlled.</span>
              </div>
              {onOpenAdmin && (
                <button
                  type="button"
                  onClick={onOpenAdmin}
                  className="text-neutral-400 hover:text-[#008069] transition-colors flex items-center gap-1 font-medium whitespace-nowrap cursor-pointer ml-3 shrink-0"
                  title="Admin Portal (/admin)"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-[#008069]" />
                  <span>Admin</span>
                </button>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
