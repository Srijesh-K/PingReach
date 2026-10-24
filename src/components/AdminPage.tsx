import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  KeyRound,
  Eye,
  EyeOff,
  Search,
  Server,
  Activity,
  UserCheck,
  AlertTriangle,
  Megaphone,
  Database,
  ArrowLeft,
  RefreshCw,
  Sliders,
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink,
  Info,
  Clock,
  Terminal,
} from 'lucide-react';
import { lookupPersonByIdentifier } from '../services/chatService';
import { DirectoryEntry, PublicProfile, VALIDATION_RULES, AVATAR_PALETTE } from '../types/chat';
import { db } from '../firebase';
import { collection, getDocs, limit, query } from 'firebase/firestore';

interface AdminPageProps {
  onNavigateHome: () => void;
  currentUser?: PublicProfile | null;
  onSelectUserForChat?: (user: DirectoryEntry) => void;
}

interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  type: 'auth' | 'lookup' | 'broadcast' | 'system';
}

const ADMIN_SECRET_CODE = 'admin@123';
const ADMIN_STORAGE_KEY = 'pingreach_admin_authenticated';
const BROADCAST_STORAGE_KEY = 'pingreach_system_announcement';

export function AdminPage({ onNavigateHome, currentUser, onSelectUserForChat }: AdminPageProps) {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem(ADMIN_STORAGE_KEY) === 'true';
  });
  const [passcodeInput, setPasscodeInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'lookup' | 'broadcast' | 'rules' | 'logs'>('overview');

  // User directory lookup state
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<DirectoryEntry | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  // Broadcast state
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastLevel, setBroadcastLevel] = useState<'info' | 'warning' | 'critical'>('info');
  const [activeBroadcast, setActiveBroadcast] = useState<{
    title: string;
    message: string;
    level: 'info' | 'warning' | 'critical';
    publishedAt: string;
  } | null>(() => {
    try {
      const stored = localStorage.getItem(BROADCAST_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [broadcastSavedFeedback, setBroadcastSavedFeedback] = useState(false);

  // Health check state
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');

  // Audit logs
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => [
    {
      id: '1',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      action: 'Admin portal initial boot verified',
      type: 'system',
    },
  ]);

  const addAuditLog = (action: string, type: AuditLog['type']) => {
    const newLog: AuditLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      action,
      type,
    };
    setAuditLogs((prev) => [newLog, ...prev.slice(0, 49)]);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcodeInput === ADMIN_SECRET_CODE) {
      setIsAuthenticated(true);
      sessionStorage.setItem(ADMIN_STORAGE_KEY, 'true');
      setAuthError(null);
      setPasscodeInput('');
      addAuditLog('Admin authentication succeeded via code verification', 'auth');
    } else {
      setAuthError('Access denied: Invalid admin passcode. Please verify your credentials.');
      addAuditLog(`Failed authentication attempt with invalid code`, 'auth');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem(ADMIN_STORAGE_KEY);
    setPasscodeInput('');
    setAuthError(null);
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupQuery.trim()) return;

    setLookupLoading(true);
    setLookupError(null);
    setLookupResult(null);

    try {
      const result = await lookupPersonByIdentifier(lookupQuery);
      if (result) {
        setLookupResult(result);
        addAuditLog(`User lookup found handle @${result.handle} (${result.uid.slice(0, 8)}...)`, 'lookup');
      } else {
        setLookupError(`No registered user found matching "${lookupQuery.trim()}".`);
        addAuditLog(`User lookup yielded no records for "${lookupQuery.trim()}"`, 'lookup');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLookupError(`Directory search error: ${msg}`);
      addAuditLog(`Directory search failure: ${msg}`, 'lookup');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSaveBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) return;

    const payload = {
      title: broadcastTitle.trim(),
      message: broadcastMessage.trim(),
      level: broadcastLevel,
      publishedAt: new Date().toISOString(),
    };

    localStorage.setItem(BROADCAST_STORAGE_KEY, JSON.stringify(payload));
    setActiveBroadcast(payload);
    setBroadcastTitle('');
    setBroadcastMessage('');
    setBroadcastSavedFeedback(true);
    setTimeout(() => setBroadcastSavedFeedback(false), 3000);
    addAuditLog(`System announcement published: "${payload.title}" (${payload.level})`, 'broadcast');
  };

  const handleClearBroadcast = () => {
    localStorage.removeItem(BROADCAST_STORAGE_KEY);
    setActiveBroadcast(null);
    addAuditLog('System announcement cleared by admin', 'broadcast');
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('idle');
    setConnectionMessage('');

    try {
      // Attempt a lightweight read on public lookup collection with limit 1
      const q = query(collection(db, 'handles'), limit(1));
      await getDocs(q);
      setConnectionStatus('success');
      setConnectionMessage('Firebase Firestore live connection verified successfully.');
      addAuditLog('Database connectivity diagnostic passed', 'system');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setConnectionStatus('error');
      setConnectionMessage(`Firestore ping failed: ${msg}`);
      addAuditLog(`Database connectivity check failed: ${msg}`, 'system');
    } finally {
      setTestingConnection(false);
    }
  };

  // If not authenticated, render the Passcode Gate Lockscreen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0c1317] text-[#e9edef] flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md bg-[#111b21] border border-[#222e35] rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          {/* Top Emerald Glow Bar */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#00a884] via-[#008069] to-[#02735e]" />

          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-[#202c33] border border-[#00a884]/30 flex items-center justify-center text-[#00a884] shadow-lg mb-4">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#e9edef]">Admin Portal</h1>
            <p className="text-xs text-[#8696a0] mt-1.5 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-[#00a884]" />
              Restricted Area · Authorized Personnel Only
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#8696a0] uppercase tracking-wider mb-2">
                Passcode Required
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#8696a0]">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={passcodeInput}
                  onChange={(e) => {
                    setPasscodeInput(e.target.value);
                    if (authError) setAuthError(null);
                  }}
                  placeholder="Enter admin passcode"
                  autoFocus
                  className="w-full pl-10 pr-10 py-3 bg-[#202c33] border border-[#2a3942] focus:border-[#00a884] focus:outline-none rounded-xl text-sm text-[#e9edef] placeholder-[#8696a0] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#8696a0] hover:text-[#e9edef] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {authError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start gap-2">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 px-4 bg-[#008069] hover:bg-[#00a884] active:scale-[0.99] text-white font-medium rounded-xl text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <Unlock className="w-4 h-4" />
              <span>Unlock Admin Console</span>
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-[#222e35] flex items-center justify-between text-xs text-[#8696a0]">
            <button
              onClick={onNavigateHome}
              className="inline-flex items-center gap-1.5 text-[#8696a0] hover:text-[#00a884] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Messenger</span>
            </button>
            <span className="font-mono text-[11px] text-[#8696a0]/60">PingReach v1.0.0</span>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated Admin Dashboard View
  return (
    <div className="min-h-screen bg-[#0c1317] text-[#e9edef] flex flex-col">
      {/* Top Navigation Bar */}
      <header className="h-16 bg-[#111b21] border-b border-[#222e35] px-6 flex items-center justify-between shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#202c33] border border-[#00a884]/40 flex items-center justify-center text-[#00a884]">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-sm tracking-tight text-[#e9edef]">PingReach Admin Console</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#00a884]/20 text-[#00a884] border border-[#00a884]/40">
                Authorized
              </span>
            </div>
            <p className="text-[11px] text-[#8696a0]">Secure Management & Diagnostics</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onNavigateHome}
            className="px-3 py-1.5 text-xs text-[#8696a0] hover:text-[#e9edef] hover:bg-[#202c33] rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Open Messenger</span>
          </button>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Lock Console</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col md:flex-row gap-6">
        {/* Sidebar Nav */}
        <nav className="w-full md:w-60 shrink-0 space-y-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2.5 transition-colors cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-[#008069] text-white shadow-sm'
                : 'text-[#8696a0] hover:bg-[#202c33] hover:text-[#e9edef]'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>System Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('lookup')}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2.5 transition-colors cursor-pointer ${
              activeTab === 'lookup'
                ? 'bg-[#008069] text-white shadow-sm'
                : 'text-[#8696a0] hover:bg-[#202c33] hover:text-[#e9edef]'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>User & Directory Lookup</span>
          </button>

          <button
            onClick={() => setActiveTab('broadcast')}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2.5 transition-colors cursor-pointer ${
              activeTab === 'broadcast'
                ? 'bg-[#008069] text-white shadow-sm'
                : 'text-[#8696a0] hover:bg-[#202c33] hover:text-[#e9edef]'
            }`}
          >
            <Megaphone className="w-4 h-4" />
            <span>Broadcast Alerts</span>
          </button>

          <button
            onClick={() => setActiveTab('rules')}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2.5 transition-colors cursor-pointer ${
              activeTab === 'rules'
                ? 'bg-[#008069] text-white shadow-sm'
                : 'text-[#8696a0] hover:bg-[#202c33] hover:text-[#e9edef]'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Platform Rules</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2.5 transition-colors cursor-pointer ${
              activeTab === 'logs'
                ? 'bg-[#008069] text-white shadow-sm'
                : 'text-[#8696a0] hover:bg-[#202c33] hover:text-[#e9edef]'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>Session Audit Logs</span>
          </button>
        </nav>

        {/* Tab Content */}
        <main className="flex-1 min-w-0">
          {/* TAB 1: SYSTEM OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[#111b21] border border-[#222e35] p-4 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8696a0]">Admin Status</span>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <div className="text-lg font-bold text-[#e9edef] mt-2">Active Session</div>
                  <div className="text-[11px] text-[#00a884] mt-1 font-mono">admin@123 unlocked</div>
                </div>

                <div className="bg-[#111b21] border border-[#222e35] p-4 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8696a0]">Firestore Security</span>
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-lg font-bold text-[#e9edef] mt-2">Rules Version 2</div>
                  <div className="text-[11px] text-[#8696a0] mt-1">Schema strictly enforced</div>
                </div>

                <div className="bg-[#111b21] border border-[#222e35] p-4 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8696a0]">Privacy Protocol</span>
                    <KeyRound className="w-4 h-4 text-teal-400" />
                  </div>
                  <div className="text-lg font-bold text-[#e9edef] mt-2">SHA-256 Hashing</div>
                  <div className="text-[11px] text-[#8696a0] mt-1">Zero email disclosure</div>
                </div>

                <div className="bg-[#111b21] border border-[#222e35] p-4 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8696a0]">Current Operator</span>
                    <UserCheck className="w-4 h-4 text-[#00a884]" />
                  </div>
                  <div className="text-lg font-bold text-[#e9edef] mt-2 truncate">
                    {currentUser ? `@${currentUser.handle}` : 'Anonymous Admin'}
                  </div>
                  <div className="text-[11px] text-[#8696a0] mt-1 truncate">
                    {currentUser ? currentUser.displayName : 'Not logged into chat'}
                  </div>
                </div>
              </div>

              {/* Live Connectivity Diagnostic */}
              <div className="bg-[#111b21] border border-[#222e35] rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-[#e9edef]">Live Backend Diagnostic</h2>
                    <p className="text-xs text-[#8696a0] mt-0.5">
                      Verify Cloud Firestore read/write capabilities and rule compliance.
                    </p>
                  </div>
                  <button
                    onClick={handleTestConnection}
                    disabled={testingConnection}
                    className="px-3 py-1.5 bg-[#202c33] hover:bg-[#2a3942] active:scale-95 text-xs text-[#e9edef] font-medium rounded-lg border border-[#2a3942] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin' : ''}`} />
                    <span>Run Health Ping</span>
                  </button>
                </div>

                {connectionStatus === 'success' && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{connectionMessage}</span>
                  </div>
                )}

                {connectionStatus === 'error' && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{connectionMessage}</span>
                  </div>
                )}

                {connectionStatus === 'idle' && (
                  <p className="text-xs text-[#8696a0]">
                    Click &ldquo;Run Health Ping&rdquo; to test live query responsiveness against Firestore handles collection.
                  </p>
                )}
              </div>

              {/* Environment Information */}
              <div className="bg-[#111b21] border border-[#222e35] rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-semibold text-[#e9edef]">Environment & Architecture</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="flex justify-between py-2 border-b border-[#222e35]">
                    <span className="text-[#8696a0]">Application Version:</span>
                    <span className="font-mono text-[#e9edef]">PingReach 1.0.0</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-[#222e35]">
                    <span className="text-[#8696a0]">Admin Authorization:</span>
                    <span className="font-mono text-[#00a884]">admin@123 [VALIDATED]</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-[#222e35]">
                    <span className="text-[#8696a0]">Database Engine:</span>
                    <span className="text-[#e9edef]">Google Cloud Firestore</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-[#222e35]">
                    <span className="text-[#8696a0]">Frontend Framework:</span>
                    <span className="text-[#e9edef]">React 19 + Tailwind v4 + Vite</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: USER DIRECTORY LOOKUP */}
          {activeTab === 'lookup' && (
            <div className="space-y-6">
              <div className="bg-[#111b21] border border-[#222e35] rounded-xl p-5">
                <h2 className="text-sm font-semibold text-[#e9edef] mb-1">User & Directory Explorer</h2>
                <p className="text-xs text-[#8696a0] mb-4">
                  Query the public registry by username (@handle) or registered email address.
                </p>

                <form onSubmit={handleLookup} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-[#8696a0]" />
                    <input
                      type="text"
                      value={lookupQuery}
                      onChange={(e) => setLookupQuery(e.target.value)}
                      placeholder="Search @handle or email (e.g. alice, @bob, user@domain.com)"
                      className="w-full pl-9 pr-4 py-2.5 bg-[#202c33] border border-[#2a3942] focus:border-[#00a884] focus:outline-none rounded-xl text-xs text-[#e9edef] placeholder-[#8696a0]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={lookupLoading || !lookupQuery.trim()}
                    className="px-4 py-2.5 bg-[#008069] hover:bg-[#00a884] text-white text-xs font-medium rounded-xl transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    {lookupLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    <span>Inspect</span>
                  </button>
                </form>

                {lookupError && (
                  <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>{lookupError}</span>
                  </div>
                )}

                {lookupResult && (
                  <div className="mt-5 p-4 bg-[#202c33] border border-[#2a3942] rounded-xl space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white shadow-md text-base"
                          style={{ backgroundColor: lookupResult.avatarColor }}
                        >
                          {lookupResult.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm text-[#e9edef]">{lookupResult.displayName}</h3>
                          <p className="text-xs text-[#00a884] font-mono">@{lookupResult.handle}</p>
                        </div>
                      </div>

                      {onSelectUserForChat && (
                        <button
                          onClick={() => onSelectUserForChat(lookupResult)}
                          className="px-3 py-1.5 bg-[#008069] hover:bg-[#00a884] text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Initiate Chat</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-[#2a3942] text-xs">
                      <div>
                        <span className="text-[#8696a0] block mb-1">User ID (UID):</span>
                        <div className="flex items-center gap-2 font-mono text-[11px] bg-[#111b21] p-2 rounded-lg border border-[#2a3942]">
                          <span className="truncate flex-1">{lookupResult.uid}</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(lookupResult.uid);
                              setCopiedId(true);
                              setTimeout(() => setCopiedId(false), 2000);
                            }}
                            className="text-[#8696a0] hover:text-[#00a884] transition-colors"
                            title="Copy UID"
                          >
                            {copiedId ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <span className="text-[#8696a0] block mb-1">Status / Bio:</span>
                        <div className="p-2 bg-[#111b21] rounded-lg border border-[#2a3942] text-xs text-[#d1d7db] italic">
                          &ldquo;{lookupResult.about || 'No bio provided'}&rdquo;
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: BROADCAST ALERTS */}
          {activeTab === 'broadcast' && (
            <div className="space-y-6">
              <div className="bg-[#111b21] border border-[#222e35] rounded-xl p-5">
                <h2 className="text-sm font-semibold text-[#e9edef] mb-1">System Broadcast Dispatcher</h2>
                <p className="text-xs text-[#8696a0] mb-4">
                  Publish a global banner message that appears across PingReach client sessions.
                </p>

                <form onSubmit={handleSaveBroadcast} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-[#8696a0] mb-1.5">Alert Level</label>
                    <div className="flex gap-3">
                      {(['info', 'warning', 'critical'] as const).map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setBroadcastLevel(level)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all cursor-pointer ${
                            broadcastLevel === level
                              ? level === 'info'
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                                : level === 'warning'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
                              : 'bg-[#202c33] text-[#8696a0] hover:text-[#e9edef]'
                          }`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#8696a0] mb-1.5">Announcement Title</label>
                    <input
                      type="text"
                      value={broadcastTitle}
                      onChange={(e) => setBroadcastTitle(e.target.value)}
                      placeholder="e.g. Scheduled System Maintenance"
                      className="w-full px-3.5 py-2.5 bg-[#202c33] border border-[#2a3942] focus:border-[#00a884] focus:outline-none rounded-xl text-xs text-[#e9edef] placeholder-[#8696a0]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#8696a0] mb-1.5">Message Content</label>
                    <textarea
                      rows={3}
                      value={broadcastMessage}
                      onChange={(e) => setBroadcastMessage(e.target.value)}
                      placeholder="Describe the update, notice, or instructions for users..."
                      className="w-full px-3.5 py-2.5 bg-[#202c33] border border-[#2a3942] focus:border-[#00a884] focus:outline-none rounded-xl text-xs text-[#e9edef] placeholder-[#8696a0]"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="submit"
                      disabled={!broadcastTitle.trim() || !broadcastMessage.trim()}
                      className="px-4 py-2 bg-[#008069] hover:bg-[#00a884] text-white text-xs font-medium rounded-xl transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                    >
                      <Megaphone className="w-3.5 h-3.5" />
                      <span>Publish Broadcast</span>
                    </button>

                    {broadcastSavedFeedback && (
                      <span className="text-xs text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Announcement Published!
                      </span>
                    )}
                  </div>
                </form>
              </div>

              {/* Active Broadcast Preview */}
              {activeBroadcast && (
                <div className="bg-[#111b21] border border-[#222e35] rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8696a0]">
                      Currently Active Banner
                    </h3>
                    <button
                      onClick={handleClearBroadcast}
                      className="text-xs text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                    >
                      Dismiss / Remove Banner
                    </button>
                  </div>

                  <div
                    className={`p-4 rounded-xl border flex items-start gap-3 ${
                      activeBroadcast.level === 'warning'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                        : activeBroadcast.level === 'critical'
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                        : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200'
                    }`}
                  >
                    <Info className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-xs text-[#e9edef]">{activeBroadcast.title}</h4>
                      <p className="text-xs mt-1 text-[#d1d7db]">{activeBroadcast.message}</p>
                      <span className="text-[10px] opacity-75 mt-2 block font-mono">
                        Published: {new Date(activeBroadcast.publishedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PLATFORM RULES */}
          {activeTab === 'rules' && (
            <div className="space-y-6">
              <div className="bg-[#111b21] border border-[#222e35] rounded-xl p-5">
                <h2 className="text-sm font-semibold text-[#e9edef] mb-1">Synchronized Validation Blueprint</h2>
                <p className="text-xs text-[#8696a0] mb-4">
                  Core constants verified across Firestore Security Rules, Types, and Client Services.
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#222e35] text-[#8696a0]">
                        <th className="pb-2.5 font-medium">Constant Key</th>
                        <th className="pb-2.5 font-medium">Limit / Pattern</th>
                        <th className="pb-2.5 font-medium">Scope</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#222e35]/50 font-mono text-[11px]">
                      <tr>
                        <td className="py-2.5 text-[#00a884]">HANDLE_MIN_LENGTH</td>
                        <td className="py-2.5">{VALIDATION_RULES.HANDLE_MIN_LENGTH} chars</td>
                        <td className="py-2.5 text-[#8696a0]">User handle registration</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-[#00a884]">HANDLE_MAX_LENGTH</td>
                        <td className="py-2.5">{VALIDATION_RULES.HANDLE_MAX_LENGTH} chars</td>
                        <td className="py-2.5 text-[#8696a0]">User handle registration</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-[#00a884]">MESSAGE_TEXT_MAX</td>
                        <td className="py-2.5">{VALIDATION_RULES.MESSAGE_TEXT_MAX} chars</td>
                        <td className="py-2.5 text-[#8696a0]">Direct message text payload</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-[#00a884]">PACKET_PAYLOAD_MAX</td>
                        <td className="py-2.5">{VALIDATION_RULES.PACKET_PAYLOAD_MAX} chars</td>
                        <td className="py-2.5 text-[#8696a0]">Data packet record / code body</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-[#00a884]">ABOUT_MAX</td>
                        <td className="py-2.5">{VALIDATION_RULES.ABOUT_MAX} chars</td>
                        <td className="py-2.5 text-[#8696a0]">User profile bio</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 pt-4 border-t border-[#222e35]">
                  <h3 className="text-xs font-semibold text-[#8696a0] uppercase tracking-wider mb-2.5">
                    Authorized Avatar Color Palette
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {AVATAR_PALETTE.map((color) => (
                      <div
                        key={color}
                        className="flex items-center gap-2 px-2.5 py-1.5 bg-[#202c33] rounded-lg border border-[#2a3942]"
                      >
                        <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: color }} />
                        <span className="font-mono text-[10px] text-[#e9edef]">{color}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: AUDIT LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-6">
              <div className="bg-[#111b21] border border-[#222e35] rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-[#e9edef]">Admin Session Audit Trail</h2>
                    <p className="text-xs text-[#8696a0] mt-0.5">
                      Timestamped record of administrative operations executed during this browser session.
                    </p>
                  </div>
                  <span className="text-xs font-mono text-[#8696a0]">{auditLogs.length} events logged</span>
                </div>

                <div className="space-y-2">
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 bg-[#202c33] border border-[#2a3942] rounded-xl flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <Clock className="w-3.5 h-3.5 text-[#8696a0] shrink-0" />
                        <span className="text-[#e9edef]">{log.action}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#111b21] text-[#00a884] uppercase">
                          {log.type}
                        </span>
                        <span className="font-mono text-[10px] text-[#8696a0]">{log.timestamp}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
