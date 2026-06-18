'use client';

import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import React from 'react';

if (typeof window !== 'undefined') {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (posthogKey && posthogHost) {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      person_profiles: 'never', // 匿名計測にしてリクエストを削減
      capture_pageview: false,  // ページビューは手動で計測する
      disable_session_recording: true, // 録画を無効化
    });
  }
}

export function PHProvider({ children }: { children: React.ReactNode }) {
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
