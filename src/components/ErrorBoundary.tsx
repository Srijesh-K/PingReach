import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID } from '../firebase';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  isQuotaError: boolean;
  isSpecificDailyReadQuota: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
      isQuotaError: false,
      isSpecificDailyReadQuota: false,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let raw = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.error === 'string') {
        raw = parsed.error;
      }
    } catch {
      // Plain error message
    }

    const isQuotaError = raw.includes('Quota exceeded');
    const isSpecificDailyReadQuota = raw.includes(
      "Quota exceeded for quota metric 'Free daily read units per project (free tier database)'"
    );

    return {
      hasError: true,
      message: raw,
      isQuotaError,
      isSpecificDailyReadQuota,
    };
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const upgradeUrl = `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/firestore/databases/${FIRESTORE_DATABASE_ID}/data?openUpgradeDialog=true`;

    return (
      <div className="min-h-screen bg-[#F4F6F5] flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white border border-neutral-200 rounded-xl p-8">
          <div className="w-11 h-11 rounded-lg bg-red-50 text-red-700 flex items-center justify-center mb-4">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-semibold text-neutral-900 mb-2">
            Connection Interrupted
          </h1>
          <p className="text-sm text-neutral-600 leading-relaxed mb-4">
            {this.state.message}
          </p>

          {this.state.isQuotaError && (
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2 mb-5">
              <p>
                Your Firestore free-tier daily quota has been reached and will reset the next day.
              </p>
              {this.state.isSpecificDailyReadQuota && (
                <a
                  href={upgradeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block font-semibold underline"
                >
                  Open Firebase Database Console
                </a>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#008069] hover:bg-[#006D59] text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
          >
            <RefreshCw className="w-4 h-4" />
            Reload Application
          </button>
        </div>
      </div>
    );
  }
}
