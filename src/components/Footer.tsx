import Link from 'next/link';

const Footer = () => {
    return (
        <footer className="border-t border-slate-200 bg-white mt-auto">
            <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col items-center">

                {/* フッターナビゲーションリンク */}
                <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 mb-6 text-sm text-slate-600 font-medium">
                    <Link href="/changelog" className="hover:text-blue-600 transition-colors">
                        更新履歴
                    </Link>
                    <Link href="/about" className="hover:text-blue-600 transition-colors">
                        このサイトについて
                    </Link>
                    <Link href="/privacy" className="hover:text-blue-600 transition-colors">
                        プライバシーポリシー
                    </Link>
                    <Link href="/contact" className="hover:text-blue-600 transition-colors">
                        お問い合わせ
                    </Link>
                </div>

                {/* コピーライト */}
                <div className="text-sm text-slate-400">
                    Copyright © 2025-2026 きっぷナビ. All Rights Reserved.
                </div>

            </div>
        </footer>
    );
};

export default Footer;