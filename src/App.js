import React, { useState } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import Login from "./Login";
import SignUp from "./SignUp";
import ChatBot from "./ChatBot";
import './App.css';
import GitRepoLink from "./GitRepoLink";
import { UserProvider } from './contexts/UserContext';
const App = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  const toggleTheme = () => {
    setIsDarkMode((prev) => !prev);
  };

  return (
    <div className={`app ${isDarkMode ? "dark-mode" : ""}`}>
      <Routes>
        <Route path="/" element={<Login toggleTheme={toggleTheme} isDarkMode={isDarkMode} />} />
        <Route path="/signup" element={<SignUp toggleTheme={toggleTheme} isDarkMode={isDarkMode} />} />
        <Route path="/login" element={<Login toggleTheme={toggleTheme} isDarkMode={isDarkMode} />} />
        <Route path="/gitrepo" element={<GitRepoLink toggleTheme={toggleTheme} isDarkMode={isDarkMode} />} />
        <Route path="/chatbot" element={<ChatBot />} />


      </Routes>
    </div>
  );
};

export default function AppWithRouter() {
  return (
    <Router>
      <UserProvider>
        <App />
      </UserProvider>
    </Router>
  );
}


















































