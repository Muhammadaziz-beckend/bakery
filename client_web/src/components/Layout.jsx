import { Outlet } from "react-router-dom";
import { Header } from "./Header.jsx";

export function Layout() {
  return (
    <>
      <Header />
      <main className="shop-content">
        <Outlet />
      </main>
    </>
  );
}
