import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";

import "./static/css/style.css";

import { CartProvider } from "./context/CartContext.jsx";
import { Layout } from "./components/Layout.jsx";
import { RequireAuth } from "./components/RequireAuth.jsx";

import { Home } from "./pages/Home.jsx";
import { Store } from "./pages/Store.jsx";
import { Cart } from "./pages/Cart.jsx";
import { Login } from "./pages/Login.jsx";
import { Register } from "./pages/Register.jsx";
import { Orders } from "./pages/Orders.jsx";
import { Profile } from "./pages/Profile.jsx";

const App = () => {
  return (
    <Router>
      <CartProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/store/:orgId" element={<Store />} />
            <Route
              path="/store/:orgId/cart"
              element={
                <RequireAuth>
                  <Cart />
                </RequireAuth>
              }
            />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/orders"
              element={
                <RequireAuth>
                  <Orders />
                </RequireAuth>
              }
            />
            <Route
              path="/profile"
              element={
                <RequireAuth>
                  <Profile />
                </RequireAuth>
              }
            />
          </Route>
        </Routes>
      </CartProvider>
    </Router>
  );
};

export default App;
