export const onRequest: PagesFunction = async (context) => {
  const request = context.request;
  const url = new URL(request.url);
  const pathname = url.pathname;

  const fetchWithCacheHeaders = async (targetUrl: string) => {
    const proxyRequest = new Request(targetUrl, request);
    const targetUrlObj = new URL(targetUrl);
    
    // 対象ドメインのHostヘッダーをセット
    proxyRequest.headers.set('Host', targetUrlObj.hostname);
    
    const response = await fetch(proxyRequest);
    
    // 2xx以外のエラーレスポンスはキャッシュを上書きせず、そのまま返す（エラーの永続キャッシュを防止）
    if (!response.ok) {
      return response;
    }
    
    const cachedResponse = new Response(response.body, response);
    
    // クエリパラメータにバージョン（v）が含まれている場合は強力な長期キャッシュを適用
    if (url.searchParams.has('v') || targetUrlObj.searchParams.has('v')) {
      cachedResponse.headers.set('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
    } else {
      // パラメータがない場合は、ブラウザにキャッシュさせつつ毎回サーバーへ更新の問い合わせを強制する
      cachedResponse.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    }
    
    return cachedResponse;
  };

  // 1. 静的ファイルのURLマッピング
  const staticAssetsMap: Record<string, string> = {
    '/Bthesis_main.pdf': 'https://assets.kippu-navi.com/documents/Bthesis_main.pdf',
    '/favicon.ico': 'https://assets.kippu-navi.com/icons/favicon.ico',
    '/apple-touch-icon-152x152-precomposed.png': 'https://assets.kippu-navi.com/icons/apple-touch-icon-152x152-precomposed.png',
    '/apple-touch-icon-152x152.png': 'https://assets.kippu-navi.com/icons/apple-touch-icon-152x152.png',
    '/apple-touch-icon-120x120-precomposed.png': 'https://assets.kippu-navi.com/icons/apple-touch-icon-120x120-precomposed.png',
    '/apple-touch-icon-120x120.png': 'https://assets.kippu-navi.com/icons/apple-touch-icon-120x120.png',
    '/apple-touch-icon-precomposed.png': 'https://assets.kippu-navi.com/icons/apple-touch-icon-precomposed.png',
    '/apple-touch-icon.png': 'https://assets.kippu-navi.com/icons/apple-touch-icon.png',
  };

  if (staticAssetsMap[pathname]) {
    return fetchWithCacheHeaders(staticAssetsMap[pathname]);
  }

  // 2. /engine/ パスのリライトとキャッシュ最適化
  if (pathname.startsWith('/engine/')) {
    const targetAssetUrl = 'https://assets.kippu-navi.com' + pathname;
    return fetchWithCacheHeaders(targetAssetUrl);
  }

  // 3. PostHogへのリバースプロキシ（広告ブロッカー回避用）
  if (pathname.startsWith('/ingest/')) {
    let targetHost = 'us.i.posthog.com';
    let proxyPath = pathname;

    // static アセットと通常のイベント送信でターゲットを振り分け
    if (pathname.startsWith('/ingest/static/')) {
      targetHost = 'us-assets.i.posthog.com';
      proxyPath = pathname.replace('/ingest', '');
    } else {
      proxyPath = pathname.replace('/ingest', '');
    }

    const targetUrl = `https://${targetHost}${proxyPath}${url.search}`;
    
    // PostHogへの転送
    const proxyRequest = new Request(targetUrl, request);
    // ドメインによるルーティングを正しく処理するためHostヘッダーを明示的に設定
    proxyRequest.headers.set('Host', targetHost);
    
    return fetch(proxyRequest);
  }

  // 4. APIエンドポイントへのルーティング（Go backend calculation-engineへのプロキシ）
  if (pathname.startsWith('/api/')) {
    const targetHost = 'calculation-engine-198310540092.asia-northeast1.run.app';
    const targetApiUrl = `https://${targetHost}${pathname}${url.search}`;
    
    const proxyRequest = new Request(targetApiUrl, request);
    proxyRequest.headers.set('Host', targetHost);

    return fetch(proxyRequest);
  }

  // 5. 該当しないリクエストはCloudflare Pagesにそのまま流す（SPAの静的ファイル処理）
  return context.next();
};
