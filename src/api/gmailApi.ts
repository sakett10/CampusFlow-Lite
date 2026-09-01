import type { GmailSyncStats } from '../lib/types';

export interface GmailStatusResponse {
  connected: boolean;
  email?: string | null;
  connectedAt?: string;
  updatedAt?: string;
}

export interface GmailAuthUrlResponse {
  url: string;
}

export interface GmailDisconnectResponse {
  success: boolean;
  message: string;
}

export const gmailApi = {
  /**
   * Check connection status of Gmail account for current user
   */
  getStatus: async (token: string): Promise<GmailStatusResponse> => {
    const res = await fetch('/api/gmail/status', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to get Gmail status (HTTP ${res.status})`);
    }

    return res.json();
  },

  /**
   * Get authenticated Google OAuth authorization URL
   */
  getAuthUrl: async (token: string): Promise<GmailAuthUrlResponse> => {
    const res = await fetch('/api/gmail/auth-url', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to get Gmail authorization URL (HTTP ${res.status})`);
    }

    return res.json();
  },

  /**
   * Disconnect and revoke Gmail integration for current user
   */
  disconnect: async (token: string): Promise<GmailDisconnectResponse> => {
    const res = await fetch('/api/gmail/disconnect', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to disconnect Gmail (HTTP ${res.status})`);
    }

    return res.json();
  },

  /**
   * Trigger on-demand sync of Gmail messages
   */
  sync: async (token: string): Promise<GmailSyncStats> => {
    const res = await fetch('/api/gmail/sync', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to sync Gmail (HTTP ${res.status})`);
    }

    return res.json();
  },
};
