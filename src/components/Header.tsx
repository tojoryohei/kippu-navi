"use client";

import Link from "next/link";
import { useState } from "react";
import { FaQuestionCircle } from "react-icons/fa";
import { MdMenu, MdClear, MdHome } from "react-icons/md";
import { RiGuideLine } from "react-icons/ri";

import { menuItem } from "@/app/mr/types";

const MENU_ITEMS: menuItem[] = [
    { href: "/", icon: MdHome, label: "ホーム" },
    { href: "/guide", icon: FaQuestionCircle, label: "利用案内" },
    { href: "/mr", icon: RiGuideLine, label: "運賃計算(経路入力)" }
];

const Header = () => {
    const [openMenu, setOpenMenu] = useState(false);

    const handleMenuToggle = () => {
        setOpenMenu((prev) => !prev);
    };

    return (
        <header className="sticky top-0 bg-white z-20 border-b flex items-center justify-between h-14 px-4">
            <h1>
                <Link href="/" className="text-2xl font-logo">
                    きっぷナビ
                </Link>
            </h1>

            <button
                onClick={handleMenuToggle}
                className="text-3xl z-50 md:hidden"
                aria-label={openMenu ? "メニューバーを閉じる" : "メニューバーを開く"}
                aria-expanded={openMenu}
            >
                {openMenu ? <MdClear /> : <MdMenu />}
            </button>

            {openMenu && (
                <div
                    className="fixed inset-0 bg-black/40 z-30 md:hidden"
                    onClick={handleMenuToggle}
                />
            )}
            <nav
                className={`fixed top-0 right-0 h-screen w-8/12 sm:w-6/12 bg-slate-100 shadow-lg transform transition-transform duration-300 ease-out z-40
                ${openMenu ? "translate-x-0" : "translate-x-full"}
                md:static md:flex md:h-auto md:w-auto md:translate-x-0 md:bg-transparent md:shadow-none md:z-auto`}
            >
                <ul className="mt-16 md:mt-0 flex flex-col md:flex-row">
                    {MENU_ITEMS.map((item) => {
                        const IconComponent = item.icon;
                        return (
                            <li key={item.href} className="p-3">
                                <Link
                                    href={item.href}
                                    onClick={handleMenuToggle}
                                    className="hover:opacity-50 flex items-center"
                                >
                                    <IconComponent className="mr-1" />
                                    <span className="text-base font-semibold sm:text-lg sm:font-bold text-black hover:underline underline-offset-8 decoration-2">
                                        {item.label}
                                    </span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </nav>
        </header>
    );
};

export default Header;
