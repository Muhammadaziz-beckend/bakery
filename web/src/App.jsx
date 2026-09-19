import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";

import "./static/css/style.css";
import { Main } from "./pages/Main";
import { Production } from "./pages/Production";
import { Login } from "./pages/Login";
import { Product } from "./pages/Product";
import { Warehouse } from "./pages/Warehouse";
import { Report } from "./pages/Report";
import { Settings } from "./pages/Settings";
import { Debt } from "./pages/Debt";
import { Client } from "./pages/Clietn";
import { Order } from "./pages/Order";

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={
          <Login />
        } />

        <Route path="/" element={
          <Main />
        } />

        <Route path="/production/" element={
          <Production />
        } />

        <Route path="/product/" element={
          <Product />
        } />

        <Route path="/warehouse/" element={
          <Warehouse />
        } />

        <Route path="/report/" element={
          <Report />
        } />

        <Route path="/debt/" element={
          <Debt />
        } />

        <Route path="/settings/" element={
          <Settings />
        } />

         <Route path="/clients/" element={
          <Client />
        } />

        <Route path="/order/" element={
          <Order />
        } />

        {/* Order */}

      </Routes>
    </Router>
  );
};

export default App;
