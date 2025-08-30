"use client";

import Link from "next/link";
import { useState } from "react";
import { MdMenu, MdClear, MdHome, MdOutlineCalculate } from "react-icons/md";

const Header = () => {
    const [openMenu, setOpenMenu] = useState(false);

    const handleMenuToggle = () => {
        setOpenMenu((prev) => !prev);
    };

    return (
        <header className="border-b flex items-center justify-between h-14 px-4">
            <h1>
                <Link href="/">
                    <div className="text-2xl font-logo">きっぷナビ</div>
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
                className={`fixed top-0 right-0 h-screen w-8/12 sm:w-6/12 bg-slate-100 shadow-lg transform transition-transform duration-300 ease-in-out z-40
                ${openMenu ? "translate-x-0" : "translate-x-full"}
                md:static md:flex md:h-auto md:w-auto md:translate-x-0 md:bg-transparent md:shadow-none md:z-auto`}
            >
                <ul className="mt-16 md:mt-0 flex flex-col md:flex-row">
                    <li className="p-3">
                        <Link
                            href="/"
                            onClick={handleMenuToggle}
                            className="hover:opacity-50 flex items-center"
                        >
                            <MdHome className="mr-1" />
                            <span className="text-base font-semibold sm:text-lg sm:font-bold text-black hover:underline underline-offset-8 decoration-2">
                                ホーム
                            </span>
                        </Link>
                    </li>
                    <li className="p-3">
                        <Link
                            href="/mr"
                            onClick={handleMenuToggle}
                            className="hover:opacity-50 flex items-center"
                        >
                            <MdOutlineCalculate className="mr-1" />
                            <span className="text-base font-semibold sm:text-lg sm:font-bold text-black hover:underline underline-offset-8 decoration-2">
                                運賃計算(経路入力)
                            </span>
                        </Link>
                    </li>
                </ul>
            </nav>
        </header>
    );
};

export default Header;
