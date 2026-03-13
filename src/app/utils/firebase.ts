import * as admin from 'firebase-admin';

/**
 * Firebase Admin SDKを初期化し、Firestoreのインスタンスを返す関数。
 * トップレベルでの初期化を避け、実行時にのみ初期化されるように遅延評価を行います。
 */
export function getDb(): admin.firestore.Firestore {
    // 1. すでに初期化済みの場合は、既存のアプリのFirestoreを返す（多重初期化防止）
    if (admin.apps.length > 0) {
        return admin.firestore();
    }

    // 2. 環境変数の取得
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    // Cloud Run等の環境変数に設定した秘密鍵の改行コードを正しく処理する
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    // 3. 実行時の環境変数不足をチェック
    // ビルド時はこの関数自体が呼ばれないため、ここでエラーを投げてもビルドは成功します。
    // 実際にAPIが叩かれた時に環境変数が無ければ、原因が明確なエラーを出力します。
    if (!projectId || !clientEmail || !privateKey) {
        throw new Error(
            '[Firebase Admin Error]: 初期化に必要な環境変数が不足しています。'
        );
    }

    // 4. 初回のみ初期化を実行
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
        }),
    });

    // 5. Firestoreインスタンスを返す
    return admin.firestore();
}