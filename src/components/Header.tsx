"use client";

import Link from "next/link";
import { useState } from "react";
import { FaBookOpen } from "react-icons/fa";
import { MdMenu, MdClear, MdHome } from "react-icons/md";
import { RiGuideLine, RiScissorsFill } from "react-icons/ri";

import { menuItem } from "@/app/types";

const MENU_ITEMS: menuItem[] = [
    { href: "/", icon: MdHome, label: "ホーム" },
    { href: "/logic", icon: FaBookOpen, label: "仕組み" },
    { href: "/mr", icon: RiGuideLine, label: "運賃計算" },
    { href: "/split", icon: RiScissorsFill, label: "分割乗車券" }
];

const Header = () => {
    const [openMenu, setOpenMenu] = useState(false);

    const handleMenuToggle = () => {
        setOpenMenu((prev) => !prev);
    };

    return (
        <header className="sticky top-0 bg-white/80 backdrop-blur-md z-20 border-b border-slate-200 flex items-center justify-between h-16 px-4 sm:px-6" >
            <h1>
                <Link href="/" className="text-2xl font-bold tracking-tight text-blue-600 hover:opacity-80 transition-opacity font-logo">
                    きっぷナビ
                </Link>
            </h1>

            <button
                onClick={handleMenuToggle}
                className="text-3xl z-50 md:hidden text-slate-700 hover:text-blue-600 transition-colors"
                aria-label={openMenu ? "メニューバーを閉じる" : "メニューバーを開く"}
                aria-expanded={openMenu}
            >
                {openMenu ? <MdClear /> : <MdMenu />}
            </button>

            {
                openMenu && (
                    <div
                        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-30 md:hidden transition-opacity"
                        onClick={handleMenuToggle}
                    />
                )
            }
            <nav
                className={`fixed top-0 right-0 h-screen w-64 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-40
                ${openMenu ? "translate-x-0" : "translate-x-full"}
                md:static md:flex md:h-auto md:w-auto md:translate-x-0 md:bg-transparent md:shadow-none md:z-auto`}
            >
                <ul className="mt-20 md:mt-0 flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-2 px-4 md:px-0">
                    {MENU_ITEMS.map((item) => {
                        const IconComponent = item.icon;
                        return (
                            <li key={item.href}>
                                <Link
                                    href={item.href}
                                    onClick={() => setOpenMenu(false)}
                                    className="group flex items-center px-4 py-3 md:py-2 md:px-3 rounded-lg hover:bg-blue-50 transition-colors"
                                >
                                    <IconComponent className="mr-3 md:mr-2 text-xl text-slate-500 group-hover:text-blue-600 transition-colors" />
                                    <span className="text-base font-medium text-slate-700 group-hover:text-blue-600 transition-colors">
                                        {item.label}
                                    </span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </nav>
        </header >
    );
};

export default Header;