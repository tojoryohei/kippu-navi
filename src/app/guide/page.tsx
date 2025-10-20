'use client';

import { Link as ScrollLink, Element } from "react-scroll";
import NextLink from "next/link";
import { MdOutlineAlternateEmail } from "react-icons/md";

export default function Page() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-5">利用案内</h1>

      <ul className="mb-8 list-disc list-inside space-y-2">
        <li>
          <ScrollLink
            to="about"
            smooth={true}
            duration={500}
            offset={-60}
            className="text-blue-600 hover:underline cursor-pointer"
          >
            このサイトについて
          </ScrollLink>
        </li>
        <li>
          <ScrollLink
            to="privacy"
            smooth={true}
            duration={500}
            offset={-60}
            className="text-blue-600 hover:underline cursor-pointer"
          >
            プライバシーポリシー
          </ScrollLink>
        </li>
        <li>
          <ScrollLink
            to="owner"
            smooth={true}
            duration={500}
            offset={-60}
            className="text-blue-600 hover:underline cursor-pointer"
          >
            運営者情報
          </ScrollLink>
        </li>
        <li>
          <ScrollLink
            to="contact"
            smooth={true}
            duration={500}
            offset={-60}
            className="text-blue-600 hover:underline cursor-pointer"
          >
            お問い合わせ
          </ScrollLink>
        </li>
      </ul>

      <Element name="about">
        <h2 className="text-xl font-semibold mt-8 mb-2">このサイトについて</h2>
        <p className="mb-4">
          当サイトでは，JRの運賃計算や分割乗車券の最適解を出力するプログラムを公開しています．
          <br />
          これらのプログラムは大学の卒業研究で使うために作られたものであり，必ずしも正確な出力をすることは保証していません．
          <br />
          また，このサイトの情報や計算結果をもとにきっぷを購入するときは，
          旅客営業規則等を確認してからお買い求めください．
        </p>
      </Element>

      <Element name="privacy">
        <h2 className="text-xl font-semibold mt-8 mb-2">プライバシーポリシー</h2>
        <p className="mb-4">
          当サイトでは，第三者配信による広告サービス（Google AdSense）を利用しています．
          広告配信事業者は，ユーザーの興味に応じた広告を表示するためにCookieを使用することがあります．
          <br />
          Googleによる広告におけるCookieの取り扱いについては，
          <NextLink
            href="https://policies.google.com/technologies/ads?hl=ja"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            こちら
          </NextLink>
          をご参照ください．
        </p>
        <p className="mb-8">
          また，当サイトではアクセス解析ツール「Google Analytics」を利用しています．
          Google Analyticsはトラフィックデータの収集のためにCookieを使用していますが，
          匿名で収集されており，個人を特定するものではありません．
        </p>
      </Element>

      <Element name="owner" className="mb-8">
        <h2 className="text-xl font-semibold mt-8 mb-2">運営者情報</h2>
        <p>運営者：理系の大学4年生</p>
        <p>運営開始日：2025年9月</p>
      </Element>

      <Element name="contact">
        <h2 className="text-xl font-semibold mt-8 mb-2">お問い合わせ</h2>
        <p>
          ご意見・ご質問などがありましたら，以下のメールアドレスまでご連絡ください．
          <br />
          Email：kippu-navi<MdOutlineAlternateEmail style={{ display: 'inline-block', whiteSpace: 'nowrap' }} />via.tokyo.jp
        </p>
      </Element>
    </div>
  );
}
